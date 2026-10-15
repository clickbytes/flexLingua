/**
 * Bounded, in-memory session for controlled PL/EN clauses and typed CORE acts.
 * It does not persist state or infer identity from repeated surface text.
 */
import {createDiscourse, createDialogueAct, validateInterlingua,
  MAX_DISCOURSE_EVENTS, MAX_DIALOGUE_ACTS}
  from './interlingua.js';
import {record, safeName} from './features.js';
import {splitSentences} from './text.js';
import {applyPersonalityProfile, createPersonalityProfile} from './personality.js';
import {SessionMemory} from './memory.js';

function isDeictic(ref) {
  return record(ref) && record(ref.referent) && ref.referent.kind === 'deictic';
}

function eventGraph(events, links) {
  if (!events.length) return null;
  if (events.length === 1) return events[0];
  // Existing discourse IDs cannot express turn-scoped speaker/addressee identity.
  if (events.some(event=>Object.values(event.roles || {}).some(isDeictic))) return null;
  return createDiscourse(events,{coreference:links});
}

function validateParticipantIds(value) {
  if (value === undefined) return {};
  if (!record(value) || Object.keys(value).some(key=>!['speakerId','addresseeId'].includes(key)) ||
      Object.values(value).some(id=>!safeName(id))) {
    throw new Error('Explicit session participants require safe speakerId/addresseeId values.');
  }
  return value;
}

function collectParticipantReferences(node, path, coreferenceEligible = false, out = []) {
  if (!record(node)) return out;
  if (node.type === 'question') {
    return collectParticipantReferences(node.proposition,path+'.proposition',false,out);
  }
  if (node.type === 'event' || node.type === 'state') {
    for (const [role,referent] of Object.entries(node.roles || {})) {
      out.push({path:path+'.roles.'+role,role,referent,
        coreferenceEligible:coreferenceEligible && path === 'proposition' &&
          node.type === 'event'});
      for (const [index,relative] of (referent.relatives || []).entries()) {
        collectParticipantReferences(relative.event,
          path+'.roles.'+role+'.relatives.'+index,false,out);
      }
    }
    return out;
  }
  if (node.type === 'scope' || node.type === 'modality') {
    return collectParticipantReferences(node.operand,path+'.operand',false,out);
  }
  if (node.type === 'coordination') {
    for (const [index,clause] of (node.clauses || []).entries()) {
      collectParticipantReferences(clause,path+'.clauses.'+index,false,out);
    }
    return out;
  }
  if (node.type === 'complement') {
    out.push({path:path+'.experiencer',role:'experiencer',referent:node.experiencer});
    return collectParticipantReferences(node.content,path+'.content',false,out);
  }
  return out;
}

function dialogueDocuments(act) {
  const payload=act.payload;
  if (act.act === 'assert') return [{path:'proposition',node:payload.proposition}];
  if (act.act === 'request') return [{path:'action',node:payload.action}];
  if (act.act === 'clarify') return [
    {path:'context',node:payload.inReplyTo},
    {path:'question',node:payload.question}
  ];
  return [{path:'question',node:payload.question}];
}

function focusForAct(act) {
  if (act.act === 'request') return {
    kind:'action',
    concept:act.payload.action.concept,
    politeness:act.payload.politeness
  };
  const question=act.payload.question;
  if (question) {
    return question.questionType === 'wh' ?
      {kind:'role',role:question.targetRole} :
      {kind:'question',questionType:question.questionType};
  }
  const proposition=act.payload.proposition;
  if (!proposition) return null;
  return {
    kind:'proposition',
    type:proposition.type,
    ...(proposition.concept ? {concept:proposition.concept} : {})
  };
}

export class ConversationContext {
  #engine;
  #events=[];
  #links={};
  #turns=[];
  #dialogue;
  #memory;
  #maxEvents;
  #maxTurns;

  constructor(engine,{maxEvents=MAX_DISCOURSE_EVENTS,maxTurns=MAX_DIALOGUE_ACTS,
    maxFacts=32}={}) {
    if (!engine?.analyzeCandidates || !engine?.realize || !engine?.language ||
        !Number.isInteger(maxEvents) || maxEvents<2 ||
        maxEvents>MAX_DISCOURSE_EVENTS || !Number.isInteger(maxTurns) ||
        maxTurns<1 || maxTurns>MAX_DIALOGUE_ACTS) {
      throw new Error('Invalid conversation engine, event limit (2–8), or turn limit (1–32).');
    }
    this.#engine=engine;
    this.#maxEvents=maxEvents;
    this.#maxTurns=maxTurns;
    this.#dialogue=new DialogueContext(engine,{maxActs:maxTurns});
    this.#memory=new SessionMemory({maxFacts});
  }

