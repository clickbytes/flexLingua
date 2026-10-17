/** Offline orchestration API for bounded multi-turn PL/EN sessions. */
import {ConversationContext} from './conversation.js';

export const DIALOGUE_ENGINE_VERSION = '1.0';

const NEXT_TURN_FIELDS = new Set([
  'session','utterance','language','from','to','context','pronounRealization','participants','profile'
]);
const RESPOND_FIELDS = new Set(['session','to','facts','clarifyQuestion','participants','profile']);

function diagnostic(code,message,severity='error') {
  return {code,message,severity};
}

function diagnosticsFor(error, code, message) {
  if (Array.isArray(error?.diagnostics) && error.diagnostics.length) {
    return error.diagnostics.map(item => ({...item,severity:item.severity || 'error'}));
  }
  return [diagnostic(code,message)];
}

function errorCode(error) {
  const message=error?.message || 'Dialogue turn failed.';
  return error?.code || (/Ambiguous anaphora/.test(message)?'AMBIGUOUS_ANAPHORA':
    /UNRESOLVED_DEIXIS/i.test(message)?'UNRESOLVED_DEIXIS':
    /Unresolved anaphora/.test(message)?'UNRESOLVED_ANAPHORA':
    /Ambiguous conversation (meaning|question)/.test(message)?'AMBIGUOUS_CONVERSATION_READING':
    /Unsupported (response )?language/.test(message)?'UNSUPPORTED_LANGUAGE':
    /Conversation (context|turn) limit|Dialogue history limit/.test(message)?'CONTEXT_LIMIT':
    /supported semantic reading|requires one event|one non-empty sentence/.test(message)?
      'UNSUPPORTED_CONSTRUCTION':'INVALID_INPUT');
}

function normalizeUtterance(utterance,language,from) {
  if (typeof utterance === 'string') return {text:utterance,language:language || from};
  if (!utterance || typeof utterance !== 'object' || Array.isArray(utterance) ||
      Object.keys(utterance).some(key=>!['text','language'].includes(key))) {
    throw new Error('Utterance must be text or an object with text and language.');
  }
  return {text:utterance.text,language:language || from || utterance.language};
}

function snapshotOf(session) {
  return session.snapshot();
}

function successfulTurn(result,session) {
  const warnings=[...(result.warnings || [])];
  const diagnostics=[...(result.diagnostics || []).map(item =>
    ({...item,severity:item.severity || 'error'})),
  ...warnings.map(message=>diagnostic('REALIZATION_WARNING',message,'warning'))];
  return {
    core:structuredClone(result.interlingua),
    interlingua:structuredClone(result.interlingua),
    dialogueAct:structuredClone(result.dialogueAct),
    text:result.text,
    warnings,
    diagnostics,
    alternatives:[...(result.alternatives || [])],
    informationLoss:[...(result.informationLoss || [])],
    conversation:snapshotOf(session),
    turnCount:result.turnCount,
    focus:structuredClone(result.focus)
  };
}

function successfulResponse(result,session) {
  const warnings=[...(result.warnings || [])];
  const diagnostics=[...(result.diagnostics || []).map(item =>
    ({...item,severity:item.severity || 'error'})),
  ...warnings.map(message=>diagnostic('REALIZATION_WARNING',message,'warning'))];
  return {
    core:structuredClone(result.plan.act),
    interlingua:result.plan.realization ? structuredClone(result.plan.realization) : null,
    dialogueAct:structuredClone(result.plan.act),
    plan:structuredClone(result.plan),
    text:result.text,
    warnings,
    diagnostics,
    alternatives:[...(result.alternatives || [])],
    informationLoss:[...(result.informationLoss || [])],
    conversation:snapshotOf(session),
    turnCount:result.turnCount,
    focus:structuredClone(result.focus)
  };
}

/**
 * Coordinates an Engine with sessions. Sessions must be created by this
 * facade, so a caller cannot accidentally route turns through another Engine.
 */
export class DialogueEngine {
  #engine;
  #sessions=new WeakSet();

