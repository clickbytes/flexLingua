import {EngineError} from './errors.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(value);
const pathPattern = /^#(?:\/(?:proposition|operand))*\/roles\/[a-z][a-zA-Z0-9_]{0,63}$/u;
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const fail = (code, message, contextReport) => {
  const error = new EngineError(code, message, {status:'invalid'});
  if (contextReport) error.contextReport = contextReport;
  throw error;
};

/** Validate caller-supplied evidence without inventing source facts or identities. */
export function validateReferentContext(context, ontology) {
  if (!record(context)) fail('INVALID_INPUT','Invalid analysis context.');
  const bindings = context.bindings === undefined ? [] : context.bindings;
  const facts = context.facts === undefined ? [] : context.facts;
  if (!Array.isArray(bindings) || bindings.length > 8 || !Array.isArray(facts) || facts.length > 64) {
    fail('INVALID_INPUT','Context exceeds its binding/fact shape or bound.');
  }
  const paths = new Set(), ids = new Set();
  for (const binding of bindings) {
    if (!exact(binding,['path','referentId']) || !pathPattern.test(binding.path) ||
        !id(binding.referentId) || paths.has(binding.path)) fail('INVALID_INPUT','Invalid or duplicate referent binding.');
    paths.add(binding.path);
  }
  for (const fact of facts) {
    if (!exact(fact,['id','referentId','feature','value','source']) || !id(fact.id) ||
        ids.has(fact.id) || !id(fact.referentId) || !['number','concept'].includes(fact.feature) ||
        (fact.feature === 'number' ? !['singular','plural'].includes(fact.value)
          : ontology.get(fact.value)?.type !== 'entity') || !record(fact.source) ||
        !['request','session'].includes(fact.source.kind) || !id(fact.source.id) ||
        Object.keys(fact.source).some(key => !['kind','id','turnId','recordedAt','language','text'].includes(key))) {
      fail('INVALID_INPUT','Invalid context fact or provenance.');
    }
    if (fact.source.kind === 'session' && (!/^t[1-9][0-9]*$/u.test(fact.source.turnId ?? '') ||
        typeof fact.source.recordedAt !== 'string' || !Number.isFinite(Date.parse(fact.source.recordedAt)) ||
        typeof fact.source.language !== 'string' || typeof fact.source.text !== 'string' ||
        fact.source.text.length > 4096)) fail('INVALID_INPUT','Session facts require source-turn provenance.');
    if (fact.source.kind === 'request') {
      const boundedString = (value, pattern, maximum) => typeof value === 'string' &&
        value.length <= maximum && pattern.test(value);
      const optional = ['turnId','recordedAt','language','text'];
      for (const key of optional) {
        const value = fact.source[key];
        if (value === undefined) continue;
        const valid = key === 'turnId' ? boundedString(value, /^t[1-9][0-9]*$/u, 16)
          : key === 'recordedAt' ? typeof value === 'string' && value.length <= 64 &&
            Number.isFinite(Date.parse(value))
          : key === 'language' ? boundedString(value, /^[a-zA-Z][a-zA-Z-]{1,15}$/u, 16)
          : boundedString(value, /^[\s\S]*$/u, 4096);
        if (!valid) fail('INVALID_INPUT','Request fact source fields exceed their provenance shape.');
      }
      if (optional.reduce((budget, key) => budget +
          (typeof fact.source[key] === 'string' ? fact.source[key].length : 0), 0) > 8192) {
        fail('INVALID_INPUT','Request fact source exceeds its provenance budget.');
      }
    }
    ids.add(fact.id);
  }
  const groups = new Map();
  for (const fact of facts) {
    const key = `${fact.referentId}/${fact.feature}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }
  const conflicts = [];
  for (const group of groups.values()) {
    const incompatible = group.some(a => group.some(b => a.value !== b.value &&
      (a.feature !== 'concept' || (!ontology.isA(a.value,b.value) && !ontology.isA(b.value,a.value)))));
    if (incompatible) conflicts.push({referentId:group[0].referentId, feature:group[0].feature,
      values:[...new Set(group.map(fact => fact.value))].sort(), factIds:group.map(fact => fact.id).sort(),
      reason:'conflicting-facts', sources:group.map(fact => fact.source)});
  }
  if (conflicts.length) fail('CONTEXT_CONFLICT','Explicit facts disagree about the same referent.',
    {bindings:[], decisions:[], conflicts});
  return context;
}

function participantAt(meaning, path) {
  let node = meaning;
  for (const key of path.slice(2).split('/')) {
    if (!record(node) || !Object.hasOwn(node,key)) return null;
    node = node[key];
  }
  return node;
}

/** Hard constraints precede ranking and the engine's reading bound. */
export function applyReferentContext(candidates, context, ontology) {
  if (context.bindings === undefined && context.facts === undefined) return candidates;
  const bindings = [...(context.bindings ?? [])].sort((a,b) => a.path.localeCompare(b.path,'en'));
  const facts = [...(context.facts ?? [])].sort((a,b) => a.id.localeCompare(b.id,'en'));
  const excluded = [], kept = [];
  for (const candidate of candidates) {
    const decisions = [], reportBindings = [];
    let rejected = false;
    for (const binding of bindings) {
      const ref = participantAt(candidate.interlingua,binding.path);
      if (!ref || (!ref.concept && !ref.referent)) {
        fail('CONTEXT_PATH_INVALID','Context binding must name an existing semantic participant.');
      }
      const evidence = facts.filter(fact => fact.referentId === binding.referentId);
      reportBindings.push({...binding, status:evidence.length ? 'confirmed' : 'unconfirmed',
        factIds:evidence.map(fact => fact.id)});
      for (const fact of evidence) {
        const actual = fact.feature === 'number' ? ref.features?.number ?? ref.agreement?.number : ref.concept;
        const matches = actual === undefined || actual === 'unknown'
          ? fact.feature !== 'concept' || !ref.referent || ontology.isA(fact.value,'person') || ontology.isA('person',fact.value)
          : fact.feature === 'concept'
            ? ontology.isA(actual,fact.value) || ontology.isA(fact.value,actual)
            : actual === fact.value;
        if (!matches) rejected = true;
        decisions.push({ruleId:'context.explicit-fact', path:binding.path, referentId:binding.referentId,
          factId:fact.id, feature:fact.feature, value:fact.value, source:structuredClone(fact.source),
          action:!matches ? 'rejected' : actual === undefined || actual === 'unknown' ? 'bound' : 'matched'});
      }
    }
    for (const fact of facts.filter(fact => !bindings.some(binding => binding.referentId === fact.referentId))) {
      decisions.push({ruleId:'context.unbound-fact', factId:fact.id, referentId:fact.referentId,
        feature:fact.feature, value:fact.value, source:structuredClone(fact.source), action:'ignored'});
    }
    const contextReport = {bindings:reportBindings, decisions, conflicts:[]};
    if (rejected) excluded.push({meaning:candidate.interlingua,
      decisions:decisions.filter(item => item.action === 'rejected')});
    else kept.push({...candidate, contextReport});
  }
  if (!kept.length && candidates.length) {
    fail('CONTEXT_CONFLICT','No source reading agrees with the bound referent facts.',
      {bindings, decisions:[], conflicts:excluded.flatMap(item => item.decisions.map(decision => ({
        referentId:decision.referentId, feature:decision.feature, factIds:[decision.factId],
        path:decision.path, reason:'source-fact-conflict', sources:[decision.source]})))});
  }
  return kept.map(candidate => ({...candidate, contextReport:{...candidate.contextReport,
    excludedReadings:excluded}}));
}
