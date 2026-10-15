/**
 * Bounded, in-memory conversation context for controlled PL/EN event clauses.
 * It does not persist state or infer coreference from repeated nouns.
 */
import {createDiscourse, validateInterlingua, MAX_DISCOURSE_EVENTS, MAX_DIALOGUE_ACTS}
  from './interlingua.js';
import {splitSentences} from './text.js';

export class ConversationContext {
  #engine;
  #events=[];
  #links={};
  #maxEvents;

  constructor(engine,{maxEvents=MAX_DISCOURSE_EVENTS}={}) {
    if (!engine?.analyzeCandidates || !engine?.realize || !engine?.language ||
        !Number.isInteger(maxEvents) || maxEvents<2 ||
        maxEvents>MAX_DISCOURSE_EVENTS) {
      throw new Error('Invalid conversation engine or event limit (2–8).');
    }
    this.#engine=engine;
    this.#maxEvents=maxEvents;
  }

  snapshot() {
    const events=structuredClone(this.#events);
    const links=structuredClone(this.#links);
    const interlingua=events.length>=2 ?
      createDiscourse(events,{coreference:links}) :
      events.length===1 ? events[0] : null;
    return {eventCount:events.length,maxEvents:this.#maxEvents,interlingua};
  }

  reset() {
    this.#events=[];
    this.#links={};
    return this.snapshot();
  }

  #root(mention) {
    let root=mention;
    for(let n=0;n<MAX_DISCOURSE_EVENTS;n++){
      if(!Object.hasOwn(this.#links,root))return root;
      root=this.#links[root];
    }
    throw new Error('Invalid conversation reference chain.');
  }

  #antecedents(pronoun) {
    const found=new Map();
    for(const [index,event] of this.#events.entries()){
      for(const [role,ref] of Object.entries(event.roles)){
        if(!pronoun.concepts.includes(ref.concept) ||
           ref.features?.number!=='singular')continue;
        const root=this.#root('e'+(index+1)+'.'+role);
        if(!found.has(root))found.set(root,{root,ref});
      }
    }
    return [...found.values()];
  }

  translate({text,from,to,context={},pronounRealization='repeat'}={}) {
    if(!['repeat','safe'].includes(pronounRealization))
      throw new Error('Invalid pronoun realization policy.');
    if(this.#events.length>=this.#maxEvents)
      throw new Error('Conversation context limit reached; reset required.');
    if(typeof text!=='string' || text.includes('?'))
      throw new Error('Conversation context requires one declarative sentence.');
    const sentences=splitSentences(text,1);
    if(sentences.length!==1)
      throw new Error('Conversation context requires one event per turn.');
    const settings=this.#engine.validateContext(context);
    if(settings.coreference!==undefined)
      throw new Error('Conversation context does not accept manual cross-turn coreference.');
    const adapter=this.#engine.language(from);
    const source=sentences[0];
    const pronoun=adapter.readSubjectPronoun?.(source);
    let antecedent=null, parsedText=source;
    if(pronoun){
      const matches=this.#antecedents(pronoun);
      if(!matches.length)throw new Error('Unresolved anaphora: no prior person for '+pronoun.text+'.');
      if(matches.length!==1)throw new Error('Ambiguous anaphora: multiple earlier entities match '+pronoun.text+'.');
      antecedent=matches[0];
      parsedText=adapter.expandSubjectPronoun(source,antecedent.ref);
    }
    const readings=this.#engine.analyzeCandidates({text:parsedText,from,context:settings})
      .filter(item=>item.interlingua?.type==='event' &&
        (!antecedent || item.interlingua.roles?.[adapter.subjectRole]?.concept===
          antecedent.ref.concept));
    if(!readings.length)throw new Error('Conversation event has no supported semantic reading.');
    if(readings.length!==1)throw new Error('Ambiguous conversation meaning: specify an explicit sense constraint.');
    const selected=readings[0];
    const event=structuredClone(selected.interlingua);
    if(antecedent)event.roles[adapter.subjectRole]=structuredClone(antecedent.ref);
    const links={...this.#links};
    if(antecedent)links['e'+(this.#events.length+1)+'.'+adapter.subjectRole]=antecedent.root;
    const events=[...this.#events,event];
    const graph=events.length>=2?createDiscourse(events,{coreference:links}):event;
    validateInterlingua(graph,this.#engine.ontology,this.#engine.features);

    const baseline=this.#engine.realize({interlingua:event,to});
    let output=baseline,pronounized=false;
    if(antecedent && pronounRealization==='safe' && to!=='core'){
      const target=this.#engine.language(to);
      const surface=target.subjectPronounFor?.(antecedent.ref);
      const possibleOrigins=surface?new Set(this.#events.flatMap((previous,index)=>
        Object.entries(previous.roles).filter(([,ref])=>
          target.subjectPronounFor?.(ref)===surface)
          .map(([role])=>this.#root('e'+(index+1)+'.'+role)))):new Set();
      if(surface && possibleOrigins.size===1 && possibleOrigins.has(antecedent.root)){
        const realized=target.realize(event,{subjectPronoun:surface});
        output={...baseline,text:realized.text,
          warnings:[...new Set([...(baseline.warnings||[]),...(realized.warnings||[])])]};
        pronounized=true;
      } else {
        output={...baseline,warnings:[...(baseline.warnings||[]),
          'Conversation target pronoun was not safe or available; repeated noun phrase.']};
      }
    }
    // Commit only after semantic validation and target realization succeed.
    this.#events=events;
    this.#links=links;
    return {
      text:output.text, warnings:[...(output.warnings||[])],
      alternatives:output.alternatives||[],
      interlingua:event, conversation:structuredClone(graph),
      eventCount:events.length,
      ...(antecedent?{anaphora:{antecedent:antecedent.root,
        sourcePronoun:pronoun.text,pronounized}}:{})
    };
  }

  tryTranslate(request) {
    try {return {ok:true,value:this.translate(request)};}
    catch(error){
      const code=error?.code || (/UNRESOLVED_DEIXIS/i.test(error.message)?'UNRESOLVED_DEIXIS':
        /Ambiguous anaphora/.test(error.message)?'AMBIGUOUS_ANAPHORA':
        /Unresolved anaphora/.test(error.message)?'UNRESOLVED_ANAPHORA':
        /Ambiguous conversation meaning/.test(error.message)?'AMBIGUOUS_CONVERSATION_READING':
        /Conversation context limit/.test(error.message)?'CONTEXT_LIMIT':
        /supported semantic reading|requires one event/.test(error.message)?
          'UNSUPPORTED_CONSTRUCTION':'INVALID_INPUT');
      return {ok:false,error:{code,message:error.message}};
    }
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sameQuestion(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Bounded in-memory dialogue history. Replies must match the latest recorded
 * question; clarifications push a follow-up question and preserve its parent.
 */
export class DialogueContext {
  #engine;
  #acts=[];
  #pendingQuestions=[];
  #maxActs;

  constructor(engine,{maxActs=MAX_DIALOGUE_ACTS}={}) {
    if (!engine?.ontology || !engine?.features || !Number.isInteger(maxActs) ||
        maxActs < 1 || maxActs > MAX_DIALOGUE_ACTS) {
      throw new Error('Invalid dialogue engine or act limit (1–32).');
    }
    this.#engine=engine;
    this.#maxActs=maxActs;
  }

  snapshot() {
    return {
      actCount:this.#acts.length,
      maxActs:this.#maxActs,
      acts:structuredClone(this.#acts),
      pendingQuestions:structuredClone(this.#pendingQuestions)
    };
  }

  reset() {
    this.#acts=[];
    this.#pendingQuestions=[];
    return this.snapshot();
  }

  append(act) {
    if (this.#acts.length >= this.#maxActs) {
      throw new Error('Dialogue history limit reached; reset required.');
    }
    const candidate=structuredClone(act);
    validateInterlingua(candidate,this.#engine.ontology,this.#engine.features);
    const pending=structuredClone(this.#pendingQuestions);

    if (candidate.act === 'ask') {
      if (pending.length) throw new Error('A new question cannot replace an unanswered dialogue question.');
      pending.push(candidate.payload.question);
    } else if (candidate.act === 'clarify') {
      if (pending.length) {
        const current=pending[pending.length-1];
        if (candidate.payload.inReplyTo.type !== 'question' ||
            !sameQuestion(current,candidate.payload.inReplyTo)) {
          throw new Error('Clarification does not match the current dialogue question.');
        }
      }
      pending.push(candidate.payload.question);
    } else if (['answer','confirm','refuse'].includes(candidate.act)) {
      const current=pending[pending.length-1];
      if (!current || !sameQuestion(current,candidate.payload.question)) {
        throw new Error('Dialogue reply has no matching question in context.');
      }
      pending.pop();
    }

    this.#acts=[...this.#acts,candidate];
    this.#pendingQuestions=pending;
    return this.snapshot();
  }
}
