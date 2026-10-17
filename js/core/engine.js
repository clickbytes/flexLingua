import { createDiscourse, createEventRelation, createCoordination, createNegation, createComplement, createConditional, createInformationStructure, materializeEvent, validateInterlingua, MAX_DISCOURSE_EVENTS, QUESTION_VERSION, MODALITY_VERSION, STATE_VERSION, DIALOGUE_ACT_VERSION, PASSIVE_VERSION, CONDITIONAL_VERSION, validateCoreferenceMap, sameDiscourseReferent } from './interlingua.js';
import { createFeatureRegistry, record, safeName, hasOwn } from './features.js';
import { createCoreLanguage } from './core-language.js';
import { splitSentences, sentenceText } from './text.js';
import {EngineError, isResourceLimitError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';
import {createResponsePlanner, RESPONSE_PLANNER_VERSION} from './response-planner.js';
import {createDialogueEngine as createDialogueEngineApi, DIALOGUE_ENGINE_VERSION}
  from './dialogue-engine.js';
import {applyPersonalityProfile, createPersonalityProfile, PERSONALITY_PROFILE_VERSION}
  from './personality.js';
import {validateLanguageAdapter,validateMorphologyAdapter,
  LANGUAGE_ADAPTER_CONTRACT_VERSION,MORPHOLOGY_ADAPTER_CONTRACT_VERSION}
  from './adapter-contract.js';

const MAX_CANDIDATES = 16;

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

/** One semantic ontology, N language-neutral grammar adapters and independent JSON lexicons. */
export class Engine {
  constructor(ontology, features) {
    this.core = createCoreLanguage(ontology);
    this.ontology = this.core.ontology;
    this.features = createFeatureRegistry(features);
    this.languages = new Map();
    this.morphologies = new Map();
    this.responsePlanner = createResponsePlanner(this);
  }

  registerLanguage(adapter) {
    validateLanguageAdapter(adapter);
    if (this.languages.has(adapter.code)) throw new Error(`Duplicate language: ${adapter.code}`);
    if (typeof adapter.validateOntology === 'function') {
      adapter.validateOntology(this.ontology, this.features, this.core);
    }
    this.languages.set(adapter.code, adapter);
    return this;
  }

  /** Morphology has its own adapter contract and need not implement sentence syntax. */
  registerMorphology(adapter) {
    validateMorphologyAdapter(adapter);
    if (this.morphologies.has(adapter.language)) throw new Error(`Duplicate morphology: ${adapter.language}`);
    if (!adapter.lexicon?.validateCore(this.core)) throw new Error('Unvalidated morphology CORE lexicon.');
    this.morphologies.set(adapter.language, adapter);
    return this;
  }

  morphology(language) {
    const adapter = this.morphologies.get(language);
    if (!adapter) throw new Error(`Unsupported morphology language: ${language}`);
    return adapter;
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
    return this.analyzeForm({language,text}).flatMap(analysis=>{
      const lex=this.morphology(language).lexicon.get(analysis.lexemeId);
      return lex.senses.map(sense=>({
        ...analysis, senseId:sense.id, coreRef:sense.coreRef,
        score:(sense.priority||0)+(settings.topics||[]).reduce((n,topic)=>
          n+(sense.coreRef.kind==='concept' && this.ontology.relatedToTopic(sense.coreRef.id,topic)?10:0),0)
      }));
    }).filter(reading=>!settings.senses?.lexeme ||
      reading.coreRef.id===settings.senses.lexeme).sort((a,b)=>b.score-a.score);
  }

  language(code) {
    const adapter = this.languages.get(code);
    if (!adapter) throw new Error(`Unsupported language: ${code}`);
    return adapter;
  }

  /** Query a validated language lexicon without bypassing CORE references. */
  lookupLexemes({ language, lemma }) {
    if (typeof lemma !== 'string' || !lemma.trim()) throw new Error('Invalid lemma query.');
    const index = this.language(language).lexicon;
    return index ? index.lookup(lemma) : [];
  }

  /** Reverse lexical lookup by an exact CORE reference (including parameters). */
  lexemesForCore({ language, coreRef }) {
    this.core.resolve(coreRef);
    const index = this.language(language).lexicon;
    return index ? index.forCore(coreRef) : [];
  }

  resolveCoreRef(ref) { return this.core.resolve(ref); }

  /** Build a deterministic response plan using only explicitly supplied CORE facts. */
  planResponse(request) {
    return this.responsePlanner.plan(request);
  }

  /** Plan a response in CORE, then realize its proposition with the selected language adapter. */
  respond({question,facts,clarifyQuestion,to,profile,referenceContext}={}) {
    const personality=createPersonalityProfile(profile);
    if (typeof to !== 'string' || (to !== 'core' && !this.languages.has(to))) {
      throw new Error(`Unsupported response language: ${to}`);
    }
    const plan = this.planResponse({question,facts,clarifyQuestion,referenceContext});
    if (!plan.realization) {
      return {plan,text:null,warnings:[],alternatives:[]};
    }
    const output = this.realize({interlingua:plan.realization,to,profile:personality});
    const style=personality.realization.replyStyles[to]||'standard';
    const adapter=to==='core'?null:this.language(to);
    const styled=adapter?.styleReply ? adapter.styleReply(output,style) : output;
    return {plan,text:styled.text,warnings:[...(styled.warnings||[])],
      alternatives:[...(styled.alternatives||[])]};
  }

  /** Create a multi-turn orchestration facade over this Engine. */
  createDialogueEngine() {
    return createDialogueEngineApi(this);
  }

  validatePersonalityProfile(profile) {
    return createPersonalityProfile(profile);
  }

  validateContext(context = {}) {
    if (!record(context)) throw new Error('Invalid analysis context.');
    if (context.topics !== undefined && (!Array.isArray(context.topics) || context.topics.length > 8 ||
        context.topics.some(topic => !this.ontology.get(topic)))) {
      throw new Error('Invalid semantic context topics.');
    }
    if (context.coreference !== undefined) validateCoreferenceMap(context.coreference);
    if(context.eventRelations!==undefined && (!Array.isArray(context.eventRelations) ||
        context.eventRelations.length>MAX_DISCOURSE_EVENTS*2 ||
        context.eventRelations.some(relation=>!record(relation) ||
          Object.keys(relation).sort().join(',')!=='from,to,type' ||
          typeof relation.from!=='string' || !/^e[1-8]$/u.test(relation.from) ||
          typeof relation.to!=='string' || !/^e[1-8]$/u.test(relation.to)))) {
      throw new Error('Invalid explicit event relation context.');
    }
    if (context.senses !== undefined && (!record(context.senses) ||
        Object.entries(context.senses).some(([role, concept]) =>
          !safeName(role) || !this.ontology.get(concept)))) {
      throw new Error('Invalid semantic sense constraints.');
    }
    return context;
  }

  /**
   * E2a: only a subject pronoun in the second of two sentences. Every possible
   * source-language reading must identify the same single antecedent mention.
   * Pronoun expansion is syntactic; CORE records a shared entity, never a fake
   * pronoun concept. A lexical noun renders in the target until E2b.
   */
  analyzeAnaphoricPair(sentences,adapter,settings) {
    const pronoun=adapter.readSubjectPronoun?.(sentences[1]);
    if(!pronoun || sentences.length!==2)throw new Error('Unsupported anaphora discourse shape.');
    const first=this.analyzeSentence(sentences[0],adapter).filter(item=>
      item.interlingua?.type==='event');
    if(!first.length)throw new Error('Unresolved anaphora: first clause is not a supported event.');
    const hypotheses=first.flatMap(item=>Object.entries(item.interlingua.roles)
      .filter(([,ref])=>!hasOwn(ref,'referent') && ref.features?.number==='singular' &&
        this.ontology.isA(ref.concept,'person') && adapter.subjectPronounFor?.(ref,this.ontology)===pronoun.text)
      .map(([role,ref])=>({item,role,ref})));
    if(!hypotheses.length)throw new Error('Unresolved anaphora: no compatible antecedent for '+
      pronoun.text+'.');
    const unique=[];
    for(const h of hypotheses){
      if(!unique.some(x=>x.role===h.role && sameDiscourseReferent(x.ref,h.ref)))
        unique.push(h);
    }
    if(unique.length!==1)throw new Error('Ambiguous anaphora: '+pronoun.text+
      ' matches multiple possible antecedents.');
    const selected=unique[0];
    const readings=[];
    for(const h of hypotheses){
      if(h.role!==selected.role || !sameDiscourseReferent(h.ref,selected.ref))continue;
      const expanded=adapter.expandSubjectPronoun(sentences[1],h.ref,this.ontology);
      const parsed=this.analyzeSentence(expanded,adapter).filter(item=>
        item.interlingua?.type==='event' &&
        item.interlingua.roles?.[adapter.subjectRole]?.concept===h.ref.concept);
      for(const second of parsed){
        const normalized={...second.interlingua,
          roles:{...second.interlingua.roles,[adapter.subjectRole]:h.ref}};
        const coreference={['e2.'+adapter.subjectRole]:'e1.'+h.role};
        const meaning=createDiscourse([h.item.interlingua,normalized],{coreference});
        validateInterlingua(meaning,this.ontology,this.features);
        readings.push({interlingua:meaning,
          lexicalSenses:{e1:h.item.lexicalSenses,e2:second.lexicalSenses},
          score:(h.item.score||0)+(second.score||0),
          anaphora:{sourcePronoun:pronoun.text,antecedent:'e1.'+h.role}});
      }
    }
    if(!readings.length)throw new Error('Unresolved anaphora: expanded clause has no valid grammatical reading.');
    return readings.sort((a,b)=>b.score-a.score).slice(0,MAX_CANDIDATES);
  }

  /**
   * E3: compose 3–8 independent clauses using a bounded beam. A source
   * pronoun must match precisely one distinct prior CORE entity; multiple
   * mentions of the same previously linked entity count only once.
   */
  analyzeAnaphoricDiscourse(sentences,adapter,settings={}) {
    if(sentences.length<3 || sentences.length>MAX_DISCOURSE_EVENTS)
      throw new Error('Unsupported anaphora discourse length.');
    const rootOf=(mention,links)=>{
      let at=mention;
      for(let n=0;n<MAX_DISCOURSE_EVENTS;n++){
        if(!hasOwn(links,at))return at;
        at=links[at];
      }
      throw new Error('Unresolved anaphora: invalid reference chain.');
    };
    const antecedents=(state,pronoun)=>{
      const unique=new Map();
      for(const [index,event] of state.events.entries()){
        for(const [role,ref] of Object.entries(event.roles)){
          if(hasOwn(ref,'referent') || ref.features?.number!=='singular' ||
             !this.ontology.isA(ref.concept,'person') ||
             adapter.subjectPronounFor?.(ref,this.ontology)!==pronoun.text)continue;
          const root=rootOf('e'+(index+1)+'.'+role,state.links);
          if(!unique.has(root))unique.set(root,{root,ref});
        }
      }
      return [...unique.values()];
    };
    const scoreOf=item=>(item.score||0)+(settings.topics||[]).reduce(
      (sum,topic)=>sum+participantsOf(item.interlingua).filter(ref=>
        this.ontology.relatedToTopic(ref.concept,topic)).length*10,0);
    let states=[{events:[],links:{},lexicalSenses:{},score:0,trace:[]}];
    for(const [index,text] of sentences.entries()){
      const pronoun=adapter.readSubjectPronoun?.(text);
      const candidates=[];
      if(!pronoun){
        const parsed=this.analyzeSentence(text,adapter)
          .filter(item=>item.interlingua?.type==='event');
        if(!parsed.length)throw new Error('Unsupported anaphora: discourse requires event clauses.');
        for(const state of states)for(const item of parsed){
          candidates.push({
            events:[...state.events,item.interlingua],
            links:state.links,
            lexicalSenses:{...state.lexicalSenses,['e'+(index+1)]:item.lexicalSenses},
            score:state.score+scoreOf(item),trace:state.trace
          });
        }
      } else {
        if(index===0)throw new Error('Unresolved anaphora: first sentence has no antecedent.');
        const alternatives=states.flatMap(state=>antecedents(state,pronoun));
        const distinct=[];
        for(const option of alternatives){
          if(!distinct.some(other=>other.root===option.root &&
              sameDiscourseReferent(other.ref,option.ref)))distinct.push(option);
        }
        if(!distinct.length)throw new Error('Unresolved anaphora: no compatible prior entity for '+pronoun.text+'.');
        if(distinct.length!==1)throw new Error('Ambiguous anaphora: '+pronoun.text+
          ' matches multiple independent earlier entities.');
        const selected=distinct[0];
        for(const state of states){
          const match=antecedents(state,pronoun).find(item=>
            item.root===selected.root && sameDiscourseReferent(item.ref,selected.ref));
          if(!match)continue;
          const expanded=adapter.expandSubjectPronoun(text,match.ref,this.ontology);
          const parsed=this.analyzeSentence(expanded,adapter).filter(item=>
            item.interlingua?.type==='event' &&
            item.interlingua.roles?.[adapter.subjectRole]?.concept===match.ref.concept);
          for(const item of parsed){
            const normalized={...item.interlingua,roles:{
              ...item.interlingua.roles,[adapter.subjectRole]:match.ref}};
            candidates.push({
              events:[...state.events,normalized],
              links:{...state.links,['e'+(index+1)+'.'+adapter.subjectRole]:match.root},
              lexicalSenses:{...state.lexicalSenses,['e'+(index+1)]:item.lexicalSenses},
              score:state.score+scoreOf(item),
              trace:[...state.trace,{sourcePronoun:pronoun.text,
                event:index+1,antecedent:match.root}]
            });
          }
        }
      }
      states=candidates.sort((a,b)=>b.score-a.score).slice(0,MAX_CANDIDATES);
      if(!states.length)throw new Error('Unresolved anaphora: no consistent grammatical reading.');
    }
    return states.map(state=>{
      const interlingua=createDiscourse(state.events,{coreference:state.links});
      validateInterlingua(interlingua,this.ontology,this.features);
      return {interlingua,lexicalSenses:state.lexicalSenses,score:state.score,
        anaphoraTrace:state.trace};
    });
  }

  /** Parse a controlled coordination or wide negation. Both markers are language-local JSON.
   * This is deliberately NOT naive free-text splitting across unrecognized structures.
   */
  analyzeSentence(sentence, adapter, depth = 0) {
    if (depth > 3) throw new EngineError('COMPLEMENT_DEPTH_LIMIT','Complement nesting depth exceeded.');
    const text = sentence.trim().replace(/\.\s*$/u, '');
    const prefix = adapter.wideNegation;
    const normal = text.toLocaleLowerCase();
    const scoped = typeof prefix === 'string' && normal.startsWith(prefix.toLocaleLowerCase() + ' ');
    const body = scoped ? text.slice(prefix.length).trim() : text;
    const conditional=adapter.conditional;
    const lowerBody=body.toLocaleLowerCase(adapter.code);
    if(conditional && lowerBody.startsWith(conditional.if.toLocaleLowerCase(adapter.code)+' ')) {
      const rest=body.slice(conditional.if.length).trim();
      const comma=rest.indexOf(',');
      if(comma<1)throw new Error('Conditional clauses require a comma after the if-clause.');
      const conditionText=rest.slice(0,comma).trim();
      let consequenceText=rest.slice(comma+1).trim();
      const markerPattern=marker=>marker.split(/\s+/u).map(part=>
        part.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('\\s+');
      const otherwisePattern=new RegExp(',\\s*'+
        markerPattern(conditional.otherwise)+'(?:,\\s*|\\s+)','giu');
      const otherwiseMatches=[...consequenceText.matchAll(otherwisePattern)];
      let otherwiseText;
      if(otherwiseMatches.length) {
        const match=otherwiseMatches.at(-1),at=match.index;
        otherwiseText=consequenceText.slice(at+match[0].length).trim();
        consequenceText=consequenceText.slice(0,at).trim();
      }
      const thenPattern=new RegExp('^'+markerPattern(conditional.then)+'\\s+','iu');
      consequenceText=consequenceText.replace(thenPattern,'').replace(/,$/u,'').trim();
      if(!conditionText||!consequenceText||(otherwiseText!==undefined&&!otherwiseText))
        throw new Error('Incomplete conditional clause.');
      const conditions=this.analyzeSentence(conditionText+'.',adapter,depth+1);
      const consequences=this.analyzeSentence(consequenceText+'.',adapter,depth+1);
      const alternatives=otherwiseText===undefined? [null]:
        this.analyzeSentence(otherwiseText+'.',adapter,depth+1);
      const readings=[];
      conditionalCandidates:for(const condition of conditions)for(const consequence of consequences)
        for(const alternative of alternatives) {
          const proposition=createConditional(condition.interlingua,
            consequence.interlingua,alternative?.interlingua);
          try { validateInterlingua(proposition,this.ontology,this.features); }
          catch(error) {
            if(error.code!=='INTERLINGUA_INVALID')throw error;
            continue;
          }
          readings.push({interlingua:scoped?createNegation(proposition):proposition,
            lexicalSenses:{condition:condition.lexicalSenses,
              consequence:consequence.lexicalSenses,
              ...(alternative?{otherwise:alternative.lexicalSenses}:{})},
            score:(condition.score||0)+(consequence.score||0)+(alternative?.score||0)});
          if(readings.length>=MAX_CANDIDATES)break conditionalCandidates;
        }
      if(readings.length)return readings;
      throw new Error('Conditional clause has no supported reading.');
    }
    const connective = adapter.connective;
    let atomic=[], atomError;
    try {
      atomic=adapter.analyzeCandidates(body+'.');
    } catch (error) {
      if(isResourceLimitError(error))throw error;
      atomError=error;
    }
    // Prefer a complete grammatical analysis over text splitting: an "and"
    // inside a licensed noun/relative constituent is not a clause boundary.
    if(atomic.length) return scoped ? atomic.map(item=>({
      ...item,interlingua:createNegation(item.interlingua)
    })) : atomic;
    const pattern=typeof connective==='string'&&connective ?
      new RegExp('\\s+'+connective+'\\s+','giu') : null;
    const fragments=pattern?body.split(pattern):[body];
    if(fragments.length>8)
      throw new EngineError('GRAMMAR_COORDINATION_LIMIT','Coordination exceeds eight clauses.');
    if(fragments.some(part=>!part.trim()))throw new Error('Invalid clause coordination.');

    // Chart-style boundary discovery: each span must parse as a complete
    // clause. No unconditional splitting on every connective is performed.
    const cache=new Map();
    const spanReadings=(start,end)=>{
      const key=start+':'+end;
      if(cache.has(key))return cache.get(key);
      let candidates=[];
      try {
        const span=fragments.slice(start,end).join(' '+connective+' ')+'.';
        try {
          candidates=adapter.analyzeCandidates(span)
            .filter(item=>['event','modality','scope'].includes(item.interlingua.type));
        } catch(error) {
          if(isResourceLimitError(error))throw error;
          /* This span may instead be a typed propositional complement. */
        }
        if(!candidates.length && end===start+1) {
          const heads=adapter.parseComplementHeads?.(span.replace(/\.\s*$/u,''))||[];
          candidates=heads.flatMap(head=>
            this.analyzeSentence(head.content,adapter,depth+1).map(inner=>({
              interlingua:createComplement(head.concept,head.experiencer,
                inner.interlingua,head.tense),
              lexicalSenses:{matrix:head.senseId,content:inner.lexicalSenses},
              score:inner.score||0
            })));
        }
      } catch (error) {
        if(isResourceLimitError(error))throw error;
        /* Invalid span is a rejected parse, not a phrase boundary. */
      }
      cache.set(key,candidates.slice(0,MAX_CANDIDATES));
      return cache.get(key);
    };
    let frontier=fragments.length>1 ? [{at:0,clauses:[],senses:{},score:0}] : [],complete=[];
    for(let level=0;level<4 && frontier.length;level++){
      const next=[];
      for(const state of frontier){
        for(let end=state.at+1;end<=fragments.length;end++){
          const candidates=spanReadings(state.at,end);
          for(const item of candidates){
            const advanced={
              at:end,clauses:[...state.clauses,item.interlingua],
              senses:{...state.senses,['c'+(level+1)]:item.lexicalSenses},
              score:state.score+(item.score||0)
            };
            if(end===fragments.length) {
              if(advanced.clauses.length>=2)complete.push(advanced);
            } else if(level<3) next.push(advanced);
          }
        }
      }
      frontier=next.sort((left,right)=>right.score-left.score).slice(0,MAX_CANDIDATES);
      complete=complete.sort((left,right)=>right.score-left.score).slice(0,MAX_CANDIDATES);
    }
    if(complete.length)return complete.map(item=>({
      interlingua:scoped?createNegation(createCoordination(item.clauses)):
        createCoordination(item.clauses),
      lexicalSenses:item.senses,score:item.score
    }));

    const possibleComplements=adapter.parseComplementHeads?.(body) || [];
    if(possibleComplements.length) {
      const results=possibleComplements.flatMap(head=>
        this.analyzeSentence(head.content,adapter,depth+1).map(inner=>({
          interlingua:createComplement(head.concept,head.experiencer,
            inner.interlingua,head.tense),
          lexicalSenses:{matrix:head.senseId,content:inner.lexicalSenses},
          score:inner.score||0
        })));
      return scoped?results.map(item=>({...item,
        interlingua:createNegation(item.interlingua)})):results;
    }
    throw atomError || new Error('Unsupported compound clause or nested connective.');
  }

  /**
   * Returns distinct meanings, never just spelling variants. Context is explicit:
   * {senses: {theme: 'place.riverbank'}} filters; {topics:['place.river']} boosts.
   */
  analyzeCandidates({ text, from, context = {} }) {
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
      try { validateInterlingua(meaning, this.ontology, this.features); }
      catch (error) {
        if(isResourceLimitError(error))throw error;
        throw new EngineError('CORE_SCHEMA_INVALID',error.message,{cause:error});
      }
      // JSON serialization drops null prototypes; restore the canonical wire graph.
      meaning = canonicalizeParsedCoreDocument(meaning);
      return [{ interlingua: meaning, lexicalSenses: {}, score: 0 }];
    }
    if(typeof text==='string' && text.length>RESOURCE_LIMITS.sourceTextCodeUnits) {
      throw new EngineError('SOURCE_TEXT_SIZE_LIMIT',
        `Source text exceeds ${RESOURCE_LIMITS.sourceTextCodeUnits} UTF-16 code units.`);
    }
    const adapter = this.language(from);
    if(typeof text==='string'&&text.includes('?')) {
      if (settings.coreference !== undefined)
        throw new Error('Explicit discourse coreference is not supported in questions.');
      if(!/^[^.!?]+\?$/u.test(text.trim())) {
        throw new Error('Only simple sentences with a single final question mark are supported; mixed question discourse or punctuation is unsupported.');
      }
      if(typeof adapter.analyzeQuestionCandidates!=='function'){
        throw new Error('Unsupported question construction in source language: '+from);
      }
      const readings=adapter.analyzeQuestionCandidates(text);
      const candidates=readings.filter(candidate=>
        Object.entries(settings.senses||{}).every(([role,concept])=>
          eventWithin(candidate.interlingua)?.roles?.[role]?.concept===concept))
        .map(candidate=>({...candidate,score:(candidate.score||0)+
          (settings.topics||[]).reduce((sum,topic)=>sum+
            participantsOf(candidate.interlingua).filter(ref=>ref.concept).filter(ref=>
              this.ontology.relatedToTopic(ref.concept,topic)).length*10,0)}))
        .sort((a,b)=>b.score-a.score).slice(0,MAX_CANDIDATES);
      if(!candidates.length)throw new Error('No semantic question reading matches context constraints.');
      return candidates.map(candidate=>{
        validateInterlingua(candidate.interlingua,this.ontology,this.features);
        return candidate;
      });
    }
    const sentences = splitSentences(text, MAX_DISCOURSE_EVENTS);
    if(settings.eventRelations?.length && sentences.length<2)
      throw new Error('Explicit event relations require a multi-event discourse.');
    const deicticSlots=sentences.map((sentence,i)=>
      adapter.readDeicticPronoun?.(sentence)?.length?i:-1).filter(i=>i>=0);
    if(deicticSlots.length && sentences.length>1){
      throw new Error('UNRESOLVED_DEIXIS: cross-sentence participant identity requires explicit session context.');
    }
    const pronounSlots=sentences.map((sentence,i)=>adapter.readSubjectPronoun?.(sentence)?i:-1)
      .filter(i=>i>=0);
    if(pronounSlots.length){
      if(sentences.length===1 && pronounSlots.length===1 && pronounSlots[0]===0) {
        let directReadings=[];
        try {
          const direct=this.analyzeSentence(sentences[0],adapter);
          directReadings=direct.filter(candidate=>
            ['event','state'].includes(candidate.interlingua.type));
        } catch (error) {
          if(isResourceLimitError(error))throw error;
          /* General event anaphora still follows the discourse path below. */
        }
        if(directReadings.length) {
          if(settings.coreference!==undefined)
            throw new Error('Explicit coreference requires at least two discourse sentences.');
          const candidates=directReadings.filter(candidate=>
            Object.entries(settings.senses||{}).every(([role,concept])=>
              candidate.interlingua.roles?.[role]?.concept===concept))
            .map(candidate=>({...candidate,score:(candidate.score||0)+
              (settings.topics||[]).reduce((sum,topic)=>sum+
                Object.values(candidate.interlingua.roles||{}).filter(ref=>ref.concept)
                  .filter(ref=>this.ontology.relatedToTopic(ref.concept,topic)).length*10,0)}))
            .sort((a,b)=>b.score-a.score).slice(0,MAX_CANDIDATES);
          if(!candidates.length)throw new Error('No semantic reading matches the context constraints.');
          return candidates.map(candidate=>{
            validateInterlingua(candidate.interlingua,this.ontology,this.features);
            return candidate;
          });
        }
      }
      if(pronounSlots[0]===0)
        throw new Error('Unresolved anaphora: first sentence has no antecedent.');
      if(settings.coreference!==undefined)
        throw new Error('Unsupported anaphora: explicit coreference cannot be combined with source pronouns.');
      if(Object.keys(settings.senses||{}).length)
        throw new Error('Unsupported anaphora with manual sense constraints.');
      if(sentences.length===2 && pronounSlots.length===1 && pronounSlots[0]===1)
        return this.analyzeAnaphoricPair(sentences,adapter,settings);
      return this.analyzeAnaphoricDiscourse(sentences,adapter,settings);
    }
    if (settings.coreference !== undefined && sentences.length === 1)
      throw new Error('Explicit coreference requires at least two discourse sentences.');
    if (sentences.length > 1 && Object.keys(settings.senses || {}).length) {
      throw new Error('Role-specific sense constraints currently require a single sentence.');
    }
    const scored = sentences.map(sentence => {
      const raw = this.analyzeSentence(sentence, adapter);
      const candidates = raw.filter(candidate => Object.entries(settings.senses || {})
        .every(([role, concept]) => eventWithin(candidate.interlingua)?.roles?.[role]?.concept === concept))
        .map(candidate => ({ ...candidate, score: (candidate.score || 0) +
          (settings.topics || []).reduce((sum, topic) => sum +
            participantsOf(candidate.interlingua).filter(ref => ref.concept).filter(ref =>
              this.ontology.relatedToTopic(ref.concept, topic)).length * 10, 0) }));
      if (!candidates.length) {
        throw new Error('No semantic reading matches the context constraints.');
      }
      return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
    });
    if (scored.length === 1) {
      return scored[0].map(candidate => {
        validateInterlingua(candidate.interlingua, this.ontology, this.features);
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
    // Filter incompatible candidate combinations BEFORE the top-16 beam.
    // Otherwise a single incompatible sense could abort the entire discourse
    // even when another semantically consistent reading is available.
    let combinations = [{ events: [], senses: {}, score: 0 }];
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
          score:combination.score+(candidate.score||0)
        }];
      })).sort((a,b)=>b.score-a.score).slice(0,MAX_CANDIDATES);
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
      validateInterlingua(interlingua, this.ontology, this.features);
      return { interlingua, lexicalSenses: combination.senses, score: combination.score };
    });
  }

  /** Legacy convenience method: a single preferred reading. Inspect candidates if ambiguous. */
  analyze({ text, from, context }) {
    return this.analyzeCandidates({ text, from, context })[0].interlingua;
  }

  realize({ interlingua, to, pronounRealization='repeat', profile,
    lexicalRegister='neutral',informationStructure }) {
    const personality=createPersonalityProfile(profile);
    if (profile !== undefined) pronounRealization=personality.realization.pronounRealization;
    if(!['repeat','safe'].includes(pronounRealization))
      throw new Error('Invalid pronoun realization policy.');
    if(!['neutral','formal','plain'].includes(lexicalRegister))
      throw new Error('Invalid lexical register.');
    validateInterlingua(interlingua, this.ontology, this.features);
    if(informationStructure!==undefined) {
      const expected=createInformationStructure(interlingua,informationStructure);
      if(Object.keys(informationStructure).length!==2 ||
          informationStructure.topic!==expected.topic || informationStructure.focus!==expected.focus)
        throw new Error('Invalid information structure.');
    }
    if (to === 'core') {
      return { text: JSON.stringify(interlingua, null, 2), warnings: [],
        alternatives: [], interlingua };
    }
    if (interlingua.type === 'dialogue_act') {
      if(interlingua.act!=='request')
        throw new Error('Language realization of this dialogue act is not supported; use CORE JSON.');
      const adapter=this.language(to);
      if(!adapter.realizeRequest)throw new Error(`Unsupported polite request realization in ${to}.`);
      const output=adapter.realizeRequest(interlingua);
      if(!output||typeof output.text!=='string'||!output.text.trim())
        throw new Error(`Invalid request realization from adapter: ${to}`);
      return applyPersonalityProfile({...output,interlingua},personality);
    }
    const adapter = this.language(to);
    const realizeClause = (node, options={}) => {
      if (node.type === 'question') {
        if(typeof adapter.realizeQuestion!=='function') {
          throw new Error(`Unsupported question construction for ${to}: missing language grammar.`);
        }
        const output=adapter.realizeQuestion(node);
        if(!output||typeof output.text!=='string'||!output.text.trim()) {
          throw new Error(`Invalid question realization from adapter: ${to}`);
        }
        const event=node.proposition;
        if(event.type==='event'&&event.features.aspect!=='unknown'&&
           adapter.describe?.().support?.aspectEncoding===false) {
          return {...output,warnings:[...(output.warnings||[]),
            `Target ${to} does not encode source aspect ${event.features.aspect} in this construction.`]};
        }
        return output;
      }
      if (node.type === 'modality') {
        if (!adapter.realizeModal) throw new Error(`Unsupported modal construction in ${to}.`);
        return adapter.realizeModal(node);
      }
      if (node.type === 'state') {
        if (!adapter.realizeState) throw new Error(`Unsupported state construction in ${to}.`);
        const output=adapter.realizeState(node);
        if (!output || typeof output.text!=='string' || !output.text.trim()) {
          throw new Error(`Invalid state realization from adapter: ${to}`);
        }
        return output;
      }
      if (node.type === 'comparison') {
        if (!adapter.realizeComparison) throw new Error(`Unsupported comparison construction in ${to}.`);
        return adapter.realizeComparison(node);
      }
      if (node.type === 'event') {
        const output = adapter.realize(node,{...options,lexicalRegister,informationStructure});
        if (!output || typeof output.text !== 'string' || !output.text.trim()) {
          throw new Error(`Invalid realization from adapter: ${to}`);
        }
        if (node.features.aspect !== 'unknown' && adapter.describe?.().support?.aspectEncoding === false) {
          return { ...output, warnings: [...(output.warnings || []),
            `Target ${to} does not encode source aspect ${node.features.aspect} in this construction.`] };
        }
        return output;
      }
      if (node.type === 'complement') {
        const content = realizeClause(node.content);
        return { text: adapter.realizeComplement(node, content.text),
          warnings: content.warnings || [], alternatives: [] };
      }
      if(node.type==='conditional') {
        const rules=adapter.conditional;
        if(!rules)throw new Error(`No ${to} conditional rule.`);
        const condition=realizeClause(node.condition);
        const consequence=realizeClause(node.consequence);
        const otherwise=node.otherwise?realizeClause(node.otherwise):null;
        const lowerClause=part=>part.text.replace(/[.!?]\s*$/u,'')
          .replace(/^./u,char=>char.toLocaleLowerCase(to));
        const sentence=rules.if[0].toLocaleUpperCase(to)+rules.if.slice(1)+' '+
          lowerClause(condition)+', '+rules.then+' '+lowerClause(consequence)+
          (otherwise?', '+rules.otherwise+' '+lowerClause(otherwise):'');
        return {text:sentenceText([sentence]),
          warnings:[condition,consequence,...(otherwise?[otherwise]:[])].flatMap((part,index)=>
            (part.warnings||[]).map(w=>`Conditional clause ${index+1}: ${w}`)),
          alternatives:[]};
      }
      if (node.type === 'coordination') {
        if (!adapter.connective) throw new Error(`No ${to} coordination rule.`);
        const parts = node.clauses.map(realizeClause);
        const clauseTexts = parts.map((part, i) => {
          const str = part.text.replace(/\.\s*$/u, '');
          return i ? str[0].toLocaleLowerCase() + str.slice(1) : str;
        });
        return {
          text: sentenceText([clauseTexts.join(` ${adapter.connective} `)]),
          warnings: parts.flatMap((part, index) => (part.warnings || []).map(w => `Clause ${index + 1}: ${w}`)),
          alternatives: []
        };
      }
      if (node.type === 'scope') {
        if (node.operand?.type === 'modality') {
          if (!adapter.realizeModal) throw new Error(`Unsupported modal negation in ${to}.`);
          return adapter.realizeModal(node);
        }
        if (!adapter.wideNegation) throw new Error(`No ${to} wide negation rule.`);
        const operand = realizeClause(node.operand);
        const text = sentenceText([adapter.wideNegation + ' ' +
          operand.text.replace(/\.\s*$/u, '').toLocaleLowerCase()]);
        return { text, warnings: operand.warnings || [], alternatives: [] };
      }
      throw new Error('Unsupported semantic clause node.');
    };
    if (interlingua.type !== 'discourse') {
      return applyPersonalityProfile({...realizeClause(interlingua), interlingua},personality);
    }
    const pronounizedEvents=[];
    const suppressed=[];
    const parts = interlingua.events.map((event,index)=>{
      let subjectPronoun=null;
      if(pronounRealization==='safe' && index>0 && event.roles?.[adapter.subjectRole]) {
        const sharedId=event.roles[adapter.subjectRole];
        const earlier=interlingua.events.slice(0,index);
        if(earlier.some(item=>Object.values(item.roles).includes(sharedId))) {
          const referent=interlingua.entities[sharedId];
          const candidate=referent?.concept && this.ontology.isA(referent.concept,'person')
            ?adapter.subjectPronounFor?.(referent,this.ontology):null;
          const competing=new Set(candidate?earlier.flatMap(item=>
            Object.values(item.roles).filter(id=>
              adapter.subjectPronounFor?.(interlingua.entities[id],this.ontology)===candidate)):[]);
          if(candidate && competing.size===1 && competing.has(sharedId)) {
            subjectPronoun=candidate;
            pronounizedEvents.push(index+1);
          } else suppressed.push('Event '+(index+1)+
            ': target subject pronoun was not safe or available; repeated noun phrase.');
        }
      }
      return realizeClause(materializeEvent(interlingua,event),
        subjectPronoun?{subjectPronoun}:{});
    });
    return applyPersonalityProfile({
      text: parts.map(part => part.text).join(' '), interlingua,
      warnings: [...parts.flatMap((part, i) => (part.warnings || []).map(warning =>
        `Event ${i + 1}: ${warning}`)),...suppressed],
      alternatives: [],
      ...(pronounRealization==='safe'?{pronounizedEvents}:{})
    },personality);
  }

  /** Stable, serializable discovery interface (does not expose mutable adapters). */
  capabilities() {
    return { interlinguaVersion: '1.0', questionDocumentVersion: QUESTION_VERSION,
      eventRelationDocumentVersion: '1.28',
      passiveEventDocumentVersion: PASSIVE_VERSION,
      conditionalDocumentVersion: CONDITIONAL_VERSION,
      dialogueActDocumentVersion: DIALOGUE_ACT_VERSION,
      responsePlannerVersion: RESPONSE_PLANNER_VERSION,
      dialogueEngineVersion: DIALOGUE_ENGINE_VERSION,
      personalityProfileVersion: PERSONALITY_PROFILE_VERSION,
      languageAdapterContractVersion:LANGUAGE_ADAPTER_CONTRACT_VERSION,
      morphologyAdapterContractVersion:MORPHOLOGY_ADAPTER_CONTRACT_VERSION,
      modalityDocumentVersion: MODALITY_VERSION, stateDocumentVersion: STATE_VERSION,
      stateFrameVersion: this.ontology.stateFrameVersion,
      coreLanguage: {code:'core', version:this.core.version, format:'interlingua-json'},
      languages: [...this.languages.values()].map(a =>
      ({ code: a.code, ...a.describe?.() })),
      morphologies: [...this.morphologies.values()].map(a=>a.describe()) };
  }

  /** Safe entry point for UIs: malformed input is a result, not an unhandled exception. */
  tryTranslate(request) {
    try { return { ok: true, value: this.translate(request) }; }
    catch (error) {
      return { ok: false, error: { code: error?.code || (/Ambiguous anaphora/.test(error.message) ?
        'AMBIGUOUS_ANAPHORA' : /anaphora/i.test(error.message) ?
        'UNRESOLVED_ANAPHORA' : /coreference/i.test(error.message) ?
        'INVALID_COREFERENCE' : /Unsupported language/.test(error.message) ?
        'UNSUPPORTED_LANGUAGE' : /UNRESOLVED_DEIXIS/i.test(error.message) ?
        'UNRESOLVED_DEIXIS' : /Missing|No .*lexeme|No .*form|no complement|no .*construction|no .*quantifier|does not match|Cannot realize|Unsupported question construction|Unsupported state construction|Unsupported modal|prohibition not available/.test(error.message) ?
        'UNSUPPORTED_CONSTRUCTION' : 'INVALID_INPUT'), message: error.message } };
    }
  }

  translate({ text, from, to, context, pronounRealization='repeat', profile,
    lexicalRegister='neutral',informationStructure }) {
    const candidates = this.analyzeCandidates({ text, from, context });
    const results = [];
    let firstError;
    for (const candidate of candidates) {
      try {
        const output = this.realize({ interlingua: candidate.interlingua, to,
          pronounRealization,profile,lexicalRegister,informationStructure });
        results.push({ ...candidate, output });
      } catch (error) {
        firstError ||= error;
      }
    }
    if (!results.length) throw firstError || new Error('No target realization is available.');
    const [best, ...others] = results;
    const warnings = [...best.output.warnings];
    const anaphoraItems=best.anaphoraTrace ||
      (best.anaphora?[{...best.anaphora,event:2}]:[]);
    for(const item of anaphoraItems) {
      if(!best.output.pronounizedEvents?.includes(item.event))
        warnings.push('Source subject pronoun '+item.sourcePronoun+
          ' was linked to '+item.antecedent+
          '; target repeats the noun phrase (safe pronoun realization was not selected or licensed).');
    }
    if (candidates.length > 1) {
      warnings.push(`Source has ${candidates.length} distinct semantic readings; selected the preferred reading. See semantic alternatives.`);
    }
    if (results.length < candidates.length) {
      warnings.push(`${candidates.length - results.length} semantic readings cannot be realized in ${to}.`);
    }
    return {
      ...best.output,
      warnings,
      lexicalSenses: best.lexicalSenses,
      semanticAlternatives: others.map(other => ({
        text: other.output.text, interlingua: other.interlingua,
        lexicalSenses: other.lexicalSenses, score: other.score
      }))
    };
  }
}
