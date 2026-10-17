/** Deterministic, bounded CORE-to-CORE response planning. */
import {
  createDialogueAct, materializeEvent, MAX_DIALOGUE_ACTS, validateInterlingua
} from './interlingua.js';
import {record} from './features.js';

export const RESPONSE_PLANNER_VERSION = '1.0';
export const MAX_RESPONSE_FACTS = MAX_DIALOGUE_ACTS;

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function participantContext(references, scope, participants) {
  if (references === undefined) references = [];
  if (!Array.isArray(references) || references.length>256)
    throw new Error('Invalid participant reference context.');
  const byPath = new Map();
  for (const reference of references) {
    if (!record(reference) || typeof reference.role !== 'string' || !reference.role ||
        reference.role.length>1024 ||
        typeof reference.referenceId !== 'string' || !reference.referenceId ||
        reference.referenceId.length > 256) {
      throw new Error('Invalid participant reference context.');
    }
    const prior = byPath.get(reference.role);
    if (prior !== undefined && prior !== reference.referenceId) {
      throw new Error('Conflicting participant identities for one mention.');
    }
    byPath.set(reference.role,reference.referenceId);
  }
  const anchorsById=new Map();
  if (participants !== undefined) {
    if (!record(participants) ||
        Object.keys(participants).some(key=>!['speaker','addressee'].includes(key)) ||
        Object.values(participants).some(id=>typeof id!=='string' || !id || id.length>256)) {
      throw new Error('Invalid question participant identities.');
    }
    for (const [anchor,id] of Object.entries(participants)) {
      if (!anchorsById.has(id)) anchorsById.set(id,new Set());
      anchorsById.get(id).add(anchor);
    }
  }
  return {byPath,scope,anchorsById};
}

function buildReferenceContext(value) {
  if (value === undefined) return {
    question:participantContext(undefined,'question'),facts:[]
  };
  if (!record(value) || Object.keys(value).some(key=>
        !['question','questionParticipants','facts'].includes(key)) ||
      (value.facts !== undefined &&
        (!Array.isArray(value.facts) || value.facts.length>MAX_RESPONSE_FACTS))) {
    throw new Error('Invalid response participant reference context.');
  }
  return {
    question:participantContext(value.question,'question',value.questionParticipants),
    facts:(value.facts || []).map((references,index)=>
      participantContext(references,'fact:'+index))
  };
}

function participantIdentityFor(roleValue,path,context) {
  if (roleValue?.referent?.kind !== 'deictic') return null;
  const grounded=roleValue.agreement?.number === 'singular' && context.byPath.has(path);
  return {
    id:grounded ? context.byPath.get(path) :
      'unresolved:'+context.scope+':'+roleValue.referent.anchor,
    grounded
  };
}

function referenceIdFor(roleValue,path,context) {
  return participantIdentityFor(roleValue,path,context)?.id ?? null;
}

function participantInQuestion(roleValue,path,sourceContext,questionContext) {
  if (roleValue?.referent?.kind !== 'deictic') return structuredClone(roleValue);
  const identity=participantIdentityFor(roleValue,path,sourceContext);
  if (!identity.grounded) return null;
  const anchors=questionContext.anchorsById.get(identity.id);
  if (!anchors || anchors.size!==1) return null;
  const copy=structuredClone(roleValue);
  const [anchor]=anchors;
  copy.referent.anchor=anchor;
  if (copy.agreement?.person) copy.agreement.person=anchor==='speaker'?'first':'second';
  return copy;
}

function matchingRole(roleValue,path,context) {
  const copy=structuredClone(roleValue);
  if (copy?.referent?.kind === 'deictic') {
    const identity=participantIdentityFor(roleValue,path,context);
    copy.referent={kind:'planner_participant',id:identity.id};
    if (identity.grounded && copy.agreement?.person) copy.agreement.person='grounded';
  }
  if (Array.isArray(copy?.relatives)) {
    copy.relatives=copy.relatives.map((relative,index)=>({...relative,
      event:matchingView(relative.event,path+'.relatives.'+index+'.event',context)}));
  }
  return copy;
}

function matchingView(node,path,context) {
  if (!record(node)) return node;
  const copy=structuredClone(node);
  if (copy.type === 'event' || copy.type === 'state') {
    copy.roles=Object.fromEntries(Object.entries(copy.roles || {}).map(([role,value])=>
      [role,matchingRole(value,path+'.roles.'+role,context)]));
  } else if (copy.type === 'scope' || copy.type === 'modality') {
    copy.operand=matchingView(copy.operand,path+'.operand',context);
  } else if (copy.type === 'coordination') {
    copy.clauses=copy.clauses.map((clause,index)=>
      matchingView(clause,path+'.clauses.'+index,context));
  } else if (copy.type === 'complement') {
    copy.experiencer=matchingRole(copy.experiencer,path+'.experiencer',context);
    copy.content=matchingView(copy.content,path+'.content',context);
  }
  return copy;
}

