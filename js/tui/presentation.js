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
  const events = Array.isArray(meaning.events) ? meaning.events : [];
  const eventTypes = [...new Set(events.map(event => event?.type ?? event?.predicate).filter(Boolean))];
  const concept = meaning.concept ?? (eventTypes.length ? eventTypes.join(', ') : meaning.type);
  const roles = Object.entries(meaning.roles ?? {}).map(([role, value]) =>
    `${role}=${value?.concept ?? 'unspecified'}`);
  if (!concept && !roles.length) return '';
  return `MeaningGraph: ${concept ?? 'graph'}${roles.length ? ` · ${roles.join(', ')}` : ''}`;
}

function itemMessage(item) {
  if (typeof item === 'string') return item;
  return item?.message ?? item?.code ?? 'Brak opisu diagnostyki.';
}

export function diagnosticPresentation(item) {
  const code = typeof item === 'object' && item ? item.code : null;
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
