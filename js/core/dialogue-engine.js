/** Offline orchestration API for bounded multi-turn PL/EN sessions. */
import {ConversationContext} from './conversation.js';

export const DIALOGUE_ENGINE_VERSION = '1.0';

const NEXT_TURN_FIELDS = new Set([
  'session','utterance','language','from','to','context','pronounRealization','participants'
]);
const RESPOND_FIELDS = new Set(['session','to','facts','clarifyQuestion','participants']);

function diagnostic(code,message,severity='error') {
  return {code,message,severity};
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
  return {
    core:structuredClone(result.interlingua),
    interlingua:structuredClone(result.interlingua),
    dialogueAct:structuredClone(result.dialogueAct),
    text:result.text,
    warnings,
    diagnostics:warnings.map(message=>diagnostic('REALIZATION_WARNING',message,'warning')),
    alternatives:[...(result.alternatives || [])],
    conversation:snapshotOf(session),
    turnCount:result.turnCount,
    focus:structuredClone(result.focus)
  };
}

function successfulResponse(result,session) {
  const warnings=[...(result.warnings || [])];
  return {
    core:structuredClone(result.plan.act),
    interlingua:result.plan.realization ? structuredClone(result.plan.realization) : null,
    dialogueAct:structuredClone(result.plan.act),
    plan:structuredClone(result.plan),
    text:result.text,
    warnings,
    diagnostics:warnings.map(message=>diagnostic('REALIZATION_WARNING',message,'warning')),
    alternatives:[...(result.alternatives || [])],
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
    const {session,utterance,language,from,to,context={},pronounRealization='repeat',participants}=request;
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
      pronounRealization,participants}};
  }

  #respondArgs(request={}) {
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).some(key=>!RESPOND_FIELDS.has(key))) {
      throw new Error('Invalid respond request fields.');
    }
    this.#session(request.session);
    return {session:request.session,options:{to:request.to,facts:request.facts,
      clarifyQuestion:request.clarifyQuestion,participants:request.participants}};
  }

  /** Parse and realize one utterance, committing the session turn only on success. */
  tryNextTurn(request) {
    try {
      const {session,translation}=this.#nextTurnArgs(request);
      const result=session.tryTranslate(translation);
      if (!result.ok) {
        return {ok:false,error:result.error,
          diagnostics:[diagnostic(result.error.code,result.error.message)]};
      }
      return {ok:true,value:successfulTurn(result.value,session)};
    } catch (error) {
      const code=errorCode(error),message=error?.message || 'Dialogue turn failed.';
      return {ok:false,error:{code,message},diagnostics:[diagnostic(code,message)]};
    }
  }

  nextTurn(request) {
    const result=this.tryNextTurn(request);
    if (!result.ok) {
      const error=new Error(result.error.message);
      error.code=result.error.code;
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
      return {ok:false,error:{code,message},diagnostics:[diagnostic(code,message)]};
    }
  }

  respond(request) {
    const result=this.tryRespond(request);
    if (!result.ok) {
      const error=new Error(result.error.message);
      error.code=result.error.code;
      error.diagnostics=result.diagnostics;
      throw error;
    }
    return result.value;
  }
}

export function createDialogueEngine(engine) {
  return new DialogueEngine(engine);
}
