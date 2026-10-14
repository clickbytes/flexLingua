/**
 * Interlingua: v0.2 single-event meanings remain compatible.
 * v0.4 adds a bounded discourse graph with explicitly shared entity identities.
 * v0.5 adds typed nominal modifiers and quantifiers.
 * v0.6 adds bounded relative clauses, coordination and explicit wide-scope negation.
 * Surface case, gender and word order never enter the semantic graph.
 */
import { validateFeatureBundle, record, safeName, hasOwn } from './features.js';
import { STATE_FRAME_VERSION } from './ontology.js';

export const INTERLINGUA_VERSION = '0.2';
export const DISCOURSE_VERSION = '0.4';
export const QUALIFIED_VERSION = '0.5';
export const CLAUSE_VERSION = '0.6';
export const SEMANTIC_VERSION = '1.0';
export const QUESTION_VERSION = '1.19';
export const MODALITY_VERSION = '1.20';
export const DEICTIC_VERSION = '1.22';
export const STATE_VERSION = '1.23';
export const MAX_RELATIVE_DEPTH = 2;
export const MAX_COORDINATION_CLAUSES = 4;
export const MAX_MODIFIER_DEPTH = 3;
export const MAX_ENTITY_MODIFIERS = 3;
export const MAX_DISCOURSE_EVENTS = 8;
export const MAX_CLAUSE_DEPTH = 5;

export function createEvent(concept, roles, features) {
  const hasDeictic = Object.values(roles).some(ref => record(ref) && hasOwn(ref, 'referent'));
  return {
    version: hasDeictic ? DEICTIC_VERSION :
      Object.values(roles).some(ref => record(ref) && hasOwn(ref, 'relatives')) ? CLAUSE_VERSION :
      Object.values(roles).some(isQualifiedParticipant) ? QUALIFIED_VERSION : INTERLINGUA_VERSION,
    type: 'event',
    concept,
    roles,
    features: {
      tense: features.tense,
      polarity: features.polarity,
      aspect: features.aspect || 'unknown'
    }
  };
}

function stateFeatures(features) {
  if (!record(features) || Object.keys(features).some(key => !['tense','polarity'].includes(key))) {
    throw new Error('State features only support tense and polarity.');
  }
  return {
    tense: hasOwn(features,'tense') ? features.tense : 'present',
    polarity: hasOwn(features,'polarity') ? features.polarity : 'positive'
  };
}

function createState(kind, roles, features, predicate) {
  const state = { version: STATE_VERSION, type: 'state', kind, roles,
    features: stateFeatures(features) };
  if (kind === 'predication') state.predicate = predicate;
  return state;
}

export function createIdentity(subject, complement, features = {}) {
  return createState('identity', {subject,complement}, features);
}

export function createPredication(predicate, subject, features = {}) {
  if (typeof predicate !== 'string') throw new Error('Predication requires a property concept.');
  return createState('predication', {subject}, features, predicate);
}

export function createPossession(owner, owned, features = {}) {
  return createState('possession', {owner,owned}, features);
}

/** A referent may carry a bounded tree of language-independent properties and a quantifier. */
export function participant(concept, definiteness = 'unknown', number = 'singular', options = {}) {
  const result = { concept, features: { number, definiteness } };
  if (options.modifiers?.length) result.modifiers = options.modifiers;
  if (options.quantifier) result.quantifier = options.quantifier;
  if (options.relatives?.length) result.relatives = options.relatives;
  return result;
}

export function modifier(concept, modifiers = []) {
  return modifiers.length ? { concept, modifiers } : { concept };
}

export function isQualifiedParticipant(ref) {
  return record(ref) && (hasOwn(ref, 'modifiers') || hasOwn(ref, 'quantifier') || hasOwn(ref, 'relatives'));
}

