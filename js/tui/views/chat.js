import {appendOperation, clearModeEntries, invalidateRequests, isCurrentRequest} from '../state.js';

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

export function createChatView({chatService, state: modeState, workspaceState} = {}) {
  if (!chatService || typeof chatService.send !== 'function' ||
      typeof chatService.reset !== 'function' || typeof chatService.snapshot !== 'function') {
    throw new Error('Chat view requires the application Chat service.');
  }

  const initial = chatService.snapshot();
  const state = modeState ?? {draft: '', cursor: 0, status: '', settings: {}, scrollTop: 0};
  state.settings ??= {};
  state.defaults ??= initial.defaults;
  state.from ??= initial.from ?? initial.defaults?.from ?? null;
  state.to ??= initial.to ?? initial.defaults?.to ?? null;
  state.turnCount ??= initial.turnCount;
  state.maxTurns ??= initial.maxTurns;
  state.eventCount ??= initial.eventCount;
  state.maxEvents ??= initial.maxEvents;
  state.lastStatus ??= '';
  state.confirmReset ??= false;
  state.settings.from = state.from;
  state.settings.to = state.to;

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

  function conversationEvents() {
    return workspaceState ? state.entries.flatMap(entry => entry.events ?? []) : state.history ?? [];
  }

  function addServiceFailure(error, {input = state.draft, requestToken} = {}) {
    const event = {type: 'diagnostic', code: error?.code ?? 'CHAT_SERVICE_ERROR',
      message: error?.message ?? 'The chat service failed.', severity: 'error'};
    if (workspaceState) {
      appendOperation(workspaceState, 'chat', {input, from: state.from, to: state.to,
        status: 'error', accepted: false, output: null, rawResult: error,
        events: [event]}, requestToken);
    } else {
      state.history ??= [];
      state.history.push(event);
    }
    state.scrollTop = Number.MAX_SAFE_INTEGER;
    state.lastStatus = 'error';
  }

  async function send({requestToken} = {}) {
    const text = state.draft;
    const from = state.from;
    const to = state.to;
    let result;
    try {
      result = await chatService.send({text, from, to});
    } catch (error) {
      result = {accepted: false, status: 'error', responseStatus: 'not_attempted',
        events: [{type: 'user_utterance', text, language: from},
          {type: 'diagnostic', code: error?.code ?? 'CHAT_SERVICE_ERROR',
            message: error?.message ?? 'The chat service failed.', severity: 'error'}],
        diagnostics: [{code: error?.code ?? 'CHAT_SERVICE_ERROR',
          message: error?.message ?? 'The chat service failed.'}]};
    }
    if (workspaceState && requestToken && !isCurrentRequest(workspaceState, requestToken)) return null;
    const events = Array.isArray(result.events) ? result.events : [];
    if (!workspaceState) {
      state.history ??= [];
      state.history.push(...events);
    }
    updateCounters(result);
    const responseStatus = result.responseStatus &&
      !['not_requested', 'not_attempted'].includes(result.responseStatus) ?
      ` · response ${result.responseStatus}` : '';
    state.lastStatus = `${result.status ?? 'error'}${responseStatus}`;
    if (result.accepted && text.trim() && state.draft === text) {
      state.draft = '';
      state.cursor = 0;
    }
    state.status = '';
    state.scrollTop = Number.MAX_SAFE_INTEGER;
    const output = result.response?.text ??
      events.find(event => event.type === 'engine_response')?.text ??
      events.find(event => event.type === 'turn_output')?.text ?? null;
    if (workspaceState) appendOperation(workspaceState, 'chat', {input: text, from, to,
      status: result.status ?? 'error', accepted: result.accepted === true, output,
      rawResult: result, events}, requestToken);
    return result;
  }

  async function resetSession({requestToken, setFocus} = {}) {
    try {
      const result = await chatService.reset();
      if (workspaceState && requestToken && !isCurrentRequest(workspaceState, requestToken)) return null;
      if (result.status !== 'ok') {
        addServiceFailure(result.error ?? new Error('The session could not be reset.'),
          {input: 'reset', requestToken});
        state.confirmReset = false;
        if (workspaceState) {
          workspaceState.overlay = null;
          workspaceState.pendingConfirmation = null;
        }
        setFocus?.('draft');
        return;
      }
      if (workspaceState) {
        invalidateRequests(workspaceState);
        clearModeEntries(workspaceState, 'chat');
        workspaceState.overlay = null;
        workspaceState.pendingConfirmation = null;
      } else state.history = [];
      state.scrollTop = 0;
      updateCounters(result);
      state.lastStatus = '';
      state.status = '';
      state.draft = '';
      state.cursor = 0;
      state.confirmReset = false;
      setFocus?.('draft');
    } catch (error) {
      if (workspaceState && requestToken && !isCurrentRequest(workspaceState, requestToken)) return null;
      addServiceFailure(error, {input: 'reset', requestToken});
      state.confirmReset = false;
      if (workspaceState) {
        workspaceState.overlay = null;
        workspaceState.pendingConfirmation = null;
      }
      setFocus?.('draft');
    }
  }

  function handleAction(action, {focus, requestToken, setFocus} = {}) {
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
      if (workspaceState) workspaceState.overlay = null;
      if (workspaceState) workspaceState.pendingConfirmation = null;
      setFocus?.('draft');
      return true;
    }
    if (action.type === 'cursor_left' || action.type === 'cursor_right') {
      setFocus?.(action.type === 'cursor_left' ? 'confirm_reset' : 'cancel_reset');
      return true;
    }
    if (action.type === 'submit') {
      if (focus?.id === 'confirm_reset') return resetSession({requestToken, setFocus});
      else {
        state.confirmReset = false;
        if (workspaceState) workspaceState.overlay = null;
        if (workspaceState) workspaceState.pendingConfirmation = null;
        setFocus?.('draft');
      }
      return true;
    }
    return false;
  }

  function render({focus} = {}) {
    if (state.confirmReset) {
      const selected = focus?.id === 'cancel_reset' ? 'cancel_reset' : 'confirm_reset';
      return {panels: [{title: 'Rozpocząć nową lokalną sesję?', lines: [
        {text: 'Reset wyczyści kontekst Engine, historię i draft tej sesji.', tone: 'warning'},
        {text: `${selected === 'confirm_reset' ? '›' : ' '} [Rozpocznij nową sesję]`,
          tone: selected === 'confirm_reset' ? 'accent' : 'neutral'},
        {text: `${selected === 'cancel_reset' ? '›' : ' '} [Zachowaj sesję]`,
          tone: selected === 'cancel_reset' ? 'accent' : 'neutral'},
        {text: 'Tab lub ←/→ wybór · Enter zatwierdź · Esc anuluj', tone: 'muted'}
      ]}]};
    }

    const events = conversationEvents();
    const historyLines = events.length ? events.flatMap(event => [
      ...eventLines(event), {text: '', tone: 'muted'}
    ]) : [{text: 'No messages yet.', tone: 'muted'}];
    return {panels: [{title: `${focus?.id === 'history' ? '› ' : ''}Conversation`, lines: historyLines}]};
  }

  return {
    id: 'chat',
    label: 'Chat',
    state,
    fieldLabel: 'Message',
    composerPrompt: 'Napisz wiadomość lub /polecenie…',
    actionLabel: 'Send',
    statusLine() {
      return {text: `Sesja lokalna · ${state.from ?? '?'} → ${state.to ?? '?'} · akty ${
        state.turnCount}/${state.maxTurns} · zdarzenia ${state.eventCount}/${state.maxEvents}`,
        tone: 'muted'};
    },
    focusTargets,
    handleAction,
    onSubmit: send,
    onNewSession({setFocus} = {}) {
      if (state.confirmReset) return;
      state.confirmReset = true;
      if (workspaceState) {
        workspaceState.overlay = {type: 'confirmation', action: 'reset_chat'};
        workspaceState.pendingConfirmation = {action: 'reset_chat', mode: 'chat'};
      }
      setFocus?.('cancel_reset');
    },
    render
  };
}