function matchingKey(node,path,context) {
  return canonicalJson(matchingView(node,path,context));
}

function questionFrom(value, engine) {
  let question = value;
  if (record(value) && value.type === 'dialogue_act') {
    validateInterlingua(value, engine.ontology, engine.features);
    if (value.act !== 'ask') throw new Error('Response planning requires an ask act or semantic question.');
    question = value.payload.question;
  }
  if (!record(question) || question.type !== 'question') {
    throw new Error('Response planning requires a semantic question.');
  }
  validateInterlingua(question, engine.ontology, engine.features);
  return structuredClone(question);
}

function addFact(value, factIndex, engine, rows, contexts) {
  validateInterlingua(value, engine.ontology, engine.features);
  const context=contexts[factIndex] || participantContext(undefined,'fact:'+factIndex);
  if (value.type === 'dialogue_act') {
    if (value.act !== 'assert') throw new Error('Only explicit assert acts can be used as response facts.');
    rows.push({clause:structuredClone(value.payload.proposition),factIndex,
      path:'proposition',context});
  } else if (value.type === 'discourse') {
    value.events.forEach((event, eventIndex) => rows.push({
      clause:materializeEvent(value,event),factIndex,eventIndex,path:'proposition',context
    }));
  } else if (['event','state','coordination','scope','complement','modality'].includes(value.type)) {
    rows.push({clause:structuredClone(value),factIndex,path:'proposition',context});
  } else {
    throw new Error('Response facts must be validated propositions, assert acts, or discourse documents.');
  }
  if (rows.length > MAX_RESPONSE_FACTS) throw new Error(`Response facts exceed the ${MAX_RESPONSE_FACTS}-fact limit.`);
}

function factRows(facts, engine, contexts) {
  const rows = [];
  if (facts === undefined) return rows;
  if (Array.isArray(facts)) {
    if (facts.length > MAX_RESPONSE_FACTS) throw new Error(`Response facts exceed the ${MAX_RESPONSE_FACTS}-fact limit.`);
    facts.forEach((fact,index) => addFact(fact,index,engine,rows,contexts));
  } else addFact(facts,0,engine,rows,contexts);
  return rows;
}

function propositionEvent(node) {
  if (node?.type === 'event') return node;
  if (node?.type === 'scope' || node?.type === 'modality') return propositionEvent(node.operand);
  return null;
}

function questionEvent(question) {
  return propositionEvent(question.proposition);
}

function fillTarget(question, referent) {
  const proposition = structuredClone(question.proposition);
  const event = propositionEvent(proposition);
  if (!event) return null;
  event.roles[question.targetRole] = structuredClone(referent);
  return proposition;
}

/** Return the atomic positive proposition and its truth value for event/state polarity and wide not. */
function simpleTruth(node, inverted = false, path = '') {
  if (node?.type === 'scope' && node.operator === 'not')
    return simpleTruth(node.operand,!inverted,path+'.operand');
  if (!['event','state'].includes(node?.type)) return null;
  const polarity = node.features?.polarity;
  if (!['positive','negative'].includes(polarity)) return null;
  const positive = structuredClone(node);
  positive.features.polarity = 'positive';
  return {base:positive,value:(polarity === 'positive') !== inverted,path};
}

function evidenceRef(row) {
  return row.eventIndex === undefined ? {factIndex:row.factIndex} :
    {factIndex:row.factIndex,eventIndex:row.eventIndex};
}

function unknownPlan(question, reason, evidence, clarifyQuestion, engine) {
  const confidence={level:reason==='ambiguous'?'ambiguous':'none',evidenceCount:evidence.length};
  if (clarifyQuestion) {
    const clarification = questionFrom(clarifyQuestion,engine);
    const act = createDialogueAct('clarify',{inReplyTo:question,question:clarification});
    validateInterlingua(act,engine.ontology,engine.features);
    return {version:RESPONSE_PLANNER_VERSION,type:'response_plan',outcome:'clarify',
      question,act,realization:clarification,evidence,reason,confidence};
  }
  const act = createDialogueAct('refuse',{question,reason});
  validateInterlingua(act,engine.ontology,engine.features);
  return {version:RESPONSE_PLANNER_VERSION,type:'response_plan',outcome:'unknown',
    question,act,realization:null,evidence,reason,confidence};
}