function validateModifiers(nodes, ontology, parentType, depth, budget) {
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > MAX_ENTITY_MODIFIERS ||
      depth > MAX_MODIFIER_DEPTH) throw new Error('Modifier tree depth or breadth limit exceeded.');
  for (const node of nodes) {
    budget.count++;
    if (budget.count > 9 || !record(node) || !Object.keys(node).every(key =>
        ['concept', 'modifiers'].includes(key))) {
      throw new Error('Invalid or oversized modifier node.');
    }
    const concept = ontology.get(node.concept);
    if (!concept || !['property', 'degree'].includes(concept.type) ||
        !concept.appliesTo.includes(parentType)) {
      throw new Error(`Modifier ${node.concept} cannot modify ${parentType}.`);
    }
    if (hasOwn(node, 'modifiers')) {
      validateModifiers(node.modifiers, ontology, concept.type, depth + 1, budget);
    }
  }
}

function validateReferent(ref, ontology, registry, label, qualifiedAllowed, clauseAllowed = false, relativeDepth = 0,
  deicticAllowed = false) {
  if (record(ref) && hasOwn(ref, 'referent')) {
    const referent = ref.referent;
    const agreement = ref.agreement;
    if (!deicticAllowed || Object.keys(ref).sort().join(',') !== 'agreement,referent' ||
        !record(referent) || Object.keys(referent).sort().join(',') !== 'anchor,kind' ||
        referent.kind !== 'deictic' || !['speaker','addressee'].includes(referent.anchor) ||
        !record(agreement) || Object.keys(agreement).sort().join(',') !== 'number,person' ||
        !['first','second'].includes(agreement.person) ||
        !['singular','plural'].includes(agreement.number) ||
        (referent.anchor === 'speaker') !== (agreement.person === 'first')) {
      throw new Error(`Invalid deictic participant for ${label}.`);
    }
    return;
  }
  if (!record(ref) || !ontology?.concepts?.[ref.concept] ||
      ontology.concepts[ref.concept].type !== 'entity' ||
      !Object.keys(ref).every(key => ['concept', 'features', 'modifiers', 'quantifier', 'relatives'].includes(key))) {
    throw new Error(`Invalid participant for ${label}.`);
  }
  validateFeatureBundle(ref.features, registry.domains.participant, `participant ${label}`);
  if (isQualifiedParticipant(ref) && !qualifiedAllowed) {
    throw new Error('Qualified participants require Interlingua v0.5.');
  }
  if (hasOwn(ref, 'modifiers')) {
    validateModifiers(ref.modifiers, ontology, 'entity', 1, { count: 0 });
  }
  if (hasOwn(ref, 'relatives')) {
    if (!clauseAllowed || relativeDepth >= MAX_RELATIVE_DEPTH ||
        !Array.isArray(ref.relatives) || ref.relatives.length < 1 || ref.relatives.length > 2) {
      throw new Error('Relative clause nesting, count or version is invalid.');
    }
    for (const relative of ref.relatives) {
      if (!record(relative) || Object.keys(relative).sort().join(',') !== 'event,gap,type' ||
          relative.type !== 'relative' || !safeName(relative.gap) || !record(relative.event)) {
        throw new Error('Invalid relative clause.');
      }
      const frame = ontology.get(relative.event.concept);
      if (frame?.type !== 'event' || !frame.roles?.includes(relative.gap) ||
          (frame.roleTypes?.[relative.gap] && !ontology.isA(ref.concept, frame.roleTypes[relative.gap]))) {
        throw new Error('Relative gap violates its semantic role type.');
      }
      validateEventShape(relative.event, ontology, registry, qualifiedAllowed, clauseAllowed,
        relativeDepth + 1, relative.gap);
    }
  }
  if (hasOwn(ref, 'quantifier')) {
    const q = ref.quantifier;
    if (!record(q) || !['universal', 'exact'].includes(q.kind) ||
        !Object.keys(q).every(k => ['kind', 'value'].includes(k)) ||
        (q.kind === 'universal' && hasOwn(q, 'value')) ||
        (q.kind === 'exact' && (!Number.isInteger(q.value) || q.value < 2 || q.value > 20)) ||
        ref.features.number !== 'plural') {
      throw new Error('Invalid participant quantifier (plural number required).');
    }
  }
}


/**
 * Coreference is opt-in: eN.role -> eM.role (M < N). It is never inferred
 * from repeated spelling or an unverified pronoun.
 */
