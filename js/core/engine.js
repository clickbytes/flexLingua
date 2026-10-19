import { createDiscourse, createEventRelation, createInformationStructure, materializeEvent, validateMeaningGraph, MAX_DISCOURSE_EVENTS, QUESTION_VERSION, MODALITY_VERSION, STATE_VERSION, DIALOGUE_ACT_VERSION, PASSIVE_VERSION, CONDITIONAL_VERSION, validateCoreferenceMap, sameDiscourseReferent } from './meaning-graph.js';
import { createFeatureRegistry, record, safeName, hasOwn } from './features.js';
import { createCoreLanguage } from './core-language.js';
import { splitSentences } from './text.js';
import {EngineError, isResourceLimitError, toEngineError, pluginResultError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';
import {createResponsePlanner, RESPONSE_PLANNER_VERSION} from './response-planner.js';
import {createDialogueEngine as createDialogueEngineApi, DIALOGUE_ENGINE_VERSION}
  from './dialogue-engine.js';
import {applyPersonalityProfile, createPersonalityProfile, PERSONALITY_PROFILE_VERSION}
  from './personality.js';
import {LANGUAGE_PLUGIN_CONTRACT_VERSION, normalizeAnalysisResult, normalizeRealizationResult}
  from '../plugins/contract.js';
import {matchConceptGraphs} from './typed-graph-match.js';
import {composeMeaningGraph} from './semantic-composition.js';
import {ambiguousTranslation, distinctReadings, translationFailure, withUncertainties}
  from './translation-result.js';
import {realizeInterpretations} from './translation-interpretations.js';
import {validateReferentContext, applyReferentContext} from './translation-context.js';

const MAX_CANDIDATES = 16;

function searchLimit(search = {}) {
  const maxReadings = search?.maxReadings === undefined ? MAX_CANDIDATES : search.maxReadings;
  if (!record(search) || Object.keys(search).some(key => key !== 'maxReadings') ||
      !Number.isSafeInteger(maxReadings) || maxReadings < 1 || maxReadings > MAX_CANDIDATES) {
    throw new EngineError('INVALID_INPUT', 'Invalid semantic search budget.', {status:'invalid'});
  }
  return maxReadings;
}

function boundedCandidates(candidates, limit) {
  if (candidates.length > limit) {
    throw new EngineError('SEMANTIC_SEARCH_LIMIT',
      'Semantic search exceeded its reading budget; uniqueness is unknown.', {status:'resource_limit'});
  }
  return candidates;
}

/**
 * The natural-language discourse composer uses null-prototype dictionaries for
 * semantic entity IDs and role names. JSON.parse creates plain objects; after
 * validating untrusted CORE input, restore this same internal representation.
 * Never re-map unvalidated names through Object.prototype.
 */
function canonicalizeParsedCoreDocument(node) {
  if (node.type !== 'discourse') return node;
  const nullDictionary = source => Object.assign(Object.create(null), source);
  return {
    ...node,
    entities: nullDictionary(node.entities),
    events: node.events.map(event => ({
      ...event,
      roles: nullDictionary(event.roles)
    }))
  };
}

function assertCoreJsonDepth(text) {
  let depth=0, inString=false, escaped=false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped=false;
      else if (character==='\\') escaped=true;
      else if (character==='"') inString=false;
      continue;
    }
    if (character==='"') inString=true;
    else if (character==='{' || character==='[') {
      depth++;
      if (depth > RESOURCE_LIMITS.coreJsonDepth) {
        throw new EngineError('CORE_JSON_DEPTH_LIMIT',
          `CORE JSON nesting exceeds ${RESOURCE_LIMITS.coreJsonDepth} levels.`);
      }
    } else if (character==='}' || character===']') depth--;
  }
}