  snapshot() {
    const events=structuredClone(this.#events);
    const links=structuredClone(this.#links);
    const interlingua=eventGraph(events,links);
    return {
      eventCount:events.length,
      maxEvents:this.#maxEvents,
      turnCount:this.#turns.length,
      maxTurns:this.#maxTurns,
      interlingua,
      turns:structuredClone(this.#turns),
      memory:this.#memory.snapshot(),
      pendingQuestions:this.#dialogue.snapshot().pendingQuestions,
      focus:this.#turns.length ? structuredClone(this.#turns[this.#turns.length-1].focus) : null
    };
  }

  reset() {
    this.#events=[];
    this.#links={};
    this.#turns=[];
    this.#memory.reset();
    this.#dialogue.reset();
    return this.snapshot();
  }

  /** Explicitly approve a source-turn assertion for bounded session memory. */
  remember({turnId,referent,recordedAt,scope='session',supersedes=[]}={}) {
    const turn=this.#turns.find(item=>item.id===turnId);
    return this.#memory.remember({turn,referent,recordedAt,scope,supersedes});
  }

  tryRemember(request) {
    try{return {ok:true,value:this.remember(request)};}
    catch(error){return {ok:false,error:{code:error?.code||'INVALID_INPUT',
      message:error?.message||'Could not store session fact.'}};}
  }

  #root(mention,links=this.#links) {
    let root=mention;
    for(let n=0;n<MAX_DISCOURSE_EVENTS;n++){
      if(!Object.hasOwn(links,root))return root;
      root=links[root];
    }
    throw new Error('Invalid conversation reference chain.');
  }

  #assertTurnCapacity() {
    if(this.#turns.length>=this.#maxTurns)
      throw new Error('Conversation turn limit reached; reset required.');
  }

  #turnRecord(act,participants,{eventIndex=null,links=this.#links,surface=null}={}) {
    const id='t'+(this.#turns.length+1);
    const speaker=participants.speakerId ? 'actor:'+participants.speakerId : 'turn:'+id+':speaker';
    const addressee=participants.addresseeId ? 'actor:'+participants.addresseeId :
      'turn:'+id+':addressee';
    const mentions=dialogueDocuments(act).flatMap(document=>
      collectParticipantReferences(document.node,document.path,
        document.path==='proposition'));
    if(act.act==='answer' && act.payload.response.type==='referent') {
      mentions.push({path:'response.value',role:'answer',referent:act.payload.response.value});
    }
    const references=mentions.map(mention=>{
      let referenceId;
      if(isDeictic(mention.referent)) {
        const anchor=mention.referent.referent.anchor;
        referenceId=anchor==='speaker' ? speaker : addressee;
      } else if(eventIndex!==null && mention.coreferenceEligible) {
        referenceId='mention:'+this.#root('e'+eventIndex+'.'+mention.role,links);
      } else {
        referenceId='turn:'+id+':'+mention.path;
      }
      return {role:mention.path,referenceId,referent:structuredClone(mention.referent)};
    });
    return {
      id,
      intent:act.act,
      participants:{speaker,addressee},
      references,
      focus:focusForAct(act),
      interlingua:structuredClone(act),
      ...(surface ? {surface:structuredClone(surface)} : {})
    };
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

  appendDialogueAct(act,{participants:participantInput}={}) {
    this.#assertTurnCapacity();
    const participants=validateParticipantIds(participantInput);
    const candidate=structuredClone(act);
    validateInterlingua(candidate,this.#engine.ontology,this.#engine.features);
    const assertion=candidate.act==='assert' ? candidate.payload.proposition : null;
    const event=assertion?.type==='event' ? structuredClone(assertion) : null;
    if(event && this.#events.length>=this.#maxEvents)
      throw new Error('Conversation context limit reached; reset required.');
    const events=event ? [...this.#events,event] : this.#events;
    const graph=eventGraph(events,this.#links);
    if(graph)validateInterlingua(graph,this.#engine.ontology,this.#engine.features);
    const turn=this.#turnRecord(candidate,participants,
      {eventIndex:event ? events.length : null});

    this.#dialogue.append(candidate);
    if(event)this.#events=events;
    this.#turns=[...this.#turns,turn];
    return this.snapshot();
  }

  /** Plan against the latest pending question and explicit assert turns in this session. */
  planResponse({facts,clarifyQuestion}={}) {
    const pending=this.#dialogue.snapshot().pendingQuestions;
    if(!pending.length)throw new Error('Conversation has no pending question to answer.');
    const assertions=facts===undefined ? this.#turns
      .filter(turn=>turn.intent==='assert')
      .map(turn=>turn.interlingua.payload.proposition) : facts;
    return this.#engine.planResponse({question:pending[pending.length-1],
      facts:assertions,clarifyQuestion});
  }

  /** Realize and append a planned reply; session state changes only after planning succeeds. */
  respond({facts,clarifyQuestion,to,participants,profile}={}) {
    this.#assertTurnCapacity();
    const pending=this.#dialogue.snapshot().pendingQuestions;
    if(!pending.length)throw new Error('Conversation has no pending question to answer.');
    const assertions=facts===undefined ? this.#turns
      .filter(turn=>turn.intent==='assert')
      .map(turn=>turn.interlingua.payload.proposition) : facts;
    const response=this.#engine.respond({question:pending[pending.length-1],
      facts:assertions,clarifyQuestion,to,profile});
    const session=this.appendDialogueAct(response.plan.act,{participants});
    return {...response,dialogueAct:response.plan.act,
      conversation:session.interlingua,turnCount:this.#turns.length,focus:session.focus};
  }

  translate({text,from,to,context={},pronounRealization='repeat',participants:participantInput,profile}={}) {
    const personality=createPersonalityProfile(profile);
    const profileOptions=profile===undefined?{}:{profile:personality};
    if(profile!==undefined)pronounRealization=personality.realization.pronounRealization;
    if(!['repeat','safe'].includes(pronounRealization))
      throw new Error('Invalid pronoun realization policy.');
    this.#assertTurnCapacity();
    if(typeof text!=='string' || !text.trim())
      throw new Error('Conversation context requires one non-empty sentence.');
    const settings=this.#engine.validateContext(context);
    if(settings.coreference!==undefined)
      throw new Error('Conversation context does not accept manual cross-turn coreference.');
    const participants=validateParticipantIds(participantInput);
    const adapter=this.#engine.language(from);
    const sourceText=text.trim();

    if(sourceText.includes('?')) {
      const readings=this.#engine.analyzeCandidates({text:sourceText,from,context:settings})
        .filter(item=>item.interlingua?.type==='question');
      const unique=[];
      for(const reading of readings) {
        if(!unique.some(item=>sameQuestion(item.interlingua,reading.interlingua)))
          unique.push(reading);
      }
      if(!unique.length)throw new Error('Conversation question has no supported semantic reading.');
      if(unique.length!==1)
        throw new Error('Ambiguous conversation question: specify an explicit sense constraint.');
      const question=structuredClone(unique[0].interlingua);
      const act=createDialogueAct('ask',{question});
      const output=this.#engine.realize({interlingua:question,to,...profileOptions});
      const turn=this.#turnRecord(act,participants,{surface:{
        source:{language:from,text:sourceText},target:{language:to,text:output.text}
      }});
      this.#dialogue.append(act);
      this.#turns=[...this.#turns,turn];
      const session=this.snapshot();
      return {
        text:output.text,warnings:[...(output.warnings||[])],
        alternatives:output.alternatives||[],
        interlingua:question,dialogueAct:act,conversation:session.interlingua,
        eventCount:this.#events.length,turnCount:this.#turns.length,focus:session.focus
      };
    }

    if(this.#events.length>=this.#maxEvents)
      throw new Error('Conversation context limit reached; reset required.');
    const sentences=splitSentences(sourceText,1);
    if(sentences.length!==1)
      throw new Error('Conversation context requires one event per turn.');
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
    const graph=eventGraph(events,links);
    if(graph)validateInterlingua(graph,this.#engine.ontology,this.#engine.features);

    const baseline=this.#engine.realize({interlingua:event,to,...profileOptions});
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
        output=applyPersonalityProfile({...baseline,text:realized.text,
          alternatives:realized.alternatives||[],
          warnings:[...new Set([...(baseline.warnings||[]),...(realized.warnings||[])])]},personality);
        pronounized=true;
      } else {
        output={...baseline,warnings:[...(baseline.warnings||[]),
          'Conversation target pronoun was not safe or available; repeated noun phrase.']};
      }
    }
    const act=createDialogueAct('assert',{proposition:event});
    const turn=this.#turnRecord(act,participants,{eventIndex:events.length,links,surface:{
      source:{language:from,text:sourceText},target:{language:to,text:output.text}
    }});
    // Commit only after semantic validation and target realization succeed.
    this.#dialogue.append(act);
    this.#events=events;
    this.#links=links;
    this.#turns=[...this.#turns,turn];
    return {
      text:output.text, warnings:[...(output.warnings||[])],
      alternatives:output.alternatives||[],
      interlingua:event,dialogueAct:act,conversation:graph?structuredClone(graph):null,
      eventCount:events.length,turnCount:this.#turns.length,
      focus:structuredClone(turn.focus),
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
        /Ambiguous conversation (meaning|question)/.test(error.message)?'AMBIGUOUS_CONVERSATION_READING':
        /Conversation context limit|Conversation turn limit/.test(error.message)?'CONTEXT_LIMIT':
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
