import { createEvent, createQuestion, createRelativeClause, createDialogueAct, createModality, createNegation,
  createIdentity, createPredication, createClassification, createPossession, createLocation, createExistence, createComparison, createInformationStructure, MAX_RELATIVE_DEPTH } from './meaning-graph.js';
import { createLexicon } from './lexicon.js';
import { getMorphologyRuntimeView } from './morphology/engine.js';
import { createNominalInterpreter } from './nominals.js';
import { createTextProfile, matchesTokens as matchTokenPhrase,
  firstToken as firstTextToken, sentenceText as formatSentence,
  tokenize as tokenizeText, validateTextProfile,
  textProfileForSignal } from './text.js';
import {EngineError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';
import {
  record, hasOwn, safeName, unifyFeatures, featureSource, GRAMMATICAL_PERSON,
  createFeatureRegistry, createLanguageFeatureProfile,
  matchesAgreement, matchesConditions
} from './features.js';

/**
 * Shared grammar interpreter v0.6 (compositional clauses and qualified noun phrases).
 * JSON defines linearizations, case selection, conditional inflection and agreement.
 * Required semantic roles occur once; optional roles occur at most once. An
 * @expletive slot requires a declared formal subject and never adds a CORE role.
 * it is not restricted to an S-V-O structure or complements after the verb.
 */
const GRAMMAR_VERSIONS = new Set(['0.6', '1.0']);
const MAX_ANALYSES = RESOURCE_LIMITS.grammarAnalyses;
const MAX_SEARCH_NODES = RESOURCE_LIMITS.grammarSearchNodes;
const searchBudget = counter => ({counter,memo:new Map(),nounPhraseMemo:new WeakMap(),
  jsonSignatures:new WeakMap(),relativeCommaIndexes:new WeakMap()});
function jsonSignature(value,budget) {
  if (!value || typeof value !== 'object') return value;
  if (budget.jsonSignatures.has(value)) return budget.jsonSignatures.get(value);
  const signature=JSON.stringify(value);
  budget.jsonSignatures.set(value,signature);
  return signature;
}
function commaIndexes(tokens,budget) {
  let indexes=budget.relativeCommaIndexes.get(tokens);
  if(indexes)return indexes;
  indexes=[];
  for(let index=0;index<tokens.length;index++)if(tokens[index]===',')indexes.push(index);
  budget.relativeCommaIndexes.set(tokens,indexes);
  return indexes;
}
function freezeCachedGraph(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeCachedGraph(child,seen);
  return Object.freeze(value);
}
function cacheNounPhraseCandidates(items) {
  for (const item of items) freezeCachedGraph(item.value);
  return Object.freeze(items);
}
function cloneNounPhraseCandidates(items) {
  return items.map(item=>({...item}));
}
function unsupported(message) {
  throw new EngineError('LANGUAGE_CONSTRUCTION_UNSUPPORTED', message, {status:'unsupported'});
}
function resourceLimit(message) {
  throw new EngineError('LANGUAGE_CONSTRUCTION_LIMIT', message, {status:'resource_limit'});
}
function boundedAnalyses(readings) {
  if (readings.length > MAX_ANALYSES) resourceLimit('Grammar analysis exceeded its reading budget.');
  return readings;
}
function defaultLinearizationId(sequence, count, reservedIds = new Set()) {
  const signature=JSON.stringify(sequence);
  const hashOf=value=>{
    let hash=2166136261;
    for(const character of value)hash=Math.imul(hash^character.charCodeAt(0),16777619);
    return (hash>>>0).toString(16).padStart(8,'0');
  };
  if(count===1&&!reservedIds.has('default'))return 'default';
  let salt=0,id;
  do { id=`default-${hashOf(salt?`${signature}:${salt}`:signature)}`; salt++; }
  while(reservedIds.has(id));
  return id;
}
const LEXEME_ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/u;
const PLACEHOLDER = /^\{([a-zA-Z][a-zA-Z0-9_]*)\}$/u;
const LITERAL = /^@[\p{L}]+$/u;
const MAX_LINEARIZATIONS_PER_FRAME = 8;
const MAX_LINEARIZATION_SLOTS = 16;
const VARIANT_ID = /^[a-z][a-z0-9.-]{0,63}$/u;
const FORBIDDEN_VARIANT_PARTS = new Set(['constructor','prototype']);
const MAX_SURFACE_VARIANTS = 32;
const LEGACY_CASE_VALUES = ['nom','gen','dat','acc','loc'];
const DEICTIC_FUNCTION = 'grammar.deictic_pronoun';
const STATE_ROLES = Object.freeze({
  identity: Object.freeze(['subject','complement']),
  predication: Object.freeze(['subject']),
  classification: Object.freeze(['subject','category']),
  possession: Object.freeze(['owner','owned']),
  location: Object.freeze(['subject','location']),
  existence: Object.freeze(['entity','location'])
});
const STATE_FORM_CELLS = Object.freeze([
  {path:'forms.present.firstSingular',tense:'present',person:'first',number:'singular'},
  {path:'forms.present.secondSingular',tense:'present',person:'second',number:'singular'},
  {path:'forms.present.thirdSingular',tense:'present',person:'third',number:'singular'},
  {path:'forms.present.firstPlural',tense:'present',person:'first',number:'plural'},
  {path:'forms.present.secondPlural',tense:'present',person:'second',number:'plural'},
  {path:'forms.present.thirdPlural',tense:'present',person:'third',number:'plural'},
  {path:'forms.past.firstSingular',tense:'past',person:'first',number:'singular'},
  {path:'forms.past.secondSingular',tense:'past',person:'second',number:'singular'},
  {path:'forms.past.thirdSingular',tense:'past',person:'third',number:'singular'},
  {path:'forms.past.firstPlural',tense:'past',person:'first',number:'plural'},
  {path:'forms.past.secondPlural',tense:'past',person:'second',number:'plural'},
  {path:'forms.past.thirdPlural',tense:'past',person:'third',number:'plural'},
  {path:'forms.past.singular.masculine',tense:'past',person:'third',number:'singular',gender:'masculine'},
  {path:'forms.past.singular.feminine',tense:'past',person:'third',number:'singular',gender:'feminine'},
  {path:'forms.past.singular.neuter',tense:'past',person:'third',number:'singular',gender:'neuter'},
  {path:'forms.past.plural.virile',tense:'past',person:'third',number:'plural',pluralClass:'virile'},
  {path:'forms.past.plural.nonvirile',tense:'past',person:'third',number:'plural',pluralClass:'nonvirile'}
]);
const MODAL_AGREEMENT_KEYS = [
  'firstSingular','secondSingular','thirdSingular',
  'firstPlural','secondPlural','thirdPlural'
];
const modalAgreementKey = (person, number) =>
  `${person}${number.charAt(0).toLocaleUpperCase('en')}${number.slice(1)}`;

function isDeicticReferent(ref) {
  return record(ref) && hasOwn(ref, 'referent');
}

function isAnaphoricReferent(ref) {
  return isDeicticReferent(ref) && ref.referent?.kind === 'anaphoric';
}

function implicitEventSubject(rule) {
  const person=rule?.when?.['subject.person'];
  const number=rule?.when?.['subject.number'];
  if(!['first','second'].includes(person) || !['singular','plural'].includes(number))return null;
  return {referent:{kind:'deictic',anchor:person==='first'?'speaker':'addressee'},
    agreement:{person,number}};
}

function own(obj, key) {
  return hasOwn(obj, key) ? obj[key] : undefined;
}

/** Validate and normalize the old slot arrays and opt-in variant descriptors. */
export function normalizeLinearizations(entries, label = 'frame') {
  if (!Array.isArray(entries) || entries.length < 1 ||
      entries.length > MAX_LINEARIZATIONS_PER_FRAME) {
    throw new Error(`Invalid linearization count for ${label}.`);
  }
  const defaultSequences = [];
  const variants = [];
  const seenIds = new Set();
  const seenSequences = new Set();
  for (const entry of entries) {
    const descriptor = !Array.isArray(entry);
    let sequence;
    let variantId;
    let realizationPreference;
    if (!descriptor) {
      sequence = entry;
    } else {
      const prototype = entry && typeof entry === 'object' ? Object.getPrototypeOf(entry) : undefined;
      if (!record(entry) || (prototype !== Object.prototype && prototype !== null) ||
          Object.keys(entry).sort().join(',') !== 'realizationPreference,sequence,variantId') {
        throw new Error(`Invalid linearization variant descriptor for ${label}.`);
      }
      ({sequence,variantId,realizationPreference} = entry);
      const idParts = typeof variantId === 'string' ? variantId.split(/[.-]/u) : [];
      if (typeof variantId !== 'string' || !VARIANT_ID.test(variantId) ||
          idParts.some(part => FORBIDDEN_VARIANT_PARTS.has(part)) || seenIds.has(variantId) ||
          !Number.isInteger(realizationPreference) || realizationPreference < 1 ||
          realizationPreference > 100) {
        throw new Error(`Invalid or duplicate linearization variant ID or preference for ${label}.`);
      }
      seenIds.add(variantId);
    }
    if (!Array.isArray(sequence) || sequence.length < 1 ||
        sequence.length > MAX_LINEARIZATION_SLOTS) {
      throw new Error(`Invalid linearization sequence length for ${label}.`);
    }
    const normalizedSequence = Array.from(sequence);
    if (normalizedSequence.some(step => typeof step !== 'string' ||
        !(safeName(step) || step === '@verb' || LITERAL.test(step))) ||
        normalizedSequence.filter(step => step === '@verb').length !== 1) {
      throw new Error(`Invalid linearization slot or @verb count for ${label}.`);
    }
    const roles = normalizedSequence.filter(step => !step.startsWith('@'));
    if (new Set(roles).size !== roles.length) {
      throw new Error(`Duplicate role slot in linearization for ${label}.`);
    }
    const sequenceKey = JSON.stringify(normalizedSequence);
    if (seenSequences.has(sequenceKey)) {
      throw new Error(`Duplicate linearization sequence for ${label}.`);
    }
    seenSequences.add(sequenceKey);
    if (descriptor) {
      variants.push({variantId,sequence:normalizedSequence,realizationPreference});
    } else {
      defaultSequences.push(normalizedSequence);
    }
  }
  if (variants.length && !defaultSequences.length) {
    throw new Error(`Linearization variants require an existing array default for ${label}.`);
  }
  // Keep every existing array first so the first array remains the default.
  return {
    sequences:[...defaultSequences,...variants.map(variant=>variant.sequence)],
    defaultSequences,
    variants
  };
}

function normalizeGrammarLinearizations(grammar) {
  if (!record(grammar)) return grammar;
  const normalizeFrames = (frames, label) => {
    if (!record(frames)) return frames;
    const normalized = Object.create(null);
    for (const [id, frame] of Object.entries(frames)) {
      if (!record(frame) || !Array.isArray(frame.linearizations)) {
        normalized[id] = frame;
        continue;
      }
      normalized[id] = {
        ...frame,
        linearizations:normalizeLinearizations(frame.linearizations, `${label} ${id}`).defaultSequences
      };
    }
    return normalized;
  };
  const result = {...grammar};
  if (record(grammar.frames)) result.frames = normalizeFrames(grammar.frames, 'event frame');
  if (record(grammar.states) && record(grammar.states.frames)) {
    result.states = {
      ...grammar.states,
      frames:normalizeFrames(grammar.states.frames, 'state frame')
    };
  }
  return result;
}

function pathParts(path) {
  if (typeof path !== 'string' || !path) throw new Error('Invalid grammar form path.');
  const parts = path.split('.');
  for (const part of parts) {
    if (!(safeName(part) || (PLACEHOLDER.test(part) && safeName(part.slice(1, -1))))) {
      throw new Error(`Unsafe grammar form path: ${path}`);
    }
  }
  return parts;
}

function formPlaceholders(path) {
  return pathParts(path).flatMap(part => part.match(PLACEHOLDER)?.[1] || []);
}

function bindingsForPath(expected, concrete) {
  if(typeof concrete!=='string'||!concrete)return null;
  const actual=concrete.split('.');
  if(expected.length!==actual.length)return null;
  let bindings={};
  for(let index=0;index<expected.length;index++){
    const placeholder=expected[index].match(PLACEHOLDER);
    if(placeholder){
      const unified=unifyFeatures(bindings,{[placeholder[1]]:actual[index]});
      if(!unified)return null;
      bindings=unified;
    }else if(expected[index]!==actual[index])return null;
  }
  return bindings;
}

function fullMorphologyPath(path) {
  if(typeof path!=='string'||!path)return null;
  return path==='forms'||path.startsWith('forms.')?path:`forms.${path}`;
}

function formsAt(lexeme, path, bridge) {
  const parts = pathParts(path);
  const legacy = [];
  function visit(value, index, bindings) {
    if (index === parts.length) {
      if (typeof value === 'string' && value.trim()) legacy.push({ text: value, bindings });
      return;
    }
    const placeholder = parts[index].match(PLACEHOLDER);
    if (placeholder) {
      if (!record(value)) return;
      for (const [key, inner] of Object.entries(value)) {
        if (!safeName(key)) continue;
        const unified = unifyFeatures(bindings, { [placeholder[1]]: key });
        if (unified) visit(inner, index + 1, unified);
      }
    } else {
      visit(own(value, parts[index]), index + 1, bindings);
    }
  }
  visit(lexeme, 0, {});
  const cells=(bridge?.cells||[]).flatMap(cell=>{
    const cellPath=fullMorphologyPath(cell.path);
    const bindings=bindingsForPath(parts,cellPath);
    const unified=bindings&&unifyFeatures(bindings,cell.features||{});
    return unified?[{cell:{...cell,path:cellPath},bindings:unified}]:[];
  });
  const coveredPaths=new Set(cells.map(({cell})=>cell.path));
  const candidates=(bridge?.candidates||[]).flatMap(candidate=>{
    const candidatePath=fullMorphologyPath(candidate.path);
    const bindings=bindingsForPath(parts,candidatePath);
    const consistent=bindings&&unifyFeatures(bindings,candidate.features||{});
    return consistent?[{text:candidate.text,bindings,path:candidatePath,
      morphologyFeatures:candidate.features||{},
      variant:candidate.variant,source:candidate.source,coreRefs:candidate.coreRefs,
      lexemeId:candidate.lexemeId}]:[];
  });
  const fallback=legacy.filter(form=>{
    const concrete=parts.map(part=>{
      const placeholder=part.match(PLACEHOLDER);
      return placeholder?form.bindings[placeholder[1]]:part;
    });
    return !concrete.some(value=>value===undefined)&&!coveredPaths.has(concrete.join('.'));
  });
  return [...candidates,...fallback];
}

function validateConditions(when) {
  if (!record(when)) throw new Error('Invalid grammar condition: expected an object.');
  for (const [source, value] of Object.entries(when)) {
    featureSource(source);
    if (!safeName(value)) throw new Error(`Invalid grammar condition value: ${source}`);
  }
}

function validateGrammar(dictionary, sourceGrammar, featureProfile) {
  const caseValues=featureProfile ? (featureProfile.syntactic.case || []) : LEGACY_CASE_VALUES;
  const hasSyntacticCases=caseValues.length>0;
  if (!record(dictionary) || !record(sourceGrammar) ||
      dictionary.language !== sourceGrammar.language ||
      !GRAMMAR_VERSIONS.has(sourceGrammar.version) || dictionary.version !== sourceGrammar.version) {
    throw new Error('Dictionary/grammar mismatch or unsupported grammar version.');
  }
  const grammar=normalizeGrammarLinearizations(sourceGrammar);
  if (!safeName(dictionary.language) || !Array.isArray(dictionary.nouns) ||
      !Array.isArray(dictionary.verbs) || !record(grammar.frames) ||
      !record(grammar.nounPhrase) || !record(grammar.verb) || !record(grammar.sentence)) {
    throw new Error('Incomplete declarative grammar or lexicon.');
  }
  if(grammar.temporalDeixis!==undefined) {
    const refs=['today','tomorrow','yesterday'];
    if(!record(grammar.temporalDeixis) ||
       Object.keys(grammar.temporalDeixis).length!==refs.length ||
       refs.some(ref=>!hasOwn(grammar.temporalDeixis,ref) ||
         !(typeof grammar.temporalDeixis[ref]==='string' ||
           Array.isArray(grammar.temporalDeixis[ref])) ||
         ![].concat(grammar.temporalDeixis[ref]).length ||
         ![].concat(grammar.temporalDeixis[ref]).every(word=>
           typeof word==='string' && /^[\p{L}]+$/u.test(word))) ||
       new Set(refs.flatMap(ref=>[].concat(grammar.temporalDeixis[ref]).map(word=>
         word.toLocaleLowerCase(dictionary.language)))).size !==
         refs.flatMap(ref=>[].concat(grammar.temporalDeixis[ref])).length) {
      throw new Error('Invalid temporal deixis grammar configuration.');
    }
  }
  if(grammar.numericTime!==undefined && (!record(grammar.numericTime) ||
      Object.keys(grammar.numericTime).length!==2 ||
      !['clockMarker','dateMarker'].every(key=>/^[\p{L}]+$/u.test(grammar.numericTime[key]||'')))) {
    throw new Error('Invalid numeric clock/date grammar configuration.');
  }
  if(grammar.comparison!==undefined && (!record(grammar.comparison) ||
      Object.keys(grammar.comparison).sort().join(',')!=='marker,standardCase,stateKind,subjectCase' ||
      !/^[\p{L}]+$/u.test(grammar.comparison.marker||'') ||
      grammar.comparison.stateKind!=='predication' ||
      !caseValues.includes(grammar.comparison.subjectCase) ||
      !caseValues.includes(grammar.comparison.standardCase))) {
    throw new Error('Invalid comparison grammar configuration.');
  }
  if(grammar.passive!==undefined) {
    const passive=grammar.passive;
    const validCell=cell=>(typeof cell==='string'&&/^[\p{L}]+$/u.test(cell))||
      (record(cell)&&Object.keys(cell).length>0&&Object.entries(cell).every(([key,value])=>
        ['masculine','feminine','neuter','virile','nonvirile'].includes(key)&&
        typeof value==='string'&&/^[\p{L}]+$/u.test(value)));
    if(!record(passive)||Object.keys(passive).sort().join(',')!=='agentCase,agentMarker,events'||
        !/^[\p{L}]+$/u.test(passive.agentMarker||'')||
        !['acc','dat','gen','loc'].includes(passive.agentCase)||!record(passive.events)||
        Object.keys(passive.events).length<1||Object.keys(passive.events).length>8) {
      throw new Error('Invalid passive voice grammar configuration.');
    }
    for(const [concept,tenses] of Object.entries(passive.events)) {
      const frame=grammar.frames[concept];
      if(!record(tenses)||Object.keys(tenses).length!==1||!hasOwn(tenses,'past')||
          !frame||!frame.linearizations?.some(sequence=>sequence.includes('theme'))||
          !dictionary.verbs.some(verb=>verb.senses?.some(sense=>sense.coreRef?.id===concept))) {
        throw new Error(`Invalid passive event frame: ${concept}`);
      }
      const paradigm=tenses.past;
      if(!record(paradigm)||Object.keys(paradigm).sort().join(',')!=='auxiliary,participle'||
          ['auxiliary','participle'].some(key=>!record(paradigm[key])||
            Object.keys(paradigm[key]).sort().join(',')!=='plural,singular'||
            !Object.values(paradigm[key]).every(validCell))) {
        throw new Error(`Invalid passive past paradigm: ${concept}`);
      }
    }
  }
  if(grammar.request!==undefined && (!record(grammar.request) ||
      Object.keys(grammar.request).sort().join(',')!=='actionPath,marker' ||
      !/^[\p{L}]+$/u.test(grammar.request.marker||'') ||
      !['lemma','forms.base'].includes(grammar.request.actionPath))) {
    throw new Error('Invalid polite request grammar configuration.');
  }
  if (!safeName(grammar.sentence.subjectRole) ||
      grammar.sentence.terminator !== '.') {
    throw new Error('Invalid sentence configuration.');
  }
  if(grammar.replyStyles!==undefined &&
      (!record(grammar.replyStyles) ||
       Object.keys(grammar.replyStyles).sort().join(',')!=='emphatic,standard' ||
       grammar.replyStyles.standard!=='.' || grammar.replyStyles.emphatic!=='!')) {
    throw new Error('Invalid reply style grammar configuration.');
  }
  if(grammar.conditional!==undefined&&(!record(grammar.conditional)||
      Object.keys(grammar.conditional).sort().join(',')!=='if,otherwise,then'||
      Object.values(grammar.conditional).some(marker=>
        typeof marker!=='string'||! /^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(marker)))) {
    throw new Error('Invalid conditional grammar configuration.');
  }
  // Connectives, wide negation and relative markers belong to target-language JSON.
  const coordination = grammar.sentence.coordination;
  if (!record(coordination) || !/^[\p{L}]+$/u.test(coordination.and || '') ||
      !(coordination.wideNegation === null || /^[\p{L}]+(?:,?\s+[\p{L}]+)*$/u.test(coordination.wideNegation || ''))) {
    throw new Error('Invalid declarative coordination or scope rule.');
  }
  const relative = grammar.nounPhrase.relatives;
  if (!record(relative) || !Number.isInteger(relative.maxDepth) || relative.maxDepth < 0 || relative.maxDepth > MAX_RELATIVE_DEPTH ||
      !['commas','none'].includes(relative.punctuation) ||
      !Array.isArray(relative.markers) || (relative.maxDepth > 0 && relative.markers.length < 1) || relative.markers.length > 24 ||
      relative.markers.some(marker => !record(marker) || !safeName(marker.gap) ||
        !/^[\p{L}]+$/u.test(marker.text || '') ||
        (marker.when !== undefined && (!record(marker.when) ||
          Object.entries(marker.when).some(([key,val]) =>
            !['number','gender','pluralClass'].includes(key) || !safeName(val)))))) {
    throw new Error('Invalid declarative relative-clause markers.');
  }
  const quantityModel=grammar.nounPhrase.quantity;
  const quantityNumbers=featureProfile?.morphology?.number||['singular','plural'];
  if(quantityModel!==undefined) {
    const exactNumberKeys=record(quantityModel.exactNumber)?Object.keys(quantityModel.exactNumber):[];
    const validQuantityNumber=value=>typeof value==='string'&&quantityNumbers.includes(value);
    const validQuantityConditions=conditions=>record(conditions)&&
      Object.entries(conditions).every(([key,value])=>
        (key==='number'?validQuantityNumber(value):key==='case'&&caseValues.includes(value)));
    if(!record(quantityModel)||Object.keys(quantityModel).some(key=>
        !['classifiers','defaultNumber','exactNumber','version','caseOverrides','agreementOverrides'].includes(key))||
        !['classifiers','defaultNumber','exactNumber','version'].every(key=>hasOwn(quantityModel,key))||
        quantityModel.version!=='1.0'||
        !validQuantityNumber(quantityModel.defaultNumber)||!record(quantityModel.exactNumber)||
        exactNumberKeys.length>21||exactNumberKeys.some(key=>! /^(?:0|[1-9]|1[0-9]|20)$/u.test(key)||
          !validQuantityNumber(quantityModel.exactNumber[key]))||
        !Array.isArray(quantityModel.classifiers)||quantityModel.classifiers.length>16||
        (quantityModel.caseOverrides!==undefined&&(!Array.isArray(quantityModel.caseOverrides)||
          quantityModel.caseOverrides.length>16||quantityModel.caseOverrides.some(rule=>
            !record(rule)||Object.keys(rule).sort().join(',')!=='from,to,values'||
            !Array.isArray(rule.from)||!rule.from.length||rule.from.some(value=>!caseValues.includes(value))||
            !caseValues.includes(rule.to)||!Array.isArray(rule.values)||!rule.values.length||
            rule.values.some(value=>!Number.isInteger(value)||value<0||value>20))))||
        (quantityModel.agreementOverrides!==undefined&&(!Array.isArray(quantityModel.agreementOverrides)||
          quantityModel.agreementOverrides.length>16||quantityModel.agreementOverrides.some(rule=>
            !record(rule)||Object.keys(rule).sort().join(',')!=='number,values'||
            !validQuantityNumber(rule.number)||!Array.isArray(rule.values)||!rule.values.length||
            rule.values.some(value=>!Number.isInteger(value)||value<0||value>20))))) {
      throw new Error('Invalid exact-quantity grammar contract.');
    }
    const classifierIds=new Set();
    const classifierRules=[];
    for(const classifier of quantityModel.classifiers) {
      if(!record(classifier)||Object.keys(classifier).sort().join(',')!==
          'concepts,forms,id,required,when'||!safeName(classifier.id)||classifierIds.has(classifier.id)||
          !Array.isArray(classifier.concepts)||!classifier.concepts.length||classifier.concepts.length>16||
          classifier.concepts.some(concept=>!LEXEME_ID.test(concept))||
          new Set(classifier.concepts).size!==classifier.concepts.length||
          !validQuantityConditions(classifier.when)||typeof classifier.required!=='boolean'||
          !Array.isArray(classifier.forms)||!classifier.forms.length||classifier.forms.length>16||
          classifier.forms.some(form=>!record(form)||
            Object.keys(form).some(key=>!['text','when'].includes(key))||
            !/^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(form.text||'')||
            form.when!==undefined&&!validQuantityConditions(form.when))) {
        throw new Error(`Invalid classifier declaration: ${classifier?.id}`);
      }
      const overlap=classifierRules.some(previous=>
        previous.concepts.some(concept=>classifier.concepts.includes(concept))&&
        Object.entries(previous.when).every(([key,value])=>
          !hasOwn(classifier.when,key)||classifier.when[key]===value));
      if(overlap)throw new Error(`Ambiguous classifier declaration: ${classifier.id}`);
      classifierIds.add(classifier.id);
      classifierRules.push(classifier);
    }
  }

  const anaphora=grammar.anaphora;
  if(anaphora!==undefined){
    if(!record(anaphora) || Object.keys(anaphora).length!==1 ||
        !Array.isArray(anaphora.subjectPronouns) ||
        anaphora.subjectPronouns.length<1 || anaphora.subjectPronouns.length>8){
      throw new Error('Invalid anaphora grammar inventory.');
    }
    const seen=new Set(),seenAgreements=new Set();
    const grammaticalGenders=new Set(['feminine','masculine','neuter']);
    if(dictionary.nouns.some(noun=>noun.gender!==undefined&&
        !grammaticalGenders.has(noun.gender))){
      throw new Error('Invalid lexical grammatical gender for third-person agreement.');
    }
    for(const entry of anaphora.subjectPronouns){
      const agreement=entry?.agreement;
      const agreementKey=record(agreement)?JSON.stringify(agreement):'';
      if(!record(entry) || Object.keys(entry).sort().join(',')!=='agreement,text' ||
          !/^[\p{L}]+$/u.test(entry.text||'') ||
          seen.has(entry.text.toLocaleLowerCase(grammar.language)) ||
          !record(agreement) || Object.keys(agreement).sort().join(',')!=='gender,number,person' ||
          agreement.person!=='third' || agreement.number!=='singular' ||
          !['feminine','masculine'].includes(agreement.gender) || seenAgreements.has(agreementKey)){
        throw new Error('Invalid subject pronoun declaration.');
      }
      seen.add(entry.text.toLocaleLowerCase(grammar.language));
      seenAgreements.add(agreementKey);
    }
  }

  const deictic=grammar.deicticPronouns;
  if(deictic!==undefined){
    const functionWords=dictionary.functionWords || [];
    const seen=new Set();
    const seenSenses=new Set();
    const senses=new Map(functionWords.flatMap(word=>(word.senses||[]).map(sense=>
      [sense.id,{word,sense}])));
    if(!Array.isArray(deictic) || deictic.length<3 || deictic.length>16){
      throw new Error('Invalid deictic pronoun grammar inventory.');
    }
    for(const entry of deictic){
      const found=senses.get(entry?.senseId);
      const key=JSON.stringify([entry?.referent?.anchor,entry?.person,entry?.number,entry?.case]);
      if(!record(entry) || Object.keys(entry).sort().join(',')!=='case,number,person,referent,senseId' ||
          !LEXEME_ID.test(entry.senseId||'') || !found ||
          found.sense.coreRef?.kind!=='grammaticalFunction' ||
          found.sense.coreRef.id!==DEICTIC_FUNCTION ||
          !record(entry.referent) || Object.keys(entry.referent).sort().join(',')!=='anchor,kind' ||
          entry.referent.kind!=='deictic' || !['speaker','addressee','demonstrative'].includes(entry.referent.anchor) ||
          !['first','second','third'].includes(entry.person) ||
          !['singular','plural'].includes(entry.number) ||
          !caseValues.includes(entry.case) ||
          (entry.referent.anchor==='speaker' && entry.person!=='first') ||
          (entry.referent.anchor==='addressee' && entry.person!=='second') ||
          (entry.referent.anchor==='demonstrative' &&
            (entry.person!=='third'||entry.number!=='singular')) || seen.has(key) ||
          seenSenses.has(`${entry.senseId}:${entry.case}`) ||
          !found.word.forms.every(form=>/^[\p{L}]+$/u.test(form.text||''))){
        throw new Error('Invalid deictic pronoun declaration.');
      }
      seen.add(key);
      seenSenses.add(`${entry.senseId}:${entry.case}`);
      const formTexts=found.word.forms.map(form=>form.text.toLocaleLowerCase(grammar.language));
      if(formTexts.some(text=>(grammar.anaphora?.subjectPronouns || []).some(item=>
          item.text.toLocaleLowerCase(grammar.language)===text))){
        throw new Error('Deictic pronouns cannot overlap the third-person anaphora inventory.');
      }
    }
    const required=[
      ['speaker','first','singular','nom'],['speaker','first','plural','nom'],
      ['addressee','second','singular','nom'],['addressee','second','plural','nom']
    ];
    if(!required.every(item=>seen.has(JSON.stringify(item)))){
      throw new Error('Incomplete deictic pronoun agreement inventory.');
    }
    if(!seen.has(JSON.stringify(['demonstrative','third','singular','nom'])))
      throw new Error('Missing proximal demonstrative subject pronoun.');
  }

  const modality=grammar.modality;
  if (dictionary.modals?.length || modality !== undefined) {
    if (!record(modality) ||
        !['lemma','forms.base'].includes(modality.infinitivePath) ||
        modality.supportedTense !== 'present' ||
        !['prefix','front'].includes(modality.questionStrategy) ||
        modality.questionStrategy !== (grammar.questions?.yesNo?.mode === 'prefix' ? 'prefix' : 'front') ||
        !Array.isArray(dictionary.modals) || dictionary.modals.length > 4) {
      throw new Error('Invalid declarative modal grammar configuration.');
    }
    const legalWord=value=>typeof value==='string' &&
      /^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(value);
    for (const item of dictionary.modals) {
      if (!LEXEME_ID.test(item.id || '') || !record(item.forms) ||
          !Array.isArray(item.senses) || item.senses.length !== 1 ||
          item.senses[0].coreRef?.kind !== 'operator' ||
          !['modality.ability','modality.obligation','modality.intention'].includes(item.senses[0].coreRef.id) ||
          Object.keys(item.forms).some(k=>!['positive','negative','prohibition'].includes(k)) ||
          !record(item.forms.positive) ||
          !MODAL_AGREEMENT_KEYS.every(key=>legalWord(item.forms.positive[key])) ||
          Object.keys(item.forms.positive).length!==MODAL_AGREEMENT_KEYS.length ||
          (item.senses[0].coreRef.id!=='modality.intention' &&
            (!record(item.forms.negative) ||
              !MODAL_AGREEMENT_KEYS.every(key=>legalWord(item.forms.negative[key])) ||
              Object.keys(item.forms.negative).length!==MODAL_AGREEMENT_KEYS.length)) ||
          (item.senses[0].coreRef.id==='modality.intention' &&
            Object.keys(item.forms).some(key=>key!=='positive')) ||
          (item.forms.prohibition !== undefined &&
            (item.senses[0].coreRef.id !== 'modality.obligation' ||
              !record(item.forms.prohibition) ||
              !MODAL_AGREEMENT_KEYS.every(key=>legalWord(item.forms.prohibition[key])) ||
              Object.keys(item.forms.prohibition).length!==MODAL_AGREEMENT_KEYS.length))) {
        throw new Error('Invalid or unsupported modal lexical paradigm.');
      }
    }
  }

  const questions=grammar.questions;
  if (questions !== undefined) {
    const word=value=>typeof value==='string' && /^[\p{L}]+$/u.test(value);
    const allowed=(object,keys)=>record(object) &&
      Object.keys(object).every(key=>keys.includes(key));
    if (!allowed(questions,['yesNo','wh']) || !record(questions.yesNo) ||
        !allowed(questions.wh,['agent','theme','location','destination']) ||
        !record(questions.wh.agent) || !record(questions.wh.theme) ||
        !word(questions.wh.agent.marker) || !word(questions.wh.theme.marker) ||
        questions.wh.agent.marker===questions.wh.theme.marker ||
        !allowed(questions.wh.agent,['marker','agreement']) ||
        !allowed(questions.wh.theme,['marker','caseMarkers','order']) ||
        !['verb_first','auxiliary'].includes(questions.wh.theme.order)) {
      throw new Error('Invalid interrogative grammar configuration.');
    }
    if (!record(questions.wh.location) || !word(questions.wh.location.marker) ||
        !allowed(questions.wh.location,['marker']) ||
        !record(questions.wh.destination) || !word(questions.wh.destination.marker) ||
        !word(questions.wh.destination.preposition) ||
        !allowed(questions.wh.destination,['marker','preposition','order']) ||
        (questions.wh.destination.order!==undefined &&
          !['frame','verb_first'].includes(questions.wh.destination.order))) {
      throw new Error('Invalid spatial WH grammar configuration.');
    }
    const agreement=questions.wh.agent.agreement;
    if (!record(agreement) || !['number','gender','pluralClass'].every(key=>safeName(agreement[key])) ||
        Object.keys(agreement).length!==3) {
      throw new Error('Invalid WH subject-gap agreement.');
    }
    const markers=questions.wh.theme.caseMarkers || {};
    if (!record(markers) || Object.entries(markers).some(([gramCase,marker])=>
        !safeName(gramCase) || !word(marker) || marker===questions.wh.theme.marker) ||
        new Set([questions.wh.theme.marker,...Object.values(markers)]).size!==Object.keys(markers).length+1) {
      throw new Error('Invalid WH case-sensitive markers.');
    }
    const yesNo=questions.yesNo;
    if (yesNo.mode==='prefix') {
      if (!allowed(yesNo,['mode','marker']) || !word(yesNo.marker) ||
          questions.wh.theme.order!=='verb_first') {
        throw new Error('Invalid prefix question grammar.');
      }
    } else if (yesNo.mode==='auxiliary') {
      const aux=yesNo.auxiliaries;
      const auxiliaryKeys=['past','presentFirst','presentSecond',
        'presentThirdSingular','presentThirdPlural'];
      if (!allowed(yesNo,['mode','auxiliaries','baseVerbPath','negator']) ||
          !record(aux) || !auxiliaryKeys.every(key=>word(aux[key])) ||
          Object.keys(aux).length!==auxiliaryKeys.length ||
          new Set(Object.values(aux)).size!==3 ||
          !word(yesNo.negator) || !yesNo.baseVerbPath ||
          formPlaceholders(yesNo.baseVerbPath).length ||
          questions.wh.theme.order!=='auxiliary' ||
          Object.keys(markers).length) {
        throw new Error('Invalid auxiliary question grammar.');
      }
    } else {
      throw new Error('Unsupported interrogative strategy.');
    }
  }
  const nounVariables = formPlaceholders(grammar.nounPhrase.path);
  if (nounVariables.some(part => !['number', 'case'].includes(part)) ||
      !nounVariables.includes('number') || typeof grammar.nounPhrase.allowBare !== 'boolean') {
    throw new Error('Unsupported noun form placeholder or bare-noun policy.');
  }
  if (!hasSyntacticCases && (nounVariables.includes('case') ||
      grammar.nounPhrase.subjectCase !== null)) {
    throw new Error('Caseless language cannot declare a noun case or nominative default.');
  }
  const deicticCases=grammar.nounPhrase.deicticCases;
  if (deicticCases!==undefined && (!record(deicticCases) ||
      Object.entries(deicticCases).some(([role,value])=>
        !safeName(role) || !(value===null&&!hasSyntacticCases) && !caseValues.includes(value)))) {
    throw new Error('Invalid deictic pronoun case profile.');
  }
  if (!record(grammar.nounPhrase.determiners)) throw new Error('Invalid determiner mappings.');
  for (const [number, mappings] of Object.entries(grammar.nounPhrase.determiners)) {
    if (!safeName(number) || !record(mappings)) {
      throw new Error('Invalid determiner number mapping.');
    }
    for (const [def, mapping] of Object.entries(mappings)) {
      if (!safeName(def) || !record(mapping) ||
          Number(hasOwn(mapping, 'literal')) + Number(hasOwn(mapping, 'lexemeProperty')) +
            Number(hasOwn(mapping, 'omit')) !== 1 ||
          (hasOwn(mapping, 'literal') &&
            (typeof mapping.literal !== 'string' || !/^[\p{L}]+$/u.test(mapping.literal))) ||
          (hasOwn(mapping, 'lexemeProperty') && !safeName(mapping.lexemeProperty)) ||
          (hasOwn(mapping, 'omit') && mapping.omit !== true)) {
        throw new Error('Invalid determiner rule.');
      }
    }
  }
  const possessives=grammar.nounPhrase.possessives || [];
  if(!Array.isArray(possessives) || possessives.length>8 || possessives.some(entry=>
    !record(entry) || !['anchor','forms','number','person'].every(key=>hasOwn(entry,key)) ||
    Object.keys(entry).some(key=>!['anchor','forms','number','person','standaloneForms'].includes(key)) ||
    !['speaker','addressee'].includes(entry.anchor) ||
    !['first','second'].includes(entry.person) || !['singular','plural'].includes(entry.number) ||
    (entry.anchor==='speaker')!==(entry.person==='first') ||
    !Array.isArray(entry.forms) || !entry.forms.length || entry.forms.length>32 ||
    entry.forms.some(form=>!record(form) ||
      Object.keys(form).some(key=>!['text','when'].includes(key)) ||
      !/^[\p{L}]+$/u.test(form.text||'') ||
      (form.when!==undefined && (!record(form.when) ||
        Object.entries(form.when).some(([key,value])=>
          !['number','case','gender','pluralClass','animacy'].includes(key) || !safeName(value))))) ||
    (entry.standaloneForms!==undefined && (!Array.isArray(entry.standaloneForms) ||
      !entry.standaloneForms.length || entry.standaloneForms.length>32 ||
      entry.standaloneForms.some(form=>!record(form) ||
        Object.keys(form).some(key=>!['text','when'].includes(key)) ||
        !/^[\p{L}]+$/u.test(form.text||'') ||
        (form.when!==undefined && (!record(form.when) ||
          Object.entries(form.when).some(([key,value])=>
            !['number','case','gender','pluralClass','animacy'].includes(key) || !safeName(value))))))))) {
    throw new Error('Invalid possessive pronoun grammar inventory.');
  }
  for (const property of ['defaultDefiniteness', 'alternativeDefiniteness']) {
    if (grammar.nounPhrase[property] !== undefined &&
        !safeName(grammar.nounPhrase[property])) {
      throw new Error(`Invalid ${property}.`);
    }
  }
  if (!Array.isArray(grammar.verb.rules) || !grammar.verb.rules.length ||
      !['lexeme', 'unknown'].includes(grammar.verb.aspectSource) ||
      !record(grammar.verb.agreement)) {
    throw new Error('Invalid verb rules, aspect source or agreement.');
  }
  for (const [binding, source] of Object.entries(grammar.verb.agreement)) {
    if (!safeName(binding)) throw new Error('Invalid agreement binding name.');
    featureSource(source);
  }
  const seen = new Set();
  for (const rule of grammar.verb.rules) {
    if (!safeName(rule.tense) || !safeName(rule.polarity) ||
        (rule.aspect!==undefined && !['perfective','imperfective','unknown'].includes(rule.aspect)) ||
        !Array.isArray(rule.prefix) ||
        !rule.prefix.every(word => typeof word === 'string' && /^[\p{L}]+$/u.test(word))) {
      throw new Error('Invalid declarative verb rule.');
    }
    if (formPlaceholders(rule.path).some(part => !hasOwn(grammar.verb.agreement, part))) {
      throw new Error('Unsupported verb form placeholder (missing agreement dependency).');
    }
    validateConditions(rule.when || {});
    const key = JSON.stringify([rule.tense, rule.polarity,rule.aspect||null,rule.prefix,rule.path,
      Object.entries(rule.when || {}).sort(([a], [b]) => a.localeCompare(b))]);
    if (seen.has(key)) throw new Error(`Duplicate verb rule: ${key}`);
    seen.add(key);
  }
  if (!record(grammar.cases || {})) throw new Error('Invalid cases mapping.');
  if (!Array.isArray(grammar.cases?.alternations || [])) {
    throw new Error('Invalid case alternations: expected an array.');
  }
  for (const rule of grammar.cases?.alternations || []) {
    if (!safeName(rule?.from) || !safeName(rule?.to)) {
      throw new Error('Invalid case alternation rule.');
    }
    validateConditions(rule.when);
    // Role-case conditions must be decidable before the rest of the sentence is analyzed.
    if (Object.keys(rule.when).some(source => !source.startsWith('event.'))) {
      throw new Error('Case alternations currently require event.* conditions.');
    }
  }
  for (const [concept, frame] of Object.entries(grammar.frames)) {
    const implicitSubject=frame?.implicitSubject;
    if (typeof concept !== 'string' || !record(frame) ||
        (frame.whTheme !== undefined && typeof frame.whTheme !== 'boolean' &&
          (!record(frame.whTheme) ||
            Object.keys(frame.whTheme).length !== 1 ||
            typeof frame.whTheme.frontPreposition !== 'string' ||
            !/^[\p{L}]+$/u.test(frame.whTheme.frontPreposition) ||
            grammar.questions?.yesNo?.mode !== 'prefix')) ||
        (frame.caseAlternations !== undefined && typeof frame.caseAlternations !== 'boolean') ||
        (implicitSubject!==undefined && (!record(implicitSubject) ||
          Object.keys(implicitSubject).sort().join(',')!=='analysis,realization' ||
          typeof implicitSubject.analysis!=='boolean' ||
          typeof implicitSubject.realization!=='boolean' ||
          (!implicitSubject.analysis&&!implicitSubject.realization))) ||
        (frame.bareRoles !== undefined && (!Array.isArray(frame.bareRoles) ||
          !frame.bareRoles.every(safeName) || new Set(frame.bareRoles).size !== frame.bareRoles.length)) ||
        (frame.bareRoleConcepts !== undefined && (!record(frame.bareRoleConcepts) ||
          Object.entries(frame.bareRoleConcepts).some(([role, ids]) => !safeName(role) ||
            !Array.isArray(ids) || !ids.length || !ids.every(id=>
              typeof id==='string' && /^[a-z][a-z0-9_.-]*$/u.test(id)) ||
            new Set(ids).size !== ids.length))) ||
        !Array.isArray(frame.linearizations) || !frame.linearizations.length ||
        !frame.linearizations.every(sequence => Array.isArray(sequence) && sequence.length &&
          sequence.every(step => typeof step === 'string' &&
            (safeName(step) || step === '@verb' || LITERAL.test(step))))) {
      throw new Error(`Invalid linearizations for ${concept}.`);
    }
    if(frame.agreement!==undefined){
      if(!record(frame.agreement)||!Object.keys(frame.agreement).length||
          Object.entries(frame.agreement).some(([binding,source])=>
            !safeName(binding)||!hasOwn(grammar.verb.agreement,binding)||typeof source!=='string')){
        throw new Error(`Invalid frame agreement mapping for ${concept}.`);
      }
      const controllers=[...new Set([...frame.linearizations.flat().filter(step=>!step.startsWith('@')),
        'object','possessor'])];
      for(const source of Object.values(frame.agreement)){
        try{featureSource(source,featureProfile,controllers);}
        catch{throw new Error(`Invalid agreement controller for ${concept}: ${source}`);}
      }
    }
    const usesExpletive=frame.linearizations.some(sequence=>sequence.includes('@expletive'));
    const formalSubject=frame.formalSubject;
    const agreementFeatures=new Set(['person','number','gender','pluralClass']);
    if(usesExpletive!==hasOwn(frame,'formalSubject') ||
        (formalSubject!==undefined && (!record(formalSubject) ||
          Object.keys(formalSubject).sort().join(',')!=='agreement,surface' ||
          !/^[\p{L}]+$/u.test(formalSubject.surface||'') ||
          !record(formalSubject.agreement) || !Object.keys(formalSubject.agreement).length ||
          Object.entries(formalSubject.agreement).some(([name,value])=>
            !agreementFeatures.has(name)||!safeName(value)))) ||
        frame.linearizations.some(sequence=>sequence.filter(step=>step==='@expletive').length>1)) {
      throw new Error(`Invalid formal subject/expletive declaration for ${concept}.`);
    }
  }
  const stateSenses = (dictionary.verbs || []).flatMap(verb => verb.senses || [])
    .filter(sense => sense.coreRef?.kind === 'grammaticalFunction' &&
      ['grammar.state_copula','grammar.state_possession','grammar.state_location'].includes(sense.coreRef.id));
  if (grammar.states === undefined) {
    if (stateSenses.length) throw new Error('Missing state grammar for state verb lexemes.');
    return grammar;
  }
  const states = grammar.states;
  if (!record(states) ||
      Object.keys(states).some(key => !['negator','supportedTenses','supportedPolarities','supportedTensesByPolarity','verbs','frames',
        'pastPredication',
        'unsupportedVerbs','negativeStrategies'].includes(key)) ||
      !['negator','supportedTenses','verbs','frames'].every(key => hasOwn(states,key)) ||
      !/^[\p{L}]+$/u.test(states.negator || '') ||
      !Array.isArray(states.supportedTenses) || !states.supportedTenses.length ||
      !states.supportedTenses.every(safeName) || !record(states.verbs) ||
      (states.supportedPolarities !== undefined &&
        (!Array.isArray(states.supportedPolarities) || !states.supportedPolarities.length ||
          !states.supportedPolarities.every(value=>['positive','negative'].includes(value)) ||
          new Set(states.supportedPolarities).size!==states.supportedPolarities.length)) ||
      (states.supportedTensesByPolarity !== undefined &&
        (!record(states.supportedTensesByPolarity) ||
          Object.entries(states.supportedTensesByPolarity).some(([polarity,tenses])=>
            !['positive','negative'].includes(polarity) ||
            !(states.supportedPolarities || ['positive','negative']).includes(polarity) ||
            !Array.isArray(tenses) || !tenses.length ||
            !tenses.every(tense=>states.supportedTenses.includes(tense)) ||
            new Set(tenses).size!==tenses.length))) ||
      !record(states.frames) ||
      (states.negativeStrategies!==undefined && (!record(states.negativeStrategies) ||
        Object.entries(states.negativeStrategies).some(([kind,strategy])=>
          !['identity','predication','classification','possession','location','existence'].includes(kind) ||
          !['preverbal','postverbal','do-support','replacement'].includes(strategy)))) ||
      (states.unsupportedVerbs !== undefined && !Array.isArray(states.unsupportedVerbs))) {
    throw new Error('Invalid state grammar configuration.');
  }
  if(states.pastPredication!==undefined && (states.pastPredication!=='positive_statement' ||
      !states.supportedTenses.includes('past') || !hasOwn(states.frames,'predication'))) {
    throw new Error('Invalid past predication state contract.');
  }
  const configuredFunctions = Object.keys(states.verbs);
  const actualFunctions = [...new Set(stateSenses.map(sense => sense.coreRef.id))].sort();
  const unsupportedFunctions=states.unsupportedVerbs || [];
  const declaredFunctions=[...configuredFunctions,...unsupportedFunctions];
  if (new Set(declaredFunctions).size!==declaredFunctions.length ||
      unsupportedFunctions.some(coreFunction=>!LEXEME_ID.test(coreFunction)) ||
      JSON.stringify(declaredFunctions.slice().sort()) !== JSON.stringify(actualFunctions)) {
    throw new Error('State grammar and state-verb lexicon do not match.');
  }
  const stateKinds = new Set();
  for (const [coreFunction, configuredKinds] of Object.entries(states.verbs)) {
    const kinds=Array.isArray(configuredKinds)?configuredKinds:[configuredKinds];
    if (!LEXEME_ID.test(coreFunction) || !kinds.length || new Set(kinds).size!==kinds.length ||
        kinds.some(kind=>!['identity','predication','classification','possession','location','existence'].includes(kind) ||
          !hasOwn(states.frames,kind))) {
      throw new Error(`Invalid state verb mapping: ${coreFunction}`);
    }
    for(const kind of kinds)stateKinds.add(kind);
  }
  if (Object.keys(states.frames).length !== stateKinds.size ||
      Object.keys(states.frames).some(kind => !stateKinds.has(kind))) {
    throw new Error('State grammar must define exactly the configured construction frames.');
  }
  for (const [kind, frame] of Object.entries(states.frames)) {
    const roles = STATE_ROLES[kind];
    const hasPredicate = kind === 'predication';
    const slots = hasPredicate ? [...roles, frame?.predicateRole] : roles;
    if (!record(frame) ||
        Object.keys(frame).some(key => !['subjectRole','cases','linearizations','prepositions',
          'supportedTenses','negativeVerbForms',
          'allowImplicitDeicticSubject','existentialMarker','existentialTenses',
          ...(hasPredicate ? ['predicateRole','predicateCase'] : [])].includes(key)) ||
        !['subjectRole','cases','linearizations'].every(key => hasOwn(frame,key)) ||
        (hasPredicate && (frame.predicateRole !== 'predicate' || !safeName(frame.predicateRole) ||
          (hasSyntacticCases?!safeName(frame.predicateCase):frame.predicateCase!==null) ||
          frame.allowImplicitDeicticSubject === true)) ||
        (frame.allowImplicitDeicticSubject !== undefined &&
          typeof frame.allowImplicitDeicticSubject !== 'boolean') ||
        frame.subjectRole !== (kind === 'possession' ? 'owner' : kind==='existence'?'entity':'subject') ||
        (['location','existence'].includes(kind) && (!record(frame.prepositions) ||
          Object.keys(frame.prepositions).length !== 3 ||
          Object.keys(frame.prepositions).some(preposition=>!safeName(preposition)) ||
          new Set(Object.values(frame.prepositions)).size!==3 ||
          Object.values(frame.prepositions).some(value=>!['interior','surface','point'].includes(value)))) ||
        (!['location','existence'].includes(kind) && frame.prepositions!==undefined) ||
        (frame.negativeVerbForms!==undefined && (kind!=='existence' ||
          !record(frame.negativeVerbForms) ||
          Object.keys(frame.negativeVerbForms).sort().join(',')!=='plural,singular' ||
          Object.values(frame.negativeVerbForms).some(value=>typeof value!=='string' ||
            !/^[\p{L}']+$/u.test(value)))) ||
        (frame.existentialMarker!==undefined && (kind!=='location' ||
          !safeName(frame.existentialMarker) || !Array.isArray(frame.existentialTenses) ||
          !frame.existentialTenses.length || new Set(frame.existentialTenses).size!==frame.existentialTenses.length ||
          frame.existentialTenses.some(tense=>!states.supportedTenses.includes(tense)) ||
          !Array.isArray(frame.linearizations) ||
          !frame.linearizations.some(sequence=>sequence.includes('@'+frame.existentialMarker)))) ||
        (frame.existentialTenses!==undefined && frame.existentialMarker===undefined) ||
        (frame.supportedTenses!==undefined &&
          (!Array.isArray(frame.supportedTenses) || !frame.supportedTenses.length ||
            new Set(frame.supportedTenses).size!==frame.supportedTenses.length ||
            frame.supportedTenses.some(tense=>!states.supportedTenses.includes(tense)))) ||
        !record(frame.cases) || Object.keys(frame.cases).length !== roles.length ||
        roles.some(role => !hasOwn(frame.cases,role)) ||
        !Array.isArray(frame.linearizations) || !frame.linearizations.length ||
        (hasPredicate && new Set(slots).size !== slots.length)) {
      throw new Error(`Invalid ${kind} state frame.`);
    }
    for (const role of roles) {
      const mapping = frame.cases[role];
      if(!hasSyntacticCases&&mapping===null)continue;
      if (safeName(mapping)) continue;
      if (!record(mapping) || Object.keys(mapping).length !== 2 ||
          !['positive','negative'].every(polarity => safeName(mapping[polarity]))) {
        throw new Error(`Invalid case mapping for state role ${role}.`);
      }
    }
    for (const sequence of frame.linearizations) {
      if (!Array.isArray(sequence)) throw new Error(`Invalid ${kind} state linearization.`);
      const spatialMarkers=['location','existence'].includes(kind)
        ?sequence.filter(step=>typeof step==='string' && step.startsWith('@') &&
          hasOwn(frame.prepositions,step.slice(1))):[];
      if (sequence.length < slots.length + 1 ||
          sequence.filter(step => step === '@verb').length !== 1 ||
          sequence.some(step => !(slots.includes(step) || step === '@verb' ||
            (typeof step === 'string' && LITERAL.test(step)))) ||
          slots.some(role => sequence.filter(step => step === role).length !== 1) ||
          (['location','existence'].includes(kind) && spatialMarkers.length!==1) ||
          (hasPredicate && sequence.indexOf(frame.subjectRole) > sequence.indexOf(frame.predicateRole))) {
        throw new Error(`Invalid ${kind} state linearization.`);
      }
    }
  }
  return grammar;
}

/** A lemma may have multiple senses; many lemmas may express the same concept. */
function expandLexemes(lexemes, language, partOfSpeech, hasMorphologyForms = () => false) {
  const expanded = [];
  const lexemeIds = new Set();
  const senseIds = new Set();
  for (const lexeme of lexemes) {
    // Canonical dictionaries may include productive lexemes without a stored
    // forms table. They become active only when a bound morphology provider can
    // actually generate forms. Older adapters without morphology keep their
    // original vocabulary; forms are never guessed from the lemma.
    const hasStoredForms = lexeme?.forms !== undefined;
    if (!hasStoredForms && !hasMorphologyForms(lexeme)) continue;
    if (!record(lexeme) || !LEXEME_ID.test(lexeme.id || '') ||
        lexemeIds.has(lexeme.id) ||
        typeof lexeme.lemma !== 'string' || !lexeme.lemma.trim() ||
        (hasStoredForms && !record(lexeme.forms))) {
      throw new Error(`Invalid or duplicate ${partOfSpeech} lexeme: ${lexeme?.id}`);
    }
    if (lexeme.realizationProfile !== undefined) {
      const profile=lexeme.realizationProfile;
      if(!record(profile)||Object.keys(profile).length!==2||
          profile.kind!=='additional_assumption'||!Array.isArray(profile.assumptions)||
          !profile.assumptions.length||profile.assumptions.length>4||
          profile.assumptions.some(item=>!record(item)||Object.keys(item).length!==3||
            !safeName(item.feature)||typeof item.value!=='string'||!item.value.trim()||
            typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>240)) {
        throw new Error(`Invalid realization profile for ${lexeme.id}`);
      }
    }
    lexemeIds.add(lexeme.id);
    const multisense = Array.isArray(lexeme.senses);
    if (multisense && (hasOwn(lexeme, 'concept') || !lexeme.senses.length || lexeme.senses.length > 16)) {
      throw new Error(`Invalid sense inventory for ${lexeme.id}`);
    }
    const senses = multisense ? lexeme.senses : [{ id: lexeme.id, concept: lexeme.concept,
      priority: lexeme.priority || 0 }];
    for (const sense of senses) {
      const concept = record(sense) ? (sense.concept ||
        (sense.coreRef?.kind === 'concept' ? sense.coreRef.id : null)) : null;
      const stateFunction = record(sense) && sense.coreRef?.kind === 'grammaticalFunction'
        ? sense.coreRef.id : null;
      if (!record(sense) || !LEXEME_ID.test(sense.id || '') ||
          senseIds.has(sense.id) ||
          !(LEXEME_ID.test(concept || '') ||
        (partOfSpeech === 'verb' &&
              ['grammar.state_copula','grammar.state_possession','grammar.state_location'].includes(stateFunction))) ||
          !Number.isInteger(sense.priority ?? 0) || Math.abs(sense.priority ?? 0) > 100) {
        throw new Error(`Invalid or duplicate lexical sense: ${sense?.id}`);
      }
      senseIds.add(sense.id);
      expanded.push({ ...lexeme, ...(concept ? {concept} : {}),
        ...(sense.coreRef ? {coreRef:sense.coreRef} : {}),
        ...(stateFunction ? {stateFunction} : {}), senseId: sense.id,
        ...(sense.countability ? {countability:sense.countability} : {}),
        priority: sense.priority || 0 });
    }
  }
  return expanded;
}

function markerFor(noun, mapping) {
  if (!mapping) return undefined;
  if (mapping.omit) return null;
  if (mapping.literal) return mapping.literal;
  if (mapping.lexemeProperty) return own(noun, mapping.lexemeProperty);
  return undefined;
}

function formatMessage(template, variables) {
  return template?.replace(/\{([a-zA-Z]+)\}/gu, (_match, key) => String(variables[key] ?? ''));
}

/** Select one package module by graph layer, without resolving filesystem paths. */
function planModule(plan, layer, predicate) {
  const names=[...new Set(plan.layers[layer].map(node=>node.module))];
  const modules=names.map(name=>plan.modules[name]).filter(predicate);
  if(modules.length!==1)throw new Error(`Compiled plan requires one ${layer} grammar module.`);
  return modules[0];
}

/** Build the sentence runtime from one compiled LanguageGraph plan. */
export function createRuleAdapter(plan, options = {}) {
  if(arguments.length>2)throw new Error('Invalid compiled grammar runtime arguments.');
  if(!record(plan)||!Array.isArray(plan.transferPlans)||!record(plan.modules)||
      !record(plan.layers)||!record(plan.linearizationPlans)||!safeName(plan.language)||
      !['lexicon','syntax','morphology','signal'].every(layer=>Array.isArray(plan.layers[layer]))) {
    throw new Error('Invalid compiled grammar plan.');
  }
  if(!record(options)||Object.keys(options).some(key=>!['morphology','lexicon'].includes(key))) {
    throw new Error('Invalid compiled grammar runtime options.');
  }
  const {morphology,lexicon}=options;
  const dictionary=planModule(plan,'lexicon',data=>
    record(data)&&data.language===plan.language&&Array.isArray(data.nouns));
  const grammar=planModule(plan,'syntax',data=>
    record(data)&&data.language===plan.language&&record(data.frames));
  const localModules=Object.values(plan.modules).filter(data=>record(data)&&record(data.featureProfile));
  const featureProfile=localModules[0]?.featureProfile;
  if(!featureProfile)throw new Error('Compiled grammar requires a local feature profile.');
  if(localModules.some(data=>JSON.stringify(data.featureProfile)!==JSON.stringify(featureProfile)))
    throw new Error('Conflicting local feature profiles.');
  const signal=plan.layers.signal.length?planModule(plan,'signal',data=>record(data)&&data.channel==='written'):null;
  return createGrammarInterpreter(dictionary,grammar,{
    morphology,
    lexicon,
    featureProfile,
    ...(signal?{textProfile:textProfileForSignal(signal,plan.language)}:{})
  },plan);
}

function createGrammarInterpreter(sourceDictionary, rules,
  {morphology,lexicon:sharedLexicon,featureProfile:rawFeatureProfile,textProfile:rawTextProfile}, compiledPlan) {
  const featureProfile=rawFeatureProfile===undefined?undefined:
    createLanguageFeatureProfile(rawFeatureProfile,{language:sourceDictionary.language});
  const textProfile=rawTextProfile===undefined?createTextProfile(sourceDictionary.language):
    validateTextProfile(rawTextProfile);
  const lexicon = sharedLexicon ?? createLexicon(sourceDictionary);
  if (lexicon.language !== sourceDictionary.language) {
    throw new Error('Shared grammar lexicon does not match its dictionary.');
  }
  // A compatibility view lets existing declarative grammar use the normalized
  // meaning inventory while the canonical source always points through CORE.
  const dictionary = lexicon.dictionary;
  const grammar = validateGrammar(dictionary, rules, featureProfile);
  const { nounPhrase, sentence, verb: verbGrammar, frames } = grammar;
  const frameOrder = new Map(Object.keys(frames).map((concept,index)=>[concept,index]));
  const compiledCases=new WeakMap();
  for(const transfer of compiledPlan.transferPlans) {
    const frame=frames[transfer.conceptId];
    if(!frame)continue;
    let roles=compiledCases.get(frame);
    if(!roles){roles=new Map();compiledCases.set(frame,roles);}
    for(const argument of transfer.arguments) {
      const exponent=argument.caseExponent;
      if(exponent===null||exponent===undefined)continue;
      const previous=roles.get(argument.semanticRole);
      if(roles.has(argument.semanticRole)&&JSON.stringify(previous)!==JSON.stringify(exponent))
        throw new Error(`Conflicting case plans for ${transfer.conceptId}.${argument.semanticRole}.`);
      roles.set(argument.semanticRole,exponent);
    }
  }
  const eventParserLinearizations=new WeakMap();
  const stateParserLinearizations=new WeakMap();
  function parserLinearizationPlans(kind, frameId, frame) {
    const cache=kind==='event'?eventParserLinearizations:stateParserLinearizations;
    if(cache.has(frame))return cache.get(frame);
    const sourceFrame=kind==='event'?rules.frames?.[frameId]:rules.states?.frames?.[frameId];
    if(!record(sourceFrame)||!Array.isArray(sourceFrame.linearizations)) {
      const defaults=frame.linearizations.map(sequence=>[...sequence]);
      const plans=defaults.map(sequence=>({sequence,id:null,surfaceEnabled:false}));
      cache.set(frame,plans);
      return plans;
    }
    const declared=normalizeLinearizations(sourceFrame.linearizations,`${kind} frame ${frameId}`);
    const surfaceEnabled=declared.variants.length>0;
    const defaults=frame.linearizations.map(sequence=>[...sequence]);
    const reservedIds=new Set(declared.variants.map(variant=>variant.variantId));
    const plans=defaults.map(sequence=>{
      const id=surfaceEnabled?defaultLinearizationId(sequence,defaults.length,reservedIds):null;
      if(id)reservedIds.add(id);
      return {sequence,id,surfaceEnabled};
    });
    const seen=new Set(plans.map(plan=>JSON.stringify(plan.sequence)));
    const seenIds=new Set(plans.flatMap(plan=>plan.id?[plan.id]:[]));
    if(declared.variants.length) {
      const transfers=compiledPlan.transferPlans.filter(transfer=>kind==='event'
        ?transfer.conceptId===frameId:transfer.stateKind===frameId);
      if(!transfers.length)throw new Error(`No compiled transfer for ${kind} frame ${frameId}.`);
      const variants=declared.variants.slice().sort((left,right)=>
        left.variantId<right.variantId?-1:left.variantId>right.variantId?1:0);
      for(const variant of variants) {
        for(const transfer of transfers) {
          const compiled=compiledPlan.linearizationPlans[transfer.construction]?.[variant.variantId];
          if(!record(compiled)||!Array.isArray(compiled.sequence)||
              compiled.realizationPreference!==variant.realizationPreference||
              JSON.stringify(compiled.sequence)!==JSON.stringify(variant.sequence)) {
            throw new Error(`Missing or inconsistent compiled variant ${variant.variantId} for ${kind} frame ${frameId}.`);
          }
        }
        const key=JSON.stringify(variant.sequence);
        if(seenIds.has(variant.variantId))throw new Error(`Duplicate surface variant ID ${variant.variantId}.`);
        seenIds.add(variant.variantId);
        if(!seen.has(key)) {
          seen.add(key);
          plans.push({sequence:[...variant.sequence],id:variant.variantId,surfaceEnabled:true});
        }
      }
    }
    cache.set(frame,plans);
    return plans;
  }
  function parserLinearizations(kind,frameId,frame) {
    return parserLinearizationPlans(kind,frameId,frame).map(plan=>plan.sequence);
  }
  function mergeSurfaceVariants(former,candidate) {
    const selected=candidate.score>former.score?candidate:former;
    const variants=[...(former.surfaceVariants||[]),...(candidate.surfaceVariants||[])];
    if(!variants.length)return selected;
    const unique=new Map(variants.map(variant=>[JSON.stringify(variant),variant]));
    if(unique.size>MAX_SURFACE_VARIANTS)
      throw new EngineError('GRAMMAR_SEARCH_LIMIT','Surface parse evidence exceeded its bounded variant limit.');
    const ordered=[...unique.entries()].sort(([left],[right])=>left<right?-1:left>right?1:0)
      .map(([,variant])=>variant);
    return {...selected,surfaceVariants:ordered};
  }
  function agreementContextForTransfer(meaning, transfer) {
    if (!record(transfer) || !Array.isArray(transfer.arguments) ||
        JSON.stringify(transfer.meaning) !== JSON.stringify(meaning)) {
      throw new Error('Invalid semantic transfer for realization.');
    }
    const argumentIds = new Set();
    for (const argument of transfer.arguments) {
      if (!record(argument) || !safeName(argument.argument) ||
          !safeName(argument.semanticRole) || !safeName(argument.syntacticFunction) ||
          !Array.isArray(argument.agreementControllers) || argumentIds.has(argument.argument)) {
        throw new Error('Invalid realization argument transfer.');
      }
      argumentIds.add(argument.argument);
    }
    const context = Object.create(null);
    for (const argument of transfer.arguments) {
      if (!argument.agreementControllers.length) continue;
      const features = context[argument.syntacticFunction] ||
        (context[argument.syntacticFunction] = Object.create(null));
      for (const controller of argument.agreementControllers) {
        if (!record(controller) || Object.keys(controller).sort().join(',') !==
            'argument,feature,value' || !safeName(controller.argument) ||
            !safeName(controller.feature) || !argumentIds.has(controller.argument) ||
            typeof controller.value !== 'string' || !controller.value) {
          throw new Error('Declared agreement controller has no usable feature value.');
        }
        if (hasOwn(features, controller.feature) && features[controller.feature] !== controller.value) {
          throw new Error('Conflicting agreement controller values.');
        }
        features[controller.feature] = controller.value;
      }
    }
    return context;
  }
  function informationLoss(meaning) {
    if (meaning?.type === 'question') {
      if (meaning.questionType !== 'yes_no' ||
          meaning.proposition?.type !== 'event' ||
          meaning.proposition.concept !== 'event.visual_perception') return [];
      return eventInformationLoss(meaning.proposition, '#/proposition');
    }
    return eventInformationLoss(meaning, '#');
  }
  function eventInformationLoss(meaning, prefix) {
    if (!record(meaning) || !record(meaning.roles)) return [];
    const hasDeterminers=Object.keys(nounPhrase.determiners).length>0;
    const diagnostics=[];
    for(const [role,ref] of Object.entries(meaning.roles)) {
      const definiteness=ref?.features?.definiteness;
      if(hasDeterminers && definiteness==='unknown') {
        diagnostics.push({path:`${prefix}/roles/${role}/features/definiteness`,
          feature:'definiteness',cause:'source-definiteness-unspecified-target-default',
          status:'ambiguous'});
      } else if(!hasDeterminers && ['definite','indefinite'].includes(definiteness)) {
        diagnostics.push({path:`${prefix}/roles/${role}/features/definiteness`,
          feature:'definiteness',cause:'target-grammar-does-not-mark-definiteness',
          status:'unavoidable'});
      }
    }
    if(meaning.type==='event' && meaning.features?.aspect!=='unknown' &&
        verbGrammar.aspectSource==='unknown') {
      diagnostics.push({path:`${prefix}/features/aspect`,feature:'aspect',
        cause:'target-grammar-does-not-encode-aspect',status:'unavoidable'});
    }
    return diagnostics;
  }
  const matchesTokens=(tokens,index,phrase)=>matchTokenPhrase(tokens,index,phrase,textProfile);
  const tokenize=text=>tokenizeText(text,textProfile);
  const getFirstToken=text=>firstTextToken(text,textProfile);
  const sentenceText=(parts,terminator='.')=>formatSentence(parts,terminator,textProfile.locale);
  const possessives=nounPhrase.possessives || [];
  const subjectRole = sentence.subjectRole;
  const morphologyBridge=new Map(),morphologyBridgeCache=new Map();
  const canonicalBySense=new Map(morphology?.lexicon?.entries?.flatMap(entry=>
    entry.senses.map(sense=>[sense.id,entry.id])) ?? []);
  function morphologyForLexeme(lexeme) {
    if(!morphology||!record(lexeme))return null;
    const senseIds=[lexeme.senseId,...(lexeme.senses||[]).map(sense=>sense?.id)].filter(Boolean);
    const lexemeId=morphology.has(lexeme.id)?lexeme.id:
      senseIds.map(senseId=>canonicalBySense.get(senseId)).find(id=>id&&morphology.has(id));
    if(!lexemeId)return null;
    if(!morphologyBridgeCache.has(lexemeId)){
      const runtimeView=getMorphologyRuntimeView(morphology,lexemeId);
      const availability=runtimeView?{supported:runtimeView.supported}:
        morphology.availability({lexemeId,features:{},exact:false});
      const candidates=availability?.supported===true
        ?(runtimeView?runtimeView.forms:morphology.paradigm({lexemeId})):[];
      morphologyBridgeCache.set(lexemeId,Array.isArray(candidates)&&candidates.length?{
        candidates,cells:runtimeView?.cells??(morphology.cells?.({lexemeId})||[])
      }:null);
    }
    const bridge=morphologyBridgeCache.get(lexemeId);
    return bridge?{lexemeId,bridge}:null;
  }
  const hasMorphologyForms=lexeme=>!!morphologyForLexeme(lexeme);
  const nouns = expandLexemes(dictionary.nouns, dictionary.language, 'noun', hasMorphologyForms);
  const expandedVerbs = expandLexemes(dictionary.verbs, dictionary.language, 'verb', hasMorphologyForms);
  if(morphology){
    for(const lexeme of [...nouns,...expandedVerbs]){
      const generated=morphologyForLexeme(lexeme);
      if(generated)morphologyBridge.set(lexeme,generated.bridge);
    }
  }
  const formsAtCache=new WeakMap();
  const formsAtLexeme=(lexeme,path)=>{
    let byPath=formsAtCache.get(lexeme);
    if(byPath?.has(path))return byPath.get(path);
    const forms=formsAt(lexeme,path,morphologyBridge.get(lexeme));
    if(!byPath){byPath=new Map();formsAtCache.set(lexeme,byPath);}
    byPath.set(path,forms);
    return forms;
  };
  const modalEntriesCache=new WeakMap();
  const verbs = expandedVerbs.filter(lexeme => !!lexeme.concept);
  const stateVerbs = expandedVerbs.filter(lexeme =>
    hasOwn(grammar.states?.verbs || {},lexeme.stateFunction));
  const nounForms = nouns.map(noun => ({ noun, forms: formsAtLexeme(noun, nounPhrase.path) }));
  const nounFormsByLexeme=new Map(nounForms.map(item=>[item.noun,item.forms]));
  const nominal = createNominalInterpreter({ dictionary, nounPhrase, nounForms,
    featureProfile, morphology, textProfile });
  const exactQuantityValue=ref=>{
    const value=ref?.quantity||ref?.quantifier;
    return value?.kind==='exact'?value.value:null;
  };
  const grammaticalNumberFor=(ref,parsed=null)=>{
    if(parsed?.grammaticalNumber)return parsed.grammaticalNumber;
    const count=exactQuantityValue(ref);
    return count===null?ref?.features?.number:nominal.numberForQuantity(count);
  };
  // An optional inventory of matrix predicates for propositional complements.
  const matrixLexemes = (dictionary.attitudes || []).map(x => ({ ...x }));
  const comp = grammar.sentence.complement;
  if (comp !== undefined && (!record(comp) || !/^[\p{L}]+$/u.test(comp.marker || '') ||
      (comp.order !== undefined && comp.order !== 'before') ||
      (comp.comma !== undefined && typeof comp.comma !== 'boolean') ||
      (comp.subjectCase !== undefined && !safeName(comp.subjectCase)))) {
    throw new Error('Invalid declarative complement grammar.');
  }
  if (matrixLexemes.length && !comp) throw new Error('Missing complement grammar for attitude lexemes.');
  const matrixWord = value => typeof value === 'string' && /^[\p{L}]+$/u.test(value);
  const matrixNumberForms = value => matrixWord(value) || (record(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every(key => ['masculine','feminine','neuter','virile','nonvirile'].includes(key) &&
      matrixWord(value[key])));
  for (const lex of matrixLexemes) {
    if (!LEXEME_ID.test(lex.id || '') || !LEXEME_ID.test(lex.concept || '') ||
        typeof lex.lemma !== 'string' || !record(lex.forms) ||
        !['present','past'].every(t => record(lex.forms[t]) &&
          ['singular','plural'].every(n => matrixNumberForms(lex.forms[t][n])))) {
      throw new Error(`Invalid matrix predicate: ${lex.id}`);
    }
  }
  const relativeGrammar = nounPhrase.relatives;
  const conjunction = grammar.sentence.coordination;
  const questions = grammar.questions;
  const modality = grammar.modality;
  const modals = dictionary.modals || [];
  const subjectPronouns=grammar.anaphora?.subjectPronouns || [];
  const deicticPronouns=(grammar.deicticPronouns || []).flatMap(entry=>{
    const word=dictionary.functionWords.find(item=>
      item.senses?.some(sense=>sense.id===entry.senseId));
    const sense=word?.senses?.find(item=>item.id===entry.senseId);
    return (word?.forms || []).map(form=>({text:form.text,case:entry.case,senseId:entry.senseId,
      referent:entry.referent,person:entry.person,number:entry.number,priority:sense?.priority||0}));
  });
  const verbForms = verbs.flatMap(lexeme => verbGrammar.rules.flatMap(rule => {
    const path=rule.polarity==='negative' && lexeme.negativeForms
      ? rule.path.replace(/^forms\./u,'negativeForms.') : rule.path;
    return formsAtLexeme(lexeme,path).map(form => ({ ...form, lexeme, rule }));
  }));
  // These private candidate arrays are stable, including cached modal variants.
  const verbEntryIndexes=new WeakMap();
  const frontedVerbEntriesCache=new WeakMap();
  const auxiliaryVerbEntriesCache=new WeakMap();
  function indexVerbEntries(entries,includeConcepts=false) {
    let indexes=verbEntryIndexes.get(entries);
    if(indexes)return indexes;
    const unprefixedByFirstToken=new Map();
    const prefixGroupsByFirstToken=new Map();
    const prefixGroups=new Map();
    const byConcept=includeConcepts?new Map():null;
    for(let order=0;order<entries.length;order++) {
      const entry=entries[order],candidate={entry,order};
      if(byConcept) {
        if(!byConcept.has(entry.lexeme.concept))byConcept.set(entry.lexeme.concept,[]);
        byConcept.get(entry.lexeme.concept).push(entry);
      }
      const prefixes=entry.rule.prefix;
      const formHead=getFirstToken(entry.text);
      if(!prefixes.length) {
        if(!unprefixedByFirstToken.has(formHead))unprefixedByFirstToken.set(formHead,[]);
        unprefixedByFirstToken.get(formHead).push(candidate);
        continue;
      }
      const prefixKey=JSON.stringify(prefixes);
      let group=prefixGroups.get(prefixKey);
      if(!group) {
        group={prefixes,formsByFirstToken:new Map()};
        prefixGroups.set(prefixKey,group);
        const prefixHead=getFirstToken(prefixes[0]);
        if(!prefixGroupsByFirstToken.has(prefixHead))prefixGroupsByFirstToken.set(prefixHead,[]);
        prefixGroupsByFirstToken.get(prefixHead).push(group);
      }
      if(!group.formsByFirstToken.has(formHead))group.formsByFirstToken.set(formHead,[]);
      group.formsByFirstToken.get(formHead).push(candidate);
    }
    indexes={unprefixedByFirstToken,prefixGroupsByFirstToken,...(byConcept?{byConcept}:{})};
    verbEntryIndexes.set(entries,indexes);
    return indexes;
  }
  const verbFormsByConcept=indexVerbEntries(verbForms,true).byConcept;
  function frontedVerbEntries(entries,frame,concept=null) {
    let byFrame=frontedVerbEntriesCache.get(entries);
    if(!byFrame){byFrame=new WeakMap();frontedVerbEntriesCache.set(entries,byFrame);}
    let byConcept=byFrame.get(frame);
    if(!byConcept){byConcept=new Map();byFrame.set(frame,byConcept);}
    if(byConcept.has(concept))return byConcept.get(concept);
    const selected=concept===null?entries:entries.filter(entry=>entry.lexeme.concept===concept);
    const result=selected.flatMap(entry=>{
      const text=withoutGovernedPreposition(entry.text,frame);
      return text?[{...entry,text}]:[];
    });
    byConcept.set(concept,result);
    return result;
  }
  const stateGrammar = grammar.states || null;
  const stateVerbForms = stateGrammar ? stateVerbs.flatMap(lexeme => {
    const kinds = [].concat(stateGrammar.verbs[lexeme.stateFunction]);
    const cells = morphology?.has(lexeme.id)
      ? (getMorphologyRuntimeView(morphology,lexeme.id)?.forms ??
        morphology.paradigm({lexemeId:lexeme.id})).map(form => ({
        text:form.text, features:form.features
      }))
      : STATE_FORM_CELLS.flatMap(cell => formsAtLexeme(lexeme,cell.path).map(form => ({
        text:form.text, features:{tense:cell.tense,person:cell.person,number:cell.number,
          ...(cell.gender?{gender:cell.gender}:{}),
          ...(cell.pluralClass?{pluralClass:cell.pluralClass}:{})}
      })));
    return cells.filter(form => stateGrammar.supportedTenses.includes(form.features?.tense))
      .flatMap(form => kinds.filter(kind=>!(stateGrammar.pastPredication==='positive_statement' &&
        form.features.tense==='past' && kind!=='predication')).map(kind => ({
        kind, lexeme, text:form.text, features:form.features,
        rule:{tense:form.features.tense,polarity:'positive',prefix:[],when:{
          'subject.person':form.features.person,'subject.number':form.features.number,
          ...(form.features.gender?{'subject.gender':form.features.gender}:{}),
          ...(form.features.pluralClass?{'subject.pluralClass':form.features.pluralClass}:{})
        }}
      })));
  }) : [];
  const nounIndex = new Map();
  for (const noun of nouns) {
    if (!nounIndex.has(noun.concept)) nounIndex.set(noun.concept, []);
    nounIndex.get(noun.concept).push(noun);
  }
  for (const list of nounIndex.values()) list.sort((left, right) => right.priority - left.priority);

  function roleCase(frame, role, features, ref) {
    const rolePlan=compiledCases.get(frame);
    const planned=rolePlan?.get(role);
    if(planned && !['case','zero'].includes(planned.kind))
      throw new Error(`Unsupported case exponent: ${planned.kind}.`);
    const mapping = rolePlan?.has(role)?(planned?.kind==='case'?planned.value:null):
      frame.cases?.[role] ?? (role === subjectRole ? nounPhrase.subjectCase : undefined);
    let result = record(mapping) ? (mapping[ref?.features?.definiteness] || mapping.unknown) : mapping;
    for (const alternation of frame.caseAlternations === false ? [] : grammar.cases?.alternations || []) {
      if (result === alternation.from &&
          matchesConditions({ event: features }, alternation.when)) {
        result = alternation.to;
      }
    }
    return result;
  }

  function bareRoleAllows(frame, role, concept) {
    if (!frame.bareRoles?.includes(role)) return false;
    const restricted = frame.bareRoleConcepts?.[role];
    return !restricted || restricted.includes(concept);
  }

  function deicticCase(grammaticalCase,role) {
    if(grammaticalCase)return grammaticalCase;
    return nounPhrase.deicticCases?.[role] ?? nounPhrase.subjectCase;
  }

  /** Relative agreement is derived from the antecedent lexeme, not its surface case. */
  function relativeMarker(marker, noun, ref) {
    return Object.entries(marker.when || {}).every(([key, value]) =>
      (key === 'number' ? ref.features.number : noun[key]) === value);
  }

  function plainNoun(ref, noun, gramCase, fallback, allowBare = false) {
    const count=exactQuantityValue(ref);
    const grammaticalNumber=grammaticalNumberFor(ref);
    const surfaceCase=count===null?gramCase:nominal.surfaceCaseForQuantity(count,gramCase);
    const forms = nounFormsByLexeme.get(noun) || [];
    if (!forms.length && Object.keys(noun.forms ?? {}).length === 0) {
      throw new EngineError('TARGET_NOUN_FORMS_UNAVAILABLE',
        `Target noun ${noun.lemma} has no declared or generated forms.`, {status:'unsupported'});
    }
    const form = forms.find(candidate => candidate.bindings.number === grammaticalNumber &&
      (candidate.bindings.case === undefined || candidate.bindings.case === surfaceCase));
    if (!form) throw new Error(`Missing ${grammaticalNumber}/${surfaceCase || '-'} noun form for ${noun.lemma}.`);
    const surface=nominal.render(ref, noun, form.text, surfaceCase, fallback,
      {allowBare,quantifierCase:gramCase,grammaticalNumber});
    if(!ref.possessor)return surface;
    const owner=ref.possessor;
    const ownerEntry=possessives.find(entry=>entry.anchor===owner.referent?.anchor &&
      entry.person===owner.agreement?.person && entry.number===owner.agreement?.number);
    const context={number:grammaticalNumber,case:surfaceCase,
      ...(noun.gender?{gender:noun.gender}:{}),...(noun.pluralClass?{pluralClass:noun.pluralClass}:{}),
      ...(noun.animacy?{animacy:noun.animacy}:{})};
    const word=ownerEntry?.forms.find(item=>Object.entries(item.when||{}).every(([key,value])=>
      context[key]===value))?.text;
    if(!word)throw new Error(`Missing ${dictionary.language} possessive form for ${owner.referent?.anchor}.`);
    return `${word} ${surface}`;
  }

  function contextFor(roles, event, grammaticalSubjectRole = subjectRole, {formalSubject=null}={}) {
    const subject = roles[grammaticalSubjectRole];
    const ref = subject?.value;
    const agreement = isDeicticReferent(ref) ? ref.agreement : null;
    const count=exactQuantityValue(ref);
    const subjectNumber=grammaticalNumberFor(ref,subject);
    const context={ event, subject: formalSubject ? {...formalSubject.agreement} : subject ? {
      person: agreement?.person ?? GRAMMATICAL_PERSON.third,
      number: agreement?.number ?? (count===null?subjectNumber:
        nominal.agreementNumberForQuantity(count,subjectNumber)),
      gender: agreement?.gender ?? subject.noun?.gender,
      pluralClass: subject.noun?.pluralClass
    } : {} };
    const controllerFeatures=parsed=>{
      const value=parsed?.value;
      if(!record(value))return {};
      const typedAgreement=isDeicticReferent(value)?value.agreement:null;
      const features={
        person:typedAgreement?.person??(value.features?'third':undefined),
        number:typedAgreement?.number??grammaticalNumberFor(value,parsed),
        gender:typedAgreement?.gender??parsed.noun?.gender,
        pluralClass:parsed.noun?.pluralClass,
        animacy:parsed.noun?.animacy,
        definiteness:value.features?.definiteness
      };
      return Object.fromEntries(Object.entries(features).filter(([,feature])=>feature!==undefined));
    };
    for(const [role,parsed] of Object.entries(roles))
      if(!['event','subject'].includes(role))context[role]=controllerFeatures(parsed);
    if(!hasOwn(context,'object'))context.object=context.theme||{};
    let possessor={},possessorConflict=false;
    for(const parsed of Object.values(roles)){
      const agreement=parsed?.value?.possessor?.agreement;
      if(!record(agreement))continue;
      const merged=unifyFeatures(possessor,agreement);
      if(!merged){possessorConflict=true;break;}
      possessor=merged;
    }
    context.possessor=possessorConflict?{}:possessor;
    return context;
  }

  const agreementForFrame=frame=>({...verbGrammar.agreement,...(frame?.agreement||{})});

  function matchesMorphologyFeatures(entry,context,eventFeatures,agreement=verbGrammar.agreement) {
    const morphology=entry.morphologyFeatures;
    if(!record(morphology))return true;
    for(const [source,expected] of Object.entries(entry.rule.when||{})){
      const [root,name]=featureSource(source,undefined,Object.keys(context));
      const dependency=Object.entries(agreement||{}).find(([binding,controller])=>{
        const [controllerRoot,controllerName]=featureSource(controller,undefined,Object.keys(context));
        return binding===name||controllerRoot===root&&controllerName===name;
      })?.[1];
      if(dependency){
        const [controllerRoot,controllerName]=featureSource(dependency,undefined,Object.keys(context));
        if(controllerRoot!==root||controllerName!==name)continue;
      }
      if(hasOwn(morphology,name)&&morphology[name]!==expected)return false;
    }
    for(const [name,value] of Object.entries(eventFeatures||{})){
      if(hasOwn(morphology,name)&&morphology[name]!==value)return false;
    }
    for(const [binding,source] of Object.entries(agreement||{})){
      const [root,name]=featureSource(source,undefined,Object.keys(context));
      const keys=[...new Set([binding,`${root}_${name}`,name])].filter(key=>hasOwn(morphology,key));
      const values=new Set(keys.map(key=>morphology[key]));
      if(values.size>1)return false;
      const value=keys.length?morphology[keys[0]]:undefined;
      const expected=context[root]?.[name];
      if(value!==undefined&&expected!==undefined&&value!==expected)return false;
    }
    return true;
  }

  function matchVerb(tokens, at, candidate) {
    for (const literal of candidate.rule.prefix) {
      const length = matchesTokens(tokens, at, literal);
      if (!length) return null;
      at += length;
    }
    const length = matchesTokens(tokens, at, candidate.text);
    return length ? at + length : null;
  }

  const sentenceTokenPositions=new WeakMap();
  const stateVerbPresenceCache=new WeakMap();
  function tokenPositions(tokens) {
    let positions=sentenceTokenPositions.get(tokens);
    if(!positions) {
      positions=new Map();
      for(let index=0;index<tokens.length;index++) {
        const token=tokens[index];
        if(!positions.has(token))positions.set(token,[]);
        positions.get(token).push(index);
      }
      sentenceTokenPositions.set(tokens,positions);
    }
    return positions;
  }
  function hasStateVerb(tokens,entry) {
    let matches=stateVerbPresenceCache.get(tokens);
    if(!matches) {
      matches=new Map();
      stateVerbPresenceCache.set(tokens,matches);
    }
    const signature=JSON.stringify([entry.rule.prefix,entry.text]);
    if(matches.has(signature))return matches.get(signature);
    const firstToken=getFirstToken(entry.rule.prefix[0]||entry.text);
    const positions=tokenPositions(tokens).get(firstToken)||[];
    const found=positions.some(index=>matchVerb(tokens,index,entry)!==null);
    matches.set(signature,found);
    return found;
  }

  function stateRoleCase(frame, role, polarity) {
    const mapping = frame.cases[role];
    return record(mapping) ? mapping[polarity] : mapping;
  }

  function implicitStateSubject(features) {
    const anchor=features.person==='first'?'speaker':
      features.person==='second'?'addressee':null;
    if(!anchor)return null;
    return {referent:{kind:'deictic',anchor},
      agreement:{person:features.person,number:features.number}};
  }

  function stateMeaning(kind, roles, features, relation) {
    if (kind === 'identity') return createIdentity(roles.subject,roles.complement,features);
    if (kind === 'predication') return createPredication(roles.predicate,roles.subject,features);
    if (kind === 'classification') return createClassification(roles.subject,roles.category,features);
    if (kind === 'possession') return createPossession(roles.owner,roles.owned,features);
    if (kind === 'location') return createLocation(roles.subject,roles.location,relation,features);
    if (kind === 'existence') return createExistence(roles.entity,roles.location,relation,features);
    throw new Error(`Unsupported state construction in ${dictionary.language}.`);
  }

  function parseStateCandidates(tokens, budget, options = {}) {
    if (!stateGrammar) return [];
    const entries=options.entries || stateVerbForms;
    const polarities=options.polarities || stateGrammar.supportedPolarities || ['positive','negative'];
    const readings = new Map();
    for (const base of entries) {
      const frame = stateGrammar.frames[base.kind];
      if(frame.supportedTenses && !frame.supportedTenses.includes(base.features.tense))continue;
      if(stateGrammar.pastPredication==='positive_statement' && base.features.tense==='past' &&
          (base.kind!=='predication' || options.question))continue;
      if(options.gap && (base.kind!=='location' || options.gap!=='location'))continue;
      const linearizationPlans=parserLinearizationPlans('state',base.kind,frame).flatMap(plan=>{
        let sequence=[...plan.sequence];
        if(frame.existentialMarker && sequence.includes('@'+frame.existentialMarker) &&
            (!frame.existentialTenses.includes(base.features.tense) || options.gap ||
              options.omitVerb || options.doSupport))return [];
        if(options.gap==='location') {
          const reduced=sequence.filter(step=>step!=='location' &&
            !(step.startsWith('@')&&step!=='@verb'));
          sequence=options.invert ? [reduced[1],reduced[0]] : reduced;
        }
        if(options.omitVerb)sequence=sequence.filter(step=>step!=='@verb');
        const sequences=!frame.allowImplicitDeicticSubject||!sequence.includes(frame.subjectRole)
          ?[sequence]:[sequence,sequence.filter(step=>step!==frame.subjectRole)];
        return sequences.map(sequence=>({...plan,sequence}));
      });
      for (const polarity of polarities) {
        if(stateGrammar.pastPredication==='positive_statement' && base.features.tense==='past' &&
            polarity!=='positive')continue;
        const negativeStrategy=stateGrammar.negativeStrategies?.[base.kind]||'preverbal';
        if(polarity==='negative'&&negativeStrategy==='do-support'&&!options.doSupport)continue;
        const postverbal=polarity==='negative'&&negativeStrategy==='postverbal';
        const doSupport=polarity==='negative'&&negativeStrategy==='do-support'&&options.doSupport;
        const statePlans=doSupport?linearizationPlans.map(plan=>({...plan,sequence:plan.sequence.flatMap(step=>
          step==='@verb'?['@doAux','@negator','@verb']:[step])})):
          postverbal?linearizationPlans.map(plan=>({...plan,sequence:plan.sequence.flatMap(step=>
            step==='@verb'?['@verb','@negator']:[step])})):linearizationPlans;
        const replacement=polarity==='negative'?frame.negativeVerbForms?.[base.features.number]:null;
        const entry = {...base,...(replacement?{text:replacement}:{}),rule:{...base.rule,polarity,
          prefix:polarity==='negative'&&!postverbal&&!doSupport&&negativeStrategy!=='replacement'
            ?[stateGrammar.negator]:[]}};
        if (!options.omitVerb && !options.doSupport && !hasStateVerb(tokens,entry)) continue;
        const features={tense:entry.features.tense,polarity};
        for(const orderPlan of statePlans){
          const sequence=orderPlan.sequence;
          const implicitSubject=!sequence.includes(frame.subjectRole)
            ?implicitStateSubject(entry.features):null;
          if(!sequence.includes(frame.subjectRole)&&!implicitSubject)continue;
          const initialRoles=implicitSubject
            ?{[frame.subjectRole]:{value:implicitSubject}}:{};
          const sourceRange=(start,end)=>{
            const first=tokens.sourceSpans?.[start],last=tokens.sourceSpans?.[end-1];
            return first&&last?{start:first.start,end:last.end}:null;
          };
          function search(position,index,parsedRoles,relation=null,surfaceSlots=[]) {
            if (++budget.counter.visited > MAX_SEARCH_NODES) {
              throw new EngineError('GRAMMAR_SEARCH_LIMIT',
                'Sentence analysis exceeded the bounded search limit.');
            }
            if (position === sequence.length) {
              if (index !== tokens.length) return;
              if(base.kind==='classification' &&
                  parsedRoles.category?.value.features.definiteness==='definite')return;
              const context=contextFor(parsedRoles,features,frame.subjectRole);
              if (!matchesConditions(context,entry.rule.when || {})) {
                budget.agreementFailed=true;
                return;
              }
              const roles=Object.fromEntries(Object.entries(parsedRoles)
                .map(([role,parsed])=>[role,parsed.value]));
              const possessiveOwner=parsedRoles[frame.predicateRole]?.owner;
              const meaning=base.kind==='location' && options.gap==='location'
                ?createLocation(roles.subject,undefined,'unspecified',features)
                :possessiveOwner && base.kind==='predication'
                  ?createPossession(possessiveOwner,{...roles.subject,
                    features:{...roles.subject.features,definiteness:'definite'},
                    possessor:possessiveOwner},features)
                  :stateMeaning(base.kind,roles,features,relation);
              const lexicalSenses={verb:entry.lexeme.senseId};
              for(const [role,parsed] of Object.entries(parsedRoles)) {
                if(parsed.senseId)lexicalSenses[role]=parsed.senseId;
              }
              const candidate={interlingua:meaning,lexicalSenses,
                score:(entry.lexeme.priority||0)+Object.values(parsedRoles)
                  .reduce((score,parsed)=>score+(parsed.noun?.priority||parsed.priority||0),0),
                ...(orderPlan.surfaceEnabled?{surfaceVariants:[{id:orderPlan.id,
                  slots:surfaceSlots.slice().sort((left,right)=>left.start-right.start ||
                    left.end-right.end || (left.name<right.name?-1:left.name>right.name?1:0)),
                  markedness:'unknown'}]}:{})};
              const key=JSON.stringify(meaning),former=readings.get(key);
              if(!former)readings.set(key,candidate);
              else readings.set(key,mergeSurfaceVariants(former,candidate));
              return;
            }
            const step=sequence[position];
            if(step==='@verb') {
              const next=options.omitVerb?index:matchVerb(tokens,index,entry);
              const span=!options.omitVerb&&next!==null?sourceRange(index,next):null;
              const slots=orderPlan.surfaceEnabled&&span?
                [...surfaceSlots,{name:'@verb',...span}]:surfaceSlots;
              if(next!==null)search(position+1,next,parsedRoles,relation,slots);
              return;
            }
            if(step==='@negator') {
              const length=matchesTokens(tokens,index,stateGrammar.negator);
              if(length)search(position+1,index+length,parsedRoles,relation,surfaceSlots);
              return;
            }
            if(step==='@doAux') {
              const subject=parsedRoles[frame.subjectRole]?.value;
              if(!subject)return;
              const person=isDeicticReferent(subject)?subject.agreement.person:'third';
              const number=isDeicticReferent(subject)?subject.agreement.number:subject.features.number;
              const auxiliaries=questions?.yesNo?.auxiliaries;
              const auxiliary=person==='first'?auxiliaries?.presentFirst:
                person==='second'?auxiliaries?.presentSecond:
                number==='singular'?auxiliaries?.presentThirdSingular:auxiliaries?.presentThirdPlural;
              const length=auxiliary?matchesTokens(tokens,index,auxiliary):0;
              const span=length?sourceRange(index,index+length):null;
              const slots=orderPlan.surfaceEnabled&&span?
                [...surfaceSlots,{name:'@auxiliary',...span}]:surfaceSlots;
              if(length)search(position+1,index+length,parsedRoles,relation,slots);
              return;
            }
            if(step.startsWith('@')) {
              const count=matchesTokens(tokens,index,step.slice(1));
              if(count)search(position+1,index+count,parsedRoles,
                frame.prepositions?.[step.slice(1)] || relation,surfaceSlots);
              return;
            }
            let phrases;
            if(step===frame.predicateRole) {
              const subject=parsedRoles[frame.subjectRole];
              if(!subject?.value)return;
              const subjectAgreement=isDeicticReferent(subject.value)
                ?subject.value.agreement:null;
              const context={number:subjectAgreement?.number ?? subject.value.features?.number,
                case:frame.predicateCase,
                ...(subjectAgreement?.gender ?? subject.noun?.gender
                  ?{gender:subjectAgreement?.gender ?? subject.noun?.gender}:{}),
                ...(subject.noun?.pluralClass?{pluralClass:subject.noun.pluralClass}:{}),
                ...(subject.noun?.animacy?{animacy:subject.noun.animacy}:{})};
              phrases=[...nominal.readProperty(tokens,index,context),
                ...readPossessivePredicate(tokens,index,context)];
            } else {
              const grammaticalCase=stateRoleCase(frame,step,polarity);
              phrases=[...readNounPhrases(tokens,index,grammaticalCase,0,budget),
                ...(step===frame.subjectRole&&grammaticalCase==='nom'
                  ?[...readDeicticNounPhrases(tokens,index,deicticCase(grammaticalCase,step)),
                    ...readStateSubjectPronouns(tokens,index)]:[])];
            }
            for(const parsed of phrases) {
              const span=sourceRange(index,parsed.next);
              const slots=orderPlan.surfaceEnabled&&span?
                [...surfaceSlots,{name:step,...span}]:surfaceSlots;
              search(position+1,parsed.next,{...parsedRoles,[step]:parsed},relation,slots);
            }
          }
          search(0,0,initialRoles);
        }
      }
    }
    return boundedAnalyses([...readings.values()].sort((a,b)=>b.score-a.score));
  }

  function parseComparisonCandidates(tokens,budget) {
    if(!grammar.comparison || !stateGrammar)return [];
    const config=grammar.comparison,results=[];
    const copulas=stateVerbForms.filter(entry=>entry.kind===config.stateKind &&
      entry.rule.polarity==='positive');
    for(const subject of readNounPhrases(tokens,0,config.subjectCase,0,budget)) {
      const noun=subject.noun;
      const context={number:subject.value.features.number,case:config.subjectCase,
        ...(noun?.gender?{gender:noun.gender}:{}),
        ...(noun?.pluralClass?{pluralClass:noun.pluralClass}:{}),
        ...(noun?.animacy?{animacy:noun.animacy}:{})};
      for(const copula of copulas) {
        const afterCopula=matchVerb(tokens,subject.next,copula);
        if(afterCopula===null)continue;
        for(const comparison of nominal.readComparative(tokens,afterCopula,context)) {
          const markerLength=matchesTokens(tokens,comparison.next,config.marker);
          if(!markerLength)continue;
          for(const standard of readNounPhrases(tokens,comparison.next+markerLength,
            config.standardCase,0,budget)) {
            if(standard.next!==tokens.length)continue;
            const meaning=createComparison(comparison.value,subject.value,standard.value,
              comparison.relation,{tense:copula.features.tense,polarity:'positive'});
            results.push({interlingua:meaning,lexicalSenses:{verb:copula.lexeme.senseId,
              predicate:comparison.senseId,subject:subject.senseId,standard:standard.senseId},
              score:(copula.lexeme.priority||0)+(comparison.priority||0)+
                (subject.noun?.priority||0)+(standard.noun?.priority||0)});
          }
        }
      }
    }
    return boundedAnalyses(results.sort((a,b)=>b.score-a.score));
  }

  function parseRequestCandidates(tokens,counter) {
    if(!grammar.request)return [];
    const markerLength=matchesTokens(tokens,0,grammar.request.marker);
    if(!markerLength)return [];
    const entries=verbs.flatMap(lexeme=>formsAtLexeme(lexeme,grammar.request.actionPath)
      .filter(form=>!Object.keys(form.bindings).length)
      .map(form=>({lexeme,text:form.text,bindings:{},rule:{tense:'present',polarity:'positive',
        prefix:[],when:{'subject.person':'second','subject.number':'singular'}}})));
    const addressee={value:{referent:{kind:'deictic',anchor:'addressee'},
      agreement:{person:'second',number:'singular'}},noun:{id:'request.addressee'},
      senseId:null,priority:0};
    const readings=parseClause(tokens.slice(markerLength),subjectRole,addressee,0,
      questionBudget(counter),{verbEntries:entries});
    return readings.map(reading=>({interlingua:createDialogueAct('request',{
      action:reading.interlingua,politeness:'polite'}),lexicalSenses:reading.lexicalSenses,
      score:reading.score}));
  }

  function readStateSubjectPronouns(tokens,index) {
    const found=[];
    for(const pronoun of subjectPronouns) {
      const size=matchesTokens(tokens,index,pronoun.text);
      if(!size)continue;
      found.push({value:{referent:{kind:'anaphoric',resolution:'unresolved'},
        agreement:{...pronoun.agreement}},noun:null,next:index+size,senseId:null,priority:0});
    }
    return found;
  }

  function readPossessivePredicate(tokens,index,context) {
    const found=[];
    for(const entry of possessives)for(const form of entry.standaloneForms || []){
      if(!Object.entries(form.when || {}).every(([key,value])=>context[key]===value))continue;
      const size=matchesTokens(tokens,index,form.text);
      if(!size)continue;
      const owner={referent:{kind:'deictic',anchor:entry.anchor},
        agreement:{person:entry.person,number:entry.number}};
      found.push({value:entry.anchor,owner,next:index+size,noun:null,priority:0});
    }
    return found;
  }

  function passiveCell(cell,parsed) {
    const byNumber=cell?.[parsed.value.features.number];
    if(typeof byNumber==='string')return byNumber;
    if(!record(byNumber))return null;
    const key=parsed.value.features.number==='singular'?
      parsed.noun.gender:parsed.noun.pluralClass;
    return byNumber[key]||null;
  }

  function parsePassiveCandidates(tokens,counter) {
    if(!grammar.passive)return [];
    const budget=searchBudget(counter),readings=new Map();
    let themes;
    for(const [concept,tenses] of Object.entries(grammar.passive.events)) {
      for(const [tense,paradigm] of Object.entries(tenses)) {
        if(!themes)themes=readNounPhrases(tokens,0,'nom',0,budget);
        for(const theme of themes) {
          const auxiliary=passiveCell(paradigm.auxiliary,theme);
          const participle=passiveCell(paradigm.participle,theme);
          if(!auxiliary||!participle||tokens[theme.next]!==normalizedWord(auxiliary)||
              tokens[theme.next+1]!==normalizedWord(participle))continue;
          const after=theme.next+2,baseRoles={theme:theme.value};
          if(after===tokens.length) {
            const meaning=createEvent(concept,baseRoles,
              {tense,polarity:'positive',aspect:'unknown'},
              {voice:'passive',omittedRoles:['agent']});
            const candidate={interlingua:meaning,
              lexicalSenses:{theme:theme.senseId,verb:null},score:theme.priority||0};
            const key=JSON.stringify(meaning),former=readings.get(key);
            if(!former||candidate.score>former.score)readings.set(key,candidate);
            continue;
          }
          const markerSize=matchesTokens(tokens,after,grammar.passive.agentMarker);
          if(!markerSize)continue;
          const agents=readNounPhrases(tokens,after+markerSize,grammar.passive.agentCase,0,budget);
          for(const agent of agents) {
            if(agent.next!==tokens.length)continue;
            const meaning=createEvent(concept,{...baseRoles,agent:agent.value},
              {tense,polarity:'positive',aspect:'unknown'},{voice:'passive'});
            const candidate={interlingua:meaning,
              lexicalSenses:{theme:theme.senseId,verb:null,
                ...(agent.senseId?{agent:agent.senseId}:{})},
              score:(theme.priority||0)+(agent.priority||0)};
            const key=JSON.stringify(meaning),former=readings.get(key);
            if(!former||candidate.score>former.score)readings.set(key,candidate);
          }
        }
      }
    }
    return boundedAnalyses([...readings.values()].sort((left,right)=>right.score-left.score));
  }

  /** Bounded chart-like enumeration for complete clauses or clauses with one semantic gap.
   * Relative clauses are parsed by recursively reusing the SAME frame/lexicon rules.
   * The source marker is language-specific data; no pairwise translation rules exist.
   */
  function analyzeCandidates(text) {
    if(typeof text==='string'&&text.includes('?'))return analyzeQuestionCandidates(text);
    if(grammar.numericTime && typeof text==='string') {
      const trimmed=text.trim(),punctuation=/[.]$/u.test(trimmed)?'.':null;
      if(punctuation) {
        const body=trimmed.slice(0,-1);
        const temporal=[['date',grammar.numericTime.dateMarker,/\d{4}-\d{2}-\d{2}$/u],
          ['clock',grammar.numericTime.clockMarker,/\d{2}:\d{2}$/u]];
        for(const [kind,marker,pattern] of temporal) {
          const suffix=` ${marker} `,lower=body.toLocaleLowerCase(grammar.language),at=lower.lastIndexOf(suffix);
          if(at<0)continue;
          const value=body.slice(at+suffix.length).trim(),bare=body.slice(0,at).trim();
          if(!bare)continue;
          if(!/[\d:-]/u.test(value))continue;
          if(!pattern.test(value))unsupported(`Unsupported ${kind} format; expected ${kind==='clock'?'HH:MM':'YYYY-MM-DD'}.`);
          const parsed=kind==='clock'?{hour:Number(value.slice(0,2)),minute:Number(value.slice(3,5))}:
            {year:Number(value.slice(0,4)),month:Number(value.slice(5,7)),day:Number(value.slice(8,10))};
          const readings=analyzeCandidates(bare+'.').filter(item=>item.interlingua.type==='event');
          if(readings.length)return readings.map(item=>({
            ...item,
            interlingua:createEvent(item.interlingua.concept,item.interlingua.roles,{
              ...item.interlingua.features,
              ...(item.interlingua.timeReference?{timeReference:item.interlingua.timeReference}:{}),
              ...(item.interlingua.clockTime?{clockTime:item.interlingua.clockTime}:{}),
              ...(item.interlingua.calendarDate?{calendarDate:item.interlingua.calendarDate}:{}),
              ...(kind==='clock'?{clockTime:parsed}:{calendarDate:parsed})
            },{voice:item.interlingua.voice,omittedRoles:item.interlingua.omittedRoles})
          }));
        }
      }
    }
    if(grammar.temporalDeixis && typeof text==='string') {
      const trimmed=text.trim(),punctuation=/[.]$/u.test(trimmed)?'.':null;
      if(punctuation) {
        const body=trimmed.slice(0,-1),normalized=body.toLocaleLowerCase(grammar.language);
        for(const [reference,markers] of Object.entries(grammar.temporalDeixis)) {
          for(const marker of [].concat(markers)) {
            const suffix=' '+marker.toLocaleLowerCase(grammar.language);
            if(!normalized.endsWith(suffix))continue;
            const bare=body.slice(0,body.length-suffix.length).trim();
            if(!bare)continue;
            const readings=analyzeCandidates(bare+'.');
            const timed=readings.filter(item=>item.interlingua.type==='event').map(item=>({
              ...item,
              interlingua:createEvent(item.interlingua.concept,item.interlingua.roles,
                {...item.interlingua.features,timeReference:reference},
                {voice:item.interlingua.voice,omittedRoles:item.interlingua.omittedRoles})
            }));
            if(timed.length)return timed;
          }
        }
      }
    }
    const tokens = tokenize(text);
    const counter={visited:0};
    const passiveReadings=parsePassiveCandidates(tokens,counter);
    if(passiveReadings.length)return passiveReadings;
    const requestReadings=parseRequestCandidates(tokens,counter);
    if(requestReadings.length)return requestReadings;
    const modalReadings = parseModalCandidates(tokens,null,null,null,counter);
    if (modalReadings.length) return modalReadings;
    const budget = searchBudget(counter);
    const comparisonReadings=parseComparisonCandidates(tokens,budget);
    const stateReadings = [...parseStateCandidates(tokens,budget),
      ...analyzeNegativeStateStatement(tokens,budget)];
    const results = [...comparisonReadings,...stateReadings,...parseClause(tokens, null, null, 0, budget,
      {allowImplicitSubject:true})];
    if (results.length) return boundedAnalyses(results);
    if (budget.agreementFailed) unsupported(grammar.messages?.agreement ||
      'Verb form does not agree with subject.');
    unsupported('Sentence does not match a supported grammatical construction (subject noun phrase, roles, verb or word order).');
  }

  function parseClause(tokens, gap, antecedent, depth, budget, options = {}) {
    const {verbEntries=verbForms,linearizations=null,omitGap=false,skipPreposition=null,
      allowImplicitSubject=false} = options;
    const memoKey = JSON.stringify([jsonSignature(tokens,budget),gap,antecedent?.noun?.id,
      jsonSignature(antecedent?.value,budget),depth,omitGap,linearizations?'question':'declarative',skipPreposition,
      allowImplicitSubject]);
    if (budget.memo.has(memoKey)) return budget.memo.get(memoKey);
    const sourceRange=(start,end)=>{
      const first=tokens.sourceSpans?.[start],last=tokens.sourceSpans?.[end-1];
      return first&&last?{start:first.start,end:last.end}:null;
    };
    const readings = new Map();
    const {unprefixedByFirstToken,prefixGroupsByFirstToken}=indexVerbEntries(verbEntries);
    const matchedOrders=new Set(),matchingEntriesByConcept=new Map();
    const collectMatch=(candidate,at)=>{
      if(matchedOrders.has(candidate.order)||!matchesTokens(tokens,at,candidate.entry.text))return;
      matchedOrders.add(candidate.order);
      const concept=candidate.entry.lexeme.concept;
      if(!matchingEntriesByConcept.has(concept))matchingEntriesByConcept.set(concept,[]);
      matchingEntriesByConcept.get(concept).push(candidate);
    };
    for(let at=0;at<tokens.length;at++) {
      for(const candidate of unprefixedByFirstToken.get(tokens[at])||[])collectMatch(candidate,at);
      for(const group of prefixGroupsByFirstToken.get(tokens[at])||[]) {
        let formAt=at,matched=true;
        for(const prefix of group.prefixes) {
          const length=matchesTokens(tokens,formAt,prefix);
          if(!length){matched=false;break;}
          formAt+=length;
        }
        if(!matched)continue;
        for(const candidate of group.formsByFirstToken.get(tokens[formAt])||[])
          collectMatch(candidate,formAt);
      }
    }
    const orderedConcepts=[...matchingEntriesByConcept.keys()]
      .filter(concept=>frameOrder.has(concept))
      .sort((left,right)=>frameOrder.get(left)-frameOrder.get(right));
    for (const concept of orderedConcepts) {
      const frame=frames[concept];
      const frameAgreement=agreementForFrame(frame);
      const entries=matchingEntriesByConcept.get(concept)
        .sort((left,right)=>left.order-right.order).map(candidate=>candidate.entry);
      const parserPlans=parserLinearizationPlans('event',concept,frame);
      const parserSequences=parserPlans.map(plan=>plan.sequence);
      const sequences = linearizations ? linearizations(frame,concept,parserSequences) : parserSequences;
      if (sequences.length > MAX_ANALYSES) {
        throw new EngineError('GRAMMAR_SEARCH_LIMIT',
          'Sentence analysis exceeded the bounded search limit.');
      }
      for (const sequence of sequences) {
        const orderPlan=parserPlans.find(plan=>JSON.stringify(plan.sequence)===JSON.stringify(sequence));
        if (gap && !sequence.includes(gap)) continue;
        for (const entry of entries) {
          const roleRules=new Map();
          if (++budget.counter.visited > MAX_SEARCH_NODES) {
            throw new EngineError('GRAMMAR_SEARCH_LIMIT',
              'Sentence analysis exceeded the bounded search limit.');
          }
          const features = { tense: entry.rule.tense, polarity: entry.rule.polarity,
            aspect: entry.rule.aspect!==undefined ? entry.rule.aspect :
              (verbGrammar.aspectSource === 'lexeme' ? entry.lexeme.aspect || 'unknown' : 'unknown') };
          const implicit=allowImplicitSubject&&frame.implicitSubject?.analysis
            ?implicitEventSubject(entry.rule):null;
          const variants=[{sequence,implicitSubject:null},
            ...(implicit&&sequence.includes(subjectRole)
              ?[{sequence:sequence.filter(step=>step!==subjectRole),implicitSubject:implicit}]:[])];
          for(const variant of variants) {
            const parseSequence=variant.sequence;
            const initialRoles=gap?{[gap]:antecedent}:variant.implicitSubject
              ?{[subjectRole]:{value:variant.implicitSubject,noun:null,senseId:null,priority:0,
                implicit:true}}:{};
            function search(position, index, parsedRoles, sourceTrace=[],surfaceSlots=[]) {
              if (++budget.counter.visited > MAX_SEARCH_NODES) {
                throw new EngineError('GRAMMAR_SEARCH_LIMIT',
                  'Sentence analysis exceeded the bounded search limit.');
              }
              if (position === parseSequence.length) {
                if (index !== tokens.length) return;
                const context = contextFor(parsedRoles, features,subjectRole,
                  {formalSubject:parseSequence.includes('@expletive')?frame.formalSubject:null});
                if (!matchesConditions(context, entry.rule.when || {}) ||
                    !matchesAgreement(entry.bindings, frameAgreement, context) ||
                    !matchesMorphologyFeatures(entry,context,features,frameAgreement)) {
                  budget.agreementFailed = true;
                  return;
                }
                const meaning = createEvent(concept, Object.fromEntries(Object.entries(parsedRoles)
                  .filter(([role]) => !omitGap || role !== gap)
                  .map(([role, parsed]) => [role, parsed.value])), features);
                const senses = Object.fromEntries(Object.entries(parsedRoles)
                  .filter(([role]) => role !== gap)
                  .map(([role, parsed]) => [role, parsed.senseId]));
                for (const [role, parsed] of Object.entries(parsedRoles)) {
                  if (role === gap) continue;
                  if (parsed.modifierSenses?.length) senses[`${role}.modifiers`] = parsed.modifierSenses;
                  if (parsed.quantifierSense) senses[`${role}.quantifier`] = parsed.quantifierSense;
                }
                senses.verb = entry.lexeme.senseId;
                const roleSources=Object.entries(parsedRoles)
                  .filter(([role])=>role!==gap)
                  .map(([role,parsed])=>({path:`#/roles/${role.replace(/~/gu,'~0').replace(/\//gu,'~1')}`,
                    ...(parsed.sourceSpan?{span:parsed.sourceSpan}:{status:'unavailable',
                      reason:parsed.implicit?'implicit-source-subject':'source-span-unavailable'})}));
                const candidate = { interlingua: meaning, lexicalSenses: senses,
                  sourceSegments:[...sourceTrace,...roleSources],
                  score: (entry.lexeme.priority || 0) + Object.entries(parsedRoles)
                    .filter(([role]) => role !== gap)
                    .reduce((score, [, parsed]) => score + (parsed.noun?.priority || parsed.priority || 0), 0),
                  ...(orderPlan?.surfaceEnabled?{surfaceVariants:[{id:orderPlan.id,
                    slots:surfaceSlots.slice().sort((left,right)=>left.start-right.start ||
                      left.end-right.end || (left.name<right.name?-1:left.name>right.name?1:0)),
                    markedness:'unknown'}]}:{}) };
                const key = JSON.stringify(meaning);
                const former = readings.get(key);
                if (!former) readings.set(key,candidate);
                else readings.set(key,mergeSurfaceVariants(former,candidate));
                return;
              }
              const step = parseSequence[position];
              if (step === gap) { search(position + 1, index, parsedRoles,sourceTrace,surfaceSlots); return; }
              if (step === '@verb') {
                const next = matchVerb(tokens, index, entry);
                if (next !== null) {
                  const span=sourceRange(index,next);
                  const paths=['#/concept','#/features'];
                  const slots=orderPlan?.surfaceEnabled&&span?
                    [...surfaceSlots,{name:'@verb',...span}]:surfaceSlots;
                  search(position + 1, next, parsedRoles,[...sourceTrace,...paths.map(path=>
                    ({path,...(span?{span}:{status:'unavailable',reason:'source-span-unavailable'})}))],slots);
                }
                return;
              }
              if (step.startsWith('@')) {
                const literal=step==='@expletive'?frame.formalSubject.surface:step.slice(1);
                if(literal===skipPreposition) {
                  search(position+1,index,parsedRoles,sourceTrace,surfaceSlots);
                  return;
                }
                const count = matchesTokens(tokens, index, literal);
                if (count) search(position + 1, index + count, parsedRoles,sourceTrace,surfaceSlots);
                return;
              }
              let roleRule=roleRules.get(step);
              if(!roleRule) {
                const caseRule=compiledCases.get(frame)?.has(step)?null:frame.cases?.[step];
                const cases=record(caseRule)?[...new Set(Object.values(caseRule))]:
                  [roleCase(frame,step,features)];
                const impliedByCase=new Map();
                if(record(caseRule))for(const key of Object.keys(caseRule)) {
                  const grammaticalCase=caseRule[key];
                  if(key!=='unknown'&&!impliedByCase.has(grammaticalCase))
                    impliedByCase.set(grammaticalCase,key);
                }
                roleRule={caseRule,cases,impliedByCase};
                roleRules.set(step,roleRule);
              }
              const {caseRule,cases,impliedByCase}=roleRule;
              for (const grammaticalCase of cases) {
                const phrases=[...readNounPhrases(tokens,index,grammaticalCase,depth,budget,
                  {allowBare:frame.bareRoles?.includes(step) === true}),
                  ...readDeicticNounPhrases(tokens,index,deicticCase(grammaticalCase,step)),
                  ...(step===subjectRole && grammaticalCase===nounPhrase.subjectCase
                    ?readStateSubjectPronouns(tokens,index):[])];
                for (const parsed of phrases) {
                  if (parsed.bare && frame.bareRoleConcepts?.[step] &&
                      !bareRoleAllows(frame,step,parsed.noun.concept)) continue;
                  if (record(caseRule)) {
                    const implied = impliedByCase.get(grammaticalCase);
                    if (!implied) continue;
                    if (parsed.value.features.definiteness !== 'unknown' &&
                        parsed.value.features.definiteness !== implied) continue;
                    parsed.value = { ...parsed.value,
                      features: { ...parsed.value.features, definiteness: implied } };
                  }
                  const sourced={...parsed,sourceSpan:sourceRange(index,parsed.next)};
                  const slots=orderPlan?.surfaceEnabled&&sourced.sourceSpan?
                    [...surfaceSlots,{name:step,...sourced.sourceSpan}]:surfaceSlots;
                  search(position + 1, parsed.next, { ...parsedRoles, [step]: sourced },sourceTrace,slots);
                }
              }
            }
            search(0, 0, initialRoles,[]);
          }
        }
      }
    }
    const results = boundedAnalyses([...readings.values()].sort((a, b) => b.score - a.score));
    if (budget.memo.size < 1000) budget.memo.set(memoKey, results);
    return results;
  }


  /**
   * Modal auxiliary forms are compositional syntax over existing EVENT
   * frames, bounded search, case assignment and noun phrase morphology.
   */
  function modalEntries(modal, mode, person, number, includeModal = true) {
    const modalForm=modal.forms[mode]?.[modalAgreementKey(person,number)];
    if (!modality || !modalForm) return [];
    let cache=modalEntriesCache.get(modal);
    if(!cache){cache=new Map();modalEntriesCache.set(modal,cache);}
    const cacheKey=JSON.stringify([mode,person,number,includeModal]);
    if(cache.has(cacheKey))return cache.get(cacheKey);
    const operator=modal.senses[0].coreRef.id;
    const entries=verbs.flatMap(lexeme => formsAtLexeme(lexeme,modality.infinitivePath)
      .filter(verbForm => Object.keys(verbForm.bindings).length === 0)
      .map(verbForm => ({
        lexeme, text:verbForm.text,
        bindings: {}, rule: {
          tense:operator==='modality.intention'?'future':'present', polarity:mode === 'positive' ? 'positive' : 'negative',
          prefix:includeModal?[modalForm]:[],when:{'subject.person':person,'subject.number':number}
        }
      })));
    cache.set(cacheKey,entries);
    return entries;
  }

  function containsPhrase(tokens, phrase) {
    for(let index=0;index<tokens.length;index++) {
      if(matchesTokens(tokens,index,phrase))return true;
    }
    return false;
  }

  function wrapModalReading(reading, modal, mode) {
    const event = {...reading.interlingua,
      features:{...reading.interlingua.features,polarity:'positive'}};
    const operator=modal.senses[0].coreRef.id;
    const meaning=mode==='negative'
      ? createNegation(createModality(operator,event))
      : mode==='prohibition'
        ? createModality(operator,createNegation(event))
        : createModality(operator,event);
    return {...reading,interlingua:meaning,
      lexicalSenses:{...reading.lexicalSenses,modal:modal.senses[0].id}};
  }

  function parseModalCandidates(tokens, gap = null, antecedent = null, linearizations = null,
    counter = {visited:0}) {
    if (!modality || !modals.length) return [];
    const readings=[];
    for (const modal of modals) for (const mode of (modal.senses[0].coreRef.id==='modality.intention'
      ? ['positive'] : ['positive','negative','prohibition'])) {
      if (!modal.forms[mode]) continue;
      for (const person of ['first','second','third']) for (const number of ['singular','plural']) {
        const modalForm=modal.forms[mode][modalAgreementKey(person,number)];
        if(!modalForm || !containsPhrase(tokens,modalForm))continue;
        const variants=parseClause(tokens,gap,antecedent,0,questionBudget(counter),{
          verbEntries:modalEntries(modal,mode,person,number),
          omitGap:!!gap, linearizations
        });
        for (const reading of variants) {
          readings.push(wrapModalReading(reading,modal,mode));
          boundedAnalyses(readings);
        }
      }
    }
    return readings;
  }

  function modalParts(node) {
    const negative=node?.type==='scope' && node.operand?.type==='modality';
    const modal=negative?node.operand:node;
    if (modal?.type!=='modality') return null;
    const prohibition=modal.operand?.type==='scope';
    return {operator:modal.operator,mode:negative?'negative':prohibition?'prohibition':'positive',
      event:prohibition?modal.operand.operand:modal.operand};
  }

  function parseModalQuestionCandidates(tokens,counter) {
    if (!questions || !modality || !modals.length) return [];
    const result=[];
    const add=(items,kind,role)=>{
      for(const item of items) {
        const meaning=createQuestion(item.interlingua,kind==='wh'
          ? {questionType:'wh',targetRole:role}:{questionType:'yes_no'});
        if(!result.some(x=>JSON.stringify(x.interlingua)===JSON.stringify(meaning)))
          result.push({...item,interlingua:meaning});
      }
    };
    if(modality.questionStrategy==='prefix'){
      for(const [concept,frame] of Object.entries(frames)){
        const prefix=frame.whTheme?.frontPreposition;
        if(!prefix || tokens[0]!==normalizedWord(prefix) ||
            tokens[1]!==normalizedWord(questions.wh.theme.marker))continue;
        const gap={value:{features:{number:'singular'}},
          noun:{id:'question_gap'},senseId:null};
        for(const modal of modals)for(const mode of ['positive','negative']){
          for(const person of ['first','second','third']) for(const number of ['singular','plural']){
            const entries=frontedVerbEntries(modalEntries(modal,mode,person,number),frame,concept);
            const readings=parseClause(tokens.slice(2),'theme',gap,0,questionBudget(counter),{
              verbEntries:entries,omitGap:true,linearizations:themeOrder
            });
            add(readings.map(item=>wrapModalReading(item,modal,mode)),'wh','theme');
          }
        }
      }
    }
    if (questions.yesNo.mode==='prefix' &&
        tokens[0]===normalizedWord(questions.yesNo.marker)) {
      add(parseModalCandidates(tokens.slice(1),null,null,null,counter),'yes_no');
    } else if (modality.questionStrategy==='front' &&
               ![normalizedWord(questions.wh.agent.marker),
                 normalizedWord(questions.wh.theme.marker)].includes(tokens[0])) {
      for (const modal of modals) for(const person of ['first','second','third'])
        for(const number of ['singular','plural']){
        const length=matchesTokens(tokens,0,
          modal.forms.positive[modalAgreementKey(person,number)]);
        if(!length)continue;
        const readings=parseClause(tokens.slice(length),null,null,0,questionBudget(counter),{
          verbEntries:modalEntries(modal,'positive',person,number,false)
        });
        add(readings.map(item=>wrapModalReading(item,modal,'positive')),'yes_no');
      }
    } else if (tokens[0]===normalizedWord(questions.wh.agent.marker)) {
      add(parseModalCandidates(tokens.slice(1),'agent',gapSyntax(),null,counter),'wh','agent');
    } else {
      const words=[questions.wh.theme.marker,
        ...Object.values(questions.wh.theme.caseMarkers||{})].map(normalizedWord);
      if (words.includes(tokens[0])) {
        const gap={value:{features:{number:'singular'}},noun:{id:'question_gap'},senseId:null};
        if (modality.questionStrategy==='prefix') {
          const readings=parseModalCandidates(tokens.slice(1),'theme',gap,themeOrder,counter)
            .filter(item=>{
              const parts=modalParts(item.interlingua);
              const frame=frames[parts.event.concept];
              const synthetic={...parts.event.features,
                polarity:parts.mode==='positive'?'positive':'negative'};
              const gramCase=roleCase(frame,'theme',synthetic,null);
              const marker=questions.wh.theme.caseMarkers?.[gramCase]||questions.wh.theme.marker;
              return tokens[0]===normalizedWord(marker);
            });
          add(readings,'wh','theme');
        } else if (tokens[0]===normalizedWord(questions.wh.theme.marker)) {
          for(const modal of modals) for(const person of ['first','second','third'])
            for(const number of ['singular','plural']){
            const length=matchesTokens(tokens,1,
              modal.forms.positive[modalAgreementKey(person,number)]);
            if(!length)continue;
            const readings=parseClause(tokens.slice(1+length),'theme',gap,0,questionBudget(counter),{
              verbEntries:modalEntries(modal,'positive',person,number,false),omitGap:true
            });
            add(readings.map(item=>wrapModalReading(item,modal,'positive')),'wh','theme');
          }
        }
      }
    }
    const safe = result.filter(item=>item.interlingua.questionType!=='wh' ||
      item.interlingua.targetRole!=='theme' ||
      (frames[modalParts(item.interlingua.proposition)?.event?.concept]?.whTheme!==false &&
      (!frames[modalParts(item.interlingua.proposition)?.event?.concept]?.whTheme?.frontPreposition ||
       tokens[0]===normalizedWord(frames[modalParts(item.interlingua.proposition)?.event?.concept].whTheme.frontPreposition))));
    return boundedAnalyses(safe.sort((a,b)=>(b.score||0)-(a.score||0)));
  }

  /** No semantic entity is used for an unanswered role.  This temporary
   *  syntactic record only provides finite verb agreement during parsing. */
  const gapSyntax=()=>({value:{features:{number:questions.wh.agent.agreement.number}},
    noun:{id:'question_gap',gender:questions.wh.agent.agreement.gender,
      pluralClass:questions.wh.agent.agreement.pluralClass},senseId:null});
  const themeOrder=(frame,concept,sequences=frame.linearizations)=>sequences.map(seq=>
    ['@verb',...seq.filter(step=>step!=='@verb'&&step!=='theme'),'theme']);
  const normalizedWord=value=>value.toLocaleLowerCase(grammar.language);
  const questionBudget=counter=>searchBudget(counter);
  const auxiliaryQuestionVariants=questions?.yesNo?.auxiliaries?[
    {word:questions.yesNo.auxiliaries.past,tense:'past',when:null},
    {word:questions.yesNo.auxiliaries.presentFirst,tense:'present',when:{'subject.person':'first'}},
    {word:questions.yesNo.auxiliaries.presentSecond,tense:'present',when:{'subject.person':'second'}},
    {word:questions.yesNo.auxiliaries.presentThirdSingular,tense:'present',when:{
      'subject.person':'third','subject.number':'singular'}},
    {word:questions.yesNo.auxiliaries.presentThirdPlural,tense:'present',when:{
      'subject.person':'third','subject.number':'plural'}}
  ]:[];
  function auxiliaryVerbEntries(variant,polarity) {
    let byPolarity=auxiliaryVerbEntriesCache.get(variant);
    if(!byPolarity){byPolarity=new Map();auxiliaryVerbEntriesCache.set(variant,byPolarity);}
    if(byPolarity.has(polarity))return byPolarity.get(polarity);
    const yesNo=questions.yesNo;
    const entries=verbForms.filter(entry=>
      entry.rule.tense===variant.tense && entry.rule.polarity===polarity &&
      entry.rule.aspect===undefined &&
      (!variant.when || Object.entries(variant.when).every(([key,value])=>
        entry.rule.when?.[key]===value)))
      .flatMap(entry=>formsAtLexeme(entry.lexeme,yesNo.baseVerbPath).map(base=>({
        ...entry,text:base.text,rule:{...entry.rule,
          prefix:polarity==='negative'?[yesNo.negator]:[]}
      })));
    byPolarity.set(polarity,entries);
    return entries;
  }
  let progressiveVerbEntriesByPrefix;
  function progressiveVerbEntries(prefix) {
    if(!questions?.yesNo?.auxiliaries)return [];
    if(!progressiveVerbEntriesByPrefix) {
      progressiveVerbEntriesByPrefix=new Map();
      for(const entry of verbForms) {
        if(entry.rule.tense!=='present'||entry.rule.aspect!=='imperfective'||
            entry.rule.path!=='forms.progressive'||!entry.rule.prefix.length)continue;
        const key=normalizedWord(entry.rule.prefix[0]);
        if(!progressiveVerbEntriesByPrefix.has(key))progressiveVerbEntriesByPrefix.set(key,[]);
        progressiveVerbEntriesByPrefix.get(key).push({
          ...entry,rule:{...entry.rule,prefix:entry.rule.prefix.slice(1)}});
      }
    }
    return progressiveVerbEntriesByPrefix.get(prefix)||[];
  }

  /** Only a declared governed preposition may move with the queried role. */
  function withoutGovernedPreposition(surface, frame) {
    const marker=frame?.whTheme?.frontPreposition;
    if (!marker) return surface;
    const suffix=' '+marker;
    if (typeof surface !== 'string' ||
        !surface.toLocaleLowerCase(grammar.language).endsWith(
          suffix.toLocaleLowerCase(grammar.language))) return null;
    return surface.slice(0,-suffix.length);
  }

  function parseFrontedPrepositionTheme(tokens,counter) {
    if(questions?.yesNo?.mode!=='prefix')return [];
    const readings=[];
    for(const [concept,frame] of Object.entries(frames)){
      const prefix=frame.whTheme?.frontPreposition;
      if(!prefix || tokens[0]!==normalizedWord(prefix) ||
          tokens[1]!==normalizedWord(questions.wh.theme.marker))continue;
      const syntacticGap={value:{features:{number:'singular'}},
        noun:{id:'question_gap'},senseId:null};
      const entries=frontedVerbEntries(verbFormsByConcept.get(concept)||[],frame);
      readings.push(...parseClause(tokens.slice(2),'theme',syntacticGap,0,questionBudget(counter),{
        verbEntries:entries,omitGap:true,linearizations:themeOrder
      }));
    }
    return readings;
  }

  function analyzeAuxiliaryQuestion(tokens,gap,antecedent,counter,options={}) {
    const results=[];
    for(const variant of auxiliaryQuestionVariants) {
      if(tokens[0]!==normalizedWord(variant.word))continue;
      for(const polarity of ['positive','negative']) {
        const verbEntries=auxiliaryVerbEntries(variant,polarity);
        results.push(...parseClause(tokens.slice(1),gap,antecedent,0,questionBudget(counter),{
          verbEntries,omitGap:!!gap,...options
        }));
      }
    }
    const progressiveEntries=progressiveVerbEntries(tokens[0]);
    if(progressiveEntries.length)results.push(...parseClause(tokens.slice(1),gap,antecedent,0,
      questionBudget(counter),{verbEntries:progressiveEntries,omitGap:!!gap,...options}));
    return results;
  }

  function analyzeAuxiliaryStateQuestion(tokens,counter) {
    if(questions.yesNo.mode!=='auxiliary')return [];
    const yesNo=questions.yesNo;
    const copulaReadings=[];
    const copulaEntries=stateVerbForms.filter(entry=>['predication','classification','existence'].includes(entry.kind)&&
      stateGrammar.supportedTenses.includes(entry.features.tense)&&
      normalizedWord(entry.text)===tokens[0]);
    for(const entry of copulaEntries)copulaReadings.push(...parseStateCandidates(tokens.slice(1),
      questionBudget(counter),{entries:[entry],polarities:['positive'],omitVerb:true}));
    const variants=[
      {word:yesNo.auxiliaries.past,tense:'past'},
      {word:yesNo.auxiliaries.presentFirst,tense:'present',person:'first',number:'singular'},
      {word:yesNo.auxiliaries.presentSecond,tense:'present',person:'second',number:'singular'},
      {word:yesNo.auxiliaries.presentThirdSingular,tense:'present',person:'third',number:'singular'},
      {word:yesNo.auxiliaries.presentThirdPlural,tense:'present',person:'third',number:'plural'}
    ];
    const results=[...copulaReadings];
    for(const variant of variants) {
      if(tokens[0]!==normalizedWord(variant.word))continue;
      let entries=stateVerbForms.filter(entry=>entry.kind==='possession'&&
        entry.features.tense===variant.tense&&
        (!variant.person || (entry.features.person===variant.person&&
          entry.features.number===variant.number)));
      if(!variant.person)entries=[...new Map(entries.map(entry=>[
        entry.lexeme.id,{...entry,rule:{...entry.rule,when:{}}}
      ])).values()];
      entries=entries
        .flatMap(entry=>formsAtLexeme(entry.lexeme,yesNo.baseVerbPath).map(base=>({
          ...entry,text:base.text,rule:{...entry.rule,prefix:[],when:{
            ...(variant.person?{'subject.person':variant.person,
              'subject.number':variant.number}:{})
          }}
        })));
      const readings=parseStateCandidates(tokens.slice(1),questionBudget(counter),{
        entries,polarities:['positive']
      });
      results.push(...readings);
    }
    return results;
  }

  function analyzeNegativeStateStatement(tokens,budget) {
    if(questions?.yesNo?.mode!=='auxiliary'||
       !(stateGrammar.supportedPolarities||['positive','negative']).includes('negative'))return [];
    const yesNo=questions.yesNo;
    const entries=stateVerbForms.filter(entry=>entry.kind==='possession'&&
      entry.features.tense==='present')
      .flatMap(entry=>formsAtLexeme(entry.lexeme,yesNo.baseVerbPath).map(base=>({
        ...entry,text:base.text
      })));
    return parseStateCandidates(tokens,budget,{entries,polarities:['negative'],doSupport:true});
  }

  /** A deliberately controlled question parser.  A terminal question mark is
   *  required; unsupported forms fail rather than becoming declaratives. */
  function analyzeQuestionCandidates(text) {
    if (!questions) unsupported('Unsupported question construction in this language.');
    if (typeof text!=='string' || !text.trim().endsWith('?') ||
        /[.?!]/u.test(text.trim().slice(0,-1))) {
      unsupported('Unsupported question construction or punctuation.');
    }
    const tokens=tokenize(text.trim().slice(0,-1)+'.');
    if(tokens.length<2)unsupported('Unsupported question construction.');
    const counter={visited:0};
    const modalReadings=parseModalQuestionCandidates(tokens,counter);
    if(modalReadings.length)return modalReadings;
    const results=[];
    const add=(readings,kind,targetRole)=>{
      for(const item of readings) {
        const question=createQuestion(item.interlingua,kind==='wh'
          ? {questionType:'wh',targetRole} : {questionType:'yes_no'});
        if(!results.some(candidate=>JSON.stringify(candidate.interlingua)===JSON.stringify(question))){
          results.push({...item,interlingua:question});
        }
      }
    };
    if(tokens[0]===normalizedWord(questions.wh.location.marker)) {
      add(parseStateCandidates(tokens.slice(1),questionBudget(counter),
        {gap:'location',invert:true}),'wh','location');
    }
    if(tokens[0]===normalizedWord(questions.wh.destination.marker)) {
      const gap='destination',antecedent=gapSyntax();
      if(questions.yesNo.mode==='auxiliary') {
        add(analyzeAuxiliaryQuestion(tokens.slice(1),gap,antecedent,counter,
          {skipPreposition:questions.wh.destination.preposition}),'wh',gap);
      } else {
        const linearizations=(frame,concept,sequences=frame.linearizations)=>sequences.filter(sequence=>sequence.includes(gap))
          .map(sequence=>questions.wh.destination.order==='verb_first'
            ? ['@verb',...sequence.filter(step=>step!=='@verb')]
            : sequence);
        add(parseClause(tokens.slice(1),gap,antecedent,0,questionBudget(counter),{
          omitGap:true,skipPreposition:questions.wh.destination.preposition,linearizations
        }),'wh',gap);
      }
    }
    add(analyzeAuxiliaryStateQuestion(tokens,counter),'yes_no');
    const mode=questions.yesNo.mode;
    add(parseFrontedPrepositionTheme(tokens,counter),'wh','theme');
    if(mode==='prefix' && tokens[0]===normalizedWord(questions.yesNo.marker)) {
      add(parseStateCandidates(tokens.slice(1),questionBudget(counter),{
        polarities:['positive'],question:true}),'yes_no');
      add(parseClause(tokens.slice(1),null,null,0,questionBudget(counter)),'yes_no');
    } else if(mode==='auxiliary' && (
        Object.values(questions.yesNo.auxiliaries).some(word=>tokens[0]===normalizedWord(word)) ||
        verbForms.some(entry=>entry.rule.tense==='present'&&entry.rule.aspect==='imperfective'&&
          entry.rule.path==='forms.progressive'&&entry.rule.prefix.length>0&&
          tokens[0]===normalizedWord(entry.rule.prefix[0]))
      )) {
      add(analyzeAuxiliaryQuestion(tokens,null,null,counter),'yes_no');
    } else if(tokens[0]===normalizedWord(questions.wh.agent.marker)) {
      add(parseClause(tokens.slice(1),'agent',gapSyntax(),0,questionBudget(counter),{
        omitGap:true
      }),'wh','agent');
    } else {
      const themeWords=[questions.wh.theme.marker,
        ...Object.values(questions.wh.theme.caseMarkers||{})].map(normalizedWord);
      const marker=tokens[0];
      if(themeWords.includes(marker)) {
        const syntacticGap={value:{features:{number:'singular'}},
          noun:{id:'question_gap'},senseId:null};
        const readings=mode==='prefix'
          ? parseClause(tokens.slice(1),'theme',syntacticGap,0,questionBudget(counter),{
            omitGap:true,linearizations:themeOrder
          })
          : analyzeAuxiliaryQuestion(tokens.slice(1),'theme',syntacticGap,counter);
        add(readings.filter(item=>{
          if(mode==='auxiliary')return marker===normalizedWord(questions.wh.theme.marker);
          const frame=frames[item.interlingua.concept];
          const gramCase=roleCase(frame,'theme',item.interlingua.features,null);
          const expected=questions.wh.theme.caseMarkers?.[gramCase]||questions.wh.theme.marker;
          return marker===normalizedWord(expected);
        }),'wh','theme');
      }
    }
    if(!results.length){
      unsupported('Only simple sentences with configured interrogative markers are supported. Unsupported question construction (word order, agreement, tense or polarity).');
    }
    const safe=results.filter(item=>item.interlingua.questionType!=='wh' ||
      item.interlingua.targetRole!=='theme' ||
      (frames[item.interlingua.proposition.concept]?.whTheme!==false &&
      (!frames[item.interlingua.proposition.concept]?.whTheme?.frontPreposition ||
       tokens[0]===normalizedWord(frames[item.interlingua.proposition.concept].whTheme.frontPreposition))));
    if(!safe.length) unsupported('Unsupported WH construction for this verb frame.');
    return boundedAnalyses(safe.sort((a,b)=>(b.score||0)-(a.score||0)));
  }

  function readDeicticNounPhrases(tokens,index,grammaticalCase) {
    const found=[];
    for(const pronoun of deicticPronouns){
      if(pronoun.case!==grammaticalCase)continue;
      const size=matchesTokens(tokens,index,pronoun.text);
      if(!size)continue;
      found.push({value:{referent:{...pronoun.referent},
        agreement:{person:pronoun.person,number:pronoun.number}},
        next:index+size,noun:null,senseId:pronoun.senseId,priority:pronoun.priority});
    }
    return found;
  }

  function readNounPhrases(tokens, index, grammaticalCase, depth, budget, options = {}) {
    let byPosition=budget.nounPhraseMemo.get(tokens);
    if(!byPosition){byPosition=new Map();budget.nounPhraseMemo.set(tokens,byPosition);}
    const cacheKey=JSON.stringify([index,grammaticalCase,depth,options.allowBare===true]);
    if(byPosition.has(cacheKey))return cloneNounPhraseCandidates(byPosition.get(cacheKey));
    const bare = nominal.read(tokens, index, grammaticalCase, options);
    for(const entry of possessives)for(const form of entry.forms){
      const length=matchesTokens(tokens,index,form.text);
      if(!length)continue;
      const possessed=nominal.read(tokens,index+length,grammaticalCase,{...options,allowBare:true});
      for(const parsed of possessed){
        if(parsed.value.features.definiteness!=='unknown' ||
          !Object.entries(form.when||{}).every(([key,value])=>
            ({number:parsed.value.features.number,case:grammaticalCase,
              gender:parsed.noun.gender,pluralClass:parsed.noun.pluralClass,
              animacy:parsed.noun.animacy})[key]===value))continue;
        bare.push({...parsed,value:{...parsed.value,
          features:{...parsed.value.features,definiteness:'definite'},
          possessor:{referent:{kind:'deictic',anchor:entry.anchor},
          agreement:{person:entry.person,number:entry.number}}},next:parsed.next});
      }
    }
    if (depth >= relativeGrammar.maxDepth) {
      byPosition.set(cacheKey,cacheNounPhraseCandidates(bare));
      return cloneNounPhraseCandidates(bare);
    }
    const enriched = [...bare];
    for (const base of bare) for (const marker of relativeGrammar.markers) {
      if (!relativeMarker(marker, base.noun, base.value)) continue;
      const commas = relativeGrammar.punctuation === 'commas';
      const begin = base.next + (commas ? 1 : 0);
      if (commas && tokens[base.next] !== ',') continue;
      const length = matchesTokens(tokens, begin, marker.text);
      if (!length) continue;
      const first = begin + length;
      // Search only punctuation boundaries when commas delimit relatives.
      // A comma can close either an inner or an outer clause, so both adjacent
      // endpoints remain candidates in the same order as the bounded scan.
      const ends=commas?new Set():null;
      if(commas)for(const comma of commaIndexes(tokens,budget)) {
        if(comma>first)ends.add(comma);
        if(comma+1>first)ends.add(comma+1);
      }
      const possibleEnds=commas?[...ends].filter(end=>end<=tokens.length).sort((a,b)=>a-b):
        Array.from({length:Math.max(0,tokens.length-first)},(_,index)=>first+index+1);
      for (const end of possibleEnds) {
        const closingConsumed = commas && tokens[end - 1] === ',';
        const span = tokens.slice(first, end);
        const candidates = parseClause(span, marker.gap, base, depth + 1, budget);
        for (const item of candidates) {
          const relative = createRelativeClause(item.interlingua, marker.gap);
          const value = { ...base.value, relatives: [relative] };
          enriched.push({ ...base, value, next: end + (commas && !closingConsumed ? 1 : 0),
            relativeSenses: item.lexicalSenses, modifierSenses: base.modifierSenses });
          if (enriched.length >= 72) resourceLimit('Relative clause ambiguity exceeds parser limit.');
        }
      }
    }
    byPosition.set(cacheKey,cacheNounPhraseCandidates(enriched));
    return cloneNounPhraseCandidates(enriched);
  }

  function analyze(text) { return analyzeCandidates(text)[0].interlingua; }

  /** Exposed language-neutral noun-phrase parser, reused by propositional clauses. */
  function matrixForm(lex, tense, ref, noun) {
    const numberForm = lex.forms[tense]?.[ref.features.number];
    if (typeof numberForm === 'string') return numberForm;
    if (!record(numberForm)) return null;
    const formClass = ref.features.number === 'singular' ? noun.gender : noun.pluralClass;
    return numberForm[formClass] || null;
  }

  function parseComplementHeads(text) {
    if (!comp || !matrixLexemes.length) return [];
    const tokens = tokenize(text);
    const answers = [];
    for (const head of nominal.read(tokens, 0, comp.subjectCase)) {
      for (const lex of matrixLexemes) for (const tense of ['past','present']) {
        const word = matrixForm(lex, tense, head.value, head.noun);
        if (typeof word !== 'string') continue;
        const verbSize = matchesTokens(tokens, head.next, word);
        if (!verbSize) continue;
        let cursor = head.next + verbSize;
        if (comp.comma) {
          if (tokens[cursor] !== ',') continue;
          cursor++;
        }
        const markerSize = matchesTokens(tokens, cursor, comp.marker);
        if (!markerSize || !tokens[cursor + markerSize]) continue;
        const tail = tokens.slice(cursor + markerSize).join(' ').replace(/ , /g, ', ');
        answers.push({ concept: lex.concept, experiencer: head.value, tense,
          content: tail + '.', senseId: lex.id });
      }
    }
    return boundedAnalyses(answers);
  }

  function realizeComplement(node, contentText) {
    if (!comp) unsupported(`Language ${grammar.language} has no complement construction.`);
    const lex = matrixLexemes.find(item => item.concept === node.concept);
    if (!lex) unsupported(`Missing ${grammar.language} complement lexeme for ${node.concept}.`);
    const noun = nounByConcept(node.experiencer.concept);
    const person = plainNoun(node.experiencer, noun, comp.subjectCase, nounPhrase.defaultDefiniteness);
    const predicate = matrixForm(lex, node.features.tense, node.experiencer, noun);
    if (!predicate) throw new Error('Missing matrix predicate inflection.');
    const connector = comp.comma ? `, ${comp.marker}` : ` ${comp.marker}`;
    const text = `${person} ${predicate}${connector} ${(() => { const inner = contentText.replace(/\.\s*$/u, ''); return inner.charAt(0).toLocaleLowerCase(grammar.language) + inner.slice(1); })()}`;
    return sentenceText([text]);
  }


  /** The anaphora layer is deliberately limited to leading subject pronouns.
   * It does not infer a grammatical referent or persist conversation state. */
  function readSubjectPronoun(text) {
    if(typeof text!=='string')return null;
    const match=/^([\p{L}]+)(?=\s)/u.exec(text.trim());
    if(!match)return null;
    const found=subjectPronouns.find(item=>
      item.text.toLocaleLowerCase(grammar.language)===
        match[1].toLocaleLowerCase(grammar.language));
    return found?{text:found.text,agreement:{...found.agreement}}:null;
  }

  function readDeicticPronoun(text) {
    if(typeof text!=='string')return [];
    const tokens=tokenize(text.trim());
    if(!tokens.length)return [];
    return readDeicticNounPhrases(tokens,0,deicticCase(nounPhrase.subjectCase,subjectRole)).map(item=>({
      text:tokens[0],referent:item.value.referent,agreement:item.value.agreement,
      senseId:item.senseId
    }));
  }

  function expandSubjectPronoun(text,referent,ontology=null) {
    const pronoun=readSubjectPronoun(text);
    if(!pronoun || !record(referent) ||
       subjectPronounFor(referent,ontology)!==pronoun.text ||
       !referent.concept || !nounIndex.has(referent.concept)){
      unsupported('Unresolved anaphora: no licensed singular subject antecedent.');
    }
    const noun=nounByConcept(referent.concept);
    const form=plainNoun({...referent,features:{...referent.features,
      definiteness:'definite'}},noun,nounPhrase.subjectCase,
      nounPhrase.defaultDefiniteness);
    const source=text.trim();
    const word=/^[\p{L}]+/u.exec(source)?.[0];
    return form+source.slice(word.length);
  }

  /** Safe surface candidate only; semantic antecedent selection belongs to Engine. */
  function subjectPronounFor(ref,ontology=null) {
    if (!record(ref)) return null;
    if(isDeicticReferent(ref)){
      if(ref.referent?.kind!=='anaphoric' || ref.referent.resolution!=='unresolved')return null;
      const matches=subjectPronouns.filter(item=>item.agreement.person===ref.agreement?.person &&
        item.agreement.number===ref.agreement?.number &&
        item.agreement.gender===ref.agreement?.gender);
      return matches.length===1?matches[0].text:null;
    }
    if (ref.features?.number !== 'singular' || !nounIndex.has(ref.concept) ||
        (ontology && !ontology.isA(ref.concept,'person'))) return null;
    const genders=new Set(nounIndex.get(ref.concept).map(noun=>noun.gender).filter(Boolean));
    if(genders.size!==1)return null;
    const matches = subjectPronouns.filter(item=>item.agreement.person==='third' &&
      item.agreement.number===ref.features.number && item.agreement.gender===[...genders][0]);
    return matches.length === 1 ? matches[0].text : null;
  }

  function nounByConcept(concept, lexicalRegister='neutral') {
    const nouns = nounIndex.get(concept);
    if (!nouns?.length) unsupported(`No ${dictionary.language} noun lexeme for ${concept}.`);
    return lexicalRegister==='neutral'?nouns[0]:
      nouns.find(noun=>noun.register===lexicalRegister)||nouns[0];
  }

  function deicticPronounSurface(ref,grammaticalCase=nounPhrase.subjectCase) {
    if(ref.referent?.kind==='anaphoric'){
      const text=subjectPronounFor(ref);
      if(!text)unsupported('Missing target third-person pronoun for typed referent.');
      return text;
    }
    const entry=deicticPronouns.find(item=>
      item.referent.anchor===ref.referent.anchor &&
      item.person===ref.agreement.person && item.number===ref.agreement.number &&
      item.case===grammaticalCase);
    if(!entry)unsupported(`Missing ${dictionary.language} deictic pronoun form for ${grammaticalCase}.`);
    return entry.text;
  }

  function nounSurface(role, meaning, frame, fallback, depth, lexicalRegister='neutral',
    lexicalOverrides={}) {
    const ref = meaning.roles[role];
    const requiredCase = roleCase(frame, role, meaning.features, ref);
    if(isDeicticReferent(ref)){
      return deicticPronounSurface(ref,deicticCase(requiredCase,role));
    }
    const override=lexicalOverrides?.[role];
    const noun = override ? nounIndex.get(ref.concept)?.find(item=>item.id===override) :
      nounByConcept(ref.concept,lexicalRegister);
    if(!noun)unsupported(`No ${dictionary.language} noun lexeme ${override} for ${ref.concept}.`);
    let output = plainNoun(ref, noun, requiredCase, fallback,
      bareRoleAllows(frame,role,ref.concept));
    for (const relative of ref.relatives || []) {
      if (depth >= relativeGrammar.maxDepth) resourceLimit('Relative clause realization depth exceeded.');
      const marker = relativeGrammar.markers.find(item => item.gap === relative.gap &&
        relativeMarker(item, noun, ref));
      if (!marker) unsupported(`Missing ${dictionary.language} relative marker for ${relative.gap}.`);
      const clause = renderEvent(relative.event, fallback, depth + 1, { gap: relative.gap,
        antecedent: { value: ref, noun } },{lexicalRegister,lexicalOverrides});
      const opening = relativeGrammar.punctuation === 'commas' ? ', ' : ' ';
      const closing = relativeGrammar.punctuation === 'commas' && !clause.endsWith(',') ? ',' : '';
      if (output.endsWith(',') && opening.startsWith(',')) output = output.slice(0, -1);
      output += `${opening}${marker.text} ${clause}${closing}`;
    }
    return output;
  }

  function renderEvent(meaning, fallback, depth = 0, relative = null, options = {}) {
    const frame = own(frames, meaning.concept);
    if (!frame) unsupported(`Missing frame for ${meaning.concept}.`);
    if (options.subjectPronoun && (relative ||
        frame.linearizations[0][0] !== subjectRole ||
        options.subjectPronoun !== subjectPronounFor(meaning.roles[subjectRole]))) {
      unsupported('Unsupported subject pronoun realization for this event.');
    }
    const roles = Object.fromEntries(Object.entries(meaning.roles).map(([role, ref]) => {
      const override=options.lexicalOverrides?.[role];
      const selected=isDeicticReferent(ref)?null:override ?
        nounIndex.get(ref.concept)?.find(item=>item.id===override):
        nounByConcept(ref.concept,options.lexicalRegister);
      if(override&&!selected)unsupported(`No ${dictionary.language} noun lexeme ${override} for ${ref.concept}.`);
      return [role, { value: ref, noun: isDeicticReferent(ref) ? null : selected }];
    }));
    if (relative) roles[relative.gap] = relative.antecedent;
    const sequence=options.sequence || frame.linearizations[0];
    const context = contextFor(roles, meaning.features,subjectRole,
      {formalSubject:sequence.includes('@expletive')?frame.formalSubject:null});
    for (const [argument, features] of Object.entries(options.agreementControllers || {})) {
      if (!record(context[argument])) {
        throw new Error(`Agreement controller target is unavailable: ${argument}.`);
      }
      context[argument] = {...context[argument], ...features};
    }
    const candidates = (verbFormsByConcept.get(meaning.concept)||[]).filter(entry =>
      entry.rule.tense === meaning.features.tense && entry.rule.polarity === meaning.features.polarity &&
      (verbGrammar.aspectSource !== 'lexeme' || meaning.features.aspect === 'unknown' ||
        entry.lexeme.aspect === meaning.features.aspect) &&
      matchesConditions(context, entry.rule.when || {}) &&
      matchesAgreement(entry.bindings, agreementForFrame(frame), context) &&
      matchesMorphologyFeatures(entry,context,meaning.features,agreementForFrame(frame)));
    if (!candidates.length) unsupported(`No ${dictionary.language} verb form supports ${meaning.concept}, ` +
      `${meaning.features.tense}, ${meaning.features.polarity}, ${meaning.features.aspect}.`);
    const simpleCandidates = candidates.filter(entry => entry.rule.path !== 'forms.progressive');
    const preferencePool = simpleCandidates.length ? simpleCandidates : candidates;
    const preferredAspect = verbGrammar.preferredAspects?.[meaning.concept];
    // CORE aspect does not distinguish English progressive from simple present.
    const preferred = preferencePool.find(v => v.lexeme.aspect === preferredAspect) || preferencePool[0];
    function linearizeParts(entry, def, lexicalOverrides=options.lexicalOverrides||{}) {
      return sequence.flatMap(step => {
        if (step === relative?.gap) return [];
        if (step === '@verb') return [{text:[...entry.rule.prefix,entry.text].join(' '),
          kind:'predicate',meaningPaths:['#/concept','#/features',
            `#/roles/${subjectRole}`],decision:{kind:'verb-form',id:entry.lexeme.id}}];
        if (step === '@expletive') return [{text:frame.formalSubject.surface,
          kind:'function-word',meaningPaths:['#/concept'],
          decision:{kind:'grammar-literal',id:'expletive'}}];
        if (step.startsWith('@')) return [{text:step.slice(1),kind:'function-word',
          meaningPaths:[],decision:{kind:'grammar-literal',id:step.slice(1)}}];
    if (step === subjectRole && (frame.implicitSubject?.realization ||
        (options.omitDeicticSubject===true&&frame.implicitSubject?.analysis===true)) &&
            isDeicticReferent(meaning.roles[step]) && !isAnaphoricReferent(meaning.roles[step]) &&
            ['first','second'].includes(meaning.roles[step].agreement?.person) &&
            ['singular','plural'].includes(meaning.roles[step].agreement?.number)) return [];
        if (step === subjectRole && options.subjectPronoun) return [{text:options.subjectPronoun,
          kind:'role',meaningPaths:[`#/roles/${step}`],decision:{kind:'pronoun',id:options.subjectPronoun}}];
        const text=nounSurface(step,meaning,frame,def,depth,options.lexicalRegister,lexicalOverrides);
        const noun=roles[step]?.noun;
        return [{text,kind:'role',meaningPaths:[`#/roles/${step}`],
          decision:{kind:isDeicticReferent(meaning.roles[step])?'deictic-pronoun':'lexical-choice',
            id:noun?.id||deicticPronounSurface(meaning.roles[step],deicticCase(
              roleCase(frame,step,meaning.features,meaning.roles[step]),step))}}];
      });
    }
    function linearize(entry, def, lexicalOverrides=options.lexicalOverrides||{}) {
      const parts = linearizeParts(entry,def,lexicalOverrides).map(part=>part.text);
      const text=parts.join(' ').replace(/\s+/gu, ' ').replace(/\s+,/gu, ',').trim();
      const marker=meaning.timeReference && grammar.temporalDeixis?.[meaning.timeReference];
      if(meaning.timeReference && meaning.timeReference!=='unspecified' && !marker) {
        unsupported(`Unsupported temporal reference in ${grammar.language}.`);
      }
      let output=marker ? `${text} ${[].concat(marker)[0]}` : text;
      if(meaning.clockTime)output+=` ${grammar.numericTime.clockMarker} ${String(meaning.clockTime.hour).padStart(2,'0')}:${String(meaning.clockTime.minute).padStart(2,'0')}`;
      if(meaning.calendarDate)output+=` ${grammar.numericTime.dateMarker} ${String(meaning.calendarDate.year).padStart(4,'0')}-${String(meaning.calendarDate.month).padStart(2,'0')}-${String(meaning.calendarDate.day).padStart(2,'0')}`;
      return output;
    }
    if (relative && !options.returnBuilder) return linearize(preferred, fallback);
    return { candidates, preferred, linearize, linearizeParts, roles };
  }

  function realizeState(meaning) {
    const frame=stateGrammar?.frames?.[meaning?.kind];
    if(!frame)unsupported(`Unsupported state construction in ${dictionary.language}.`);
    if(!stateGrammar.supportedTenses.includes(meaning.features.tense)) {
      unsupported(`No ${dictionary.language} state verb form supports ${meaning.features.tense}.`);
    }
    if(frame.supportedTenses && !frame.supportedTenses.includes(meaning.features.tense)) {
      unsupported(`No ${dictionary.language} ${meaning.kind} state frame supports ${meaning.features.tense}.`);
    }
    const polarity=meaning.features.polarity;
    if(!(stateGrammar.supportedPolarities || ['positive','negative']).includes(polarity)) {
      unsupported('Unsupported ' + dictionary.language + ' state polarity.');
    }
    const polarityTenses=stateGrammar.supportedTensesByPolarity?.[polarity];
    if(polarityTenses && !polarityTenses.includes(meaning.features.tense)) {
      unsupported('Unsupported ' + dictionary.language + ' state polarity.');
    }
    const negativeStrategy=stateGrammar.negativeStrategies?.[meaning.kind]||'preverbal';
    const subject=meaning.roles[frame.subjectRole];
    const person=isDeicticReferent(subject)?subject.agreement.person:GRAMMATICAL_PERSON.third;
    const number=isDeicticReferent(subject)?subject.agreement.number:subject.features.number;
    if(stateGrammar.pastPredication==='positive_statement' && meaning.features.tense==='past') {
      if(meaning.kind!=='predication') {
        unsupported(`No ${dictionary.language} state verb form supports past.`);
      }
      if(polarity!=='positive')unsupported(`Unsupported ${dictionary.language} past state polarity.`);
    }
    const subjectNoun=isDeicticReferent(subject)?null:nounByConcept(subject.concept);
    const subjectContext={subject:{person,number,
      ...(subjectNoun?.gender?{gender:subjectNoun.gender}:{}),
      ...(subjectNoun?.pluralClass?{pluralClass:subjectNoun.pluralClass}:{})}};
    const verb=stateVerbForms.find(entry=>entry.kind===meaning.kind&&
      entry.features.tense===meaning.features.tense&&entry.features.person===person&&
      entry.features.number===number&&matchesConditions(subjectContext,entry.rule.when));
    if(!verb)unsupported(`No ${dictionary.language} state verb form supports ${meaning.kind}, ${person}, ${number}.`);
    const prefix=polarity==='negative'&&negativeStrategy==='preverbal'?[stateGrammar.negator]:[];
    const surface=(role)=>{
      if(role===frame.predicateRole) {
        if(meaning.kind!=='predication') {
          unsupported(`Unsupported ${dictionary.language} state predicate subject.`);
        }
        const noun=subjectNoun;
        const context={number:isDeicticReferent(subject)
          ?subject.agreement.number:subject.features.number,case:frame.predicateCase,
          ...(subject.agreement?.gender ?? noun?.gender
            ?{gender:subject.agreement?.gender ?? noun?.gender}:{}),
          ...(noun?.pluralClass?{pluralClass:noun.pluralClass}:{}),
          ...(noun?.animacy?{animacy:noun.animacy}:{})};
        return nominal.realizeProperty(meaning.predicate,context);
      }
      const ref=meaning.roles[role];
      if(isDeicticReferent(ref)) {
        return deicticPronounSurface(ref,deicticCase(stateRoleCase(frame,role,polarity),role));
      }
      if(ref.relatives?.length)unsupported('Relative clauses in state constructions are unsupported.');
      const noun=nounByConcept(ref.concept);
      const gramCase=stateRoleCase(frame,role,polarity);
      const categoryRole=meaning.kind==='classification'&&role==='category';
      return plainNoun(ref,noun,gramCase,categoryRole?'indefinite':nounPhrase.defaultDefiniteness,
        categoryRole&&nounPhrase.allowBare);
    };
    if(polarity==='negative'&&negativeStrategy==='do-support') {
      const auxiliaries=questions?.yesNo?.auxiliaries;
      const auxiliary=person==='first'?auxiliaries?.presentFirst:
        person==='second'?auxiliaries?.presentSecond:
        number==='singular'?auxiliaries?.presentThirdSingular:auxiliaries?.presentThirdPlural;
      const base=formsAtLexeme(verb.lexeme,questions?.yesNo?.baseVerbPath||'');
      if(!auxiliary||base.length!==1)unsupported('Missing negative state do-support form.');
      const parts=frame.linearizations[0].flatMap(step=>
        step===frame.subjectRole?[surface(step)]:step==='@verb'?
          [auxiliary,stateGrammar.negator,base[0].text]:step.startsWith('@')?
            [step.slice(1)]:[surface(step)]);
      return {text:sentenceText([parts.join(' ')],sentence.terminator),warnings:[],alternatives:[]};
    }
    const baseSequence=['location','existence'].includes(meaning.kind)
      ?frame.linearizations.find(item=>item.some(step=>step.startsWith('@') &&
        frame.prepositions?.[step.slice(1)]===meaning.relation))
      :frame.linearizations[0];
    const sequence=polarity==='negative'&&negativeStrategy==='postverbal'
      ?baseSequence.flatMap(step=>step==='@verb'?['@verb','@negator']:[step]):baseSequence;
    if(!sequence)unsupported(`Unsupported ${dictionary.language} spatial relation.`);
    const parts=sequence.flatMap(step=>{
      if(step==='@verb')return [...prefix,
        polarity==='negative'&&frame.negativeVerbForms?.[number]
          ?frame.negativeVerbForms[number]:verb.text];
      if(step==='@negator')return [stateGrammar.negator];
      if(step.startsWith('@'))return [step.slice(1)];
      if(step===frame.subjectRole && frame.allowImplicitDeicticSubject &&
          isDeicticReferent(meaning.roles[step]) &&
          !isAnaphoricReferent(meaning.roles[step]))return [];
      return [surface(step)];
    });
    return {text:sentenceText([parts.join(' ')],sentence.terminator),warnings:[],alternatives:[]};
  }

  function realizePassive(meaning) {
    const paradigm=grammar.passive?.events?.[meaning.concept]?.[meaning.features.tense];
    if(!paradigm||meaning.features.polarity!=='positive' || meaning.features.aspect!=='unknown')
      unsupported(`Unsupported passive realization for ${meaning.concept}.`);
    const theme=meaning.roles.theme;
    if(!theme || theme.relatives?.length)
      unsupported('Passive realization requires a supported theme without relative clauses.');
    const noun=nounByConcept(theme.concept),parsed={value:theme,noun};
    const auxiliary=passiveCell(paradigm.auxiliary,parsed);
    const participle=passiveCell(paradigm.participle,parsed);
    if(!auxiliary||!participle)
      unsupported(`Missing passive agreement forms for ${theme.concept}.`);
    const fallback=Object.keys(nounPhrase.determiners).length?
      nounPhrase.defaultDefiniteness:undefined;
    const parts=[plainNoun(theme,noun,'nom',fallback),auxiliary,participle];
    if(meaning.roles.agent) {
      const agent=meaning.roles.agent,nounForAgent=nounByConcept(agent.concept);
      parts.push(grammar.passive.agentMarker,
        plainNoun(agent,nounForAgent,grammar.passive.agentCase,fallback));
    }
    return {text:sentenceText([parts]),warnings:[],alternatives:[]};
  }

  function realizeComparison(meaning) {
    const config=grammar.comparison;
    if(!config)unsupported(`Unsupported comparison realization in ${dictionary.language}.`);
    const subject=meaning.roles.subject,standard=meaning.roles.standard;
    const subjectNoun=nounByConcept(subject.concept),standardNoun=nounByConcept(standard.concept);
    if(!subjectNoun||!standardNoun)unsupported('Missing comparison participant lexeme.');
    const verb=stateVerbForms.find(entry=>entry.kind===config.stateKind &&
      entry.features.tense===meaning.features.tense && entry.features.person==='third' &&
      entry.features.number===subject.features.number);
    if(!verb)unsupported(`No ${dictionary.language} copula supports comparison tense/agreement.`);
    const context={number:subject.features.number,case:config.subjectCase,
      ...(subjectNoun.gender?{gender:subjectNoun.gender}:{}),
      ...(subjectNoun.pluralClass?{pluralClass:subjectNoun.pluralClass}:{}),
      ...(subjectNoun.animacy?{animacy:subjectNoun.animacy}:{})};
    const property=nominal.realizeComparative(meaning.predicate,meaning.relation,context);
    const left=plainNoun(subject,subjectNoun,config.subjectCase,nounPhrase.defaultDefiniteness);
    const right=plainNoun(standard,standardNoun,config.standardCase,nounPhrase.defaultDefiniteness);
    return {text:sentenceText([[left,verb.text,property,config.marker,right].join(' ')],sentence.terminator),
      warnings:[],alternatives:[]};
  }

  function realizeRequest(meaning) {
    const config=grammar.request,action=meaning?.payload?.action;
    if(!config||meaning?.type!=='dialogue_act'||meaning.act!=='request'||action?.type!=='event')
      unsupported(`Unsupported polite request realization in ${dictionary.language}.`);
    const candidates=verbs.filter(lexeme=>lexeme.concept===action.concept &&
      (verbGrammar.aspectSource!=='lexeme' || action.features.aspect==='unknown' ||
        lexeme.aspect===action.features.aspect))
      .flatMap(lexeme=>formsAtLexeme(lexeme,config.actionPath)
        .filter(form=>!Object.keys(form.bindings).length).map(form=>({lexeme,text:form.text})));
    if(!candidates.length || (verbGrammar.aspectSource==='lexeme' &&
        action.features.aspect==='unknown' && new Set(candidates.map(item=>item.lexeme.aspect)).size>1)) {
      unsupported('Missing or ambiguous aspect-specific request verb form.');
    }
    const selected=verbGrammar.aspectSource==='unknown'||action.features.aspect==='unknown'
      ? candidates[0] : candidates.find(item=>item.lexeme.aspect===action.features.aspect);
    const frame=frames[action.concept];
    if(!selected||!frame)unsupported(`No ${dictionary.language} request frame for ${action.concept}.`);
    const fallback=Object.keys(nounPhrase.determiners).length?nounPhrase.defaultDefiniteness:undefined;
    const words=frame.linearizations[0].flatMap(step=>{
      if(step===subjectRole)return [];
      if(step==='@verb')return [selected.text];
      if(step.startsWith('@'))return [step.slice(1)];
      return [nounSurface(step,action,frame,fallback,0)];
    });
    return {text:sentenceText([config.marker+' '+words.join(' ')],sentence.terminator),
      warnings:[],alternatives:[]};
  }


  /** Realize modality through existing frame role ordering and nominal rules. */
  function realizeModal(node, question = null) {
    const parts=modalParts(node);
    if (!parts) unsupported('Unsupported modal clause.');
    const {event,operator,mode}=parts;
    const intention=operator==='modality.intention';
    if (event.features?.tense!==(intention?'future':'present') || event.features?.polarity!=='positive')
      unsupported('Unsupported modal tense or nested event polarity.');
    const modal=modals.find(item=>item.senses[0].coreRef.id===operator);
    if (!modal || !modal.forms[mode])
      unsupported('Unsupported modal construction in this language (prohibition not available).');
    const frame=frames[event.concept];
    if (!frame)unsupported('No grammatical frame for modal event.');
    if(question?.questionType==='wh' && question.targetRole==='theme' && frame.whTheme===false)
      unsupported('Unsupported WH theme question for this verb frame.');
    const chosen=verbs.filter(v=>v.concept===event.concept &&
      (verbGrammar.aspectSource!=='lexeme' || event.features.aspect==='unknown' ||
       event.features.aspect===v.aspect))
      .map(v=>({lexeme:v,forms:formsAtLexeme(v,modality.infinitivePath)}))
      .filter(x=>x.forms.length===1 && !Object.keys(x.forms[0].bindings).length);
    if(!chosen.length || (intention && verbGrammar.aspectSource==='lexeme' &&
      event.features.aspect==='unknown' && new Set(chosen.map(x=>x.lexeme.aspect)).size>1))
      unsupported('Missing or ambiguous aspect-specific infinitive for modal event.');
    const preferred=chosen.find(x=>x.lexeme.aspect===verbGrammar.preferredAspects?.[event.concept])||chosen[0];
    const infinitive=preferred.forms[0].text;
    const syntactic={...event,features:{...event.features,
      polarity:mode==='positive'?'positive':'negative'}};
    const role=question?.questionType==='wh'?question.targetRole:null;
    const q=questions;
    if(question && (!q || !['yes_no','wh'].includes(question.questionType) ||
       (role && !['agent','theme'].includes(role))))
       unsupported('Unsupported modal question kind or target role.');
    if(question && modality.questionStrategy==='front' &&
       (mode!=='positive' && !(question.questionType==='wh'&&role==='agent')))
       unsupported('Unsupported question construction for a negated English modal.');
    const hasArticles=Object.keys(nounPhrase.determiners).length>0;
    const unknown=Object.entries(event.roles).filter(([,ref])=>
      ref.features?.definiteness==='unknown').map(([r])=>r);
    const fallback=hasArticles?nounPhrase.defaultDefiniteness:undefined;
    const alternate=hasArticles&&unknown.length?nounPhrase.alternativeDefiniteness:undefined;
    const subject=event.roles[subjectRole];
    const whAgreement=role===subjectRole?q.wh?.agent?.agreement:null;
    const person=subject?.agreement?.person ?? whAgreement?.person ?? 'third';
    const number=subject?.agreement?.number ?? subject?.features?.number ??
      whAgreement?.number;
    if (!['singular','plural'].includes(number))
      unsupported('Unsupported modal subject number.');
    const modalText=modal.forms[mode][modalAgreementKey(person,number)];
    if(!modalText)unsupported('Missing modal inflection for subject agreement.');
    const renderAt=def=>{
      const sequence=question?.questionType==='wh'&&role==='theme'&&
        modality.questionStrategy==='prefix' ? themeOrder(frame)[0] : frame.linearizations[0];
      const inverted=question && modality.questionStrategy==='front' &&
        (question.questionType==='yes_no'||role==='theme');
      const words=sequence.flatMap(step=>{
        if(step===role)return [];
        if(step==='@verb'){
          const text=role==='theme'?withoutGovernedPreposition(infinitive,frame):infinitive;
          if(!text)unsupported('Missing governed preposition in modal infinitive.');
          return [inverted?text:modalText+' '+text];
        }
        if(step.startsWith('@'))return [step.slice(1)];
        return [nounSurface(step,syntactic,frame,def,0)];
      });
      let result=words.join(' ');
      if(question){
        if(question.questionType==='yes_no')
          result=modality.questionStrategy==='prefix'
            ? q.yesNo.marker+' '+result:modalText+' '+result;
        else if(role==='agent')result=q.wh.agent.marker+' '+result;
        else {
          const gramCase=roleCase(frame,'theme',syntactic.features,null);
          const marker=q.wh.theme.caseMarkers?.[gramCase]||q.wh.theme.marker;
          result=modality.questionStrategy==='prefix'
            ? (frame.whTheme?.frontPreposition ? frame.whTheme.frontPreposition+' ' : '')+
              marker+' '+result
            : marker+' '+modalText+' '+result;
        }
      }
      return sentenceText([result],question?'?':'.');
    };
    const text=renderAt(fallback), alternative=alternate?renderAt(alternate):null;
    const warnings=[];
    if(hasArticles&&unknown.length)
      warnings.push(formatMessage(grammar.messages?.definitenessUnknown||
        'Source definiteness unknown for {roles}; displayed with a default article.',
        {roles:unknown.join(', ')}));
    if(verbGrammar.aspectSource==='unknown'&&event.features.aspect!=='unknown')
      warnings.push('Target '+grammar.language+' does not encode source aspect '+event.features.aspect+' in modal construction.');
    return {text,warnings,alternatives:alternative&&alternative!==text?[alternative]:[]};
  }

  function realize(meaning, {subjectPronoun=null,lexicalRegister='neutral',informationStructure,
    semanticTransfer,includeSegments=false,sourceSegments=[],omitDeicticSubject=false} = {}) {
    if(!['neutral','formal','plain'].includes(lexicalRegister))
      unsupported('Unsupported lexical register.');
    if(subjectPronoun && (meaning?.type!=='event' ||
        subjectPronoun!==subjectPronounFor(meaning.roles?.[subjectRole]))) {
      unsupported('Unsupported subject pronoun realization.');
    }
    if(meaning?.type==='question')return realizeQuestion(meaning,{semanticTransfer});
    if(meaning?.type==='comparison')return realizeComparison(meaning);
    if(meaning?.type==='state')return realizeState(meaning);
    if(meaning?.voice==='passive')return realizePassive(meaning);
    if(modalParts(meaning))return realizeModal(meaning);
    let sequence;
    if(informationStructure!==undefined) {
      const {focus}=createInformationStructure(meaning,informationStructure);
      sequence=frames[meaning.concept]?.linearizations.find(item=>item.at(-1)===focus);
      if(!sequence)unsupported(`No ${dictionary.language} information-structure variant for ${focus}.`);
    }
    const agreementControllers = agreementContextForTransfer(meaning, semanticTransfer);
    if(typeof includeSegments!=='boolean'||!Array.isArray(sourceSegments)||sourceSegments.length>64||
        typeof omitDeicticSubject!=='boolean')
      unsupported('Invalid segment request.');
    const built = renderEvent(meaning, undefined, 0, null,
      {subjectPronoun,lexicalRegister,sequence,agreementControllers,omitDeicticSubject});
    const { candidates, preferred, linearize } = built;
    const unspecifiedRoles = Object.entries(meaning.roles)
      .filter(([role,ref]) => !(subjectPronoun && role === subjectRole) &&
        ref.features?.definiteness === 'unknown').map(([role]) => role);
    const withDeterminers = Object.keys(nounPhrase.determiners).length > 0;
    const fallback = withDeterminers ? nounPhrase.defaultDefiniteness : undefined;
    const otherFallback = withDeterminers && unspecifiedRoles.length
      ? nounPhrase.alternativeDefiniteness : undefined;
    if (withDeterminers && unspecifiedRoles.length && !fallback) {
      throw new Error('No default definiteness policy for underspecified source.');
    }
    const renderCache=new Map();
    const renderDetail=(entry,def,lexicalOverrides={})=>{
      const key=JSON.stringify([entry.lexeme.id,entry.rule.path,def,lexicalOverrides]);
      if(renderCache.has(key))return renderCache.get(key);
      const renderer=Object.keys(lexicalOverrides).length?
        renderEvent(meaning,undefined,0,null,{subjectPronoun,lexicalRegister,sequence,
          agreementControllers,lexicalOverrides,omitDeicticSubject}):built;
      const parts=renderer.linearizeParts(entry,def,lexicalOverrides);
      const text=sentenceText([parts.map(part=>part.text)],sentence.terminator,grammar.language);
      if(!includeSegments){const result={text};renderCache.set(key,result);return result;}
      const sources=new Map(sourceSegments.map(item=>[item.path,item]));
      let cursor=0,first=true;
      const segments=[];
      for(const part of parts){
        const normalized=part.text.normalize('NFC').replace(/\s+/gu,' ')
          .replace(/\s+,/gu,',').trim();
        if(!normalized)continue;
        let displayed=normalized;
        if(first){const chars=Array.from(displayed);
          displayed=(chars[0]?.toLocaleUpperCase(grammar.language)||'')+chars.slice(1).join('');
          first=false;
        }
        const start=text.indexOf(displayed,cursor);
        const end=start<0?-1:start+displayed.length;
        const sourceLinks=(part.meaningPaths||[]).map(path=>{
          const source=sources.get(path);
          return source?.span?{meaningPath:path,status:'aligned',span:source.span}:
            {meaningPath:path,status:'unavailable',reason:source?.reason||'source-span-unavailable'};
        });
        segments.push({text:displayed,
          targetSpan:start<0?null:{start,end},meaningPaths:part.meaningPaths||[],
          sources:sourceLinks,decision:part.decision});
        if(end>=0)cursor=end;
      }
      renderCache.set(key,{text,segments});
      return {text,segments};
    };
    const render = (entry,def)=>renderDetail(entry,def).text;
    const text = render(preferred, fallback);
    const alternatives = [];
    const seen = new Set([text]);
    const realizationRows=[];
    const realizationSeen=new Set();
    const addRealization=(entry,def,lexicalOverrides={},informationLoss=[])=>{
      const rendered=renderDetail(entry,def,lexicalOverrides);
      if(realizationSeen.has(rendered.text))return;
      realizationSeen.add(rendered.text);
      realizationRows.push({text:rendered.text,
        kind:informationLoss.length?'additional_assumption':'equivalent_expression',
        assumptions:informationLoss.map(item=>({path:item.path,feature:item.feature,
          reason:item.cause})),informationLoss,...(includeSegments?{segments:rendered.segments}:{})});
    };
    if(includeSegments)addRealization(preferred,fallback);
    const ordered = [preferred, ...candidates.filter(v => v !== preferred)];
    for (const choice of ordered) {
      for (const def of [fallback, otherFallback]) {
        if (def === undefined && def !== fallback) continue;
        const variant = render(choice, def);
        if(includeSegments)addRealization(choice,def);
        if (!seen.has(variant)) { seen.add(variant); alternatives.push(variant); }
        if (alternatives.length >= 7) break;
      }
      if (alternatives.length >= 7) break;
    }
    if(includeSegments){
      for(const [role,ref] of Object.entries(meaning.roles)){
        if(isDeicticReferent(ref))continue;
        const preferredNoun=nounByConcept(ref.concept,lexicalRegister);
        for(const noun of nounIndex.get(ref.concept)||[]){
          if(noun.id===preferredNoun.id||!noun.realizationProfile)continue;
          const losses=noun.realizationProfile.assumptions.map(item=>({
            path:`#/roles/${role.replace(/~/gu,'~0').replace(/\//gu,'~1')}/features/${item.feature}`,
            feature:item.feature,cause:item.reason,status:'ambiguous'}));
          addRealization(preferred,fallback,{[role]:noun.id},losses);
          if(realizationRows.length>=32)break;
        }
        if(realizationRows.length>=32)break;
      }
    }
    const warnings = [];
    if(lexicalRegister!=='neutral')for(const ref of Object.values(meaning.roles)) {
      const options=nounIndex.get(ref?.concept)||[];
      if(options.some(noun=>noun.register) &&
          !options.some(noun=>noun.register===lexicalRegister))
        warnings.push(`No ${lexicalRegister} lexical variant for ${ref.concept} in ${dictionary.language}; preferred wording was kept.`);
    }
    if (!withDeterminers && Object.entries(frames[meaning.concept]?.cases || {}).some(([role, cases]) =>
        record(cases) && meaning.roles[role]?.features?.definiteness === 'unknown')) {
      warnings.push(grammar.messages?.definitenessUnknown ||
        'Unspecified definiteness requires a target-language case choice.');
    }
    if (withDeterminers && unspecifiedRoles.length) {
      warnings.push(formatMessage(grammar.messages?.definitenessUnknown ||
        'Source definiteness unknown for {roles}; displayed with a default article.',
      { roles: unspecifiedRoles.join(', ') }));
    }
    if (candidates.some(v => v.lexeme.aspect !== preferred.lexeme.aspect) &&
        meaning.features.aspect === 'unknown') {
      warnings.push(grammar.messages?.aspectUnknown ||
        'Source does not specify aspect; target aspect was selected by default.');
    }
    return { text, warnings, alternatives,
      ...(includeSegments?{realizations:realizationRows}: {}) };
  }


  /** Reuse existing inflection and nominal rules; interrogative strategies
   * remain in each language's declarative grammar configuration. */
  function realizeQuestion(question, {semanticTransfer} = {}) {
    if(!questions)unsupported('Unsupported question construction in this language.');
    const q=questions,clause=question.proposition;
    const propositionTransfer=semanticTransfer?.kind==='question'
      ? semanticTransfer.propositionTransfer : undefined;
    if(modalParts(clause))return realizeModal(clause,question);
    if(clause?.type==='state')return realizeStateQuestion(clause,question);
    if(clause?.type!=='event') {
      unsupported('Unsupported question construction: only single-event propositions can be realized.');
    }
    const hasArticles=Object.keys(nounPhrase.determiners).length>0;
    const fallback=hasArticles?nounPhrase.defaultDefiniteness:undefined;
    const unspecified=Object.entries(clause.roles).filter(([,ref])=>
      ref.features?.definiteness==='unknown').map(([role])=>role);
    if(hasArticles&&unspecified.length&&!fallback){
      throw new Error('Missing definiteness display policy for question.');
    }
    const alternate=hasArticles&&unspecified.length?nounPhrase.alternativeDefiniteness:undefined;
    const wrap=value=>sentenceText([value],'?');
    const withoutPeriod=value=>value.replace(/\.\s*$/u,'');
    const lowerFirst=value=>{
      const characters=Array.from(value);
      return characters.length
        ? characters[0].toLocaleLowerCase(grammar.language)+characters.slice(1).join('')
        : value;
    };
    if(question.questionType==='wh' && question.targetRole==='destination') {
      const frame=frames[clause.concept];
      const sequence=frame?.linearizations.find(item=>item.includes('destination'));
      if(!sequence || clause.features.polarity!=='positive' ||
         !['present','past'].includes(clause.features.tense)) {
        unsupported('Unsupported destination WH question for this event.');
      }
      let linearization=sequence.filter(step=>step!==`@${q.wh.destination.preposition}`);
      if(q.wh.destination.order==='verb_first') {
        linearization=['@verb',...linearization.filter(step=>step!=='@verb')];
      }
      const relative={gap:'destination',antecedent:{value:{features:{number:'singular'}},
        noun:{id:'question_gap'},senseId:null}};
      const built=renderEvent(clause,fallback,0,relative,{sequence:linearization,returnBuilder:true});
      let text;
      if(q.yesNo.mode==='auxiliary') {
        const subject=clause.roles[subjectRole];
        const person=subject?.agreement?.person||'third';
        const number=subject?.agreement?.number||subject?.features?.number;
        const auxiliaries=q.yesNo.auxiliaries;
        const auxiliary=clause.features.tense==='past'?auxiliaries.past:
          person==='first'?auxiliaries.presentFirst:
          person==='second'?auxiliaries.presentSecond:
          number==='singular'?auxiliaries.presentThirdSingular:auxiliaries.presentThirdPlural;
        const base=formsAtLexeme(built.preferred.lexeme,q.yesNo.baseVerbPath);
        if(!auxiliary || base.length!==1)unsupported('Missing destination WH auxiliary or verb form.');
        const entry={...built.preferred,text:base[0].text,rule:{...built.preferred.rule,prefix:[]}};
        text=`${q.wh.destination.marker} ${auxiliary} ${built.linearize(entry,fallback)}`;
      } else {
        text=`${q.wh.destination.marker} ${built.linearize(built.preferred,fallback)}`;
      }
      return {text:wrap(text),warnings:[],alternatives:[]};
    }
    if(question.questionType==='yes_no'&&q.yesNo.mode==='prefix'){
      const rendered=realize(clause,{semanticTransfer:propositionTransfer});
      const prefix=text=>wrap(q.yesNo.marker+' '+lowerFirst(withoutPeriod(text)));
      return {...rendered,text:prefix(rendered.text),
        alternatives:rendered.alternatives.map(prefix)};
    }
    const frame=frames[clause.concept];
    if(!frame)unsupported('Unsupported question event frame.');
    if(question.questionType==='wh' && question.targetRole==='theme' && frame.whTheme===false)
      unsupported('Unsupported WH theme question for this verb frame.');
    const syntaxGap=question.questionType==='wh' && question.targetRole==='agent'
      ? gapSyntax() : {value:{features:{number:'singular'}},
        noun:{id:'question_gap'},senseId:null};
    const relative=question.questionType==='wh'
      ? {gap:question.targetRole,antecedent:syntaxGap} : null;
    const options=question.questionType==='wh'&&question.targetRole==='theme'&&
      q.wh.theme.order==='verb_first'
      ? {sequence:themeOrder(frame)[0],returnBuilder:true}
      : {returnBuilder:true};
    const agreementControllers=agreementContextForTransfer(clause,propositionTransfer);
    const built=renderEvent(clause,undefined,0,relative,{...options,agreementControllers});
    const whEntry=question.questionType==='wh'&&question.targetRole==='theme' &&
      frame.whTheme?.frontPreposition
      ? {...built.preferred,text:withoutGovernedPreposition(built.preferred.text,frame)}
      : built.preferred;
    if(!whEntry.text)unsupported('Missing governed preposition in WH verb form.');
    const auxiliary=()=>{
      const values=q.yesNo.auxiliaries;
      if(clause.features.tense==='past')return values.past;
      if(clause.features.tense!=='present')unsupported('Unsupported question tense.');
      const subject=built.roles[subjectRole]?.value;
      const person=subject?.agreement?.person || 'third';
      const number=subject?.agreement?.number ?? subject?.features?.number;
      if(person==='first')return values.presentFirst;
      if(person==='second')return values.presentSecond;
      if(person==='third'&&number==='singular')return values.presentThirdSingular;
      if(person==='third'&&number==='plural')return values.presentThirdPlural;
      unsupported('Unsupported question subject agreement.');
    };
    const auxiliaryEntry=()=>{
      const base=formsAtLexeme(built.preferred.lexeme,q.yesNo.baseVerbPath);
      if(base.length!==1)unsupported('Missing unambiguous base verb form for question.');
      return {...built.preferred,text:base[0].text,rule:{
        ...built.preferred.rule,
        prefix:clause.features.polarity==='negative'?[q.yesNo.negator]:[]
      }};
    };
    const renderAt=def=>{
      if(question.questionType==='yes_no') {
        if(built.preferred.rule.tense==='present'&&
           built.preferred.rule.aspect==='imperfective'&&
           built.preferred.rule.path==='forms.progressive') {
          const prefix=built.preferred.rule.prefix;
          const fronted=prefix?.[0];
          if(!fronted)unsupported('Missing progressive auxiliary for question.');
          const entry={...built.preferred,rule:{...built.preferred.rule,prefix:prefix.slice(1)}};
          return wrap(fronted+' '+built.linearize(entry,def));
        }
        return wrap(auxiliary()+' '+built.linearize(auxiliaryEntry(),def));
      }
      if(question.questionType!=='wh')unsupported('Unsupported question kind.');
      if(question.targetRole==='agent') {
        return wrap(q.wh.agent.marker+' '+built.linearize(built.preferred,def));
      }
      if(question.targetRole==='theme') {
        const gramCase=roleCase(frame,'theme',clause.features,null);
        const marker=q.wh.theme.caseMarkers?.[gramCase]||q.wh.theme.marker;
        const content=q.wh.theme.order==='auxiliary'
          ? auxiliary()+' '+built.linearize(auxiliaryEntry(),def)
          : built.linearize(whEntry,def);
        const governed=frame.whTheme?.frontPreposition
          ? frame.whTheme.frontPreposition+' ':'';
        return wrap(governed+marker+' '+content);
      }
      unsupported('Unsupported WH target role.');
    };
    const text=renderAt(fallback);
    const alternative=alternate?renderAt(alternate):null;
    const warnings=[];
    if(hasArticles&&unspecified.length) {
      warnings.push(formatMessage(grammar.messages?.definitenessUnknown||
        'Source definiteness unknown for {roles}; displayed with a default article.',
        {roles:unspecified.join(', ')}));
    }
    if(built.candidates.some(entry=>entry.lexeme.aspect!==built.preferred.lexeme.aspect)&&
       clause.features.aspect==='unknown') {
      warnings.push(grammar.messages?.aspectUnknown||
        'Source does not specify aspect; target aspect was selected by default.');
    }
    return {text,warnings,alternatives:alternative&&alternative!==text?[alternative]:[]};
  }

  function realizeStateQuestion(clause,question) {
    if(question.questionType==='wh' && question.targetRole==='location' &&
       clause.kind==='location' && clause.features?.tense==='present' &&
       clause.features?.polarity==='positive') {
      const frame=stateGrammar.frames.location;
      const subject=clause.roles[frame.subjectRole];
      const person=isDeicticReferent(subject)?subject.agreement.person:'third';
      const number=isDeicticReferent(subject)?subject.agreement.number:subject.features.number;
      const verb=stateVerbForms.find(entry=>entry.kind==='location' &&
        entry.features.tense==='present' && entry.features.person===person &&
        entry.features.number===number);
      if(!verb)unsupported('Missing location WH copula form.');
      const rendered=isDeicticReferent(subject)?deicticPronounSurface(subject,
        stateRoleCase(frame,'subject','positive')):
        plainNoun(subject,nounByConcept(subject.concept),stateRoleCase(frame,'subject','positive'),
          nounPhrase.defaultDefiniteness);
      return {text:sentenceText([`${questions.wh.location.marker} ${verb.text} ${rendered}`],'?'),
        warnings:[],alternatives:[]};
    }
    if(question.questionType==='yes_no'&&questions.yesNo.mode==='prefix') {
      if(stateGrammar.pastPredication==='positive_statement' &&
          clause.features?.tense==='past') {
        unsupported(`Unsupported ${dictionary.language} past state question.`);
      }
      const rendered=realize(clause);
      const lower=rendered.text.charAt(0).toLocaleLowerCase(grammar.language)+rendered.text.slice(1);
      const text=sentenceText([questions.yesNo.marker+' '+lower.replace(/[.]$/u,'')],'?');
      return {...rendered,text,alternatives:rendered.alternatives.map(item=>
        sentenceText([questions.yesNo.marker+' '+item.charAt(0).toLocaleLowerCase(grammar.language)+
          item.slice(1).replace(/[.]$/u,'')],'?'))};
    }
    if(question.questionType==='yes_no'&&questions.yesNo.mode==='auxiliary'&&
       ['predication','classification','existence'].includes(clause.kind)&&clause.features?.tense==='present'&&
       clause.features?.polarity==='positive'&&stateGrammar.supportedTenses.includes('present')) {
      const frame=stateGrammar.frames[clause.kind];
      const subject=clause.roles[frame.subjectRole];
      const person=isDeicticReferent(subject)?subject.agreement.person:'third';
      const number=isDeicticReferent(subject)?subject.agreement.number:subject.features.number;
      const verb=stateVerbForms.find(entry=>entry.kind===clause.kind&&
        entry.features.tense==='present'&&entry.features.person===person&&entry.features.number===number);
      if(!verb)unsupported('Missing state question copula form.');
      const surface=role=>{
        if(role===frame.predicateRole) {
          const noun=isDeicticReferent(subject)?null:nounByConcept(subject.concept);
          const context={number:isDeicticReferent(subject)?subject.agreement.number:subject.features.number,
            case:frame.predicateCase,
            ...(subject.agreement?.gender ?? noun?.gender
              ?{gender:subject.agreement?.gender ?? noun?.gender}:{}),
            ...(noun?.pluralClass?{pluralClass:noun.pluralClass}:{}),
            ...(noun?.animacy?{animacy:noun.animacy}:{})};
          return nominal.realizeProperty(clause.predicate,context);
        }
        if(role===frame.subjectRole&&isDeicticReferent(subject))return deicticPronounSurface(subject,
          stateRoleCase(frame,role,clause.features.polarity));
        const ref=clause.roles[role];
        return plainNoun(ref,nounByConcept(ref.concept),stateRoleCase(frame,role,clause.features.polarity),
          nounPhrase.defaultDefiniteness);
      };
      const questionSequence=['location','existence'].includes(clause.kind)
        ?frame.linearizations.find(item=>item.some(step=>step.startsWith('@') &&
          frame.prepositions?.[step.slice(1)]===clause.relation))
        :frame.linearizations[0];
      if(!questionSequence)unsupported(`Unsupported ${dictionary.language} spatial relation.`);
      const remainder=questionSequence.filter(step=>step!=='@verb')
        .flatMap(step=>step.startsWith('@')?[step.slice(1)]:[surface(step)]);
      return {text:sentenceText([[verb.text,...remainder].join(' ')],'?'),
        warnings:[],alternatives:[]};
    }
    if(question.questionType!=='yes_no' || questions.yesNo.mode!=='auxiliary' ||
       clause.kind!=='possession' || !['present','past'].includes(clause.features?.tense) ||
       clause.features?.polarity!=='positive' ||
       !stateGrammar.supportedTenses.includes(clause.features.tense) ||
       !(stateGrammar.supportedPolarities || ['positive','negative']).includes(clause.features.polarity)) {
      unsupported('Unsupported state question construction in this language.');
    }
    const frame=stateGrammar.frames.possession;
    const owner=clause.roles[frame.subjectRole];
    const person=isDeicticReferent(owner)?owner.agreement.person:'third';
    const number=isDeicticReferent(owner)?owner.agreement.number:owner.features.number;
    const auxiliaries=questions.yesNo.auxiliaries;
    const auxiliary=clause.features.tense==='past'?auxiliaries.past:
      person==='first'?auxiliaries.presentFirst:
      person==='second'?auxiliaries.presentSecond:
      person==='third'&&number==='singular'?auxiliaries.presentThirdSingular:
      person==='third'&&number==='plural'?auxiliaries.presentThirdPlural:null;
    if(!auxiliary)unsupported('Unsupported state question subject agreement.');
    const verb=stateVerbForms.find(entry=>entry.kind==='possession'&&
      entry.features.tense===clause.features.tense&&entry.features.person===person&&
      entry.features.number===number);
    const base=verb&&formsAtLexeme(verb.lexeme,questions.yesNo.baseVerbPath);
    if(!base || base.length!==1)unsupported('Missing unambiguous state verb base form for question.');
    const surface=role=>{
      const ref=clause.roles[role];
      if(isDeicticReferent(ref)) {
        return deicticPronounSurface(ref,stateRoleCase(frame,role,clause.features.polarity));
      }
      if(ref.relatives?.length)unsupported('Relative clauses in state questions are unsupported.');
      return plainNoun(ref,nounByConcept(ref.concept),stateRoleCase(frame,role,clause.features.polarity),
        nounPhrase.defaultDefiniteness);
    };
    const text=sentenceText([`${auxiliary} ${surface(frame.subjectRole)} ${base[0].text} ${surface('owned')}`],'?');
    return {text,warnings:[],alternatives:[]};
  }

  function validateOntology(ontology, featureRegistry, coreLanguage) {
    const concepts = ontology?.concepts;
    const scopedRegistry=featureProfile?createFeatureRegistry(featureRegistry,featureProfile):featureRegistry;
    const domains = scopedRegistry?.domains;
    const syntactic = scopedRegistry?.featureProfile?.syntactic ?? domains?.syntactic;
    const grammaticalNumbers=featureProfile?.morphology?.number||domains?.participant?.number||[];
    if (!record(concepts) || !domains) throw new Error('Missing ontology or feature registry.');
    const validateSyntacticCase=(grammaticalCase,message)=>{
      if(!Array.isArray(syntactic.case)) {
        if(grammaticalCase===null||grammaticalCase===undefined)return;
        throw new Error('Absent feature category: syntactic.case');
      }
      if(!syntactic.case.includes(grammaticalCase)) throw new Error(message);
    };
    for (const noun of nouns) {
      if (own(concepts, noun.concept)?.type !== 'entity') {
        throw new Error(`Unknown entity concept in ${grammar.language} lexicon: ${noun.concept}`);
      }
      for (const [name, dimension] of Object.entries({ gender: domains.lexical.gender,
        pluralClass: domains.lexical.pluralClass, animacy: domains.lexical.animacy })) {
        if (noun[name] !== undefined && !dimension.includes(noun[name])) {
          throw new Error(`Invalid lexical ${name} for ${noun.lemma}`);
        }
      }
    }
    nominal.validateOntology(ontology, scopedRegistry);
    for(const classifier of nounPhrase.quantity?.classifiers||[])for(const concept of classifier.concepts) {
      if(ontology.get(concept)?.type!=='entity'||!nouns.some(noun=>noun.concept===concept)) {
        throw new Error(`Classifier ${classifier.id} is not licensed for a known noun concept: ${concept}`);
      }
    }
    for (const marker of relativeGrammar.markers) {
      for (const [name,value] of Object.entries(marker.when || {})) {
        const domain = name === 'number' ? grammaticalNumbers : domains.lexical[name];
        if (!domain?.includes(value)) throw new Error(`Invalid relative marker feature: ${name}=${value}`);
      }
    }
    if(questions){
      const agr=questions.wh.agent.agreement;
      if(!domains.participant.number.includes(agr.number) ||
         !domains.lexical.gender.includes(agr.gender) ||
         !domains.lexical.pluralClass.includes(agr.pluralClass)) {
        throw new Error('Unsupported WH subject-gap agreement feature.');
      }
      for(const caseName of Object.keys(questions.wh.theme.caseMarkers||{})){
        validateSyntacticCase(caseName,'Unknown grammatical WH marker case.');
      }
    }
    for (const [number, maps] of Object.entries(nounPhrase.determiners)) {
      if (!domains.participant.number.includes(number)) {
        throw new Error(`Unknown determiner number: ${number}`);
      }
      for (const def of Object.keys(maps)) {
        if (!domains.participant.definiteness.includes(def) || def === 'unknown') {
          throw new Error(`Unknown determiner definiteness: ${def}`);
        }
      }
    }
    for (const property of ['defaultDefiniteness', 'alternativeDefiniteness']) {
      if (nounPhrase[property] !== undefined &&
          !domains.participant.definiteness.includes(nounPhrase[property])) {
        throw new Error(`Unknown definiteness policy: ${nounPhrase[property]}`);
      }
    }
    for (const rule of verbGrammar.rules) {
      if (!domains.event.tense.includes(rule.tense) ||
          !domains.event.polarity.includes(rule.polarity)) {
        throw new Error(`Unknown tense/polarity combination: ${rule.tense}/${rule.polarity}`);
      }
    }
    for (const [binding, source] of Object.entries(verbGrammar.agreement)) {
      const [root, name] = featureSource(source);
      const available = root === 'event' ? domains.event[name] :
        (name==='person' ? Object.values(GRAMMATICAL_PERSON) :
          name==='number'?grammaticalNumbers:domains.participant[name] || domains.lexical[name]);
      if (!available) throw new Error(`Unknown agreement source for ${binding}: ${source}`);
    }
    for (const rule of verbGrammar.rules) {
      for (const [source, value] of Object.entries(rule.when || {})) {
        const [root, name] = featureSource(source);
        const allowed = root === 'event' ? domains.event[name] :
          (name==='person' ? Object.values(GRAMMATICAL_PERSON) :
            name==='number'?grammaticalNumbers:domains.participant[name] || domains.lexical[name]);
        if (!allowed?.includes(value)) throw new Error(`Unknown conditional feature: ${source}=${value}`);
      }
    }
    for (const alt of grammar.cases?.alternations || []) {
      for (const [source, value] of Object.entries(alt.when)) {
        const [, name] = featureSource(source);
        if (!domains.event[name]?.includes(value)) throw new Error(`Unknown case condition: ${source}`);
      }
    }
    for (const attitude of matrixLexemes) {
      if (ontology.get(attitude.concept)?.complement !== true) {
        throw new Error(`Missing complement semantic frame: ${attitude.concept}`);
      }
    }
    for (const verb of verbs) {
      const semanticFrame = own(concepts, verb.concept);
      if (semanticFrame?.type !== 'event' || !Array.isArray(semanticFrame.roles)) {
        throw new Error(`Unknown event concept in ${grammar.language} lexicon: ${verb.concept}`);
      }
      const frame = own(frames, verb.concept);
      if (!frame) throw new Error(`Missing grammatical frame for ${verb.concept}`);
      if (!semanticFrame.roles.includes(subjectRole)) {
        throw new Error('Subject semantic role missing from frame.');
      }
      if(frame.implicitSubject && frame.linearizations.some(sequence=>!sequence.includes(subjectRole))) {
        throw new Error(`Implicit subject policy requires an explicit subject slot in every ${verb.concept} linearization.`);
      }
      for(const [binding,source] of Object.entries(frame.agreement||{})){
        const [root,name]=featureSource(source,featureProfile,[...semanticFrame.roles,'object','possessor']);
        const controllerExists=root==='event'||root==='subject'||root==='possessor'||
          root==='object'&&(semanticFrame.roles.includes('object')||semanticFrame.roles.includes('theme'))||
          semanticFrame.roles.includes(root);
        if(!controllerExists)throw new Error(`Unknown agreement controller for ${verb.concept}: ${source}`);
        const available=root==='event'?domains.event[name]:name==='person'?Object.values(GRAMMATICAL_PERSON):
          name==='case'?syntactic.case:
            name==='number'?grammaticalNumbers:domains.participant[name]||domains.lexical[name];
        if(!available)throw new Error(`Unknown agreement feature for ${verb.concept}.${binding}: ${source}`);
      }
      if (frame.bareRoles && frame.bareRoles.some(role=>!semanticFrame.roles.includes(role))) {
        throw new Error(`Unknown bare noun role for ${verb.concept}`);
      }
      for (const [role, ids] of Object.entries(frame.bareRoleConcepts || {})) {
        const allowedConcepts=frame.capabilities?.themeConcepts;
        if (!frame.bareRoles?.includes(role) || !semanticFrame.roles.includes(role) ||
            !Array.isArray(allowedConcepts) || ids.some(id=>
              !ontology.get(id) || !ontology.isA(id,semanticFrame.roleTypes?.[role]) ||
              !allowedConcepts.includes(id))) {
          throw new Error(`Invalid bare role concept for ${verb.concept}.${role}`);
        }
      }
      for (const sequence of frame.linearizations) {
        const roles = sequence.filter(step => !step.startsWith('@'));
        const roleCounts=new Map(roles.map(role=>[role,roles.filter(value=>value===role).length]));
        const optionalRoles=new Set(semanticFrame.optionalRoles||[]);
        const requiredRoles=semanticFrame.roles.filter(role=>!optionalRoles.has(role));
        if (sequence.filter(step => step === '@verb').length !== 1 ||
            roles.some(role => !semanticFrame.roles.includes(role)) ||
            [...roleCounts.values()].some(count=>count!==1) ||
            requiredRoles.some(role=>roleCounts.get(role)!==1) ||
            (sequence.includes('@expletive')&&roles.includes(subjectRole))) {
          throw new Error(`Linearization roles do not match ontology for ${verb.concept}`);
        }
      }
      if (nounPhrase.path.includes('{case}') && semanticFrame.roles.some(role =>
        !['string','object'].includes(typeof (frame.cases?.[role] || (role === subjectRole && nounPhrase.subjectCase))))) {
        throw new Error(`Missing case mapping for ${verb.concept}`);
      }
      for (const grammaticalCase of Object.values(frame.cases || {}).flatMap(value =>
        record(value) ? Object.values(value) : [value])) {
        validateSyntacticCase(grammaticalCase,`Unknown syntactic case: ${grammaticalCase}`);
      }
    }
    for(const frame of Object.values(stateGrammar?.frames || {})) {
      const cases=[...Object.values(frame.cases || {}).flatMap(value=>
        record(value)?Object.values(value):[value]),
      ...(frame.predicateRole?[frame.predicateCase]:[])];
      for(const grammaticalCase of cases) {
        validateSyntacticCase(grammaticalCase,`Unknown state grammatical case: ${grammaticalCase}`);
      }
    }
    // Covers nouns, verbs, modifiers, quantifiers, matrix predicates AND
    // function words, including entries the restricted parser does not use yet.
    if (coreLanguage) lexicon.validateCore(coreLanguage);
  }

  return {
    code: grammar.language,
    ...(featureProfile?{featureProfile}:{}),
    textProfile, informationLoss,
    analyze, analyzeCandidates, realize, realizeState, realizeComparison, realizeRequest, realizeModal, validateOntology, lexicon,
    analyzeQuestionCandidates:questions?analyzeQuestionCandidates:undefined,
    realizeQuestion:questions?realizeQuestion:undefined,
    parseComplementHeads, realizeComplement,
    readSubjectPronoun, readDeicticPronoun, expandSubjectPronoun, subjectPronounFor, subjectRole,
    connective: conjunction.and, wideNegation: conjunction.wideNegation,
    conditional:grammar.conditional,
    styleReply:(output,style)=>{
      const suffix=grammar.replyStyles?.[style];
      if(!suffix || !output.text?.endsWith('.'))return {...output,
        warnings:[...(output.warnings||[]),
          `Reply style ${style} is unavailable in ${grammar.language}; standard wording was kept.`]};
      if(suffix==='.')return output;
      return {...output,text:output.text.slice(0,-1)+suffix,
        alternatives:(output.alternatives||[]).map(value=>
          value.endsWith('.')?value.slice(0,-1)+suffix:value)};
    },
    describe: () => ({ language: grammar.language, grammarVersion: grammar.version,
      ...(featureProfile?{featureProfile}:{}),
      textProfile,
      nouns: dictionary.nouns.length, verbs: dictionary.verbs.length, ...nominal.describe(),
      nounSenses: nouns.length, verbSenses: verbs.length, frames: Object.keys(frames).length,
      support: { relativeClauses: relativeGrammar.maxDepth > 0,
        propositionalComplements: matrixLexemes.length > 0, wideScopeNegation: !!conjunction.wideNegation,
        aspectEncoding: verbGrammar.aspectSource === 'lexeme',
        questions:!!questions,
        states:stateVerbForms.length>0,
        anaphora:subjectPronouns.length>0,
        modality:modals.length>0,
        quantifiers: dictionary.quantifiers?.length > 0 } })
  };
}
