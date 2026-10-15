const UI = {
  pl: {
    eyebrow: '05 / Rozmowa', heading: 'Rozmowa w wielu turach',
    intro: 'Wysyłaj wypowiedzi między jawnie wskazanymi rozmówcami. Historia jest prowadzona przez DialogueEngine.',
    controls: 'Ustawienia sesji', profileHelp: 'Profil zmienia wyłącznie obsługiwane opcje realizacji tekstu.',
    uiLanguage: 'Język interfejsu', pronouns: 'Zaimki', variant: 'Wariant tekstu',
    compose: 'Nowa wypowiedź', speaker: 'Mówca', addressee: 'Adresat', from: 'Język wypowiedzi',
    to: 'Język wyniku', text: 'Wypowiedź', placeholder: 'Wpisz jedno zdanie…', send: 'Dodaj turę',
    reply: 'Odpowiedz na pytanie', reset: 'Resetuj rozmowę', history: 'Historia tur',
    empty: 'Brak tur. Wpisz wypowiedź, aby rozpocząć.', ready: 'Rozmowa gotowa.',
    turn: 'Tura', speakerLine: 'Mówca', recipientLine: 'Adresat', sourceLine: 'Oryginał',
    resultLine: 'Wynik',
    intents: {assert: 'Stwierdzenie', ask: 'Pytanie', answer: 'Odpowiedź',
      clarify: 'Doprecyzowanie', refuse: 'Odmowa'},
    count: (used, max) => `${used} / ${max} tur`,
    state: (used, max, pending) => `Tury: ${used} / ${max}${pending ? ' · Oczekuje odpowiedź' : ''}`,
    accepted: 'Dodano turę.', responded: 'Dodano odpowiedź.', resetDone: 'Rozmowa została zresetowana.',
    rejected: (code, message) => `Nie dodano tury (${code}): ${message}`,
    names: {you: 'Ty', assistant: 'Asystent'}
  },
  en: {
    eyebrow: '05 / Dialogue', heading: 'Multi-turn conversation',
    intro: 'Send utterances between explicitly identified participants. DialogueEngine manages the session history.',
    controls: 'Session settings', profileHelp: 'The profile changes only supported text realization options.',
    uiLanguage: 'Interface language', pronouns: 'Pronouns', variant: 'Wording variant',
    compose: 'New utterance', speaker: 'Speaker', addressee: 'Addressee', from: 'Utterance language',
    to: 'Output language', text: 'Utterance', placeholder: 'Enter one sentence…', send: 'Add turn',
    reply: 'Answer question', reset: 'Reset conversation', history: 'Turn history',
    empty: 'No turns yet. Enter an utterance to begin.', ready: 'Conversation ready.',
    turn: 'Turn', speakerLine: 'Speaker', recipientLine: 'Addressee', sourceLine: 'Original',
    resultLine: 'Output',
    intents: {assert: 'Statement', ask: 'Question', answer: 'Answer',
      clarify: 'Clarification', refuse: 'Refusal'},
    count: (used, max) => `${used} / ${max} turns`,
    state: (used, max, pending) => `Turns: ${used} / ${max}${pending ? ' · Awaiting a response' : ''}`,
    accepted: 'Turn added.', responded: 'Response added.', resetDone: 'Conversation reset.',
    rejected: (code, message) => `Turn not added (${code}): ${message}`,
    names: {you: 'You', assistant: 'Assistant'}
  }
};

const $ = id => document.getElementById(id);

function appendText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  parent.appendChild(node);
  return node;
}

function participantName(value, strings) {
  const id = String(value || '').replace(/^actor:/u, '');
  return strings.names[id] || id || '—';
}

function profileFor(engine) {
  const baseline = engine.validatePersonalityProfile();
  return engine.validatePersonalityProfile({
    ...baseline,
    id: 'dialogue-ui',
    realization: {
      pronounRealization: $('dialogue-pronouns').value,
      outputVariant: $('dialogue-variant').value
    }
  });
}

function localize(locale) {
  const strings = UI[locale] || UI.pl;
  const labels = {
    'dialogue-eyebrow': 'eyebrow', 'dialogue-heading': 'heading', 'dialogue-intro': 'intro',
    'dialogue-controls-heading': 'controls', 'dialogue-profile-help': 'profileHelp',
    'dialogue-label-ui-language': 'uiLanguage', 'dialogue-label-pronouns': 'pronouns',
    'dialogue-label-variant': 'variant', 'dialogue-compose-heading': 'compose',
    'dialogue-label-speaker': 'speaker', 'dialogue-label-addressee': 'addressee',
    'dialogue-label-from': 'from', 'dialogue-label-to': 'to', 'dialogue-label-text': 'text',
    'dialogue-send': 'send', 'dialogue-reply': 'reply', 'dialogue-reset': 'reset',
    'dialogue-history-heading': 'history', 'dialogue-empty-text': 'empty'
  };
  for (const [id, key] of Object.entries(labels)) {
    const node = $(id);
    if (node) node.textContent = strings[key];
  }
  const text = $('dialogue-text');
  if (text) text.placeholder = strings.placeholder;
  const panel = $('panel-dialogue');
  if (panel) panel.lang = locale;
  return strings;
}

