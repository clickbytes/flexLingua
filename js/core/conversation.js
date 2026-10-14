/**
 * Bounded, in-memory conversation context for controlled PL/EN event clauses.
 * Nothing is persisted, inferred from repeated nouns, or added to CORE schema.
 */
import {createDiscourse, validateInterlingua, MAX_DISCOURSE_EVENTS}
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
    const code=/UNRESOLVED_DEIXIS/i.test(error.message)?'UNRESOLVED_DEIXIS':
      /Ambiguous anaphora/.test(error.message)?'AMBIGUOUS_ANAPHORA':
        /Unresolved anaphora/.test(error.message)?'UNRESOLVED_ANAPHORA':
        /Ambiguous conversation meaning/.test(error.message)?'AMBIGUOUS_CONVERSATION_READING':
        /Conversation context limit/.test(error.message)?'CONTEXT_LIMIT':
        /supported semantic reading|requires one event/.test(error.message)?
          'UNSUPPORTED_CONSTRUCTION':'INVALID_INPUT';
      return {ok:false,error:{code,message:error.message}};
    }
  }
}
