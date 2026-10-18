const STATUS_LABELS = Object.freeze({
  ok: 'OK',
  found: 'Znaleziono',
  ambiguous: 'Niejednoznaczne',
  unsupported: 'Niedostępne',
  invalid: 'Nieprawidłowe żądanie',
  resource_limit: 'Limit zasobów',
  error: 'Błąd',
  not_found: 'Nie znaleziono',
  morphology_unsupported: 'Morfologia niedostępna',
  dictionary_unsupported: 'Słownik niedostępny',
  unknown_availability: 'Dostępność nieznana',
  no_paradigm: 'Brak paradygmatu',
  empty_paradigm: 'Pusty paradygmat'
});

const DIAGNOSTIC_LABELS = Object.freeze({
  PLUGIN_DIRECTION_UNAVAILABLE: {
    summary: 'Kierunek nie jest zadeklarowany.',
    nextStep: 'Wybierz inny zadeklarowany kierunek.'
  },
  PLUGIN_CAPABILITY_UNAVAILABLE: {
    summary: 'Plugin nie deklaruje wymaganej obsługi.',
    nextStep: 'Wybierz dostępny kierunek.'
  },
  PLUGIN_NOT_FOUND: {
    summary: 'Nie znaleziono pluginu dla wybranego języka.',
    nextStep: 'Wybierz język z listy.'
  },
  PLUGIN_PACKAGE_UNAVAILABLE: {
    summary: 'Pakiet językowy jest niedostępny.',
    nextStep: 'Wybierz dostępny pakiet.'
  },
  AMBIGUOUS_MEANING: {
    summary: 'Zdanie ma kilka możliwych odczytań.',
    nextStep: 'Sprawdź alternatywy w Details.'
  },
  INVALID_INPUT: {
    summary: 'Wejście jest nieprawidłowe.',
    nextStep: 'Popraw tekst i spróbuj ponownie.'
  },
  SOURCE_CHARACTER_UNSUPPORTED: {
    summary: 'Tekst zawiera znaki spoza obsługiwanego zakresu.',
    nextStep: 'Sprawdź tekst i spróbuj ponownie.'
  },
  SOURCE_CONSTRUCTION_UNSUPPORTED: {
    summary: 'Konstrukcja zdania nie jest obsługiwana.',
    nextStep: 'Użyj zdania z ograniczonego zakresu.'
  },
  TARGET_CONSTRUCTION_UNSUPPORTED: {
    summary: 'Wynik nie może zostać zrealizowany w tym kierunku.',
    nextStep: 'Wybierz inny zadeklarowany kierunek.'
  },
  RESOURCE_LIMIT: {
    summary: 'Wejście przekracza limit zasobów.',
    nextStep: 'Skróć tekst i spróbuj ponownie.'
  }
});

export function operationStatusLabel(status) {
  return STATUS_LABELS[status] ?? (status ? `Status: ${status}` : 'Status nieznany');
}

export function semanticSummary(meaning) {
  if (!meaning || typeof meaning !== 'object') return '';
  if (meaning.type === 'question') {
    const questionType = meaning.questionType === 'yes_no' ? 'pytanie tak/nie' : 'pytanie';
    const proposition = meaning.proposition;
    if (proposition?.type !== 'event') return `MeaningGraph: ${questionType}`;
    const concept = typeof proposition.concept === 'string' ? proposition.concept : null;
    const roles = Object.entries(proposition.roles ?? {}).sort(([left], [right]) =>
      left.localeCompare(right)).map(([role, value]) =>
      `${role}=${typeof value?.concept === 'string' ? value.concept : 'unspecified'}`);
    return `MeaningGraph: ${questionType}${concept ? ` · ${concept}` : ''}${
      roles.length ? ` · ${roles.join(', ')}` : ''}`;
  }
  const events = Array.isArray(meaning.events) ? meaning.events : [];
  const eventTypes = [...new Set(events.map(event => event?.type ?? event?.predicate).filter(Boolean))];
  const concept = meaning.concept ?? (eventTypes.length ? eventTypes.join(', ') : meaning.type);
  const roles = Object.entries(meaning.roles ?? {}).map(([role, value]) =>
    `${role}=${typeof value?.concept === 'string' ? value.concept : 'unspecified'}`);
  if (!concept && !roles.length) return '';
  return `MeaningGraph: ${concept ?? 'graph'}${roles.length ? ` · ${roles.join(', ')}` : ''}`;
}

