function meaningSummary(meaning) {
  if (!meaning || typeof meaning !== 'object') return 'MeaningGraph unavailable';
  const label = meaning.concept ?? meaning.kind ?? meaning.type ?? 'graph';
  const roles = Object.entries(meaning.roles ?? {}).map(([role, value]) =>
    `${role}: ${value?.concept ?? value?.referent ?? 'unspecified'}`);
  return `${label}${roles.length ? ` · ${roles.join(', ')}` : ''}`;
}

function eventLines(event) {
  if (event.type === 'user_utterance') {
    return [{text: `You (${event.language ?? 'unknown'}): ${event.text ?? ''}`, tone: 'neutral'}];
  }
  if (event.type === 'turn_output') {
    return [{text: `Turn output (${event.from ?? 'unknown'} -> ${event.to ?? 'unknown'}): ${
      event.text ?? ''}`, tone: 'accent'}];
  }
  if (event.type === 'semantic_reading') {
    return [
      {text: `Semantic reading${event.dialogueAct?.act ? ` · ${event.dialogueAct.act}` : ''}`, tone: 'accent'},
      {text: `MeaningGraph: ${meaningSummary(event.meaning)}`, tone: 'muted'},
      ...(event.alternatives?.length ? [{text: `Alternatives: ${event.alternatives.length}`,
        tone: 'muted'}] : []),
      ...(event.informationLoss?.length ? [{text: `Information loss: ${event.informationLoss.length}`,
        tone: 'warning'}] : [])
    ];
  }
  if (event.type === 'engine_response') {
    return [
      {text: `Engine response: ${event.text ?? ''}`, tone: 'accent'},
      ...(event.meaning ? [{text: `Response meaning: ${meaningSummary(event.meaning)}`,
        tone: 'muted'}] : []),
      ...(event.informationLoss?.length ? [{text: `Information loss: ${event.informationLoss.length}`,
        tone: 'warning'}] : [])
    ];
  }
  if (event.type === 'diagnostic') {
    const code = event.code ? ` ${event.code}` : '';
    const message = event.message ? ` — ${event.message}` : '';
    return [{text: `Diagnostic (${event.severity ?? 'error'})${code}${message}`, tone: 'warning'}];
  }
  return [{text: `Service event: ${event.type ?? 'unknown'}`, tone: 'muted'}];
}