const MENTION = /^e([1-8])\.([a-zA-Z][a-zA-Z0-9_]*)$/u;
export function validateCoreferenceMap(coreference, eventCount = null) {
  if (!record(coreference) || Object.keys(coreference).length > 32 ||
      (eventCount !== null && (!Number.isInteger(eventCount) ||
        eventCount < 2 || eventCount > MAX_DISCOURSE_EVENTS))) {
    throw new Error('Invalid or excessive explicit discourse coreference links.');
  }
  return Object.entries(coreference).map(([source,target]) => {
    const s = MENTION.exec(source);
    const t = typeof target === 'string' ? MENTION.exec(target) : null;
    if (!s || !t || !safeName(s[2]) || !safeName(t[2])) {
      throw new Error('Invalid explicit discourse coreference link: ' + source + '.');
    }
    const sourceIndex = Number(s[1]) - 1;
    const targetIndex = Number(t[1]) - 1;
    if (eventCount !== null && sourceIndex >= eventCount) {
      throw new Error('Unknown discourse coreference source event: ' + source + '.');
    }
    if (sourceIndex <= targetIndex) {
      throw new Error('Coreference ' + source + ' → ' + target +
        ' must reference a role in an earlier event.');
    }
    return {source,target,sourceIndex,targetIndex,sourceRole:s[2],targetRole:t[2]};
  });
}

/** Order of JS object keys does not change a semantic referent's identity. */
function referentFingerprint(value, budget = {count:0}, depth = 0) {
  if (++budget.count > 256 || depth > 12)
    throw new Error('Explicit coreference referent exceeds structural complexity limit.');
  if (Array.isArray(value))
    return '[' + value.map(item=>referentFingerprint(item,budget,depth+1)).join(',') + ']';
  if (record(value))
    return '{' + Object.keys(value).sort().map(k =>
      JSON.stringify(k) + ':' + referentFingerprint(value[k],budget,depth+1)).join(',') + '}';
  return JSON.stringify(value);
}
export function sameDiscourseReferent(left, right) {
  return record(left) && record(right) &&
    referentFingerprint(left) === referentFingerprint(right);
}
export function createDiscourse(events, { coreference = {} } = {}) {
  if (!Array.isArray(events) || events.length < 2 || events.length > MAX_DISCOURSE_EVENTS) {
    throw new Error('Discourse requires 2–8 events.');
  }
  const links = validateCoreferenceMap(coreference, events.length);
  const targets = new Map(links.map(link=>[link.source,link]));
  const entities = Object.create(null);
  const earlierMentions = new Map();
  const steps = events.map((event, index) => {
    if (!record(event) || event.type !== 'event' || !record(event.roles)) {
      throw new Error('Discourse only supports independent event clauses.');
    }
    if (Object.values(event.roles).some(ref => record(ref) && hasOwn(ref, 'referent'))) {
      throw new Error('UNRESOLVED_DEIXIS: cross-turn participant identity requires explicit session context.');
    }
    const roles = Object.create(null);
    const currentMentions = new Map();
    for (const [role, entity] of Object.entries(event.roles)) {
      if (!safeName(role)) throw new Error('Unsafe discourse semantic role.');
      const mention='e'+(index + 1)+'.'+role;
      if (targets.has(mention)) {
        const link = targets.get(mention);
        const id = earlierMentions.get(link.target);
        if (!id) throw new Error('Unknown earlier discourse coreference target role: ' + link.target + '.');
        if (!sameDiscourseReferent(entities[id], entity)) {
          throw new Error('Explicit coreference ' + mention + ' → ' + link.target +
            ' has incompatible semantic referents.');
        }
        roles[role] = id;
      } else {
        const id = 'p'+(Object.keys(entities).length + 1);
        entities[id] = entity;
        roles[role] = id;
      }
      currentMentions.set(mention,roles[role]);
    }
    for (const [mention,id] of currentMentions) earlierMentions.set(mention,id);
    return { id: 'e'+(index + 1), concept: event.concept, roles, features: event.features };
  });
  for (const link of links) {
    if (!earlierMentions.has(link.source)) {
      throw new Error('Unknown discourse coreference source role: ' + link.source + '.');
    }
  }
  return {
    version: events.some(event => event.version === CLAUSE_VERSION) ? CLAUSE_VERSION :
      events.some(event => event.version === QUALIFIED_VERSION) ? QUALIFIED_VERSION : DISCOURSE_VERSION,
    type: 'discourse', entities, events: steps,
    relations: steps.slice(1).map((event, i) => ({ type: 'precedes', from: steps[i].id, to: event.id }))
  };
}

