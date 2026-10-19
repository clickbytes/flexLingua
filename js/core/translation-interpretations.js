import {translationErrorStatus, withUncertainties} from './translation-result.js';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const keyOf = value => JSON.stringify(canonical(value));
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const vector = score => [score.assumptions ?? Infinity, -score.contextRules,
  -score.ontologyLinks, -score.lexicalPreference];
function compareScore(left, right) {
  const a = vector(left), b = vector(right);
  for (let index = 0; index < a.length; index++) {
    const order = compare(a[index], b[index]);
    if (order) return order;
  }
  return 0;
}

function contextEvidence(meaning, context, ontology) {
  const evidence = [];
  let senseMeaning = meaning;
  while (['question','scope','modality'].includes(senseMeaning?.type)) {
    senseMeaning = senseMeaning.type === 'question' ? senseMeaning.proposition : senseMeaning.operand;
  }
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    for (const [role, ref] of Object.entries(node.roles ?? {})) {
      const rolePath = `${path}/roles/${role}`;
      if (node === senseMeaning && ref.concept && context.senses?.[role] === ref.concept) {
        evidence.push({ruleId:'context.explicit-sense', path:`${rolePath}/concept`,
          concept:ref.concept, source:`request.context.senses.${role}`});
      }
      for (const topic of [...new Set(context.topics ?? [])].sort()) {
        if (!ref.concept || !ontology.relatedToTopic(ref.concept, topic)) continue;
        let link;
        if (ontology.isA(ref.concept, topic) || ontology.isA(topic, ref.concept)) {
          link = {relation:'is_a', target:topic};
        } else {
          for (const relation of Object.keys(ontology.relationTypes).sort()) {
            const target = ontology.relationTargets(ref.concept, relation).sort()
              .find(target => ontology.isA(topic, target) || ontology.isA(target, topic));
            if (target) { link = {relation, target}; break; }
          }
        }
        if (link) evidence.push({ruleId:'ontology.topic-link', path:`${rolePath}/concept`,
          concept:ref.concept, topic, ...link, source:'ontology.relationTargets/isA',
          constraint:'preference'});
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') visit(value,
        `${path}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`);
    }
  }
  visit(meaning, '#');
  return evidence;
}

/** Realize bounded complete readings; ranking is preference, never disambiguation. */
export function realizeInterpretations(engine, candidates, options) {
  const context = options.context ?? {};
  const ids = new Map([...candidates].sort((a,b) => compare(keyOf(a.interlingua), keyOf(b.interlingua)))
    .map((candidate, index) => [candidate, `i${index + 1}`]));
  const outputs = [];
  let limitError;
  const interpretations = candidates.map(candidate => {
    const id = ids.get(candidate), meaning = candidate.interlingua;
    const reasons = contextEvidence(meaning, context, engine.ontology);
    const score = {assumptions:null,
      contextRules:reasons.filter(reason => reason.ruleId === 'context.explicit-sense').length,
      ontologyLinks:reasons.filter(reason => reason.ruleId === 'ontology.topic-link').length,
      lexicalPreference:candidate.lexicalPreference ?? 0};
    reasons.push({ruleId:'source.lexical-preference', source:'LanguagePlugin.analysis.score',
      value:score.lexicalPreference});
    let output, error;
    try {
      output = engine.realize({interlingua:meaning, ...options, construction:context.construction});
    } catch (caught) {
      const status = translationErrorStatus(caught);
      if (!['unsupported','resource_limit'].includes(status)) throw caught;
      error = caught;
      if (status === 'resource_limit') limitError ??= caught;
    }
    outputs.push({candidate, output, error});
    const realizations = [];
    if (output) {
      const assumptions = (output.informationLoss ?? []).filter(loss => loss.status === 'ambiguous');
      score.assumptions = assumptions.length;
      const assumptionReasons = assumptions.map(loss => ({ruleId:'target.additional-assumption',
        path:loss.path, feature:loss.feature, cause:loss.cause, source:'LanguagePlugin.informationLoss'}));
      if (!assumptions.length) assumptionReasons.push({ruleId:'target.no-additional-assumption',
        source:'LanguagePlugin.informationLoss'});
      reasons.push(...assumptionReasons);
      const texts = [...new Set([output.text, ...(output.alternatives ?? [])])];
      for (const [index, text] of texts.entries()) {
        realizations.push({id:`${id}.r${index + 1}`, interpretationId:id, text,
          kind:assumptions.length ? 'additional_assumption' : 'equivalent_expression',
          assumptions:assumptions.map(loss => ({path:loss.path, feature:loss.feature, reason:loss.cause})),
          informationLoss:output.informationLoss ?? [], diagnostics:output.diagnostics ?? [],
          warnings:output.warnings ?? [], score:{...score},
          reasons:[...assumptionReasons, {ruleId:'target.lexical-order',
            source:'LanguagePlugin.realize', value:index}],
          uncertainties:withUncertainties({...output, text, status:'ok', meaning}).uncertainties});
      }
    }
    return {id, meaning, lexicalSenses:candidate.lexicalSenses, score, reasons,
      ruleIds:[...new Set(reasons.map(reason => reason.ruleId))],
      status:error ? translationErrorStatus(error) : 'ok',
      diagnostics:error ? [{code:error.code, message:'No complete target realization is available for this reading.'}] : [],
      realizations};
  }).sort((a,b) => compareScore(a.score,b.score) || compare(a.id,b.id));
  let rank = 1;
  interpretations.forEach((item,index) => {
    if (index && compareScore(item.score, interpretations[index - 1].score)) rank = index + 1;
    item.rank = rank;
  });
  return {interpretations, outputs, limitError,
    previewId:limitError ? null : interpretations.find(item => item.realizations.length)?.realizations[0].id ?? null};
}