function assertSafeCoreJsonGraph(root) {
  const stack=[{value:root,depth:0}];
  let visited=0;
  while(stack.length) {
    const {value,depth}=stack.pop();
    if(++visited>RESOURCE_LIMITS.coreJsonNodes) {
      throw new EngineError('CORE_JSON_NODE_LIMIT',
        `CORE JSON exceeds ${RESOURCE_LIMITS.coreJsonNodes} values.`);
    }
    if(!value || typeof value!=='object')continue;
    if(depth>RESOURCE_LIMITS.coreJsonDepth) {
      throw new EngineError('CORE_JSON_DEPTH_LIMIT',
        `CORE JSON nesting exceeds ${RESOURCE_LIMITS.coreJsonDepth} levels.`);
    }
    const keys=Object.keys(value);
    if(keys.some(key=>['__proto__','prototype','constructor'].includes(key))) {
      throw new EngineError('CORE_JSON_UNSAFE_KEY','Unsafe CORE JSON key.');
    }
    for(let index=keys.length-1;index>=0;index--) {
      stack.push({value:value[keys[index]],depth:depth+1});
    }
  }
}

/** Collect semantic participants from bounded clause graphs for topic ranking. */
function participantsOf(node) {
  if (node?.type === 'question') return participantsOf(node.proposition);
  if (node?.type === 'scope' || node?.type === 'modality') return participantsOf(node.operand);
  if (node?.type === 'coordination') return node.clauses.flatMap(participantsOf);
  if (node?.type === 'complement') return [node.experiencer, ...participantsOf(node.content)];
  if (node?.type !== 'event') return [];
  const refs = Object.values(node.roles);
  return refs.flatMap(ref => [ref, ...(ref.relatives || []).flatMap(relative =>
    participantsOf({ type: 'event', roles: relative.event.roles }))]);
}


/** Stable semantic-role access despite structural modal and scope wrappers. */
function eventWithin(node) {
  if (node?.type === 'event') return node;
  if (['question','scope','modality'].includes(node?.type))
    return eventWithin(node.type==='question' ? node.proposition : node.operand);
  return null;
}

/** One semantic ontology and a registry of language-neutral LanguagePlugin providers. */
export class Engine {
  constructor(ontology, features, plugins, options = {}) {
    if (!plugins || typeof plugins.get !== 'function' || typeof plugins.list !== 'function') {
      throw new EngineError('PLUGIN_REGISTRY_INVALID', 'Engine requires a LanguagePlugin registry.');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some(key => key !== 'core')) {
      throw new EngineError('ENGINE_OPTIONS_INVALID', 'Engine options may contain only a shared CORE.');
    }
    const core = options.core ?? createCoreLanguage(ontology);
    if (!core || typeof core.resolve !== 'function' || !core.ontology) {
      throw new EngineError('CORE_LANGUAGE_INVALID', 'Engine requires a valid CORE language.');
    }
    this.core = core;
    this.ontology = this.core.ontology;
    this.features = createFeatureRegistry(features);
    this.plugins = plugins;
    this.responsePlanner = createResponsePlanner(this);
  }

  plugin(code) {
    try {
      return this.plugins.get(code);
    } catch (error) {
      throw toEngineError(error);
    }
  }

  /** Shared submodules still address a language by code; resolve it through the registry. */
  language(code) {
    return this.plugin(code);
  }

