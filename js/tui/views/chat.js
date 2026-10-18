import {appendOperation, isCurrentRequest} from '../state.js';

export function createChatView({chatService, capabilityCatalog, state: modeState, workspaceState} = {}) {
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
  state.settings.from = state.from;
  state.settings.to = state.to;

  function focusTargets() {
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

  function capabilityText(status) {
    return ({available: 'obsługiwane w ograniczonym zakresie',
      partial: 'częściowo zadeklarowane', unsupported: 'niedostępne',
      undeclared: 'niezadeklarowane', provider_unavailable: 'provider niedostępny'})[status] ??
      'dostępność nieznana';
  }

  function capabilityAvailability(language, channel, operation) {
    const capabilities = capabilityCatalog?.chat?.({language});
    if (!capabilities || capabilities.status !== 'capabilities_only') return 'nieznana';
    return capabilityText(capabilities[channel]?.[operation]?.status);
  }

  function questionCapability(language, operation) {
    const capabilities = capabilityCatalog?.chat?.({language});
    return capabilities?.status === 'capabilities_only' ? capabilities.questions?.[operation] : null;
  }

  function questionEvidenceId(summary) {
    return (summary?.declarations ?? []).filter(declaration => declaration.status === 'implemented' &&
      declaration.construction === 'question.yes-no').flatMap(declaration =>
      (declaration.evidence ?? []).map(item => item?.id).filter(id => typeof id === 'string'));
  }

  function scopeLines() {
    const analyze = questionCapability(state.from, 'analyze');
    const realize = questionCapability(state.to, 'realize');
    const sourceHasQuestion = analyze?.constructions?.includes('question.yes-no') === true;
    const targetHasQuestion = realize?.constructions?.includes('question.yes-no') === true;
    const lines = [
      {text: `Zdania · ${state.from ?? '?'} analiza ${capabilityAvailability(state.from,
        'sentence', 'analyze')} · ${state.to ?? '?'} realizacja ${capabilityAvailability(state.to,
        'sentence', 'realize')}.`, tone: 'muted'},
      {text: `Pytania · ${state.from ?? '?'} analiza ${capabilityAvailability(state.from,
        'questions', 'analyze')} · ${state.to ?? '?'} realizacja ${capabilityAvailability(state.to,
        'questions', 'realize')}.`, tone: 'muted'}
    ];
    if (sourceHasQuestion && targetHasQuestion) {
      const evidence = [...new Set([...questionEvidenceId(analyze), ...questionEvidenceId(realize)])];
      lines.push({text: 'Zakres · question.yes-no: pytanie tak/nie o widzeniu w czasie teraźniejszym. ' +
        'Odpowiedź zależy od faktów sesji i rozstrzygniętych referentów.', tone: 'muted'});
      lines.push({text: `Dowody · ${evidence.length ? evidence.join(' · ') :
        'identyfikatory dowodu niezadeklarowane'}.`, tone: 'muted'});
    } else {
      lines.push({text: `Zakres · brak wspólnej deklaracji question.yes-no dla ${state.from ?? '?'}→${
        state.to ?? '?'}.`, tone: 'warning'});
    }
    return lines;
  }

  function countersText(result = state) {
    const turns = Number.isSafeInteger(result.turnCount) ? result.turnCount : 0;
    const maxTurns = Number.isSafeInteger(result.maxTurns) ? result.maxTurns : '?';
    const events = Number.isSafeInteger(result.eventCount) ? result.eventCount : 0;
    const maxEvents = Number.isSafeInteger(result.maxEvents) ? result.maxEvents : '?';
    return `akty ${turns}/${maxTurns} · zdarzenia ${events}/${maxEvents}`;
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
      ` · odpowiedź ${result.responseStatus}` : '';
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

  function handleAction(action, {focus} = {}) {
    if (focus?.id === 'history' && action.type === 'text' && ['j', 'k'].includes(action.value.toLowerCase())) {
      state.scrollTop = Math.max(0, state.scrollTop + (action.value.toLowerCase() === 'j' ? 1 : -1));
      return true;
    }
    if (focus?.id === 'history' && action.type === 'submit') return true;
    return false;
  }

  function render({focus} = {}) {
    const events = conversationEvents();
    const historyLines = events.length ? events.flatMap(event => [
      {text: event.text ?? event.message ?? event.type ?? 'Zdarzenie usługi', tone: 'neutral'},
      {text: '', tone: 'muted'}
    ]) : [{text: 'Brak wiadomości. Wpisz zdanie z ograniczonego zakresu.', tone: 'muted'}];
    return {panels: [{title: `${focus?.id === 'history' ? '› ' : ''}Rozmowa`, lines: historyLines}]};
  }

  return {
    id: 'chat',
    label: 'Chat',
    state,
    fieldLabel: 'Message',
    composerPrompt: 'Napisz wiadomość lub /polecenie…',
    actionLabel: 'Send',
    statusLine() {
      return {text: `Sesja lokalna · ${state.from ?? '?'}→${state.to ?? '?'} · ${countersText()}`,
        tone: 'muted'};
    },
    emptyStateLines() {
      return [
        {text: 'Sesja jest lokalna i ograniczona do danych oraz reguł Engine.', tone: 'muted'},
        ...scopeLines(),
        {text: 'Engine odpowiada tylko na podstawie dopasowanych faktów i rozstrzygniętych referentów.',
          tone: 'muted'}
      ];
    },
    countersText,
    focusTargets,
    handleAction,
    onSubmit: send,
    render
  };
}