  constructor(engine) {
    if (!engine?.analyzeCandidates || !engine?.realize || !engine?.language ||
        !engine?.planResponse || !engine?.respond) {
      throw new Error('DialogueEngine requires an Engine with parsing, planning, and realization APIs.');
    }
    this.#engine=engine;
  }

  createSession(options) {
    const session=new ConversationContext(this.#engine,options);
    this.#sessions.add(session);
    return session;
  }

  #session(session) {
    if (!this.#sessions.has(session)) {
      throw new Error('Session must be created by this DialogueEngine instance.');
    }
  }

  #nextTurnArgs(request={}) {
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).some(key=>!NEXT_TURN_FIELDS.has(key))) {
      throw new Error('Invalid nextTurn request fields.');
    }
    const {session,utterance,language,from,to,context={},pronounRealization='repeat',participants,profile}=request;
    this.#session(session);
    if (language !== undefined && from !== undefined && language !== from) {
      throw new Error('Specify one source language using language or from.');
    }
    const parsed=normalizeUtterance(utterance,language,from);
    const source=from || language || parsed.language;
    const target=to || source;
    if (typeof source !== 'string' || !source || typeof target !== 'string' || !target) {
      throw new Error('A source language and utterance are required.');
    }
    this.#engine.language(source);
    if (target !== 'core') this.#engine.language(target);
    return {session,translation:{text:parsed.text,from:source,to:target,context,
      pronounRealization,participants,profile}};
  }

  #respondArgs(request={}) {
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).some(key=>!RESPOND_FIELDS.has(key))) {
      throw new Error('Invalid respond request fields.');
    }
    this.#session(request.session);
    return {session:request.session,options:{to:request.to,facts:request.facts,
      clarifyQuestion:request.clarifyQuestion,participants:request.participants,
      profile:request.profile}};
  }

  /** Parse and realize one utterance, committing the session turn only on success. */
  tryNextTurn(request) {
    try {
      const {session,translation}=this.#nextTurnArgs(request);
      const result=session.tryTranslate(translation);
      if (!result.ok) {
        return {ok:false,error:result.error,
          diagnostics:diagnosticsFor(result.error,result.error.code,result.error.message)};
      }
      return {ok:true,value:successfulTurn(result.value,session)};
    } catch (error) {
      const code=errorCode(error),message=error?.message || 'Dialogue turn failed.';
      return {ok:false,error:{code,message,
        ...(error?.status?{status:error.status}:{}),
        ...(Array.isArray(error?.diagnostics)?{diagnostics:error.diagnostics}:{})},
        diagnostics:diagnosticsFor(error,code,message)};
    }
  }

  nextTurn(request) {
    const result=this.tryNextTurn(request);
    if (!result.ok) {
      const error=new Error(result.error.message);
      error.code=result.error.code;
      if (result.error.status !== undefined) error.status=result.error.status;
      error.diagnostics=result.diagnostics;
      throw error;
    }
    return result.value;
  }

  /** Plan, realize, and record a reply to the latest pending question. */
  tryRespond(request) {
    try {
      const {session,options}=this.#respondArgs(request);
      const result=session.respond(options);
      return {ok:true,value:successfulResponse(result,session)};
    } catch (error) {
      const code=errorCode(error),message=error?.message || 'Dialogue response failed.';
      return {ok:false,error:{code,message,
        ...(error?.status?{status:error.status}:{}),
        ...(Array.isArray(error?.diagnostics)?{diagnostics:error.diagnostics}:{})},
        diagnostics:diagnosticsFor(error,code,message)};
    }
  }

  respond(request) {
    const result=this.tryRespond(request);
    if (!result.ok) {
      const error=new Error(result.error.message);
      error.code=result.error.code;
      if (result.error.status !== undefined) error.status=result.error.status;
      error.diagnostics=result.diagnostics;
      throw error;
    }
    return result.value;
  }
}

export function createDialogueEngine(engine) {
  return new DialogueEngine(engine);
}
