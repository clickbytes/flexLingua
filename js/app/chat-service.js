function diagnosticEvents(diagnostics = []) {
  return diagnostics.map(item => ({type: 'diagnostic', ...item,
    severity: item.severity ?? 'error'}));
}

/** In-memory bounded chat facade over a single DialogueEngine session. */
export function createChatService(runtime, {language = 'en'} = {}) {
  if (!runtime?.engine) throw new Error('Chat service requires an initialized application runtime.');
  if (typeof language !== 'string' || !language) throw new Error('Chat language must be a code.');
  const dialogue = runtime.engine.createDialogueEngine();
  const session = dialogue.createSession();

  function counters() {
    const conversation = session.snapshot();
    return {conversation, turnCount: conversation.turnCount, maxTurns: conversation.maxTurns};
  }

  function send({text, from = language, to = from} = {}) {
    const events = [{type: 'user_utterance', text, language: from}];
    if (typeof text !== 'string' || !text.trim()) {
      const diagnostics = [{code: 'INVALID_INPUT', message: 'Enter a non-empty utterance.',
        severity: 'error'}];
      return {status: 'invalid', events: [...events, ...diagnosticEvents(diagnostics)],
        diagnostics, ...counters()};
    }

    const turn = dialogue.tryNextTurn({session, utterance: text, language: from, to});
    if (!turn.ok) {
      const diagnostics = turn.diagnostics?.length ? turn.diagnostics : [turn.error];
      return {status: turn.error?.status ?? 'error',
        events: [...events, ...diagnosticEvents(diagnostics)], error: turn.error,
        diagnostics, ...counters()};
    }

    const value = turn.value;
    events.push({type: 'semantic_reading', meaning: value.core, dialogueAct: value.dialogueAct,
      alternatives: value.alternatives, informationLoss: value.informationLoss,
      turnCount: value.turnCount});
    events.push(...diagnosticEvents(value.diagnostics ?? []));

    if (value.dialogueAct?.act === 'ask') {
      const response = dialogue.tryRespond({session, to});
      if (!response.ok) {
        const diagnostics = response.diagnostics?.length ? response.diagnostics : [response.error];
        events.push(...diagnosticEvents(diagnostics));
      } else if (response.value.plan?.realization && typeof response.value.text === 'string' &&
          response.value.text.length > 0) {
        events.push({type: 'engine_response', text: response.value.text,
          meaning: response.value.interlingua, dialogueAct: response.value.dialogueAct,
          plan: response.value.plan, turnCount: response.value.turnCount,
          informationLoss: response.value.informationLoss,
          diagnostics: response.value.diagnostics});
        events.push(...diagnosticEvents(response.value.diagnostics ?? []));
      } else {
        const plan = response.value.plan;
        events.push({type: 'diagnostic', code: 'RESPONSE_NOT_REALIZABLE',
          message: 'The response planner did not provide a supported realization.',
          severity: 'warning', reason: plan?.reason ?? null, outcome: plan?.outcome ?? null});
      }
    }

    return {status: 'ok', events, ...counters()};
  }

  function reset() {
    const conversation = session.reset();
    return {status: 'ok', events: [], conversation,
      turnCount: conversation.turnCount, maxTurns: conversation.maxTurns};
  }

  return Object.freeze({language, snapshot: counters, send, reset});
}
