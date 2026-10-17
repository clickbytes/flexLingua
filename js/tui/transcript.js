function entryNumber(entry) {
  return String(entry.id ?? '').replace(/^op-/u, '');
}

function line(text, tone = 'neutral', entryId = null) {
  return {text: String(text ?? ''), tone, entryId};
}

function statusLabel(status) {
  return ({ok: 'OK', found: 'Znaleziono', ambiguous: 'Wybór wymagany',
    not_found: 'Nie znaleziono', unsupported: 'Nieobsługiwane', invalid: 'Nieprawidłowe wejście',
    resource_limit: 'Limit zasobów', morphology_unsupported: 'Morfologia niedostępna',
    dictionary_unsupported: 'Słownik niedostępny', no_paradigm: 'Brak paradygmatu',
    empty_paradigm: 'Pusty paradygmat', error: 'Błąd'})[status] ?? String(status ?? 'unknown');
}

function semanticSummary(meaning) {
  if (!meaning || typeof meaning !== 'object') return null;
  const concept = meaning.concept ?? meaning.type ?? 'meaning';
  const roles = Object.entries(meaning.roles ?? {}).map(([role, value]) =>
    `${role}=${value?.concept ?? 'unspecified'}`);
  return `CORE: ${concept}${roles.length ? ` · ${roles.join(', ')}` : ''}`;
}

function translationLines(entry) {
  const id = entryNumber(entry);
  const result = entry.rawResult ?? {};
  const lines = [line(`#${id} Ty · ${entry.from ?? '?'}`, 'muted', entry.id),
    line(entry.input || '(puste wejście)', 'neutral', entry.id),
    line(`#${id} Wynik · ${entry.to ?? '?'} · ${statusLabel(entry.status)}`,
      entry.status === 'ok' ? 'accent' : 'warning', entry.id)];
  if (entry.output) lines.push(line(entry.output, 'neutral', entry.id));
  const meaning = semanticSummary(result.meaning);
  if (meaning) lines.push(line(meaning, 'muted', entry.id));
  const lossCount = result.informationLoss?.length ?? 0;
  const alternativeCount = result.alternatives?.length ?? 0;
  if (lossCount || alternativeCount) lines.push(line(
    `${lossCount} strat informacji · ${alternativeCount} alternatyw · /details ${id}`, 'muted', entry.id));
  for (const diagnostic of result.diagnostics ?? []) {
    lines.push(line(diagnostic?.message ?? diagnostic?.code ?? diagnostic, 'warning', entry.id));
  }
  return lines;
}

function chatEventLines(entry) {
  const id = entryNumber(entry);
  const events = entry.events ?? [];
  if (!events.length) return [line(`#${id} ${statusLabel(entry.status)}`, 'warning', entry.id)];
  const lines = [];
  for (const event of events) {
    if (event.type === 'user_utterance') {
      lines.push(line(`#${id} Ty · ${event.language ?? entry.from ?? '?'}`, 'muted', entry.id),
        line(event.text, 'neutral', entry.id));
    } else if (event.type === 'turn_output') {
      lines.push(line(`#${id} Tłumaczenie wypowiedzi · ${event.to ?? entry.to ?? '?'}`,
        'accent', entry.id), line(event.text, 'neutral', entry.id));
    } else if (event.type === 'semantic_reading') {
      const act = event.dialogueAct?.act;
      const meaning = semanticSummary(event.meaning);
      if (meaning) lines.push(line(`${meaning}${act ? ` · act=${act}` : ''}`, 'muted', entry.id));
    } else if (event.type === 'engine_response') {
      lines.push(line(`#${id} Odpowiedź Engine · ${entry.to ?? '?'}`, 'accent', entry.id),
        line(event.text, 'neutral', entry.id));
    } else if (event.type === 'diagnostic') {
      lines.push(line(event.message ?? event.code ?? 'Brak zdarzeń usługi.', 'warning', entry.id));
    }
  }
  return lines.length ? lines : [line(`#${id} ${statusLabel(entry.status)}`, 'warning', entry.id)];
}

function featureSummary(features) {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return '';
  return Object.entries(features).map(([key, value]) => `${key}=${value}`).join(', ');
}

function formsLines(entry, selectedIndex = 0) {
  const id = entryNumber(entry);
  const result = entry.rawResult ?? {};
  const lines = [line(`#${id} Szukano · ${entry.language ?? '?'}`, 'muted', entry.id),
    line(entry.input ?? '(puste wejście)', 'neutral', entry.id),
    line(`#${id} ${statusLabel(entry.status)}`, entry.status === 'found' ? 'accent' : 'warning', entry.id)];
  if (result.lexeme) lines.push(line(`${result.lexeme.lemma} · ${result.lexeme.id}`, 'accent', entry.id));
  for (const [index, candidate] of (result.matches ?? []).entries()) {
    lines.push(line(`${index === selectedIndex ? '› ' : '  '}${candidate.lexeme?.lemma ?? '?'} · ${
      candidate.lexeme?.id ?? '?'}`, index === selectedIndex ? 'accent' : 'neutral', entry.id));
  }
  for (const form of result.forms ?? []) {
    const features = featureSummary(form.features);
    lines.push(line(`${features ? `${features}: ` : ''}${form.text ?? ''}`, 'neutral', entry.id));
  }
  if (!result.forms?.length && entry.output) lines.push(line(entry.output, 'neutral', entry.id));
  if (result.message) lines.push(line(result.message, 'warning', entry.id));
  for (const diagnostic of result.diagnostics ?? []) {
    lines.push(line(diagnostic?.message ?? diagnostic?.code ?? diagnostic, 'warning', entry.id));
  }
  return lines;
}

function confirmationLines(view, focus) {
  const description = view.render({focus});
  return (description?.panels ?? []).flatMap(panel => [
    line(panel.title ?? 'Confirmation', 'accent'),
    ...(panel.lines ?? []).map(item => typeof item === 'string' ? line(item) : line(item.text, item.tone))
  ]);
}

export function buildTranscript(view, {focus} = {}) {
  if (view.id === 'chat' && view.state.confirmReset) return confirmationLines(view, focus);
  const entries = view.state.entries ?? [];
  const lines = [];
  if (view.state.removedEntryCount) {
    lines.push(line(`Usunięto ${view.state.removedEntryCount} starszych wpisów`, 'muted'));
  }
  if (view.statusLine) lines.push(line(view.statusLine().text, 'muted'));
  if (!entries.length) {
    lines.push(line('Brak operacji. Wpisz tekst lub /help.', 'muted'));
    return lines;
  }
  for (const entry of entries) {
    if (view.id === 'translate') lines.push(...translationLines(entry));
    else if (view.id === 'chat') lines.push(...chatEventLines(entry));
    else if (view.id === 'forms') lines.push(...formsLines(entry,
      entry.id === view.state.selectedEntryId ? view.state.selectedIndex : 0));
    lines.push(line('', 'muted', entry.id));
  }
  if (view.id === 'translate' && view.state.details) {
    const entry = entries.find(item => item.id === view.state.selectedEntryId) ?? entries.at(-1);
    if (entry) {
      lines.push(line(`Szczegóły #${entryNumber(entry)} · Translate`, 'accent', entry.id));
      const result = entry.rawResult ?? {};
      const detail = JSON.stringify({meaning: result.meaning ?? null,
        alternatives: result.alternatives ?? [], informationLoss: result.informationLoss ?? [],
        diagnostics: result.diagnostics ?? []}, null, 2);
      for (const text of detail.split('\n')) lines.push(line(text, 'neutral', entry.id));
    }
  }
  return lines;
}