function itemMessage(item) {
  if (typeof item === 'string') return item;
  return item?.message ?? item?.code ?? 'Brak opisu diagnostyki.';
}

export function diagnosticPresentation(item) {
  const code = typeof item === 'object' && item ? item.code : null;
  if (code === 'RESPONSE_NOT_REALIZABLE') {
    const summary = ({
      insufficient_context: 'Brak dopasowanego faktu w tej sesji.',
      ambiguous: 'Sprzeczne lub niejednoznaczne dowody.',
      unsupported: 'Ten rodzaj odpowiedzi jest poza zakresem.'
    })[item.reason] ?? 'Engine nie utworzył odpowiedzi.';
    return `${summary} (${code})`;
  }
  if (code === 'CHAT_RESPONSE_CONTRACT_INVALID') {
    return `Plan odpowiedzi Engine jest nieprawidłowy; sprawdź Details. (${code})`;
  }
  const known = code ? DIAGNOSTIC_LABELS[code] : null;
  if (known) return `${known.summary} ${known.nextStep} (${code})`;
  const message = itemMessage(item);
  return code ? `${message} (${code})` : message;
}

function warningPresentation(item) {
  const code = typeof item === 'object' && item ? item.code : null;
  const message = itemMessage(item);
  return code && message !== code ? `${message} (${code})` : message;
}

function entryNumber(entry) {
  return String(entry.id ?? '').replace(/^op-/u, '');
}

export function translatePresentationLines(entry) {
  const id = entryNumber(entry);
  const result = entry.rawResult ?? {};
  const lines = [
    {text: `#${id} Ty · ${entry.from ?? '?'}`, tone: 'muted', entryId: entry.id},
    {text: entry.input || '(puste wejście)', tone: 'neutral', entryId: entry.id},
    {text: `#${id} Wynik · ${entry.to ?? '?'} · ${operationStatusLabel(entry.status)}`,
      tone: entry.status === 'ok' ? 'accent' : 'warning', entryId: entry.id}
  ];
  if (typeof entry.output === 'string' && entry.output.length) {
    lines.push({text: entry.output, tone: 'neutral', entryId: entry.id});
  } else if (entry.status !== 'ok') {
    lines.push({text: 'Brak tekstu wynikowego.', tone: 'muted', entryId: entry.id});
  }

  const meaning = semanticSummary(result.meaning);
  if (meaning) lines.push({text: meaning, tone: 'muted', entryId: entry.id});
  const losses = result.informationLoss?.length ?? 0;
  const alternatives = result.alternatives?.length ?? 0;
  const warnings = result.warnings?.length ?? 0;
  lines.push({text: `Straty: ${losses} · Ostrzeżenia: ${warnings} · Alternatywy: ${alternatives} · /details ${id}`,
    tone: losses || warnings || alternatives ? 'warning' : 'muted', entryId: entry.id});

  for (const item of result.diagnostics ?? []) {
    lines.push({text: diagnosticPresentation(item), tone: 'warning', entryId: entry.id});
  }
  for (const item of result.warnings ?? []) {
    lines.push({text: warningPresentation(item), tone: 'warning', entryId: entry.id});
  }
  return lines;
}

function featureSummary(features) {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return '';
  return Object.entries(features).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join(', ');
}

function candidateSummary(candidate) {
  const lexeme = candidate?.lexeme ?? {};
  const partOfSpeech = lexeme.pos ?? lexeme.category ?? 'leksem';
  const senses = (lexeme.senses ?? []).map(sense => sense?.coreRef?.id ?? sense?.id)
    .filter(Boolean);
  const analyses = [...new Set((candidate?.analyses ?? []).map(analysis =>
    featureSummary(analysis?.features)).filter(Boolean))];
  return `${lexeme.lemma ?? '?'} · ${lexeme.id ?? '?'} · ${partOfSpeech}${
    analyses.length ? ` · ${analyses.join(' / ')}` : ''}${
    senses.length ? ` · ${senses.join(', ')}` : ''}`;
}