function yesNoPlan(question, rows, engine, clarifyQuestion, questionContext) {
  const expected = simpleTruth(question.proposition,false,'question.proposition');
  const observations = [];
  for (const row of rows) {
    const actual = simpleTruth(row.clause,false,row.path);
    if (expected && actual &&
        matchingKey(expected.base,expected.path,questionContext) ===
          matchingKey(actual.base,actual.path,row.context)) {
      observations.push({value:actual.value === expected.value,row});
    } else if (matchingKey(row.clause,row.path,row.context) ===
        matchingKey(question.proposition,'question.proposition',questionContext)) {
      observations.push({value:true,row});
    }
  }

  const truths = new Set(observations.map(item=>item.value));
  const evidence = observations.map(item=>evidenceRef(item.row));
  if (!truths.size) return unknownPlan(question,'insufficient_context',[],clarifyQuestion,engine);
  if (truths.size > 1) return unknownPlan(question,'ambiguous',evidence,clarifyQuestion,engine);

  const value = truths.has(true);
  let act, realization;
  if (value) {
    act = createDialogueAct('confirm',{question});
    realization = structuredClone(question.proposition);
  } else {
    act = createDialogueAct('answer',{question,response:{type:'yes_no',value:false}});
    const negative = simpleTruth(question.proposition);
    if (negative) {
      realization = structuredClone(question.proposition);
      // For wide not, remove its outer scope. For local polarity, flip the predicate.
      if (realization.type === 'scope' && realization.operator === 'not') {
        realization = structuredClone(realization.operand);
      } else if (['event','state'].includes(realization.type)) {
        realization.features.polarity = realization.features.polarity === 'positive' ? 'negative' : 'positive';
      }
    }
  }
  validateInterlingua(act,engine.ontology,engine.features);
  validateInterlingua(realization,engine.ontology,engine.features);
  return {version:RESPONSE_PLANNER_VERSION,type:'response_plan',outcome:'answer',
    question,act,realization,evidence,reason:null,
    confidence:{level:'grounded',evidenceCount:evidence.length}};
}

function whPlan(question, rows, engine, clarifyQuestion, questionContext) {
  if (!questionEvent(question) || !question.targetRole) {
    return unknownPlan(question,'unsupported',[],clarifyQuestion,engine);
  }
  const candidates = [];
  for (const row of rows) {
    const event = propositionEvent(row.clause);
    if (!event || !Object.hasOwn(event.roles,question.targetRole)) continue;
    const rolePath=row.path+'.roles.'+question.targetRole;
    const referent=participantInQuestion(event.roles[question.targetRole],rolePath,
      row.context,questionContext);
    if (referent === null) continue;
    const realization = fillTarget(question,referent);
    const candidateContext={byPath:new Map(questionContext.byPath),scope:questionContext.scope};
    const identity=referenceIdFor(event.roles[question.targetRole],rolePath,row.context);
    if (identity !== null) {
      candidateContext.byPath.set('question.proposition.roles.'+question.targetRole,identity);
    }
    if (realization &&
        matchingKey(realization,'question.proposition',candidateContext) ===
          matchingKey(row.clause,row.path,row.context)) {
      candidates.push({referent,realization,row,
        identity:canonicalJson(matchingRole(event.roles[question.targetRole],rolePath,row.context))});
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = candidate.identity;
    if (!unique.has(key)) unique.set(key,candidate);
  }
  const evidence = candidates.map(candidate=>evidenceRef(candidate.row));
  if (!unique.size) return unknownPlan(question,'insufficient_context',[],clarifyQuestion,engine);
  if (unique.size > 1) return unknownPlan(question,'ambiguous',evidence,clarifyQuestion,engine);

  const selected = unique.values().next().value;
  const act = createDialogueAct('answer',{question,
    response:{type:'referent',value:structuredClone(selected.referent)}});
  validateInterlingua(act,engine.ontology,engine.features);
  validateInterlingua(selected.realization,engine.ontology,engine.features);
  return {version:RESPONSE_PLANNER_VERSION,type:'response_plan',outcome:'answer',
    question,act,realization:selected.realization,evidence,reason:null,
    confidence:{level:'grounded',evidenceCount:evidence.length}};
}

export function createResponsePlanner(engine) {
  if (!engine?.ontology || !engine?.features) throw new Error('Response planner requires a CORE engine.');
  return Object.freeze({
    version:RESPONSE_PLANNER_VERSION,
    plan({question:questionInput,facts,clarifyQuestion,referenceContext:referenceInput}={}) {
      const question = questionFrom(questionInput,engine);
      const references=buildReferenceContext(referenceInput);
      const rows = factRows(facts,engine,references.facts);
      return question.questionType === 'yes_no' ?
        yesNoPlan(question,rows,engine,clarifyQuestion,references.question) :
        whPlan(question,rows,engine,clarifyQuestion,references.question);
    }
  });
}