export function materializeEvent(discourse, event) {
  const roles = Object.fromEntries(Object.entries(event.roles).map(([role, id]) =>
    [role, discourse.entities[id]]));
  return createEvent(event.concept, roles, event.features);
}

function validateEventShape(node, ontology, registry, qualifiedAllowed = true, clauseAllowed = false, depth = 0, gap = null) {
  const event = ontology?.concepts?.[node.concept];
  if (!event || event.type !== 'event' || !Array.isArray(event.roles)) {
    throw new Error(`Unknown event concept: ${node.concept}`);
  }
  validateFeatureBundle(node.features, registry.domains.event, 'event');
  if (!record(node.roles) || Object.keys(node.roles).length !== event.roles.length - (gap ? 1 : 0)) {
    throw new Error('Event roles do not match the semantic frame.');
  }
  for (const role of event.roles) {
    if (role === gap) {
      if (hasOwn(node.roles, role)) throw new Error(`Relative gap ${role} must not repeat the antecedent.`);
      continue;
    }
    if (!hasOwn(node.roles, role)) throw new Error(`Missing semantic role: ${role}`);
    const ref = node.roles[role];
    validateReferent(ref, ontology, registry, role, qualifiedAllowed, clauseAllowed, depth,
      node.version === DEICTIC_VERSION);
    const constraint = event.roleTypes?.[role];
    if (constraint && !(hasOwn(ref, 'referent') ? ontology.isA('person', constraint) :
      ontology.isA(ref.concept, constraint))) {
      throw new Error(`Participant for ${role} violates role type ${constraint}.`);
    }
  }
  for (const role of Object.keys(node.roles)) {
    if (!event.roles.includes(role)) throw new Error(`Unexpected semantic role: ${role}`);
  }
}

function validateStateShape(node, ontology, registry) {
  const frame = ontology?.stateFrames?.[node.kind];
  const hasPredicate = node.kind === 'predication';
  const fields = hasPredicate ?
    ['version','type','kind','predicate','roles','features'] :
    ['version','type','kind','roles','features'];
  if (ontology?.stateFrameVersion !== STATE_FRAME_VERSION || !frame ||
      node.version !== STATE_VERSION || !['identity','predication','possession'].includes(node.kind) ||
      Object.keys(node).length !== fields.length || Object.keys(node).some(key => !fields.includes(key)) ||
      !record(node.roles) || Object.keys(node.roles).length !== frame.roles.length ||
      frame.roles.some(role => !hasOwn(node.roles,role)) ||
      Object.keys(node.roles).some(role => !frame.roles.includes(role))) {
    throw new Error('Invalid or unsupported state document or role frame.');
  }
  validateFeatureBundle(node.features, registry.domains.state, 'state');
  for (const role of frame.roles) {
    const ref = node.roles[role];
    validateReferent(ref, ontology, registry, role, true, true, 0, true);
    const concept = hasOwn(ref,'referent') ? 'person' : ref.concept;
    if (!ontology.isA(concept,frame.roleTypes[role])) {
      throw new Error(`Participant for ${role} violates state role type ${frame.roleTypes[role]}.`);
    }
  }
  if (hasPredicate) {
    const predicate = typeof node.predicate === 'string' ? ontology.get(node.predicate) : undefined;
    if (predicate?.type !== frame.predicateType) {
      throw new Error('Predication requires a property concept.');
    }
    const subject = node.roles.subject;
    const subjectConcept = hasOwn(subject,'referent') ? 'person' : subject.concept;
    const domainMatchesFrame = predicate.appliesTo.some(target =>
      ontology.isA(target,frame.predicateAppliesTo));
    if (!domainMatchesFrame || !predicate.appliesTo.some(target => ontology.isA(subjectConcept,target))) {
      throw new Error(`Property ${node.predicate} does not apply to the subject.`);
    }
  }
}

