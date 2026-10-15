import { createEvent, createQuestion, createRelativeClause, createModality, createNegation,
  createIdentity, createPredication, createPossession, MAX_RELATIVE_DEPTH } from './interlingua.js';
import { createLexicon } from './lexicon.js';
import { materializeInflections } from './morphology/engine.js';
import { createNominalInterpreter } from './nominals.js';
import { matchesTokens, sentenceText, tokenize } from './text.js';
import {EngineError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';
import {
  record, hasOwn, safeName, unifyFeatures, featureSource, GRAMMATICAL_PERSON,
  matchesAgreement, matchesConditions
} from './features.js';

/**
 * Shared grammar interpreter v0.6 (compositional clauses and qualified noun phrases).
 * JSON defines linearizations, case selection, conditional inflection and agreement.
 * A linearization contains each semantic role exactly once plus an @verb slot;
 * it is not restricted to an S-V-O structure or complements after the verb.
 */
const GRAMMAR_VERSIONS = new Set(['0.6', '1.0']);
const MAX_ANALYSES = RESOURCE_LIMITS.grammarAnalyses;
const MAX_SEARCH_NODES = RESOURCE_LIMITS.grammarSearchNodes;
const searchBudget = counter => ({counter,memo:new Map()});
const LEXEME_ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/u;
const PLACEHOLDER = /^\{([a-zA-Z][a-zA-Z0-9_]*)\}$/u;
const LITERAL = /^@[\p{L}]+$/u;
const DEICTIC_FUNCTION = 'grammar.deictic_pronoun';
const STATE_ROLES = Object.freeze({
  identity: Object.freeze(['subject','complement']),
  predication: Object.freeze(['subject']),
  possession: Object.freeze(['owner','owned'])
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
  {path:'forms.past.thirdPlural',tense:'past',person:'third',number:'plural'}
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

function own(obj, key) {
  return hasOwn(obj, key) ? obj[key] : undefined;
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

function formsAt(lexeme, path) {
  const parts = pathParts(path);
  const result = [];
  function visit(value, index, bindings) {
    if (index === parts.length) {
      if (typeof value === 'string' && value.trim()) result.push({ text: value, bindings });
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
  return result;
}

function validateConditions(when) {
  if (!record(when)) throw new Error('Invalid grammar condition: expected an object.');
  for (const [source, value] of Object.entries(when)) {
    featureSource(source);
    if (!safeName(value)) throw new Error(`Invalid grammar condition value: ${source}`);
  }
}

function validateGrammar(dictionary, grammar) {
  if (!record(dictionary) || !record(grammar) || dictionary.language !== grammar.language ||
      !GRAMMAR_VERSIONS.has(grammar.version) || dictionary.version !== grammar.version) {
    throw new Error('Dictionary/grammar mismatch or unsupported grammar version.');
  }
  if (!safeName(dictionary.language) || !Array.isArray(dictionary.nouns) ||
      !Array.isArray(dictionary.verbs) || !record(grammar.frames) ||
      !record(grammar.nounPhrase) || !record(grammar.verb) || !record(grammar.sentence)) {
    throw new Error('Incomplete declarative grammar or lexicon.');
  }
  if (!safeName(grammar.sentence.subjectRole) ||
      grammar.sentence.terminator !== '.') {
    throw new Error('Invalid sentence configuration.');
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

  const anaphora=grammar.anaphora;
  if(anaphora!==undefined){
    if(!record(anaphora) || Object.keys(anaphora).length!==1 ||
        !Array.isArray(anaphora.subjectPronouns) ||
        anaphora.subjectPronouns.length<1 || anaphora.subjectPronouns.length>8){
      throw new Error('Invalid anaphora grammar inventory.');
    }
    const seen=new Set();
    for(const entry of anaphora.subjectPronouns){
      if(!record(entry) || Object.keys(entry).sort().join(',')!=='concepts,text' ||
          !/^[\p{L}]+$/u.test(entry.text||'') ||
          seen.has(entry.text.toLocaleLowerCase(grammar.language)) ||
          !Array.isArray(entry.concepts) || !entry.concepts.length ||
          entry.concepts.length>12 || new Set(entry.concepts).size!==entry.concepts.length ||
          entry.concepts.some(concept=>!LEXEME_ID.test(concept))){
        throw new Error('Invalid subject pronoun declaration.');
      }
      seen.add(entry.text.toLocaleLowerCase(grammar.language));
    }
  }

  const deictic=grammar.deicticPronouns;
  if(deictic!==undefined){
    const functionWords=dictionary.functionWords || [];
    const seen=new Set();
    const seenSenses=new Set();
    const senses=new Map(functionWords.flatMap(word=>(word.senses||[]).map(sense=>
      [sense.id,{word,sense}])));
    if(!Array.isArray(deictic) || deictic.length<3 || deictic.length>8){
      throw new Error('Invalid deictic pronoun grammar inventory.');
    }
    for(const entry of deictic){
      const found=senses.get(entry?.senseId);
      const key=JSON.stringify([entry?.referent?.anchor,entry?.person,entry?.number]);
      if(!record(entry) || Object.keys(entry).sort().join(',')!=='number,person,referent,senseId' ||
          !LEXEME_ID.test(entry.senseId||'') || !found ||
          found.sense.coreRef?.kind!=='grammaticalFunction' ||
          found.sense.coreRef.id!==DEICTIC_FUNCTION ||
          !record(entry.referent) || Object.keys(entry.referent).sort().join(',')!=='anchor,kind' ||
          entry.referent.kind!=='deictic' || !['speaker','addressee'].includes(entry.referent.anchor) ||
          !['first','second'].includes(entry.person) ||
          !['singular','plural'].includes(entry.number) ||
          (entry.referent.anchor==='speaker')!==(entry.person==='first') || seen.has(key) ||
          seenSenses.has(entry.senseId) ||
          !found.word.forms.every(form=>/^[\p{L}]+$/u.test(form.text||''))){
        throw new Error('Invalid deictic pronoun declaration.');
      }
      seen.add(key);
      seenSenses.add(entry.senseId);
      const formTexts=found.word.forms.map(form=>form.text.toLocaleLowerCase(grammar.language));
      if(formTexts.some(text=>(grammar.anaphora?.subjectPronouns || []).some(item=>
          item.text.toLocaleLowerCase(grammar.language)===text))){
        throw new Error('Deictic pronouns cannot overlap the third-person anaphora inventory.');
      }
    }
    const required=[
      ['speaker','first','singular'],['speaker','first','plural'],
      ['addressee','second','singular'],['addressee','second','plural']
    ];
    if(!required.every(item=>seen.has(JSON.stringify(item)))){
      throw new Error('Incomplete deictic pronoun agreement inventory.');
    }
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
          !['modality.ability','modality.obligation'].includes(item.senses[0].coreRef.id) ||
          Object.keys(item.forms).some(k=>!['positive','negative','prohibition'].includes(k)) ||
          !['positive','negative'].every(mode=>record(item.forms[mode]) &&
            MODAL_AGREEMENT_KEYS.every(key=>legalWord(item.forms[mode][key])) &&
            Object.keys(item.forms[mode]).length===MODAL_AGREEMENT_KEYS.length) ||
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
        !allowed(questions.wh,['agent','theme']) ||
        !record(questions.wh.agent) || !record(questions.wh.theme) ||
        !word(questions.wh.agent.marker) || !word(questions.wh.theme.marker) ||
        questions.wh.agent.marker===questions.wh.theme.marker ||
        !allowed(questions.wh.agent,['marker','agreement']) ||
        !allowed(questions.wh.theme,['marker','caseMarkers','order']) ||
        !['verb_first','auxiliary'].includes(questions.wh.theme.order)) {
      throw new Error('Invalid interrogative grammar configuration.');
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
        !Array.isArray(rule.prefix) ||
        !rule.prefix.every(word => typeof word === 'string' && /^[\p{L}]+$/u.test(word))) {
      throw new Error('Invalid declarative verb rule.');
    }
    if (formPlaceholders(rule.path).some(part => !hasOwn(grammar.verb.agreement, part))) {
      throw new Error('Unsupported verb form placeholder (missing agreement dependency).');
    }
    validateConditions(rule.when || {});
    const key = JSON.stringify([rule.tense, rule.polarity,
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
    if (typeof concept !== 'string' || !record(frame) ||
        (frame.whTheme !== undefined && typeof frame.whTheme !== 'boolean' &&
          (!record(frame.whTheme) ||
            Object.keys(frame.whTheme).length !== 1 ||
            typeof frame.whTheme.frontPreposition !== 'string' ||
            !/^[\p{L}]+$/u.test(frame.whTheme.frontPreposition) ||
            grammar.questions?.yesNo?.mode !== 'prefix')) ||
        (frame.caseAlternations !== undefined && typeof frame.caseAlternations !== 'boolean') ||
        !Array.isArray(frame.linearizations) || !frame.linearizations.length ||
        !frame.linearizations.every(sequence => Array.isArray(sequence) && sequence.length &&
          sequence.every(step => typeof step === 'string' &&
            (safeName(step) || step === '@verb' || LITERAL.test(step))))) {
      throw new Error(`Invalid linearizations for ${concept}.`);
    }
  }
  const stateSenses = (dictionary.verbs || []).flatMap(verb => verb.senses || [])
    .filter(sense => sense.coreRef?.kind === 'grammaticalFunction' &&
      ['grammar.state_copula','grammar.state_possession'].includes(sense.coreRef.id));
  if (grammar.states === undefined) {
    if (stateSenses.length) throw new Error('Missing state grammar for state verb lexemes.');
    return grammar;
  }
  const states = grammar.states;
  if (!record(states) ||
      Object.keys(states).some(key => !['negator','supportedTenses','supportedPolarities','verbs','frames',
        'unsupportedVerbs'].includes(key)) ||
      !['negator','supportedTenses','verbs','frames'].every(key => hasOwn(states,key)) ||
      !/^[\p{L}]+$/u.test(states.negator || '') ||
      !Array.isArray(states.supportedTenses) || !states.supportedTenses.length ||
      !states.supportedTenses.every(safeName) || !record(states.verbs) ||
      (states.supportedPolarities !== undefined &&
        (!Array.isArray(states.supportedPolarities) || !states.supportedPolarities.length ||
          !states.supportedPolarities.every(value=>['positive','negative'].includes(value)) ||
          new Set(states.supportedPolarities).size!==states.supportedPolarities.length)) ||
      !record(states.frames) ||
      (states.unsupportedVerbs !== undefined && !Array.isArray(states.unsupportedVerbs))) {
    throw new Error('Invalid state grammar configuration.');
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
  for (const [coreFunction, kind] of Object.entries(states.verbs)) {
    if (!LEXEME_ID.test(coreFunction) || !['identity','predication','possession'].includes(kind) ||
        !hasOwn(states.frames,kind)) {
      throw new Error(`Invalid state verb mapping: ${coreFunction}`);
    }
    stateKinds.add(kind);
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
        Object.keys(frame).some(key => !['subjectRole','cases','linearizations',
          'allowImplicitDeicticSubject', ...(hasPredicate ? ['predicateRole','predicateCase'] : [])].includes(key)) ||
        !['subjectRole','cases','linearizations'].every(key => hasOwn(frame,key)) ||
        (hasPredicate && (frame.predicateRole !== 'predicate' || !safeName(frame.predicateRole) ||
          !safeName(frame.predicateCase) || frame.allowImplicitDeicticSubject === true)) ||
        (frame.allowImplicitDeicticSubject !== undefined &&
          typeof frame.allowImplicitDeicticSubject !== 'boolean') ||
        frame.subjectRole !== (kind === 'possession' ? 'owner' : 'subject') ||
        !record(frame.cases) || Object.keys(frame.cases).length !== roles.length ||
        roles.some(role => !hasOwn(frame.cases,role)) ||
        !Array.isArray(frame.linearizations) || !frame.linearizations.length ||
        (hasPredicate && new Set(slots).size !== slots.length)) {
      throw new Error(`Invalid ${kind} state frame.`);
    }
    for (const role of roles) {
      const mapping = frame.cases[role];
      if (safeName(mapping)) continue;
      if (!record(mapping) || Object.keys(mapping).length !== 2 ||
          !['positive','negative'].every(polarity => safeName(mapping[polarity]))) {
        throw new Error(`Invalid case mapping for state role ${role}.`);
      }
    }
    for (const sequence of frame.linearizations) {
      if (!Array.isArray(sequence) || sequence.length !== slots.length + 1 ||
          sequence.filter(step => step === '@verb').length !== 1 ||
          sequence.some(step => !(slots.includes(step) || step === '@verb' ||
            (typeof step === 'string' && LITERAL.test(step)))) ||
          slots.some(role => sequence.filter(step => step === role).length !== 1) ||
          (hasPredicate && sequence.indexOf(frame.subjectRole) > sequence.indexOf(frame.predicateRole))) {
        throw new Error(`Invalid ${kind} state linearization.`);
      }
    }
  }
  return grammar;
}

/** A lemma may have multiple senses; many lemmas may express the same concept. */
function expandLexemes(lexemes, language, partOfSpeech) {
  const expanded = [];
  const lexemeIds = new Set();
  const senseIds = new Set();
  for (const lexeme of lexemes) {
    // Canonical dictionaries may include productive lexemes without a stored
    // forms table. They become active only after morphology materialization.
    // Keep older adapters (constructed without morphology) usable for their
    // original vocabulary; never guess forms from the lemma.
    if (lexeme?.forms === undefined) continue;
    if (!record(lexeme) || !LEXEME_ID.test(lexeme.id || '') ||
        lexemeIds.has(lexeme.id) ||
        typeof lexeme.lemma !== 'string' || !lexeme.lemma.trim() ||
        !record(lexeme.forms)) {
      throw new Error(`Invalid or duplicate ${partOfSpeech} lexeme: ${lexeme?.id}`);
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
              ['grammar.state_copula','grammar.state_possession'].includes(stateFunction))) ||
          !Number.isInteger(sense.priority ?? 0) || Math.abs(sense.priority ?? 0) > 100) {
        throw new Error(`Invalid or duplicate lexical sense: ${sense?.id}`);
      }
      senseIds.add(sense.id);
      expanded.push({ ...lexeme, ...(concept ? {concept} : {}),
        ...(sense.coreRef ? {coreRef:sense.coreRef} : {}),
        ...(stateFunction ? {stateFunction} : {}), senseId: sense.id,
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

export function createRuleAdapter(sourceDictionary, rules, {morphology} = {}) {
  const prepared = morphology ? materializeInflections(sourceDictionary, morphology, {assertLegacy:true}) : sourceDictionary;
  const lexicon = createLexicon(prepared);
  // A compatibility view lets existing declarative grammar use the normalized
  // meaning inventory while the canonical source always points through CORE.
  const dictionary = lexicon.dictionary;
  const grammar = validateGrammar(dictionary, rules);
  const { nounPhrase, sentence, verb: verbGrammar, frames } = grammar;
  const subjectRole = sentence.subjectRole;
  const nouns = expandLexemes(dictionary.nouns, dictionary.language, 'noun');
  const expandedVerbs = expandLexemes(dictionary.verbs, dictionary.language, 'verb');
  const verbs = expandedVerbs.filter(lexeme => !!lexeme.concept);
  const stateVerbs = expandedVerbs.filter(lexeme =>
    hasOwn(grammar.states?.verbs || {},lexeme.stateFunction));
  const nounForms = nouns.map(noun => ({ noun, forms: formsAt(noun, nounPhrase.path) }));
  const nominal = createNominalInterpreter({ dictionary, nounPhrase, nounForms });
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
    return (word?.forms || []).map(form=>({text:form.text,senseId:entry.senseId,
      referent:entry.referent,person:entry.person,number:entry.number,priority:sense?.priority||0}));
  });
  const verbForms = verbs.flatMap(lexeme => verbGrammar.rules.flatMap(rule =>
    formsAt(lexeme, rule.path).map(form => ({ ...form, lexeme, rule }))));
  const stateGrammar = grammar.states || null;
  const stateVerbForms = stateGrammar ? stateVerbs.flatMap(lexeme => {
    const kind = stateGrammar.verbs[lexeme.stateFunction];
    const cells = morphology?.has(lexeme.id)
      ? morphology.paradigm({lexemeId:lexeme.id}).map(form => ({
        text:form.text, features:form.features
      }))
      : STATE_FORM_CELLS.flatMap(cell => formsAt(lexeme,cell.path).map(form => ({
        text:form.text, features:{tense:cell.tense,person:cell.person,number:cell.number}
      })));
    return cells.filter(form => stateGrammar.supportedTenses.includes(form.features?.tense))
      .map(form => ({
        kind, lexeme, text:form.text, features:form.features,
        rule:{tense:form.features.tense,polarity:'positive',prefix:[],when:{
          'subject.person':form.features.person,'subject.number':form.features.number
        }}
      }));
  }) : [];
  const nounIndex = new Map();
  for (const noun of nouns) {
    if (!nounIndex.has(noun.concept)) nounIndex.set(noun.concept, []);
    nounIndex.get(noun.concept).push(noun);
  }
  for (const list of nounIndex.values()) list.sort((left, right) => right.priority - left.priority);

  function roleCase(frame, role, features, ref) {
    const mapping = frame.cases?.[role] || (role === subjectRole ? nounPhrase.subjectCase : undefined);
    let result = record(mapping) ? (mapping[ref?.features?.definiteness] || mapping.unknown) : mapping;
    for (const alternation of frame.caseAlternations === false ? [] : grammar.cases?.alternations || []) {
      if (result === alternation.from &&
          matchesConditions({ event: features }, alternation.when)) {
        result = alternation.to;
      }
    }
    return result;
  }

  /** Relative agreement is derived from the antecedent lexeme, not its surface case. */
  function relativeMarker(marker, noun, ref) {
    return Object.entries(marker.when || {}).every(([key, value]) =>
      (key === 'number' ? ref.features.number : noun[key]) === value);
  }

  function plainNoun(ref, noun, gramCase, fallback) {
    const forms = nounForms.find(item => item.noun === noun)?.forms || [];
    const form = forms.find(candidate => candidate.bindings.number === ref.features.number &&
      (candidate.bindings.case === undefined || candidate.bindings.case === gramCase));
    if (!form) throw new Error(`Missing ${ref.features.number}/${gramCase || '-'} noun form for ${noun.lemma}.`);
    return nominal.render(ref, noun, form.text, gramCase, fallback);
  }

  function contextFor(roles, event, grammaticalSubjectRole = subjectRole) {
    const subject = roles[grammaticalSubjectRole];
    const ref = subject?.value;
    const agreement = isDeicticReferent(ref) ? ref.agreement : null;
    return { event, subject: subject ? {
      person: agreement?.person ?? GRAMMATICAL_PERSON.third,
      number: agreement?.number ?? ref?.features?.number,
      gender: subject.noun?.gender,
      pluralClass: subject.noun?.pluralClass
    } : {} };
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

  function stateMeaning(kind, roles, features) {
    if (kind === 'identity') return createIdentity(roles.subject,roles.complement,features);
    if (kind === 'predication') return createPredication(roles.predicate,roles.subject,features);
    if (kind === 'possession') return createPossession(roles.owner,roles.owned,features);
    throw new Error(`Unsupported state construction in ${dictionary.language}.`);
  }

  function parseStateCandidates(tokens, budget, options = {}) {
    if (!stateGrammar) return [];
    const entries=options.entries || stateVerbForms;
    const polarities=options.polarities || stateGrammar.supportedPolarities || ['positive','negative'];
    const readings = new Map();
    for (const base of entries) {
      const frame = stateGrammar.frames[base.kind];
      const linearizations=frame.linearizations.flatMap(sequence=>{
        if(!frame.allowImplicitDeicticSubject||!sequence.includes(frame.subjectRole))return [sequence];
        return [sequence,sequence.filter(step=>step!==frame.subjectRole)];
      });
      for (const polarity of polarities) {
        const entry = {...base,rule:{...base.rule,polarity,
          prefix:polarity==='negative'?[stateGrammar.negator]:[]}};
        if (!tokens.some((_,index) => matchVerb(tokens,index,entry)!==null)) continue;
        const features={tense:entry.features.tense,polarity};
        for(const sequence of linearizations){
          const implicitSubject=!sequence.includes(frame.subjectRole)
            ?implicitStateSubject(entry.features):null;
          if(!sequence.includes(frame.subjectRole)&&!implicitSubject)continue;
          const initialRoles=implicitSubject
            ?{[frame.subjectRole]:{value:implicitSubject}}:{};
          function search(position,index,parsedRoles) {
            if (++budget.counter.visited > MAX_SEARCH_NODES) {
              throw new EngineError('GRAMMAR_SEARCH_LIMIT',
                'Sentence analysis exceeded the bounded search limit.');
            }
            if (position === sequence.length) {
              if (index !== tokens.length) return;
              const context=contextFor(parsedRoles,features,frame.subjectRole);
              if (!matchesConditions(context,entry.rule.when || {})) {
                budget.agreementFailed=true;
                return;
              }
              const roles=Object.fromEntries(Object.entries(parsedRoles)
                .map(([role,parsed])=>[role,parsed.value]));
              const meaning=stateMeaning(base.kind,roles,features);
              const lexicalSenses={verb:entry.lexeme.senseId};
              for(const [role,parsed] of Object.entries(parsedRoles)) {
                if(parsed.senseId)lexicalSenses[role]=parsed.senseId;
              }
              const candidate={interlingua:meaning,lexicalSenses,
                score:(entry.lexeme.priority||0)+Object.values(parsedRoles)
                  .reduce((score,parsed)=>score+(parsed.noun?.priority||parsed.priority||0),0)};
              const key=JSON.stringify(meaning),former=readings.get(key);
              if(!former||candidate.score>former.score)readings.set(key,candidate);
              return;
            }
            const step=sequence[position];
            if(step==='@verb') {
              const next=matchVerb(tokens,index,entry);
              if(next!==null)search(position+1,next,parsedRoles);
              return;
            }
            if(step.startsWith('@')) {
              const count=matchesTokens(tokens,index,step.slice(1));
              if(count)search(position+1,index+count,parsedRoles);
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
                ...(subject.noun?.gender?{gender:subject.noun.gender}:{}),
                ...(subject.noun?.pluralClass?{pluralClass:subject.noun.pluralClass}:{}),
                ...(subject.noun?.animacy?{animacy:subject.noun.animacy}:{})};
              phrases=nominal.readProperty(tokens,index,context);
            } else {
              const grammaticalCase=stateRoleCase(frame,step,polarity);
              phrases=[...readNounPhrases(tokens,index,grammaticalCase,0,budget),
                ...(step===frame.subjectRole&&grammaticalCase==='nom'
                  ?[...readDeicticNounPhrases(tokens,index),
                    ...readStateSubjectPronouns(tokens,index)]:[])];
            }
            for(const parsed of phrases) {
              search(position+1,parsed.next,{...parsedRoles,[step]:parsed});
            }
          }
          search(0,0,initialRoles);
        }
      }
    }
    return [...readings.values()].sort((a,b)=>b.score-a.score).slice(0,MAX_ANALYSES);
  }

  function readStateSubjectPronouns(tokens,index) {
    const found=[];
    for(const pronoun of subjectPronouns) {
      const size=matchesTokens(tokens,index,pronoun.text);
      if(!size)continue;
      for(const concept of pronoun.concepts) {
        if(!nounIndex.has(concept))continue;
        found.push({value:{concept,features:{number:'singular',definiteness:'definite'}},
          noun:nounByConcept(concept),next:index+size,senseId:null,priority:0});
      }
    }
    return found;
  }

  /** Bounded chart-like enumeration for complete clauses or clauses with one semantic gap.
   * Relative clauses are parsed by recursively reusing the SAME frame/lexicon rules.
   * The source marker is language-specific data; no pairwise translation rules exist.
   */
  function analyzeCandidates(text) {
    if(typeof text==='string'&&text.includes('?'))return analyzeQuestionCandidates(text);
    const tokens = tokenize(text);
    const counter={visited:0};
    const modalReadings = parseModalCandidates(tokens,null,null,null,counter);
    if (modalReadings.length) return modalReadings;
    const budget = searchBudget(counter);
    const stateReadings = parseStateCandidates(tokens,budget);
    const results = [...stateReadings,...parseClause(tokens, null, null, 0, budget)];
    if (results.length) return results.slice(0, MAX_ANALYSES);
    if (budget.agreementFailed) throw new Error(grammar.messages?.agreement ||
      'Verb form does not agree with subject.');
    throw new Error('Sentence does not match a supported grammatical construction (subject noun phrase, roles, verb or word order).');
  }

  function parseClause(tokens, gap, antecedent, depth, budget, options = {}) {
    const {verbEntries=verbForms,linearizations=null,omitGap=false} = options;
    const memoKey = JSON.stringify([tokens,gap,antecedent?.noun?.id,
      antecedent?.value,depth,omitGap,linearizations?'question':'declarative']);
    if (budget.memo.has(memoKey)) return budget.memo.get(memoKey);
    const readings = new Map();
    for (const [concept, frame] of Object.entries(frames)) {
      for (const sequence of linearizations ? linearizations(frame) : frame.linearizations) {
        if (gap && !sequence.includes(gap)) continue;
        for (const entry of verbEntries) {
          if (entry.lexeme.concept !== concept ||
              !tokens.some((_, i) => matchVerb(tokens, i, entry) !== null)) continue;
          const features = { tense: entry.rule.tense, polarity: entry.rule.polarity,
            aspect: verbGrammar.aspectSource === 'lexeme' ? entry.lexeme.aspect || 'unknown' : 'unknown' };
          const initialRoles = gap ? { [gap]: antecedent } : {};
          function search(position, index, parsedRoles) {
            if (++budget.counter.visited > MAX_SEARCH_NODES) {
              throw new EngineError('GRAMMAR_SEARCH_LIMIT',
                'Sentence analysis exceeded the bounded search limit.');
            }
            if (position === sequence.length) {
              if (index !== tokens.length) return;
              const context = contextFor(parsedRoles, features);
              if (!matchesConditions(context, entry.rule.when || {}) ||
                  !matchesAgreement(entry.bindings, verbGrammar.agreement, context)) {
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
              const candidate = { interlingua: meaning, lexicalSenses: senses,
                score: (entry.lexeme.priority || 0) + Object.entries(parsedRoles)
                  .filter(([role]) => role !== gap)
                  .reduce((score, [, parsed]) => score + (parsed.noun?.priority || parsed.priority || 0), 0) };
              const key = JSON.stringify(meaning);
              const former = readings.get(key);
              if (!former || candidate.score > former.score) readings.set(key, candidate);
              return;
            }
            const step = sequence[position];
            if (step === gap) { search(position + 1, index, parsedRoles); return; }
            if (step === '@verb') {
              const next = matchVerb(tokens, index, entry);
              if (next !== null) search(position + 1, next, parsedRoles);
              return;
            }
            if (step.startsWith('@')) {
              const count = matchesTokens(tokens, index, step.slice(1));
              if (count) search(position + 1, index + count, parsedRoles);
              return;
            }
            const caseRule = frame.cases?.[step];
            const cases = record(caseRule) ? [...new Set(Object.values(caseRule))] :
              [roleCase(frame, step, features)];
            for (const grammaticalCase of cases) {
              const phrases=[...readNounPhrases(tokens,index,grammaticalCase,depth,budget),
                ...(step===subjectRole && grammaticalCase===nounPhrase.subjectCase ?
                  readDeicticNounPhrases(tokens,index) : [])];
              for (const parsed of phrases) {
                if (record(caseRule)) {
                  const implied = Object.keys(caseRule).find(key => key !== 'unknown' &&
                    caseRule[key] === grammaticalCase);
                  if (!implied) continue;
                  if (parsed.value.features.definiteness !== 'unknown' &&
                      parsed.value.features.definiteness !== implied) continue;
                  parsed.value = { ...parsed.value,
                    features: { ...parsed.value.features, definiteness: implied } };
                }
                search(position + 1, parsed.next, { ...parsedRoles, [step]: parsed });
              }
            }
          }
          search(0, 0, initialRoles);
        }
      }
    }
    const results = [...readings.values()].sort((a, b) => b.score - a.score).slice(0, MAX_ANALYSES);
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
    return verbs.flatMap(lexeme => formsAt(lexeme,modality.infinitivePath)
      .filter(verbForm => Object.keys(verbForm.bindings).length === 0)
      .map(verbForm => ({
        lexeme, text: includeModal ? modalForm+' '+verbForm.text : verbForm.text,
        bindings: {}, rule: {
          tense:'present', polarity:mode === 'positive' ? 'positive' : 'negative',
          prefix:[],when:{'subject.person':person,'subject.number':number}
        }
      })));
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
    for (const modal of modals) for (const mode of ['positive','negative','prohibition']) {
      if (!modal.forms[mode]) continue;
      for (const person of ['first','second','third']) for (const number of ['singular','plural']) {
        const variants=parseClause(tokens,gap,antecedent,0,questionBudget(counter),{
          verbEntries:modalEntries(modal,mode,person,number),
          omitGap:!!gap, linearizations
        });
        for (const reading of variants) {
          readings.push(wrapModalReading(reading,modal,mode));
          if (readings.length >= MAX_ANALYSES) return readings;
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
            const entries=modalEntries(modal,mode,person,number).filter(e=>
              e.lexeme.concept===concept).flatMap(e=>{
              const text=withoutGovernedPreposition(e.text,frame);
              return text?[{...e,text}]:[];
            });
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
    return safe.sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,MAX_ANALYSES);
  }

  /** No semantic entity is used for an unanswered role.  This temporary
   *  syntactic record only provides finite verb agreement during parsing. */
  const gapSyntax=()=>({value:{features:{number:questions.wh.agent.agreement.number}},
    noun:{id:'question_gap',gender:questions.wh.agent.agreement.gender,
      pluralClass:questions.wh.agent.agreement.pluralClass},senseId:null});
  const themeOrder=frame=>frame.linearizations.map(seq=>
    ['@verb',...seq.filter(step=>step!=='@verb'&&step!=='theme'),'theme']);
  const normalizedWord=value=>value.toLocaleLowerCase(grammar.language);
  const questionBudget=counter=>searchBudget(counter);

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
      const entries=verbForms.filter(entry=>entry.lexeme.concept===concept).flatMap(entry=>{
        const text=withoutGovernedPreposition(entry.text,frame);
        return text?[{...entry,text}]:[];
      });
      readings.push(...parseClause(tokens.slice(2),'theme',syntacticGap,0,questionBudget(counter),{
        verbEntries:entries,omitGap:true,linearizations:themeOrder
      }));
    }
    return readings;
  }

  function analyzeAuxiliaryQuestion(tokens,gap,antecedent,counter) {
    const yesNo=questions.yesNo;
    const variants=[
      {word:yesNo.auxiliaries.past,tense:'past',when:null},
      {word:yesNo.auxiliaries.presentFirst,tense:'present',when:{'subject.person':'first'}},
      {word:yesNo.auxiliaries.presentSecond,tense:'present',when:{'subject.person':'second'}},
      {word:yesNo.auxiliaries.presentThirdSingular,tense:'present',when:{
        'subject.person':'third','subject.number':'singular'}},
      {word:yesNo.auxiliaries.presentThirdPlural,tense:'present',when:{
        'subject.person':'third','subject.number':'plural'}}
    ];
    const results=[];
    for(const variant of variants) {
      if(tokens[0]!==normalizedWord(variant.word))continue;
      for(const polarity of ['positive','negative']) {
        const verbEntries=verbForms.filter(entry=>
          entry.rule.tense===variant.tense && entry.rule.polarity===polarity &&
          (!variant.when || Object.entries(variant.when).every(([key,value])=>
            entry.rule.when?.[key]===value)))
          .flatMap(entry=>formsAt(entry.lexeme,yesNo.baseVerbPath).map(base=>({
            ...entry,text:base.text,rule:{...entry.rule,
              prefix:polarity==='negative'?[yesNo.negator]:[]}
          })));
        results.push(...parseClause(tokens.slice(1),gap,antecedent,0,questionBudget(counter),{
          verbEntries,omitGap:!!gap
        }));
      }
    }
    return results;
  }

  function analyzeAuxiliaryStateQuestion(tokens,counter) {
    if(questions.yesNo.mode!=='auxiliary')return [];
    const yesNo=questions.yesNo;
    const variants=[
      {word:yesNo.auxiliaries.past,tense:'past'},
      {word:yesNo.auxiliaries.presentFirst,tense:'present',person:'first',number:'singular'},
      {word:yesNo.auxiliaries.presentSecond,tense:'present',person:'second',number:'singular'},
      {word:yesNo.auxiliaries.presentThirdSingular,tense:'present',person:'third',number:'singular'},
      {word:yesNo.auxiliaries.presentThirdPlural,tense:'present',person:'third',number:'plural'}
    ];
    const results=[];
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
        .flatMap(entry=>formsAt(entry.lexeme,yesNo.baseVerbPath).map(base=>({
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

  /** A deliberately controlled question parser.  A terminal question mark is
   *  required; unsupported forms fail rather than becoming declaratives. */
  function analyzeQuestionCandidates(text) {
    if (!questions) throw new Error('Unsupported question construction in this language.');
    if (typeof text!=='string' || !text.trim().endsWith('?') ||
        /[.?!]/u.test(text.trim().slice(0,-1))) {
      throw new Error('Unsupported question construction or punctuation.');
    }
    const tokens=tokenize(text.trim().slice(0,-1)+'.');
    if(tokens.length<2)throw new Error('Unsupported question construction.');
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
    add(analyzeAuxiliaryStateQuestion(tokens,counter),'yes_no');
    const mode=questions.yesNo.mode;
    add(parseFrontedPrepositionTheme(tokens,counter),'wh','theme');
    if(mode==='prefix' && tokens[0]===normalizedWord(questions.yesNo.marker)) {
      add(parseClause(tokens.slice(1),null,null,0,questionBudget(counter)),'yes_no');
    } else if(mode==='auxiliary' && Object.values(questions.yesNo.auxiliaries)
        .some(word=>tokens[0]===normalizedWord(word))) {
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
      throw new Error('Only simple sentences with configured interrogative markers are supported. Unsupported question construction (word order, agreement, tense or polarity).');
    }
    const safe=results.filter(item=>item.interlingua.questionType!=='wh' ||
      item.interlingua.targetRole!=='theme' ||
      (frames[item.interlingua.proposition.concept]?.whTheme!==false &&
      (!frames[item.interlingua.proposition.concept]?.whTheme?.frontPreposition ||
       tokens[0]===normalizedWord(frames[item.interlingua.proposition.concept].whTheme.frontPreposition))));
    if(!safe.length) throw new Error('Unsupported WH construction for this verb frame.');
    return safe.sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,MAX_ANALYSES);
  }

  function readDeicticNounPhrases(tokens,index) {
    const found=[];
    for(const pronoun of deicticPronouns){
      const size=matchesTokens(tokens,index,pronoun.text);
      if(!size)continue;
      found.push({value:{referent:{...pronoun.referent},
        agreement:{person:pronoun.person,number:pronoun.number}},
        next:index+size,noun:null,senseId:pronoun.senseId,priority:pronoun.priority});
    }
    return found;
  }

  function readNounPhrases(tokens, index, grammaticalCase, depth, budget) {
    const bare = nominal.read(tokens, index, grammaticalCase);
    if (depth >= relativeGrammar.maxDepth) return bare;
    const enriched = [...bare];
    for (const base of bare) for (const marker of relativeGrammar.markers) {
      if (!relativeMarker(marker, base.noun, base.value)) continue;
      const commas = relativeGrammar.punctuation === 'commas';
      const begin = base.next + (commas ? 1 : 0);
      if (commas && tokens[base.next] !== ',') continue;
      const length = matchesTokens(tokens, begin, marker.text);
      if (!length) continue;
      const first = begin + length;
      // Search possible relative endings; only successful frame parses count.
      for (let end = first + 1; end <= tokens.length; end++) {
        // A comma may close both an inner and an outer relative clause.
        // Reusing one boundary matches written Polish: ..., który ..., dała ...
        const closingConsumed = commas && tokens[end - 1] === ',';
        if (commas && tokens[end] !== ',' && !closingConsumed) continue;
        const span = tokens.slice(first, end);
        const candidates = parseClause(span, marker.gap, base, depth + 1, budget);
        for (const item of candidates) {
          const relative = createRelativeClause(item.interlingua, marker.gap);
          const value = { ...base.value, relatives: [relative] };
          enriched.push({ ...base, value, next: end + (commas && !closingConsumed ? 1 : 0),
            relativeSenses: item.lexicalSenses, modifierSenses: base.modifierSenses });
          if (enriched.length >= 72) throw new Error('Relative clause ambiguity exceeds parser limit.');
        }
      }
    }
    return enriched;
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
    return answers.slice(0, MAX_ANALYSES);
  }

  function realizeComplement(node, contentText) {
    if (!comp) throw new Error(`Language ${grammar.language} has no complement construction.`);
    const lex = matrixLexemes.find(item => item.concept === node.concept);
    if (!lex) throw new Error(`Missing ${grammar.language} complement lexeme for ${node.concept}.`);
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
    return found?{text:found.text,concepts:[...found.concepts]}:null;
  }

  function readDeicticPronoun(text) {
    if(typeof text!=='string')return [];
    const tokens=tokenize(text.trim());
    if(!tokens.length)return [];
    return readDeicticNounPhrases(tokens,0).map(item=>({
      text:tokens[0],referent:item.value.referent,agreement:item.value.agreement,
      senseId:item.senseId
    }));
  }

  function expandSubjectPronoun(text,referent) {
    const pronoun=readSubjectPronoun(text);
    if(!pronoun || !record(referent) ||
       !pronoun.concepts.includes(referent.concept) ||
       referent.features?.number!=='singular' ||
       !nounIndex.has(referent.concept)){
      throw new Error('Unresolved anaphora: no licensed singular subject antecedent.');
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
  function subjectPronounFor(ref) {
    if (!record(ref) || isDeicticReferent(ref) || ref.features?.number !== 'singular' ||
        !nounIndex.has(ref.concept)) return null;
    const matches = subjectPronouns.filter(item=>item.concepts.includes(ref.concept));
    return matches.length === 1 ? matches[0].text : null;
  }

  function nounByConcept(concept) {
    const nouns = nounIndex.get(concept);
    if (!nouns?.length) throw new Error(`No ${dictionary.language} noun lexeme for ${concept}.`);
    return nouns[0];
  }

  function deicticPronounSurface(ref) {
    const entry=deicticPronouns.find(item=>
      item.referent.anchor===ref.referent.anchor &&
      item.person===ref.agreement.person && item.number===ref.agreement.number);
    if(!entry)throw new Error(`Missing ${dictionary.language} deictic pronoun form.`);
    return entry.text;
  }

  function nounSurface(role, meaning, frame, fallback, depth) {
    const ref = meaning.roles[role];
    if(isDeicticReferent(ref)){
      if(role!==subjectRole)throw new Error('Only subject deictic pronouns are supported in this grammar scope.');
      return deicticPronounSurface(ref);
    }
    const noun = nounByConcept(ref.concept);
    const requiredCase = roleCase(frame, role, meaning.features, ref);
    let output = plainNoun(ref, noun, requiredCase, fallback);
    for (const relative of ref.relatives || []) {
      if (depth >= relativeGrammar.maxDepth) throw new Error('Relative clause realization depth exceeded.');
      const marker = relativeGrammar.markers.find(item => item.gap === relative.gap &&
        relativeMarker(item, noun, ref));
      if (!marker) throw new Error(`Missing ${dictionary.language} relative marker for ${relative.gap}.`);
      const clause = renderEvent(relative.event, fallback, depth + 1, { gap: relative.gap,
        antecedent: { value: ref, noun } });
      const opening = relativeGrammar.punctuation === 'commas' ? ', ' : ' ';
      const closing = relativeGrammar.punctuation === 'commas' && !clause.endsWith(',') ? ',' : '';
      if (output.endsWith(',') && opening.startsWith(',')) output = output.slice(0, -1);
      output += `${opening}${marker.text} ${clause}${closing}`;
    }
    return output;
  }

  function renderEvent(meaning, fallback, depth = 0, relative = null, options = {}) {
    const frame = own(frames, meaning.concept);
    if (!frame) throw new Error(`Missing frame for ${meaning.concept}.`);
    if (options.subjectPronoun && (relative ||
        frame.linearizations[0][0] !== subjectRole ||
        options.subjectPronoun !== subjectPronounFor(meaning.roles[subjectRole]))) {
      throw new Error('Unsupported subject pronoun realization for this event.');
    }
    const roles = Object.fromEntries(Object.entries(meaning.roles).map(([role, ref]) =>
      [role, { value: ref, noun: isDeicticReferent(ref) ? null : nounByConcept(ref.concept) }]));
    if (relative) roles[relative.gap] = relative.antecedent;
    const context = contextFor(roles, meaning.features);
    const candidates = verbForms.filter(entry => entry.lexeme.concept === meaning.concept &&
      entry.rule.tense === meaning.features.tense && entry.rule.polarity === meaning.features.polarity &&
      (verbGrammar.aspectSource !== 'lexeme' || meaning.features.aspect === 'unknown' ||
        entry.lexeme.aspect === meaning.features.aspect) &&
      matchesConditions(context, entry.rule.when || {}) &&
      matchesAgreement(entry.bindings, verbGrammar.agreement, context));
    if (!candidates.length) throw new Error(`No ${dictionary.language} verb form supports ${meaning.concept}, ` +
      `${meaning.features.tense}, ${meaning.features.polarity}, ${meaning.features.aspect}.`);
    const preferredAspect = verbGrammar.preferredAspects?.[meaning.concept];
    const preferred = candidates.find(v => v.lexeme.aspect === preferredAspect) || candidates[0];
    function linearize(entry, def) {
      const parts = (options.sequence || frame.linearizations[0]).flatMap(step => {
        if (step === relative?.gap) return [];
        if (step === '@verb') return [...entry.rule.prefix, entry.text];
        if (step.startsWith('@')) return [step.slice(1)];
        if (step === subjectRole && options.subjectPronoun)
          return [options.subjectPronoun];
        return [nounSurface(step, meaning, frame, def, depth)];
      });
      return parts.join(' ').replace(/\s+/gu, ' ').replace(/\s+,/gu, ',').trim();
    }
    if (relative && !options.returnBuilder) return linearize(preferred, fallback);
    return { candidates, preferred, linearize, roles };
  }

  function realizeState(meaning) {
    const frame=stateGrammar?.frames?.[meaning?.kind];
    if(!frame)throw new Error(`Unsupported state construction in ${dictionary.language}.`);
    if(!stateGrammar.supportedTenses.includes(meaning.features.tense)) {
      throw new Error(`No ${dictionary.language} state verb form supports ${meaning.features.tense}.`);
    }
    const polarity=meaning.features.polarity;
    if(!(stateGrammar.supportedPolarities || ['positive','negative']).includes(polarity)) {
      throw new Error(`Unsupported ${dictionary.language} state polarity.`);
    }
    const subject=meaning.roles[frame.subjectRole];
    const person=isDeicticReferent(subject)?subject.agreement.person:GRAMMATICAL_PERSON.third;
    const number=isDeicticReferent(subject)?subject.agreement.number:subject.features.number;
    const verb=stateVerbForms.find(entry=>entry.kind===meaning.kind&&
      entry.features.tense===meaning.features.tense&&entry.features.person===person&&
      entry.features.number===number);
    if(!verb)throw new Error(`No ${dictionary.language} state verb form supports ${meaning.kind}, ${person}, ${number}.`);
    const prefix=polarity==='negative'?[stateGrammar.negator]:[];
    const surface=(role)=>{
      if(role===frame.predicateRole) {
        if(meaning.kind!=='predication') {
          throw new Error(`Unsupported ${dictionary.language} state predicate subject.`);
        }
        const noun=isDeicticReferent(subject)?null:nounByConcept(subject.concept);
        const context={number:isDeicticReferent(subject)
          ?subject.agreement.number:subject.features.number,case:frame.predicateCase,
          ...(noun?.gender?{gender:noun.gender}:{}),
          ...(noun?.pluralClass?{pluralClass:noun.pluralClass}:{}),
          ...(noun?.animacy?{animacy:noun.animacy}:{})};
        return nominal.realizeProperty(meaning.predicate,context);
      }
      const ref=meaning.roles[role];
      if(isDeicticReferent(ref)) {
        if(role!==frame.subjectRole)throw new Error('Only subject deictic pronouns are supported in state constructions.');
        return deicticPronounSurface(ref);
      }
      if(ref.relatives?.length)throw new Error('Relative clauses in state constructions are unsupported.');
      const noun=nounByConcept(ref.concept);
      const gramCase=stateRoleCase(frame,role,polarity);
      return plainNoun(ref,noun,gramCase,nounPhrase.defaultDefiniteness);
    };
    const parts=frame.linearizations[0].flatMap(step=>{
      if(step==='@verb')return [...prefix,verb.text];
      if(step.startsWith('@'))return [step.slice(1)];
      if(step===frame.subjectRole && frame.allowImplicitDeicticSubject &&
          isDeicticReferent(meaning.roles[step]))return [];
      return [surface(step)];
    });
    return {text:sentenceText([parts.join(' ')],sentence.terminator),warnings:[],alternatives:[]};
  }


  /** Realize modality through existing frame role ordering and nominal rules. */
  function realizeModal(node, question = null) {
    const parts=modalParts(node);
    if (!parts) throw new Error('Unsupported modal clause.');
    const {event,operator,mode}=parts;
    if (event.features?.tense!=='present' || event.features?.polarity!=='positive')
      throw new Error('Unsupported modal tense or nested event polarity.');
    const modal=modals.find(item=>item.senses[0].coreRef.id===operator);
    if (!modal || !modal.forms[mode])
      throw new Error('Unsupported modal construction in this language (prohibition not available).');
    const frame=frames[event.concept];
    if (!frame)throw new Error('No grammatical frame for modal event.');
    if(question?.questionType==='wh' && question.targetRole==='theme' && frame.whTheme===false)
      throw new Error('Unsupported WH theme question for this verb frame.');
    const chosen=verbs.filter(v=>v.concept===event.concept &&
      (verbGrammar.aspectSource!=='lexeme' || event.features.aspect==='unknown' ||
       event.features.aspect===v.aspect))
      .map(v=>({lexeme:v,forms:formsAt(v,modality.infinitivePath)}))
      .filter(x=>x.forms.length===1 && !Object.keys(x.forms[0].bindings).length);
    if(!chosen.length)throw new Error('Missing infinitive/base verb for modal event.');
    const preferred=chosen.find(x=>x.lexeme.aspect===verbGrammar.preferredAspects?.[event.concept])||chosen[0];
    const infinitive=preferred.forms[0].text;
    const syntactic={...event,features:{...event.features,
      polarity:mode==='positive'?'positive':'negative'}};
    const role=question?.questionType==='wh'?question.targetRole:null;
    const q=questions;
    if(question && (!q || !['yes_no','wh'].includes(question.questionType) ||
       (role && !['agent','theme'].includes(role))))
       throw new Error('Unsupported modal question kind or target role.');
    if(question && modality.questionStrategy==='front' &&
       (mode!=='positive' && !(question.questionType==='wh'&&role==='agent')))
       throw new Error('Unsupported question construction for a negated English modal.');
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
      throw new Error('Unsupported modal subject number.');
    const modalText=modal.forms[mode][modalAgreementKey(person,number)];
    if(!modalText)throw new Error('Missing modal inflection for subject agreement.');
    const renderAt=def=>{
      const sequence=question?.questionType==='wh'&&role==='theme'&&
        modality.questionStrategy==='prefix' ? themeOrder(frame)[0] : frame.linearizations[0];
      const inverted=question && modality.questionStrategy==='front' &&
        (question.questionType==='yes_no'||role==='theme');
      const words=sequence.flatMap(step=>{
        if(step===role)return [];
        if(step==='@verb'){
          const text=role==='theme'?withoutGovernedPreposition(infinitive,frame):infinitive;
          if(!text)throw new Error('Missing governed preposition in modal infinitive.');
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

  function realize(meaning, {subjectPronoun=null} = {}) {
    if(subjectPronoun && (meaning?.type!=='event' ||
        subjectPronoun!==subjectPronounFor(meaning.roles?.[subjectRole]))) {
      throw new Error('Unsupported subject pronoun realization.');
    }
    if(meaning?.type==='question')return realizeQuestion(meaning);
    if(meaning?.type==='state')return realizeState(meaning);
    if(modalParts(meaning))return realizeModal(meaning);
    const built = renderEvent(meaning, undefined, 0, null, {subjectPronoun});
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
    const render = (entry, def) => sentenceText([linearize(entry, def)], sentence.terminator);
    const text = render(preferred, fallback);
    const alternatives = [];
    const seen = new Set([text]);
    const ordered = [preferred, ...candidates.filter(v => v !== preferred)];
    for (const choice of ordered) {
      for (const def of [fallback, otherFallback]) {
        if (def === undefined && def !== fallback) continue;
        const variant = render(choice, def);
        if (!seen.has(variant)) { seen.add(variant); alternatives.push(variant); }
        if (alternatives.length >= 7) break;
      }
      if (alternatives.length >= 7) break;
    }
    const warnings = [];
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
    return { text, warnings, alternatives };
  }


  /** Reuse existing inflection and nominal rules; interrogative strategies
   * remain in each language's declarative grammar configuration. */
  function realizeQuestion(question) {
    if(!questions)throw new Error('Unsupported question construction in this language.');
    const q=questions,clause=question.proposition;
    if(modalParts(clause))return realizeModal(clause,question);
    if(clause?.type==='state')return realizeStateQuestion(clause,question);
    if(clause?.type!=='event') {
      throw new Error('Unsupported question construction: only single-event propositions can be realized.');
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
    const lowerFirst=value=>value.charAt(0).toLocaleLowerCase(grammar.language)+value.slice(1);
    if(question.questionType==='yes_no'&&q.yesNo.mode==='prefix'){
      const rendered=realize(clause);
      const prefix=text=>wrap(q.yesNo.marker+' '+lowerFirst(withoutPeriod(text)));
      return {...rendered,text:prefix(rendered.text),
        alternatives:rendered.alternatives.map(prefix)};
    }
    const frame=frames[clause.concept];
    if(!frame)throw new Error('Unsupported question event frame.');
    if(question.questionType==='wh' && question.targetRole==='theme' && frame.whTheme===false)
      throw new Error('Unsupported WH theme question for this verb frame.');
    const syntaxGap=question.questionType==='wh' && question.targetRole==='agent'
      ? gapSyntax() : {value:{features:{number:'singular'}},
        noun:{id:'question_gap'},senseId:null};
    const relative=question.questionType==='wh'
      ? {gap:question.targetRole,antecedent:syntaxGap} : null;
    const options=question.questionType==='wh'&&question.targetRole==='theme'&&
      q.wh.theme.order==='verb_first'
      ? {sequence:themeOrder(frame)[0],returnBuilder:true}
      : {returnBuilder:true};
    const built=renderEvent(clause,undefined,0,relative,options);
    const whEntry=question.questionType==='wh'&&question.targetRole==='theme' &&
      frame.whTheme?.frontPreposition
      ? {...built.preferred,text:withoutGovernedPreposition(built.preferred.text,frame)}
      : built.preferred;
    if(!whEntry.text)throw new Error('Missing governed preposition in WH verb form.');
    const auxiliary=()=>{
      const values=q.yesNo.auxiliaries;
      if(clause.features.tense==='past')return values.past;
      if(clause.features.tense!=='present')throw new Error('Unsupported question tense.');
      const subject=built.roles[subjectRole]?.value;
      const person=subject?.agreement?.person || 'third';
      const number=subject?.agreement?.number ?? subject?.features?.number;
      if(person==='first')return values.presentFirst;
      if(person==='second')return values.presentSecond;
      if(person==='third'&&number==='singular')return values.presentThirdSingular;
      if(person==='third'&&number==='plural')return values.presentThirdPlural;
      throw new Error('Unsupported question subject agreement.');
    };
    const auxiliaryEntry=()=>{
      const base=formsAt(built.preferred.lexeme,q.yesNo.baseVerbPath);
      if(base.length!==1)throw new Error('Missing unambiguous base verb form for question.');
      return {...built.preferred,text:base[0].text,rule:{
        ...built.preferred.rule,
        prefix:clause.features.polarity==='negative'?[q.yesNo.negator]:[]
      }};
    };
    const renderAt=def=>{
      if(question.questionType==='yes_no') {
        return wrap(auxiliary()+' '+built.linearize(auxiliaryEntry(),def));
      }
      if(question.questionType!=='wh')throw new Error('Unsupported question kind.');
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
      throw new Error('Unsupported WH target role.');
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
    if(question.questionType!=='yes_no' || questions.yesNo.mode!=='auxiliary' ||
       clause.kind!=='possession' || !['present','past'].includes(clause.features?.tense) ||
       clause.features?.polarity!=='positive' ||
       !stateGrammar.supportedTenses.includes(clause.features.tense) ||
       !(stateGrammar.supportedPolarities || ['positive','negative']).includes(clause.features.polarity)) {
      throw new Error('Unsupported state question construction in this language.');
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
    if(!auxiliary)throw new Error('Unsupported state question subject agreement.');
    const verb=stateVerbForms.find(entry=>entry.kind==='possession'&&
      entry.features.tense===clause.features.tense&&entry.features.person===person&&
      entry.features.number===number);
    const base=verb&&formsAt(verb.lexeme,questions.yesNo.baseVerbPath);
    if(!base || base.length!==1)throw new Error('Missing unambiguous state verb base form for question.');
    const surface=role=>{
      const ref=clause.roles[role];
      if(isDeicticReferent(ref)) {
        if(role!==frame.subjectRole)throw new Error('Only subject deictic pronouns are supported in state questions.');
        return deicticPronounSurface(ref);
      }
      if(ref.relatives?.length)throw new Error('Relative clauses in state questions are unsupported.');
      return plainNoun(ref,nounByConcept(ref.concept),stateRoleCase(frame,role,clause.features.polarity),
        nounPhrase.defaultDefiniteness);
    };
    const text=sentenceText([`${auxiliary} ${surface(frame.subjectRole)} ${base[0].text} ${surface('owned')}`],'?');
    return {text,warnings:[],alternatives:[]};
  }

  function validateOntology(ontology, featureRegistry, coreLanguage) {
    const concepts = ontology?.concepts;
    const domains = featureRegistry?.domains;
    if (!record(concepts) || !domains) throw new Error('Missing ontology or feature registry.');
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
    nominal.validateOntology(ontology, featureRegistry);
    for (const marker of relativeGrammar.markers) {
      for (const [name,value] of Object.entries(marker.when || {})) {
        const domain = name === 'number' ? domains.participant.number : domains.lexical[name];
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
        if(!domains.syntactic.case.includes(caseName)) {
          throw new Error('Unknown grammatical WH marker case.');
        }
      }
    }
    for(const entry of subjectPronouns){
      for(const concept of entry.concepts){
        if(ontology.get(concept)?.type!=='entity' ||
           !ontology.isA(concept,'person') || !nounIndex.has(concept)){
          throw new Error('Anaphora pronoun maps to an unavailable person concept: '+concept);
        }
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
          domains.participant[name] || domains.lexical[name]);
      if (!available) throw new Error(`Unknown agreement source for ${binding}: ${source}`);
    }
    for (const rule of verbGrammar.rules) {
      for (const [source, value] of Object.entries(rule.when || {})) {
        const [root, name] = featureSource(source);
        const allowed = root === 'event' ? domains.event[name] :
          (name==='person' ? Object.values(GRAMMATICAL_PERSON) :
            domains.participant[name] || domains.lexical[name]);
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
      for (const sequence of frame.linearizations) {
        const roles = sequence.filter(step => !step.startsWith('@'));
        if (sequence.filter(step => step === '@verb').length !== 1 ||
            roles.length !== semanticFrame.roles.length ||
            roles.some(role => !semanticFrame.roles.includes(role)) ||
            new Set(roles).size !== semanticFrame.roles.length) {
          throw new Error(`Linearization roles do not match ontology for ${verb.concept}`);
        }
      }
      if (nounPhrase.path.includes('{case}') && semanticFrame.roles.some(role =>
        !['string','object'].includes(typeof (frame.cases?.[role] || (role === subjectRole && nounPhrase.subjectCase))))) {
        throw new Error(`Missing case mapping for ${verb.concept}`);
      }
      for (const grammaticalCase of Object.values(frame.cases || {}).flatMap(value =>
        record(value) ? Object.values(value) : [value])) {
        if (!domains.syntactic.case.includes(grammaticalCase)) {
          throw new Error(`Unknown syntactic case: ${grammaticalCase}`);
        }
      }
    }
    for(const frame of Object.values(stateGrammar?.frames || {})) {
      const cases=[...Object.values(frame.cases || {}).flatMap(value=>
        record(value)?Object.values(value):[value]),
      ...(frame.predicateRole?[frame.predicateCase]:[])];
      for(const grammaticalCase of cases) {
        if(!domains.syntactic.case.includes(grammaticalCase)) {
          throw new Error(`Unknown state grammatical case: ${grammaticalCase}`);
        }
      }
    }
    // Covers nouns, verbs, modifiers, quantifiers, matrix predicates AND
    // function words, including entries the restricted parser does not use yet.
    if (coreLanguage) lexicon.validateCore(coreLanguage);
  }

  return {
    code: grammar.language, analyze, analyzeCandidates, realize, realizeState, realizeModal, validateOntology, lexicon,
    analyzeQuestionCandidates:questions?analyzeQuestionCandidates:undefined,
    realizeQuestion:questions?realizeQuestion:undefined,
    parseComplementHeads, realizeComplement,
    readSubjectPronoun, readDeicticPronoun, expandSubjectPronoun, subjectPronounFor, subjectRole,
    connective: conjunction.and, wideNegation: conjunction.wideNegation,
    describe: () => ({ language: grammar.language, grammarVersion: grammar.version,
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