function updateState(session, strings, message = null) {
  const snapshot = session.snapshot();
  const pending = snapshot.pendingQuestions.length > 0;
  $('dialogue-count').textContent = strings.count(snapshot.turnCount, snapshot.maxTurns);
  $('dialogue-state').textContent = strings.state(snapshot.turnCount, snapshot.maxTurns, pending);
  $('dialogue-reply').disabled = !pending;
  $('dialogue-empty').hidden = snapshot.turnCount > 0;
  $('dialogue-feedback').textContent = message || '';
  return snapshot;
}

function renderHistory(snapshot, surfaces, strings) {
  const history = $('dialogue-history');
  history.replaceChildren();
  for (const [index, turn] of snapshot.turns.entries()) {
    const refusal = turn.intent === 'refuse';
    const article = document.createElement('article');
    article.className = `dialogue-turn${refusal ? ' refusal' : ''}`;
    article.setAttribute('aria-label', `${strings.turn} ${index + 1}: ${strings.intents[turn.intent] || turn.intent}`);
    appendText(article, 'h3', '', `${strings.turn} ${index + 1} · ${strings.intents[turn.intent] || turn.intent}`);
    appendText(article, 'p', 'dialogue-meta',
      `${strings.speakerLine}: ${participantName(turn.participants.speaker, strings)} → ` +
      `${strings.recipientLine}: ${participantName(turn.participants.addressee, strings)}`);
    const rendered = surfaces.get(turn.id) || turn.surface || {};
    if (rendered.source?.text) {
      appendText(article, 'p', 'dialogue-meta', `${strings.sourceLine}: ${rendered.source.text}`);
    }
    if (rendered.target?.text) {
      appendText(article, 'p', 'dialogue-text', `${strings.resultLine}: ${rendered.target.text}`);
    }
    history.appendChild(article);
  }
}

/** Wire the browser dialogue tab to the validated DialogueEngine facade. */
export function initDialoguePanel(engine) {
  const ids = ['panel-dialogue', 'dialogue-form', 'dialogue-text', 'dialogue-from', 'dialogue-to',
    'dialogue-speaker', 'dialogue-addressee', 'dialogue-pronouns', 'dialogue-variant',
    'dialogue-ui-language', 'dialogue-reply', 'dialogue-reset', 'dialogue-history',
    'dialogue-feedback', 'dialogue-state', 'dialogue-count', 'dialogue-empty'];
  if (!engine?.createDialogueEngine || ids.some(id => !$(id))) return;

  const dialogue = engine.createDialogueEngine();
  const session = dialogue.createSession();
  const surfaces = new Map();
  let strings = localize($('dialogue-ui-language').value || 'pl');

  const showFailure = result => {
    const error = result.error || {code: 'INVALID_INPUT', message: strings.rejected('INVALID_INPUT', '')};
    const feedback = $('dialogue-feedback');
    feedback.textContent = strings.rejected(error.code, error.message);
    feedback.classList?.add('error');
    feedback.setAttribute('role', 'alert');
    feedback.setAttribute('aria-live', 'assertive');
    updateState(session, strings, feedback.textContent);
  };

  const accept = (result, sourceText, message) => {
    const value = result.value;
    const latest = value.conversation.turns.at(-1);
    if (latest) surfaces.set(latest.id, {
      source: sourceText ? {text: sourceText} : null,
      target: value.text ? {text: value.text} : null
    });
    const snapshot = updateState(session, strings, message);
    renderHistory(snapshot, surfaces, strings);
    const feedback = $('dialogue-feedback');
    feedback.classList?.remove('error');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
  };

  $('dialogue-ui-language').addEventListener('change', () => {
    strings = localize($('dialogue-ui-language').value);
    renderHistory(session.snapshot(), surfaces, strings);
    updateState(session, strings);
  });

  $('dialogue-form').addEventListener('submit', event => {
    event.preventDefault();
    const sourceText = $('dialogue-text').value.trim();
    const result = dialogue.tryNextTurn({
      session,
      utterance: sourceText,
      from: $('dialogue-from').value,
      to: $('dialogue-to').value,
      participants: {
        speakerId: $('dialogue-speaker').value,
        addresseeId: $('dialogue-addressee').value
      },
      profile: profileFor(engine)
    });
    if (!result.ok) {
      showFailure(result);
      return;
    }
    $('dialogue-text').value = '';
    accept(result, sourceText, strings.accepted);
    $('dialogue-text').focus();
  });

  $('dialogue-reply').addEventListener('click', () => {
    $('dialogue-speaker').value = 'assistant';
    $('dialogue-addressee').value = 'you';
    const result = dialogue.tryRespond({
      session,
      to: $('dialogue-to').value,
      participants: {speakerId: 'assistant', addresseeId: 'you'},
      profile: profileFor(engine)
    });
    if (!result.ok) {
      showFailure(result);
      return;
    }
    accept(result, '', strings.responded);
  });

  $('dialogue-reset').addEventListener('click', () => {
    session.reset();
    surfaces.clear();
    $('dialogue-text').value = '';
    const snapshot = updateState(session, strings, strings.resetDone);
    renderHistory(snapshot, surfaces, strings);
    const feedback = $('dialogue-feedback');
    feedback.classList?.remove('error');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    $('dialogue-text').focus();
  });

  const snapshot = updateState(session, strings, strings.ready);
  renderHistory(snapshot, surfaces, strings);
}