export function createRelativeClause(event, gap) {
  if (!safeName(gap) || !record(event) || !record(event.roles) || !hasOwn(event.roles, gap)) {
    throw new Error('Relative clause requires a present semantic gap role.');
  }
  const roles = { ...event.roles };
  delete roles[gap];
  return { type: 'relative', gap, event: { concept: event.concept, roles, features: event.features } };
}

/** Coordination is truth-functional AND, not event sequencing or automatic coreference. */
export function createCoordination(clauses) {
  if (!Array.isArray(clauses) || clauses.length < 2 || clauses.length > MAX_COORDINATION_CLAUSES) {
    throw new Error('Coordination requires 2–4 clauses.');
  }
  return { version: CLAUSE_VERSION, type: 'coordination', connective: 'and', clauses };
}

/** The explicit operand makes not(A and B) different from not(A) and B. */
export function createNegation(operand) {
  return { version: operand?.type === 'coordination' ? CLAUSE_VERSION :
    operand?.type === 'modality' ? MODALITY_VERSION : SEMANTIC_VERSION,
    type: 'scope', operator: 'not', operand };
}

/**
 * Modal meanings have explicit scope. NOT(ABILITY(P)) and
 * NOT(OBLIGATION(P)) differ from OBLIGATION(NOT(P)), a prohibition.
 */
export function createModality(operator, operand) {
  if (!['modality.ability','modality.obligation'].includes(operator) ||
      !record(operand) || !['event','scope'].includes(operand.type) ||
      (operand.type === 'scope' &&
        (operator !== 'modality.obligation' || operand.operator !== 'not' ||
          operand.operand?.type !== 'event'))) {
    throw new Error('Unsupported modality operator or operand.');
  }
  return { version: MODALITY_VERSION, type: 'modality', operator, operand };
}

/** A finite content clause selected by a higher-order predicate. */
export function createComplement(concept, experiencer, content, tense = 'present') {
  return { version: SEMANTIC_VERSION, type: 'complement', concept,
    experiencer, content, features: { tense } };
}



/**
 * A question is a distinct semantic document. WH questions omit the queried
 * participant from proposition.roles (an explicit role gap, not a fake entity).
 * Surface words such as "who"/"kto" belong to individual language grammars.
 */
function questionGapEvent(node) {
  if (node?.type === 'event') return node;
  if (node?.type === 'modality') return questionGapEvent(node.operand);
  if (node?.type === 'scope' && node.operand?.type === 'modality')
    return questionGapEvent(node.operand);
  return null;
}

export function createQuestion(proposition, options = {}) {
  if (!record(options) || Object.keys(options).some(k => !['questionType','targetRole'].includes(k))) {
    throw new Error('Invalid question options.');
  }
  const {questionType = 'yes_no', targetRole} = options;
  if (!record(proposition) || !['event','scope','coordination','complement','modality'].includes(proposition.type)) {
    throw new Error('A question requires a supported semantic proposition.');
  }
  if (questionType === 'yes_no') {
    if (hasOwn(options,'targetRole')) throw new Error('Yes/no questions cannot query a participant role.');
    return {version:QUESTION_VERSION,type:'question',questionType,proposition};
  }
  if (questionType === 'wh') {
    const event = questionGapEvent(proposition);
    if (!event || !safeName(targetRole) || !record(event.roles) ||
        hasOwn(event.roles,targetRole)) {
      throw new Error('WH question needs an explicit unfilled semantic targetRole in an event.');
    }
    return {version:QUESTION_VERSION,type:'question',questionType,targetRole,proposition};
  }
  throw new Error('Unsupported semantic question type.');
}

