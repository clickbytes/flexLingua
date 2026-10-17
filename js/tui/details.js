function entryNumber(entry) {
  return String(entry.id ?? '').replace(/^op-/u, '');
}

function modeLabel(mode) {
  return ({translate: 'Translate', chat: 'Chat', forms: 'Forms'})[mode] ?? String(mode ?? '');
}

function jsonLines(value) {
  try {
    return (JSON.stringify(value ?? null, null, 2) ?? 'null').split('\n');
  } catch {
    return [String(value)];
  }
}

export function detailsSections(entry) {
  const result = entry.rawResult ?? {};
  if (entry.mode === 'chat') {
    return [
      {id: 'operation', title: 'Wypowiedź i kierunek', value: {
        id: entry.id,
        mode: entry.mode,
        input: entry.input,
        from: entry.from,
        to: entry.to,
        status: entry.status,
        accepted: entry.accepted,
        output: entry.output,
        responseStatus: result.responseStatus
      }},
      {id: 'events', title: 'Zdarzenia Engine', value: result.events ?? entry.events ?? []},
      {id: 'session', title: 'Limity sesji', value: {
        turnCount: result.turnCount ?? null,
        maxTurns: result.maxTurns ?? null,
        eventCount: result.eventCount ?? null,
        maxEvents: result.maxEvents ?? null,
        conversation: result.conversation ?? null
      }},
      {id: 'response', title: 'Plan odpowiedzi Engine', value: result.response ?? null},
      {id: 'diagnostics', title: 'Diagnostyka', value: result.diagnostics ?? []},
      {id: 'raw-result', title: 'Wynik surowy', value: result}
    ];
  }
  if (entry.mode === 'forms') {
    return [
      {id: 'operation', title: 'Zapytanie i język', value: {
        id: entry.id,
        mode: entry.mode,
        query: entry.input,
        language: entry.language,
        status: entry.status,
        accepted: entry.accepted,
        output: entry.output
      }},
      {id: 'lexemes', title: 'Hasła, senses i analizy', value: {
        lexeme: result.lexeme ?? null,
        matches: result.matches ?? [],
        analyses: result.analyses ?? []
      }},
      {id: 'provider', title: 'Stan providera', value: {
        providerStatus: result.providerStatus ?? null,
        hasProvider: result.hasProvider ?? null,
        hasParadigm: result.hasParadigm ?? null,
        paradigmStatus: result.paradigmStatus ?? null,
        availability: result.availability ?? null,
        description: result.description ?? null
      }},
      {id: 'forms', title: 'Formy zwrócone przez providera', value: result.forms ?? []},
      {id: 'diagnostics', title: 'Diagnostyka', value: result.diagnostics ?? []},
      {id: 'raw-result', title: 'Wynik surowy', value: result}
    ];
  }
  return [
    {id: 'operation', title: 'Wejście i kierunek', value: {
      id: entry.id,
      mode: entry.mode,
      input: entry.input,
      ...(entry.from === undefined ? {} : {from: entry.from}),
      ...(entry.to === undefined ? {} : {to: entry.to}),
      ...(entry.language === undefined ? {} : {language: entry.language}),
      status: entry.status,
      accepted: entry.accepted,
      output: entry.output
    }},
    {id: 'meaning', title: 'MeaningGraph', value: result.meaning ?? null},
    {id: 'alternatives', title: 'Alternatywy', value: result.alternatives ?? []},
    {id: 'information-loss', title: 'Utrata informacji', value: result.informationLoss ?? []},
    {id: 'diagnostics', title: 'Diagnostyka', value: result.diagnostics ?? []},
    {id: 'warnings', title: 'Ostrzeżenia', value: result.warnings ?? []},
    {id: 'raw-result', title: 'Wynik surowy', value: result}
  ];
}

export function detailsSectionCount(entry) {
  return detailsSections(entry).length;
}

export function buildDetailsLines(entry, {mode = entry.mode, sectionIndex = 0} = {}) {
  if (!entry) return [{text: 'Nie znaleziono tego wpisu w historii.', tone: 'warning'}];
  const sections = detailsSections(entry);
  const index = Math.max(0, Math.min(Math.floor(sectionIndex), sections.length - 1));
  const section = sections[index];
  return [
    {text: `Szczegóły #${entryNumber(entry)} · ${modeLabel(mode)}`, tone: 'accent'},
    {text: `Sekcja ${index + 1}/${sections.length} · ${section.title}`, tone: 'accent'},
    {text: 'Tab/Shift+Tab: sekcja · PgUp/PgDn: przewijanie · Esc: powrót', tone: 'muted'},
    ...jsonLines(section.value).map(text => ({text, tone: 'neutral'}))
  ];
}
