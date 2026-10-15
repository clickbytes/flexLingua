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

function addFact(value, factIndex, engine, rows) {
  validateInterlingua(value, engine.ontology, engine.features);
  if (value.type === 'dialogue_act') {
    if (value.act !== 'assert') throw new Error('Only explicit assert acts can be used as response facts.');
    rows.push({clause:structuredClone(value.payload.proposition),factIndex});
  } else if (value.type === 'discourse') {
    value.events.forEach((event, eventIndex) => rows.push({
      clause:materializeEvent(value,event),factIndex,eventIndex
    }));
  } else if (['event','state','coordination','scope','complement','modality'].includes(value.type)) {
    rows.push({clause:structuredClone(value),factIndex});
  } else {
    throw new Error('Response facts must be validated propositions, assert acts, or discourse documents.');
  }
  if (rows.length > MAX_RESPONSE_FACTS) throw new Error(`Response facts exceed the ${MAX_RESPONSE_FACTS}-fact limit.`);
}

function factRows(facts, engine) {
  const rows = [];
  if (facts === undefined) return rows;
  if (Array.isArray(facts)) {
    if (facts.length > MAX_RESPONSE_FACTS) throw new Error(`Response facts exceed the ${MAX_RESPONSE_FACTS}-fact limit.`);
    facts.forEach((fact,index) => addFact(fact,index,engine,rows));
  } else addFact(facts,0,engine,rows);
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
function simpleTruth(node, inverted = false) {
  if (node?.type === 'scope' && node.operator === 'not') return simpleTruth(node.operand,!inverted);
  if (!['event','state'].includes(node?.type)) return null;
  const polarity = node.features?.polarity;
  if (!['positive','negative'].includes(polarity)) return null;
  const positive = structuredClone(node);
  positive.features.polarity = 'positive';
  return {base:positive,value:(polarity === 'positive') !== inverted};
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

function yesNoPlan(question, rows, engine, clarifyQuestion) {
  const expected = simpleTruth(question.proposition);
  const observations = [];
  for (const row of rows) {
    const actual = simpleTruth(row.clause);
    if (expected && actual && canonicalJson(expected.base) === canonicalJson(actual.base)) {
      observations.push({value:actual.value === expected.value,row});
    } else if (canonicalJson(row.clause) === canonicalJson(question.proposition)) {
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

function whPlan(question, rows, engine, clarifyQuestion) {
  if (!questionEvent(question) || !question.targetRole) {
    return unknownPlan(question,'unsupported',[],clarifyQuestion,engine);
  }
  const candidates = [];
  for (const row of rows) {
    const event = propositionEvent(row.clause);
    if (!event || !Object.hasOwn(event.roles,question.targetRole)) continue;
    const realization = fillTarget(question,event.roles[question.targetRole]);
    if (realization && canonicalJson(realization) === canonicalJson(row.clause)) {
      candidates.push({referent:event.roles[question.targetRole],realization,row});
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = canonicalJson(candidate.referent);
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
    plan({question:questionInput,facts,clarifyQuestion}={}) {
      const question = questionFrom(questionInput,engine);
      const rows = factRows(facts,engine);
      return question.questionType === 'yes_no' ?
        yesNoPlan(question,rows,engine,clarifyQuestion) :
        whPlan(question,rows,engine,clarifyQuestion);
    }
  });
}