function validateQuestion(node, ontology, registry) {
  const wh=node.questionType==='wh';
  const fields=wh?['version','type','questionType','targetRole','proposition']:
    ['version','type','questionType','proposition'];
  if (node.version!==QUESTION_VERSION || !['wh','yes_no'].includes(node.questionType) ||
      Object.keys(node).length!==fields.length || Object.keys(node).some(k=>!fields.includes(k))) {
    throw new Error('Invalid or unsupported semantic question document.');
  }
  if (!wh) {
    if (!['event','coordination','scope','complement','modality'].includes(node.proposition?.type)) {
      throw new Error('Yes/no question requires a supported proposition.');
    }
    validateClauseTree(node.proposition,ontology,registry,1);
    return;
  }
  const p=node.proposition;
  if (p?.type === 'modality' || (p?.type === 'scope' && p.operand?.type === 'modality')) {
    const event=questionGapEvent(p);
    if (!safeName(node.targetRole) || event?.type !== 'event' ||
        !record(event.roles) || hasOwn(event.roles,node.targetRole)) {
      throw new Error('Invalid modal WH question gap.');
    }
    const frame=ontology?.get(event.concept);
    if (frame?.type !== 'event' || !frame.roles.includes(node.targetRole)) {
      throw new Error('Modal WH targetRole is not declared in the semantic frame.');
    }
    validateClauseTree(p,ontology,registry,1,node.targetRole);
    return;
  }
  if (!safeName(node.targetRole) || !record(p) || p.type!=='event' ||
      !['version','type','concept','roles','features'].every(k=>hasOwn(p,k)) ||
      Object.keys(p).length!==5 ||
      ![INTERLINGUA_VERSION,QUALIFIED_VERSION,CLAUSE_VERSION,SEMANTIC_VERSION,DEICTIC_VERSION].includes(p.version) ||
      !record(p.roles)) {
    throw new Error('Invalid WH question proposition or semantic targetRole.');
  }
  const frame=ontology?.get(p.concept);
  if (frame?.type!=='event' || !frame.roles.includes(node.targetRole)) {
    throw new Error('WH question targetRole is not declared in this event frame.');
  }
  if (hasOwn(p.roles,node.targetRole)) throw new Error('WH targetRole must be an unfilled semantic gap.');
  validateEventShape(p,ontology,registry,p.version!==INTERLINGUA_VERSION,
    [CLAUSE_VERSION,SEMANTIC_VERSION].includes(p.version),0,node.targetRole);
}

function validateClauseTree(node, ontology, registry, depth = 0, gap = null) {
  if (!record(node) || depth > MAX_CLAUSE_DEPTH) throw new Error('Clause tree nesting limit exceeded.');
  if (node.type === 'event') {
    if (![INTERLINGUA_VERSION, QUALIFIED_VERSION, CLAUSE_VERSION, SEMANTIC_VERSION, DEICTIC_VERSION].includes(node.version)) {
      throw new Error('Unsupported event version.');
    }
    validateEventShape(node, ontology, registry, node.version !== INTERLINGUA_VERSION,
      [CLAUSE_VERSION, SEMANTIC_VERSION].includes(node.version),0,gap);
  } else if (node.type === 'state') {
    if (node.version !== STATE_VERSION) throw new Error('Unsupported state version.');
    validateStateShape(node,ontology,registry);
  } else if (node.type === 'complement') {
    const frame = ontology.get(node.concept);
    if (node.version !== SEMANTIC_VERSION || !frame || frame.type !== 'event' ||
        frame.complement !== true || !record(node.features) ||
        !['past', 'present'].includes(node.features.tense) ||
        Object.keys(node.features).length !== 1 ||
        !Object.keys(node).every(k => ['version','type','concept','experiencer','content','features'].includes(k)) ||
        !node.content || !['event','coordination','scope','complement','modality'].includes(node.content.type)) {
      throw new Error('Invalid propositional complement.');
    }
    validateReferent(node.experiencer, ontology, registry, 'experiencer', true, true);
    if (!ontology.isA(node.experiencer.concept, 'person')) {
      throw new Error('Complement experiencer must be a person.');
    }
    validateClauseTree(node.content, ontology, registry, depth + 1);
  } else if (node.type === 'coordination') {
    if (node.version !== CLAUSE_VERSION || node.connective !== 'and' ||
        !Array.isArray(node.clauses) || node.clauses.length < 2 ||
        node.clauses.length > MAX_COORDINATION_CLAUSES ||
        !Object.keys(node).every(k => ['version', 'type', 'connective', 'clauses'].includes(k))) {
      throw new Error('Invalid semantic coordination.');
    }
    for (const child of node.clauses) {
      if (!['event','modality','scope'].includes(child?.type))
        throw new Error('Coordination requires complete event or modal clauses.');
      validateClauseTree(child, ontology, registry, depth + 1);
    }
  } else if (node.type === 'scope') {
    if (![CLAUSE_VERSION, SEMANTIC_VERSION, MODALITY_VERSION].includes(node.version) || node.operator !== 'not' ||
        !Object.keys(node).every(k => ['version', 'type', 'operator', 'operand'].includes(k)) ||
        !['coordination','event','state','complement','modality'].includes(node.operand?.type) ||
        (node.version === CLAUSE_VERSION && node.operand?.type !== 'coordination') ||
        (node.operand?.type === 'modality' && node.version !== MODALITY_VERSION) ||
        (gap && !['event','modality'].includes(node.operand?.type))) {
      throw new Error('Wide-scope negation currently requires a coordination operand.');
    }
    validateClauseTree(node.operand, ontology, registry, depth + 1, gap);
  } else if (node.type === 'modality') {
    if (node.version !== MODALITY_VERSION ||
        !['modality.ability','modality.obligation'].includes(node.operator) ||
        Object.keys(node).length !== 4 ||
        !['version','type','operator','operand'].every(k => hasOwn(node,k)) ||
        !['event','scope'].includes(node.operand?.type) ||
        (node.operand.type === 'scope' && (node.operator !== 'modality.obligation' ||
          node.operand.operator !== 'not' || node.operand.operand?.type !== 'event'))) {
      throw new Error('Invalid or unsupported modality operator and scope.');
    }
    const event = node.operand.type === 'scope' ? node.operand.operand : node.operand;
    if (event.features?.tense !== 'present' || event.features?.polarity !== 'positive') {
      throw new Error('Modalities currently require an affirmative present-tense event.');
    }
    validateClauseTree(node.operand, ontology, registry, depth + 1, gap);
  } else throw new Error('Unsupported clause node.');
}