  morphology(language) {
    const provider = this.plugin(language).morphology;
    if (!provider) {
      throw new EngineError('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Morphology is unsupported for language ${language}.`, {status: 'unsupported'});
    }
    return provider;
  }

  morphologyAvailability({language,lexemeId,features,exact=true}) {
    return this.morphology(language).availability({lexemeId,features,exact});
  }

  inflect({language,lexemeId,features}) {
    return this.morphology(language).generate({lexemeId,features});
  }

  analyzeForm({language,text}) {
    return this.morphology(language).analyze({text});
  }

  inspectParadigm({language,lexemeId}) {
    return this.morphology(language).paradigm({lexemeId});
  }

  /**
   * Return every CORE sense licensed by the analyzed surface form. Explicit
   * topics only rank competing meanings; they never erase ambiguity. A caller
   * must inspect all readings unless it supplies a sense constraint.
   */
  resolveWord({language,text,context={}}) {
    const settings=this.validateContext(context);
    const plugin=this.plugin(language);
    const lexicon=plugin.lexicon;
    if(typeof lexicon?.get!=='function') {
      throw new EngineError('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Lexical lookup is unsupported for language ${language}.`, {status: 'unsupported'});
    }
    let readings=this.analyzeForm({language,text}).flatMap(analysis=>{
      const lex=lexicon.get(analysis.lexemeId);
      if(!lex)return [];
      return lex.senses.map(sense=>({
        ...analysis, senseId:sense.id, coreRef:sense.coreRef,
        score:(sense.priority||0)+(settings.topics||[]).reduce((n,topic)=>
          n+(sense.coreRef.kind==='concept' && this.ontology.relatedToTopic(sense.coreRef.id,topic)?10:0),0)
      }));
    }).filter(reading=>!settings.senses?.lexeme ||
      reading.coreRef.id===settings.senses.lexeme);
    if(settings.typedGraph===undefined) return readings.sort((a,b)=>b.score-a.score);
    if(!readings.length) return readings;

    const conceptIds=[...new Set(readings.filter(reading=>reading.coreRef.kind==='concept')
      .map(reading=>reading.coreRef.id))];
    const nonConceptReadings=readings.filter(reading=>reading.coreRef.kind!=='concept');
    if(!conceptIds.length) {
      throw new EngineError('TYPED_GRAPH_UNSUPPORTED',
        'Typed graph context cannot adjudicate this non-concept lexical reference.',
        {status:'unsupported',diagnostics:[{code:'TYPED_GRAPH_UNSUPPORTED',
          message:'Typed graph context requires concept-based lexical senses.'}]});
    }
    const match=matchConceptGraphs({observed:settings.typedGraph,candidates:conceptIds,
      ontology:this.ontology});
    const matchedById=new Map(match.candidates.map(item=>[item.conceptId,item]));
    const readingStatus=nonConceptReadings.length ? 'ambiguous' : match.status;
    readings=readings.filter(reading=>reading.coreRef.kind!=='concept' ||
      matchedById.get(reading.coreRef.id)?.compatible).map(reading=>{
        if(reading.coreRef.kind!=='concept') {
          return {...reading,graphMatch:{status:'unresolved',compatible:true,score:0,
            matchedRelations:[],unresolved:['non-concept core reference']}};
        }
        const candidate=matchedById.get(reading.coreRef.id);
        return {...reading,graphMatch:{status:readingStatus,compatible:candidate.compatible,
          score:candidate.score,matchedRelations:candidate.matchedRelations,
          hardViolations:candidate.hardViolations,unresolved:candidate.unresolved}};
      });
    if(match.status==='unsupported' && nonConceptReadings.length===0) {
      throw new EngineError('TYPED_GRAPH_NO_MATCH',match.diagnostics[0].message,
        {status:'unsupported',diagnostics:match.diagnostics});
    }
    const matchedRequiredCount=reading=>(reading.graphMatch?.matchedRelations||[])
      .filter(edge=>edge.constraint==='required').length;
    return readings.sort((left,right)=>matchedRequiredCount(right)-matchedRequiredCount(left) ||
      (right.graphMatch?.score||0)-(left.graphMatch?.score||0) ||
      (right.score||0)-(left.score||0) ||
      (left.coreRef.id < right.coreRef.id ? -1 : left.coreRef.id > right.coreRef.id ? 1 : 0) ||
      (left.senseId < right.senseId ? -1 : left.senseId > right.senseId ? 1 : 0));
  }

  /** Query a validated language lexicon without bypassing CORE references. */
  lookupLexemes({ language, lemma }) {
    if (typeof lemma !== 'string' || !lemma.trim()) throw new Error('Invalid lemma query.');
    const lexicon=this.plugin(language).lexicon;
    const lookup = lexicon?.lookup;
    if(typeof lookup!=='function') {
      throw new EngineError('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Lexical lookup is unsupported for language ${language}.`, {status: 'unsupported'});
    }
    return lookup.call(lexicon, lemma);
  }

  /** Reverse lexical lookup by an exact CORE reference (including parameters). */
  lexemesForCore({ language, coreRef }) {
    this.core.resolve(coreRef);
    const lexicon=this.plugin(language).lexicon;
    if(typeof lexicon?.forCore!=='function') {
      throw new EngineError('PLUGIN_CAPABILITY_UNAVAILABLE',
        `CORE lexical lookup is unsupported for language ${language}.`, {status: 'unsupported'});
    }
    return lexicon.forCore(coreRef);
  }

  resolveCoreRef(ref) { return this.core.resolve(ref); }

  /** Return a read-only typed graph view while preserving the MeaningGraph wire contract. */
  projectMeaningGraph(meaning, {limits} = {}) {
    validateMeaningGraph(meaning,this.ontology,this.features);
    return composeMeaningGraph({meaning,core:this.core,limits});
  }

  /** Build a deterministic response plan using only explicitly supplied CORE facts. */
  planResponse(request) {
    return this.responsePlanner.plan(request);
  }

  /** Plan a response in CORE, then realize its proposition with the selected language plugin. */
  respond({question,facts,clarifyQuestion,to,profile,referenceContext}={}) {
    const personality=createPersonalityProfile(profile);
    if (typeof to !== 'string' || !to) {
      throw new Error(`Unsupported response language: ${to}`);
    }
    if(to!=='core')this.plugin(to);
    const plan = this.planResponse({question,facts,clarifyQuestion,referenceContext});
    if (!plan.realization) {
      return {plan,text:null,warnings:[],alternatives:[],informationLoss:[],diagnostics:[]};
    }
    const output = this.realize({interlingua:plan.realization,to,profile:personality});
    return {plan,text:output.text,warnings:[...(output.warnings||[])],
      alternatives:[...(output.alternatives||[])],
      informationLoss:[...(output.informationLoss||[])],
      diagnostics:[...(output.diagnostics||[])]};
  }

  /** Create a multi-turn orchestration facade over this Engine. */
  createDialogueEngine() {
    return createDialogueEngineApi(this);
  }

  validatePersonalityProfile(profile) {
    return createPersonalityProfile(profile);
  }

  validateContext(context = {}) {
    validateReferentContext(context, this.ontology);
    if (context.topics !== undefined && (!Array.isArray(context.topics) || context.topics.length > 8 ||
        context.topics.some(topic => !this.ontology.get(topic)))) {
      throw new EngineError('INVALID_INPUT','Invalid semantic context topics.',{status:'invalid'});
    }
    if (context.coreference !== undefined) validateCoreferenceMap(context.coreference);
    if(context.eventRelations!==undefined && (!Array.isArray(context.eventRelations) ||
        context.eventRelations.length>MAX_DISCOURSE_EVENTS*2 ||
        context.eventRelations.some(relation=>!record(relation) ||
          Object.keys(relation).sort().join(',')!=='from,to,type' ||
          typeof relation.from!=='string' || !/^e[1-8]$/u.test(relation.from) ||
          typeof relation.to!=='string' || !/^e[1-8]$/u.test(relation.to)))) {
      throw new EngineError('INVALID_INPUT','Invalid explicit event relation context.',{status:'invalid'});
    }
    if (context.senses !== undefined && (!record(context.senses) ||
        Object.entries(context.senses).some(([role, concept]) =>
          !safeName(role) || !this.ontology.get(concept)))) {
      throw new EngineError('INVALID_INPUT','Invalid semantic sense constraints.',{status:'invalid'});
    }
    return context;
  }

  pluginAnalysisCandidates(plugin, text, context = {}) {
    try {
      if (typeof plugin?.analyze !== 'function') {
        throw new EngineError('PLUGIN_CAPABILITY_UNAVAILABLE',
          `Sentence analysis is unsupported for language ${plugin?.code || 'unknown'}.`,
          {status: 'unsupported'});
      }
      const result = normalizeAnalysisResult(plugin.analyze({text, context}));
      if (!['ok', 'ambiguous'].includes(result.status)) {
        throw pluginResultError(result, 'analysis');
      }
      return distinctReadings(result.readings.map(reading => ({
        interlingua: reading.meaning,
        lexicalSenses: reading.analysis?.lexicalSenses || {},
        sourceSegments:reading.analysis?.sourceSegments||[],
        ...(reading.analysis?.surface ? {surface:reading.analysis.surface} : {}),
        lexicalPreference: Number.isFinite(reading.analysis?.score) ? reading.analysis.score : 0,
        score: Number.isFinite(reading.analysis?.score) ? reading.analysis.score : 0
      })));
    } catch (error) {
      throw toEngineError(error);
    }
  }

  pluginRealization(plugin, meaning, context = {}, {includeSegments=false,sourceSegments=[],
    omitDeicticSubject=false} = {}) {
    try {
      if (typeof plugin?.realize !== 'function') {
        throw new EngineError('PLUGIN_CAPABILITY_UNAVAILABLE',
          `Sentence realization is unsupported for language ${plugin?.code || 'unknown'}.`,
          {status: 'unsupported'});
      }
      const result = normalizeRealizationResult(plugin.realize({meaning,context,
        ...(includeSegments?{includeSegments:true,sourceSegments}: {})}));
      if (result.status !== 'ok') throw pluginResultError(result, 'realization');
      return result;
    } catch (error) {
      throw toEngineError(error);
    }
  }

  analyzeSentence(sentence, plugin, pluginContext = {}) {
    return this.pluginAnalysisCandidates(plugin, sentence.trim(), pluginContext);
  }

  /**
   * Returns distinct meanings, never just spelling variants. Context is explicit:
   * {senses: {theme: 'place.riverbank'}} filters; {topics:['place.river']} boosts.
   */
  analyzeCandidates({ text, from, context = {}, search }) {
    const limit = searchLimit(search);
    const settings = this.validateContext(context);
    if (from === 'core') {
      if (typeof text !== 'string') {
        throw new EngineError('CORE_JSON_TYPE_INVALID','CORE JSON input must be a string.');
      }
      if (text.length > RESOURCE_LIMITS.coreJsonCodeUnits) {
        throw new EngineError('CORE_JSON_SIZE_LIMIT','Invalid CORE JSON document size.');
      }
      if (settings.coreference !== undefined) {
        throw new EngineError('INVALID_COREFERENCE',
          'Explicit coreference cannot be applied to a CORE JSON document.');
      }
      if(settings.eventRelations?.length)
        throw new EngineError('CORE_JSON_CONTEXT_INVALID',
          'Event relations are part of the CORE document, not analysis context.');
      if (Object.keys(settings.senses || {}).length || (settings.topics || []).length) {
        throw new EngineError('CORE_JSON_CONTEXT_INVALID',
          'CORE documents do not need source-language sense disambiguation.');
      }
      assertCoreJsonDepth(text);
      let meaning;
      try { meaning = JSON.parse(text); }
      catch (error) {
        throw new EngineError('CORE_JSON_INVALID','Invalid CORE JSON document.',{cause:error});
      }
      assertSafeCoreJsonGraph(meaning);
      try { validateMeaningGraph(meaning, this.ontology, this.features); }
      catch (error) {
        if(isResourceLimitError(error))throw error;
        throw new EngineError('CORE_SCHEMA_INVALID',error.message,{cause:error});
      }
      // JSON serialization drops null prototypes; restore the canonical wire graph.
      meaning = canonicalizeParsedCoreDocument(meaning);
      return applyReferentContext([{interlingua:meaning, lexicalSenses:{}, score:0}],settings,this.ontology);
    }
    if(typeof text==='string' && text.length>RESOURCE_LIMITS.sourceTextCodeUnits) {
      throw new EngineError('SOURCE_TEXT_SIZE_LIMIT',
        `Source text exceeds ${RESOURCE_LIMITS.sourceTextCodeUnits} UTF-16 code units.`);
    }
    const plugin = this.plugin(from);
    if(typeof text==='string'&&text.includes('?')) {
      if (settings.coreference !== undefined)
        throw new Error('Explicit discourse coreference is not supported in questions.');
      if(!/^[^.!?]+\?$/u.test(text.trim())) {
        throw new Error('Only simple sentences with a single final question mark are supported; mixed question discourse or punctuation is unsupported.');
      }
      const readings=this.pluginAnalysisCandidates(plugin,text,
        settings.construction ? {construction: settings.construction} : {});
      const candidates=distinctReadings(applyReferentContext(readings.filter(candidate=>
        candidate.interlingua.type==='question' &&
        Object.entries(settings.senses||{}).every(([role,concept])=>
          eventWithin(candidate.interlingua)?.roles?.[role]?.concept===concept))
        .map(candidate=>({...candidate,score:(candidate.score||0)+
          (settings.topics||[]).reduce((sum,topic)=>sum+
            participantsOf(candidate.interlingua).filter(ref=>ref.concept).filter(ref=>
              this.ontology.relatedToTopic(ref.concept,topic)).length*10,0)}))
        .sort((a,b)=>b.score-a.score),settings,this.ontology));
      candidates.sort((a,b)=>b.score-a.score);
      boundedCandidates(candidates, limit);
      if(!candidates.length)throw new Error('No semantic question reading matches context constraints.');
      return candidates.map(candidate=>{
        validateMeaningGraph(candidate.interlingua,this.ontology,this.features);
        return candidate;
      });
    }
    const sentences = splitSentences(text, MAX_DISCOURSE_EVENTS);
    if (sentences.length > 1 && (settings.bindings !== undefined || settings.facts !== undefined)) {
      throw new EngineError('INVALID_INPUT','Referent context currently requires one sentence.',{status:'invalid'});
    }
    if(settings.eventRelations?.length && sentences.length<2)
      throw new Error('Explicit event relations require a multi-event discourse.');
    if (settings.coreference !== undefined && sentences.length === 1)
      throw new Error('Explicit coreference requires at least two discourse sentences.');
    if (sentences.length > 1 && Object.keys(settings.senses || {}).length) {
      throw new Error('Role-specific sense constraints currently require a single sentence.');
    }
    const scored = sentences.map(sentence => {
      const raw = this.analyzeSentence(sentence, plugin,
        settings.construction ? {construction: settings.construction} : {});
      const candidates = raw.filter(candidate => Object.entries(settings.senses || {})
        .every(([role, concept]) => eventWithin(candidate.interlingua)?.roles?.[role]?.concept === concept))
        .map(candidate => ({ ...candidate, score: (candidate.score || 0) +
          (settings.topics || []).reduce((sum, topic) => sum +
            participantsOf(candidate.interlingua).filter(ref => ref.concept).filter(ref =>
              this.ontology.relatedToTopic(ref.concept, topic)).length * 10, 0) }));
      if (!candidates.length) {
        throw new Error('No semantic reading matches the context constraints.');
      }
      const contextual=distinctReadings(applyReferentContext(
        candidates.sort((a, b) => b.score - a.score),settings,this.ontology));
      return boundedCandidates(contextual, limit);
    });
    if (scored.length === 1) {
      return scored[0].map(candidate => {
        validateMeaningGraph(candidate.interlingua, this.ontology, this.features);
        return candidate;
      });
    }
    if (scored.some(candidates => candidates.some(c => c.interlingua.type !== 'event'))) {
      throw new Error('Mixed multi-sentence coordination is not supported in v0.6.');
    }
    const links=validateCoreferenceMap(settings.coreference || {},scored.length);
    // Check role identifiers before semantic search to distinguish a typo from
    // a genuine conflict between distinct interpretations of a known noun.
    for (const link of links) {
      if (!scored[link.sourceIndex].some(c=>hasOwn(c.interlingua.roles,link.sourceRole))) {
        throw new Error('Unknown discourse coreference source role: '+link.source+'.');
      }
      if (!scored[link.targetIndex].some(c=>hasOwn(c.interlingua.roles,link.targetRole))) {
        throw new Error('Unknown earlier discourse coreference target role: '+link.target+'.');
      }
    }
    // Check hard compatibility before the bound; never silently discard viable paths.
    let combinations = [{ events: [], senses: {}, score: 0, lexicalPreference:0 }];
    for (const [index, candidates] of scored.entries()) {
      const matchingLinks=links.filter(link=>link.sourceIndex===index);
      combinations = combinations.flatMap(combination => candidates.flatMap(candidate => {
        const events=[...combination.events,candidate.interlingua];
        if (!matchingLinks.every(link=>
          hasOwn(events[link.sourceIndex].roles,link.sourceRole) &&
          hasOwn(events[link.targetIndex].roles,link.targetRole) &&
          sameDiscourseReferent(events[link.sourceIndex].roles[link.sourceRole],
            events[link.targetIndex].roles[link.targetRole]))) return [];
        return [{
          events,
          senses:{...combination.senses,[`e${index + 1}`]:candidate.lexicalSenses},
          score:combination.score+(candidate.score||0),
          lexicalPreference:combination.lexicalPreference+(candidate.lexicalPreference||0)
        }];
      })).sort((a,b)=>b.score-a.score);
      boundedCandidates(combinations, limit);
      if (!combinations.length) {
        throw new Error('No semantic reading satisfies explicit coreference links: '+
          links.map(link=>link.source+' → '+link.target).join(', ')+'.');
      }
    }
    return combinations.map(combination => {
      const interlingua = createDiscourse(combination.events,
        {coreference:settings.coreference || {},
          relations:(settings.eventRelations||[]).map(edge=>
            createEventRelation(edge.type,edge.from,edge.to))});
      validateMeaningGraph(interlingua, this.ontology, this.features);
      return { interlingua, lexicalSenses: combination.senses, score: combination.score,
        lexicalPreference:combination.lexicalPreference };
    });
  }

  /** Return a meaning only when analysis uniquely identifies it. */
  analyze({ text, from, context, search }) {
    const readings = distinctReadings(this.analyzeCandidates({text, from, context, search}));
    if (readings.length !== 1) {
      const result = ambiguousTranslation(readings);
      const error = new EngineError('AMBIGUOUS_MEANING', result.diagnostics[0].message,
        {status: 'ambiguous', diagnostics: result.diagnostics});
      error.result = result;
      throw error;
    }
    return readings[0].interlingua;
  }

  realize({ interlingua, to, pronounRealization='repeat', profile,
    lexicalRegister='neutral',informationStructure,construction,subjectPronoun,
    includeSegments=false,sourceSegments=[],omitDeicticSubject=false }) {
    const personality=createPersonalityProfile(profile);
    if (profile !== undefined) pronounRealization=personality.realization.pronounRealization;
    if(!['repeat','safe'].includes(pronounRealization))
      throw new EngineError('INVALID_INPUT','Invalid pronoun realization policy.',{status:'invalid'});
    if(!['neutral','formal','plain'].includes(lexicalRegister))
      throw new EngineError('INVALID_INPUT','Invalid lexical register.',{status:'invalid'});
    if(typeof includeSegments!=='boolean'||!Array.isArray(sourceSegments)||sourceSegments.length>64||
        typeof omitDeicticSubject!=='boolean')
      throw new EngineError('INVALID_INPUT','Invalid segment request.',{status:'invalid'});
    validateMeaningGraph(interlingua, this.ontology, this.features);
    if(informationStructure!==undefined) {
      if(!record(informationStructure)||Object.keys(informationStructure).length!==2||
          !hasOwn(informationStructure,'topic')||!hasOwn(informationStructure,'focus')) {
        throw new EngineError('INVALID_INPUT','Invalid information structure.',{status:'invalid'});
      }
      const expected=createInformationStructure(interlingua,informationStructure);
      if(informationStructure.topic!==expected.topic ||
          informationStructure.focus!==expected.focus)
        throw new EngineError('INVALID_INPUT','Invalid information structure.',{status:'invalid'});
    }
    if (to === 'core') {
      return {text:JSON.stringify(interlingua,null,2),warnings:[],alternatives:[],
        informationLoss:[],diagnostics:[],interlingua};
    }
    const plugin=this.plugin(to);
    const context={lexicalRegister,omitDeicticSubject,
      ...(construction===undefined?{}:{construction}),
      ...(subjectPronoun===undefined?{}:{subjectPronoun}),
      ...(informationStructure===undefined?{}:{informationStructure})};
    try {
      const output=this.pluginRealization(plugin,interlingua,context,
        {includeSegments,sourceSegments,omitDeicticSubject});
      return applyPersonalityProfile({...output,interlingua},personality);
    } catch(error) {
      if(interlingua.type!=='discourse' || error?.status!=='unsupported')throw error;
    }
    const parts=interlingua.events.map(event=>this.pluginRealization(plugin,
      materializeEvent(interlingua,event),context,{includeSegments,sourceSegments,omitDeicticSubject}));
    const warnings=parts.flatMap((part,index)=>(part.warnings||[])
      .map(warning=>'Event '+(index+1)+': '+warning));
    const diagnostics=parts.flatMap(part=>part.diagnostics||[]);
    if(pronounRealization==='safe' && interlingua.events.length>1) {
      warnings.push('Safe discourse pronouns are not declared by this plugin; noun phrases were repeated.');
    }
    return applyPersonalityProfile({status:'ok',
      text:parts.map(part=>part.text).join(' '),interlingua,warnings,alternatives:[],
      informationLoss:parts.flatMap(part=>part.informationLoss||[]),diagnostics},personality);
  }

  /** Stable discovery view built from registered LanguagePlugins and their providers. */
  capabilities() {
    const languages=this.plugins.list().map(code=>{
      const plugin=this.plugin(code);
      const declarations=plugin.capabilities();
      const implemented=(channel,operation)=>declarations.some(item=>
        item.channel===channel && item.operation===operation && item.status==='implemented');
      return {
        code,
        ...plugin.describe(),
        capabilities:declarations,
        runtimeCapabilities:{
          parsing:implemented('sentence','analyze'),
          realization:implemented('sentence','realize'),
          questions:declarations.some(item=>item.channel==='sentence' &&
            item.status==='implemented' && /question|interrogative/iu.test(item.construction)),
          morphology:!!plugin.morphology,
          lexicon:!!plugin.lexicon,
          signal:!!plugin.signal
        }
      };
    });
    return { interlinguaVersion: '1.0', questionDocumentVersion: QUESTION_VERSION,
      eventRelationDocumentVersion: '1.28',
      passiveEventDocumentVersion: PASSIVE_VERSION,
      conditionalDocumentVersion: CONDITIONAL_VERSION,
      dialogueActDocumentVersion: DIALOGUE_ACT_VERSION,
      responsePlannerVersion: RESPONSE_PLANNER_VERSION,
      dialogueEngineVersion: DIALOGUE_ENGINE_VERSION,
      personalityProfileVersion: PERSONALITY_PROFILE_VERSION,
      languagePluginContractVersion:LANGUAGE_PLUGIN_CONTRACT_VERSION,
      modalityDocumentVersion: MODALITY_VERSION, stateDocumentVersion: STATE_VERSION,
      stateFrameVersion: this.ontology.stateFrameVersion,
      coreLanguage: {code:'core', version:this.core.version, format:'interlingua-json'},
      languages };
  }

  /** Safe entry point for UIs: malformed input is a result, not an unhandled exception. */
  tryTranslate(request) {
    try {
      const value = this.translate(request);
      if (value.status === 'ok') return {ok: true, value};
      return {ok: false, value, error: {status: value.status,
        code: value.diagnostics[0]?.code, message: value.diagnostics[0]?.message,
        diagnostics: value.diagnostics, uncertainties: value.uncertainties}};
    }
    catch (error) {
      return {ok: false, error: {code: 'INFRASTRUCTURE_ERROR', status: 'error',
        message: 'Translation infrastructure failed.'}};
    }
  }

  translate({ text, from, to, context, search, pronounRealization='repeat', profile,
    lexicalRegister='neutral',informationStructure,includeSegments=false,previewId } = {}) {
    try {
      const candidates = distinctReadings(this.analyzeCandidates({text, from, context, search}));
      const bundle = realizeInterpretations(this, candidates, {to, context,
        pronounRealization, profile, lexicalRegister, informationStructure,includeSegments,previewId});
      const attach = result => ({...result, interpretations:bundle.interpretations,
        previewId:bundle.previewId,preview:bundle.preview,
        ...(candidates[0]?.contextReport ? {contextReport:candidates[0].contextReport} : {})});
      if (bundle.limitError) return attach(translationFailure(bundle.limitError));
      if (candidates.length !== 1) return attach(ambiguousTranslation(candidates));
      const candidate = candidates[0];
      const meaning = candidate.interlingua;
      const {output, error} = bundle.outputs[0];
      if (error) return attach(translationFailure(error));
      const warnings = [...(output.warnings ?? [])];
      const anaphoraItems = candidate.anaphoraTrace ||
        (candidate.anaphora ? [{...candidate.anaphora, event: 2}] : []);
      for (const item of anaphoraItems) {
        if (!output.pronounizedEvents?.includes(item.event)) {
          warnings.push('Source subject pronoun ' + item.sourcePronoun +
            ' was linked to ' + item.antecedent +
            '; target repeats the noun phrase (safe pronoun realization was not selected or licensed).');
        }
      }
      return attach(withUncertainties({...output, status: 'ok', meaning, warnings,
        lexicalSenses: candidate.lexicalSenses, semanticAlternatives: []}));
    } catch (error) {
      return translationFailure(error);
    }
  }
}
