const DOMAIN_STATUSES = new Set(['unsupported', 'invalid', 'ambiguous', 'resource_limit']);
const UNSUPPORTED_CODES = new Set([
  'PLUGIN_NOT_FOUND', 'PLUGIN_PACKAGE_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE',
  'PLUGIN_DIRECTION_UNAVAILABLE', 'PLUGIN_CAPABILITY_UNAVAILABLE', 'UNSUPPORTED_LANGUAGE',
  'UNSUPPORTED_CONSTRUCTION', 'UNRESOLVED_DEIXIS', 'UNRESOLVED_ANAPHORA'
]);
const AMBIGUOUS_CODES = new Set(['AMBIGUOUS_ANAPHORA', 'AMBIGUOUS_CONVERSATION_READING']);
const UNKNOWN_RESPONSE_REASONS = new Set(['insufficient_context', 'ambiguous', 'unsupported']);
const UNKNOWN_RESPONSE_MESSAGES = Object.freeze({
  insufficient_context: 'No matching fact in this conversation supports an answer to the question.',
  ambiguous: 'Conflicting facts in this conversation support different answers.',
  unsupported: 'The response planner cannot answer this question under the supported policy.'
});

function diagnosticEvents(diagnostics = []) {
  return diagnostics.map(item => ({type: 'diagnostic', ...item,
    severity: item.severity ?? 'error'}));
}

function uniqueDiagnostics(...groups) {
  const diagnostics = [];
  const seen = new Map();
  for (const group of groups) {
    for (const item of group ?? []) {
      if (!item || typeof item !== 'object') continue;
      const key = typeof item.code === 'string' && typeof item.message === 'string' ?
        `${item.code}\u0000${item.message}` : JSON.stringify(item);
      if (seen.has(key)) {
        const index = seen.get(key);
        diagnostics[index] = {...diagnostics[index], ...item};
        continue;
      }
      seen.set(key, diagnostics.length);
      diagnostics.push(item);
    }
  }
  return diagnostics;
}

function failureDiagnostics(result) {
  const diagnostics = uniqueDiagnostics(result?.diagnostics, result?.error?.diagnostics);
  if (diagnostics.length) return diagnostics;
  return result?.error ? [result.error] : [];
}