export function validateInterlingua(node, ontology, registry) {
  if (!record(node)) throw new Error('Unsupported or invalid Interlingua document.');
  if (node.type === 'question') {
    validateQuestion(node, ontology, registry);
    return node;
  }
  if (['event','state','coordination','scope','complement','modality'].includes(node.type)) {
    validateClauseTree(node, ontology, registry);
    return node;
  }
  if (node.type !== 'discourse' || ![DISCOURSE_VERSION, QUALIFIED_VERSION, CLAUSE_VERSION].includes(node.version) ||
      !record(node.entities) || !Array.isArray(node.events) ||
      node.events.length < 2 || node.events.length > MAX_DISCOURSE_EVENTS ||
      !Array.isArray(node.relations)) {
    throw new Error('Unsupported or invalid Interlingua document.');
  }
  for (const [id, entity] of Object.entries(node.entities)) {
    if (!safeName(id)) throw new Error(`Invalid discourse entity: ${id}`);
    validateReferent(entity, ontology, registry, `entity ${id}`,
      node.version !== DISCOURSE_VERSION, [CLAUSE_VERSION, SEMANTIC_VERSION].includes(node.version));
  }
  const ids = new Set();
  for (const event of node.events) {
    if (!record(event) || !safeName(event.id) || ids.has(event.id) || !record(event.roles)) {
      throw new Error('Duplicate or invalid discourse event ID.');
    }
    ids.add(event.id);
    for (const [role, ref] of Object.entries(event.roles)) {
      if (!safeName(role) || !safeName(ref) || !hasOwn(node.entities, ref)) {
        throw new Error(`Unknown discourse entity reference: ${role} → ${ref}`);
      }
    }
    validateEventShape(materializeEvent(node, event), ontology, registry,
      node.version !== DISCOURSE_VERSION, [CLAUSE_VERSION, SEMANTIC_VERSION].includes(node.version));
  }
  if (node.relations.length !== node.events.length - 1 ||
      node.relations.some((edge, i) => !record(edge) || edge.type !== 'precedes' ||
        edge.from !== node.events[i].id || edge.to !== node.events[i + 1].id)) {
    throw new Error('Discourse sequence relations must form an ordered, acyclic chain.');
  }
  return node;
}