function formsStatusMessage(result, entry) {
  const statusMessages = {
    ambiguous: 'Kilka haseł pasuje. Wybierz jedno ręcznie.',
    not_found: 'Nie znaleziono w słowniku.',
    dictionary_unsupported: 'Ten język nie udostępnia wyszukiwania słownikowego.',
    morphology_unsupported: 'Ten język nie udostępnia morfologii.',
    no_paradigm: 'Hasło znaleziono, ale provider nie udostępnia paradygmatu.',
    empty_paradigm: 'Provider zwrócił pusty paradygmat; brak pozostaje niepotwierdzony.',
    unknown_availability: 'Dostępność paradygmatu jest nieznana.'
  };
  if (statusMessages[entry.status]) return statusMessages[entry.status];
  if (result.message) return result.message;
  return '';
}

export function formsPresentationLines(entry, {selectedIndex = 0, interactive = false} = {}) {
  const id = entryNumber(entry);
  const result = entry.rawResult ?? {};
  const lines = [
    {text: `#${id} Szukano · ${entry.language ?? '?'}`, tone: 'muted', entryId: entry.id},
    {text: entry.input || '(puste wejście)', tone: 'neutral', entryId: entry.id},
    {text: `#${id} ${operationStatusLabel(entry.status)}`,
      tone: entry.status === 'found' ? 'accent' : 'warning', entryId: entry.id}
  ];

  const statusMessage = formsStatusMessage(result, entry);
  if (statusMessage) lines.push({text: statusMessage,
    tone: ['error', 'unsupported', 'ambiguous', 'not_found', 'morphology_unsupported',
      'dictionary_unsupported', 'no_paradigm', 'empty_paradigm',
      'unknown_availability'].includes(entry.status) ? 'warning' : 'muted', entryId: entry.id});
  if (entry.status === 'not_found') {
    lines.push({text: 'Generowanie nieznanych form: niedostępne.',
      tone: 'muted', entryId: entry.id});
  }

  if (result.lexeme) {
    lines.push({text: `${result.lexeme.lemma ?? '?'} · ${result.lexeme.id ?? '?'}`,
      tone: 'accent', entryId: entry.id});
  }

  const candidates = Array.isArray(result.matches) ? result.matches : [];
  if (entry.status === 'ambiguous') {
    if (!statusMessage) lines.push({text: 'Kilka haseł pasuje. Wybierz jedno ręcznie.',
      tone: 'warning', entryId: entry.id});
    for (const [index, candidate] of candidates.entries()) {
      const active = interactive && index === selectedIndex;
      lines.push({text: `${active ? '›' : ' '} ${candidateSummary(candidate)}`,
        tone: active ? 'accent' : 'neutral', entryId: entry.id,
        ...(interactive ? {candidateIndex: index} : {})});
    }
    if (interactive) {
      lines.push({text: '↑/↓ wybór · Enter zatwierdź · Esc anuluj', tone: 'muted', entryId: entry.id});
    }
  }

  const forms = Array.isArray(result.forms) ? result.forms : [];
  if (entry.status === 'found') {
    lines.push({text: `Formy zwrócone przez provider: ${forms.length}`,
      tone: 'muted', entryId: entry.id});
  }
  for (const form of forms) {
    const features = featureSummary(form.features);
    lines.push({text: `${features ? `${features}: ` : ''}${form.text ?? ''}`,
      tone: 'neutral', entryId: entry.id});
  }
  for (const analysis of result.analyses ?? []) {
    const features = featureSummary(analysis.features);
    lines.push({text: `Analiza${features ? ` · ${features}` : ''}`,
      tone: 'muted', entryId: entry.id});
  }

  for (const item of result.diagnostics ?? []) {
    lines.push({text: diagnosticPresentation(item), tone: 'warning', entryId: entry.id});
  }
  if (result.availability?.reason) {
    lines.push({text: `Powód dostępności · ${result.availability.reason}`,
      tone: 'muted', entryId: entry.id});
  }
  lines.push({text: `/details ${id}`, tone: 'muted', entryId: entry.id});
  return lines;
}