export function createChatView({chatService} = {}) {
  if (!chatService || typeof chatService.send !== 'function' ||
      typeof chatService.reset !== 'function' || typeof chatService.snapshot !== 'function') {
    throw new Error('Chat view requires the application Chat service.');
  }

  const initial = chatService.snapshot();
  const state = {
    draft: '',
    cursor: 0,
    focusIndex: 0,
    status: '',
    defaults: initial.defaults,
    from: initial.from ?? initial.defaults?.from ?? null,
    to: initial.to ?? initial.defaults?.to ?? null,
    turnCount: initial.turnCount,
    maxTurns: initial.maxTurns,
    eventCount: initial.eventCount,
    maxEvents: initial.maxEvents,
    lastStatus: '',
    history: [],
    scrollTop: 0,
    confirmReset: false
  };

  function focusTargets() {
    if (state.confirmReset) return [
      {id: 'confirm_reset', type: 'action', label: 'Reset session'},
      {id: 'cancel_reset', type: 'action', label: 'Keep session'}
    ];
    return [
      {id: 'draft', type: 'input', label: 'Message'},
      {id: 'send', type: 'action', label: 'Send'},
      {id: 'history', type: 'action', label: 'Conversation'}
    ];
  }

  function updateCounters(result) {
    if (Number.isSafeInteger(result.turnCount)) state.turnCount = result.turnCount;
    if (Number.isSafeInteger(result.maxTurns)) state.maxTurns = result.maxTurns;
    if (Number.isSafeInteger(result.eventCount)) state.eventCount = result.eventCount;
    if (Number.isSafeInteger(result.maxEvents)) state.maxEvents = result.maxEvents;
  }

  function addServiceFailure(error) {
    state.history.push({type: 'diagnostic', code: error?.code ?? 'CHAT_SERVICE_ERROR',
      message: error?.message ?? 'The chat service failed.', severity: 'error'});
    state.scrollTop = Number.MAX_SAFE_INTEGER;
    state.lastStatus = 'error';
  }

  function send() {
    const text = state.draft;
    try {
      const result = chatService.send({text, from: state.from, to: state.to});
      state.history.push(...(Array.isArray(result.events) ? result.events : []));
      state.scrollTop = Number.MAX_SAFE_INTEGER;
      updateCounters(result);
      const responseStatus = result.responseStatus &&
        !['not_requested', 'not_attempted'].includes(result.responseStatus) ?
        ` · response ${result.responseStatus}` : '';
      state.lastStatus = `${result.status ?? 'error'}${responseStatus}`;
      if (result.accepted && text.trim()) {
        state.draft = '';
        state.cursor = 0;
      }
      state.status = '';
    } catch (error) {
      addServiceFailure(error);
    }
  }

  function resetSession() {
    try {
      const result = chatService.reset();
      if (result.status !== 'ok') {
        addServiceFailure(result.error ?? new Error('The session could not be reset.'));
        state.confirmReset = false;
        state.focusIndex = 0;
        return;
      }
      state.history = [];
      state.scrollTop = 0;
      updateCounters(result);
      state.lastStatus = '';
      state.status = '';
      state.confirmReset = false;
      state.focusIndex = 0;
    } catch (error) {
      addServiceFailure(error);
      state.confirmReset = false;
      state.focusIndex = 0;
    }
  }

  function handleAction(action, {focus} = {}) {
    if (!state.confirmReset) {
      if (focus?.id === 'history' && action.type === 'text' && ['j', 'k'].includes(action.value.toLowerCase())) {
        state.scrollTop = Math.max(0, state.scrollTop + (action.value.toLowerCase() === 'j' ? 1 : -1));
        return true;
      }
      if (focus?.id === 'history' && action.type === 'submit') return true;
      return false;
    }
    if (action.type === 'escape') {
      state.confirmReset = false;
      state.focusIndex = 0;
      return true;
    }
    if (action.type === 'cursor_left' || action.type === 'cursor_right') {
      state.focusIndex = action.type === 'cursor_left' ? 0 : 1;
      return true;
    }
    if (action.type === 'submit') {
      if (focus?.id === 'confirm_reset') resetSession();
      else {
        state.confirmReset = false;
        state.focusIndex = 0;
      }
      return true;
    }
    return false;
  }

  function render({focus} = {}) {
    if (state.confirmReset) {
      const selected = state.focusIndex === 0 ? 'confirm_reset' : 'cancel_reset';
      return {panels: [{title: 'Start a new local session?', lines: [
        {text: 'Reset starts a new local session and clears its conversation history.', tone: 'warning'},
        {text: `${selected === 'confirm_reset' ? '›' : ' '} [Reset session]`,
          tone: selected === 'confirm_reset' ? 'accent' : 'neutral'},
        {text: `${selected === 'cancel_reset' ? '›' : ' '} [Keep session]`,
          tone: selected === 'cancel_reset' ? 'accent' : 'neutral'},
        {text: 'Tab or ←/→ to choose · Enter to confirm · Esc to cancel', tone: 'muted'}
      ]}]};
    }

    const inputLines = [
      ...(state.lastStatus ? [{text: `Last send: ${state.lastStatus}`,
        tone: state.lastStatus === 'ok' ? 'muted' : 'warning'}] : [])
    ];
    const historyLines = state.history.length ? state.history.flatMap(event => [
      ...eventLines(event), {text: '', tone: 'muted'}
    ]) : [{text: 'No messages yet.', tone: 'muted'}];
    return {panels: [
      {title: 'Chat', kind: 'input', lines: inputLines},
      {title: `${focus?.id === 'history' ? '› ' : ''}Conversation`, lines: historyLines}
    ]};
  }

  return {
    id: 'chat',
    label: 'Chat',
    state,
    fieldLabel: 'Message',
    actionLabel: 'Send',
    statusLine() {
      return {text: `Session status: local · ${state.from ?? '?'} -> ${state.to ?? '?'} · turns ${
        state.turnCount}/${state.maxTurns} · events ${state.eventCount}/${state.maxEvents}`,
        tone: 'muted'};
    },
    focusTargets,
    handleAction,
    onSubmit: send,
    onNewSession() {
      if (state.confirmReset) return;
      state.confirmReset = true;
      state.focusIndex = 0;
    },
    render
  };
}