function statusFor(error) {
  if (DOMAIN_STATUSES.has(error?.status)) return error.status;
  if (error?.status === 'error') return 'error';
  if (UNSUPPORTED_CODES.has(error?.code)) return 'unsupported';
  if (AMBIGUOUS_CODES.has(error?.code)) return 'ambiguous';
  if (error?.code === 'INVALID_INPUT') return 'invalid';
  if (error?.code === 'CONTEXT_LIMIT') return 'resource_limit';
  return 'error';
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function responsePlanEnvelope(plan) {
  return isRecord(plan) && plan.type === 'response_plan' &&
    isRecord(plan.act) && plan.act.type === 'dialogue_act' &&
    typeof plan.act.act === 'string' && Array.isArray(plan.evidence) &&
    isRecord(plan.confidence) && typeof plan.confidence.level === 'string' &&
    Number.isSafeInteger(plan.confidence.evidenceCount) &&
    plan.confidence.evidenceCount === plan.evidence.length;
}

function hasRealizedResponse(result) {
  const plan = result?.plan;
  return responsePlanEnvelope(plan) && ['answer', 'clarify'].includes(plan.outcome) &&
    isRecord(plan.realization) && typeof result.text === 'string' && result.text.trim().length > 0 &&
    isRecord(result.dialogueAct) && result.dialogueAct.type === 'dialogue_act' &&
    result.dialogueAct.act === plan.act.act && isRecord(result.interlingua) &&
    JSON.stringify(result.interlingua) === JSON.stringify(plan.realization);
}

function isUnknownResponse(result) {
  const plan = result?.plan;
  if (!responsePlanEnvelope(plan) || plan.outcome !== 'unknown' ||
      !UNKNOWN_RESPONSE_REASONS.has(plan.reason) || plan.realization !== null ||
      plan.act.act !== 'refuse' || plan.act.payload?.reason !== plan.reason ||
      result.text !== null || result.interlingua !== null ||
      result.dialogueAct?.type !== 'dialogue_act' || result.dialogueAct.act !== 'refuse') {
    return false;
  }
  return plan.confidence.level === (plan.reason === 'ambiguous' ? 'ambiguous' : 'none');
}

function responseContractDiagnostic() {
  return {code: 'CHAT_RESPONSE_CONTRACT_INVALID',
    message: 'The dialogue engine returned a missing or inconsistent response plan.',
    severity: 'error'};
}

function errorDetails(error, diagnostics) {
  return {
    ...(error && typeof error === 'object' ? error : {}),
    code: error?.code ?? 'CHAT_SERVICE_ERROR',
    message: error?.message ?? 'The chat operation failed.',
    ...(error?.status ? {status: error.status} : {}),
    diagnostics
  };
}

function safeCall(operation, fallbackCode, fallbackMessage) {
  try {
    return operation();
  } catch (error) {
    const failure = {code: error?.code ?? fallbackCode,
      message: error?.message ?? fallbackMessage};
    const diagnostics = uniqueDiagnostics(error?.diagnostics, [failure]);
    const details = errorDetails({...error, ...failure}, diagnostics);
    return {ok: false, error: details, diagnostics};
  }
}

/** In-memory bounded chat facade over one DialogueEngine session and its declared direction. */
export function createChatService(runtime, {from: requestedFrom, to: requestedTo} = {}) {
  if (!runtime?.engine || typeof runtime.engine.createDialogueEngine !== 'function' ||
      typeof runtime.capabilityCatalog?.translation !== 'function' ||
      typeof runtime.capabilityCatalog?.listLanguages !== 'function' ||
      typeof runtime.capabilityCatalog?.listDirections !== 'function') {
    throw new Error('Chat service requires an initialized runtime and capability catalog.');
  }
  for (const [name, value] of [['from', requestedFrom], ['to', requestedTo]]) {
    if (value !== undefined && (typeof value !== 'string' || !value)) {
      throw new Error(`Chat ${name} language must be a non-empty code.`);
    }
  }

  const catalog = runtime.capabilityCatalog;
  const availableDirections = catalog.listDirections({availableOnly: true});
  const preferred = availableDirections.find(item => item.from === 'en' && item.to === 'en') ??
    availableDirections.find(item => item.from === 'en' && item.to === 'pl') ??
    availableDirections[0];
  const availableLanguages = catalog.listLanguages().filter(item => item.status === 'available')
    .map(item => item.code);
  const fallbackLanguage = availableLanguages.includes('en') ? 'en' : availableLanguages[0] ?? null;
  const defaults = Object.freeze({
    from: requestedFrom ?? preferred?.from ?? fallbackLanguage,
    to: requestedTo ?? (requestedFrom !== undefined ? requestedFrom : preferred?.to ?? fallbackLanguage)
  });
  let direction = {from: defaults.from, to: defaults.to};

  const dialogue = runtime.engine.createDialogueEngine();
  const session = dialogue.createSession();

  function counters(conversation = session.snapshot()) {
    return {
      conversation,
      defaults,
      from: direction.from,
      to: direction.to,
      turnCount: conversation.turnCount,
      maxTurns: conversation.maxTurns,
      eventCount: conversation.eventCount,
      maxEvents: conversation.maxEvents
    };
  }

  function directionFailure(from, to) {
    const result = catalog.translation({from, to});
    if (result.status === 'available') return null;
    const diagnostics = result.diagnostics?.length ? result.diagnostics : [{
      code: result.code ?? 'PLUGIN_CAPABILITY_UNAVAILABLE',
      message: `Chat direction ${from ?? '(unset)'} -> ${to ?? '(unset)'} is unavailable.`
    }];
    const first = diagnostics[0];
    return {
      status: statusFor({code: result.code ?? first.code}),
      error: errorDetails({code: result.code ?? first.code, message: first.message}, diagnostics),
      diagnostics
    };
  }

  function setDirection({from, to} = {}) {
    if (typeof from !== 'string' || !from || typeof to !== 'string' || !to) {
      const diagnostics = [{code: 'INVALID_INPUT',
        message: 'A source and target language are required to change chat direction.',
        severity: 'error'}];
      return {status: 'invalid', code: 'INVALID_INPUT', diagnostics, ...counters()};
    }
    const failure = directionFailure(from, to);
    if (failure) return {...failure, ...counters()};
    const current = session.snapshot();
    if ((current.turnCount > 0 || current.eventCount > 0) &&
        (direction.from !== from || direction.to !== to)) {
      const diagnostics = [{code: 'CHAT_DIRECTION_RESET_REQUIRED',
        message: 'Reset the current session before changing its language direction.', severity: 'warning'}];
      return {status: 'reset_required', code: 'CHAT_DIRECTION_RESET_REQUIRED', diagnostics, ...counters()};
    }
    direction = {from, to};
    return {status: 'ok', diagnostics: [], ...counters()};
  }

  function send({text, from = direction.from, to = direction.to} = {}) {
    const userEvent = {type: 'user_utterance', text, language: from};
    if (typeof text !== 'string' || !text.trim()) {
      const diagnostics = [{code: 'INVALID_INPUT', message: 'Enter a non-empty utterance.',
        severity: 'error'}];
      return {accepted: false, status: 'invalid', responseStatus: 'not_attempted',
        events: [userEvent, ...diagnosticEvents(diagnostics)], diagnostics, ...counters()};
    }

    const selectedDirection = setDirection({from, to});
    if (selectedDirection.status !== 'ok') {
      const diagnostics = selectedDirection.diagnostics ?? [];
      const error = selectedDirection.error ?? errorDetails({
        code: selectedDirection.code ?? diagnostics[0]?.code,
        message: diagnostics[0]?.message
      }, diagnostics);
      return {accepted: false, status: selectedDirection.status, responseStatus: 'not_attempted',
        error, events: [userEvent, ...diagnosticEvents(diagnostics)], diagnostics,
        ...counters(selectedDirection.conversation)};
    }

    const turn = safeCall(() => dialogue.tryNextTurn({session, utterance: text, from, to}),
      'CHAT_TURN_ERROR', 'The dialogue engine could not process this turn.');
    if (!turn.ok) {
      const diagnostics = failureDiagnostics(turn);
      const error = errorDetails(turn.error, diagnostics);
      return {accepted: false, status: statusFor(turn.error), responseStatus: 'not_attempted',
        error, events: [userEvent, ...diagnosticEvents(diagnostics)], diagnostics, ...counters()};
    }

    const value = turn.value;
    const events = [userEvent, {type: 'turn_output', text: value.text, from, to},
      {type: 'semantic_reading', meaning: value.core, dialogueAct: value.dialogueAct,
        alternatives: value.alternatives, informationLoss: value.informationLoss,
        warnings: value.warnings, turnCount: value.turnCount}];
    const turnDiagnostics = uniqueDiagnostics(value.diagnostics);
    events.push(...diagnosticEvents(turnDiagnostics));

    let response = null;
    let responseStatus = 'not_requested';
    let responseDiagnostics = [];
    if (value.dialogueAct?.act === 'ask') {
      const attempt = safeCall(() => dialogue.tryRespond({session, to}),
        'CHAT_RESPONSE_ERROR', 'The dialogue engine could not plan this response.');
      if (!attempt.ok) {
        responseDiagnostics = failureDiagnostics(attempt);
        responseStatus = statusFor(attempt.error);
        response = {status: responseStatus, error: errorDetails(attempt.error, responseDiagnostics)};
        events.push(...diagnosticEvents(responseDiagnostics));
      } else {
        const result = attempt.value;
        const plan = result.plan;
        responseDiagnostics = uniqueDiagnostics(result.diagnostics);
        if (hasRealizedResponse(result)) {
          responseStatus = 'ok';
          response = {status: responseStatus, text: result.text, meaning: result.interlingua,
            dialogueAct: result.dialogueAct, plan, informationLoss: result.informationLoss,
            warnings: result.warnings, diagnostics: responseDiagnostics};
          events.push({type: 'engine_response', text: result.text, meaning: result.interlingua,
            dialogueAct: result.dialogueAct, plan, turnCount: result.turnCount,
            informationLoss: result.informationLoss, warnings: result.warnings});
          events.push(...diagnosticEvents(responseDiagnostics));
        } else if (isUnknownResponse(result)) {
          responseStatus = plan.reason === 'ambiguous' ? 'ambiguous' : 'unsupported';
          response = {status: responseStatus, text: null, plan};
          const refusal = {code: 'RESPONSE_NOT_REALIZABLE',
            message: UNKNOWN_RESPONSE_MESSAGES[plan.reason], severity: 'warning',
            reason: plan.reason, outcome: plan.outcome,
            evidence: structuredClone(plan.evidence), confidence: structuredClone(plan.confidence)};
          responseDiagnostics = uniqueDiagnostics(responseDiagnostics, [refusal]);
          response.diagnostics = responseDiagnostics;
          events.push(...diagnosticEvents(responseDiagnostics));
        } else {
          responseStatus = 'error';
          const contractError = responseContractDiagnostic();
          responseDiagnostics = uniqueDiagnostics(responseDiagnostics, [contractError]);
          response = {status: responseStatus, plan: plan ?? null,
            error: errorDetails(contractError, responseDiagnostics),
            diagnostics: responseDiagnostics};
          events.push(...diagnosticEvents(responseDiagnostics));
        }
      }
    }

    const diagnostics = uniqueDiagnostics(turnDiagnostics, responseDiagnostics);
    return {accepted: true, status: 'ok', responseStatus, response, events,
      warnings: value.warnings ?? [], diagnostics, ...counters()};
  }

  function reset() {
    const conversation = session.reset();
    return {status: 'ok', events: [], diagnostics: [], ...counters(conversation)};
  }

  return Object.freeze({snapshot: counters, send, setDirection, reset});
}
