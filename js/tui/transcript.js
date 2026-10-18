import {diagnosticPresentation, formsPresentationLines, operationStatusLabel,
  semanticSummary, translatePresentationLines} from './presentation.js';

function entryNumber(entry) {
  return String(entry.id ?? '').replace(/^op-/u, '');
}

function line(text, tone = 'neutral', entryId = null) {
  return {text: String(text ?? ''), tone, entryId};
}

function chatEventLines(entry, {compact = false} = {}) {
  const id = entryNumber(entry);
  const events = entry.events ?? [];
  const result = entry.rawResult ?? {};
  const accepted = entry.accepted === true;
  const isQuestion = events.some(event => event.type === 'semantic_reading' &&
    event.dialogueAct?.act === 'ask');
  const acceptedLabel = isQuestion ? 'Przyjęto pytanie' : 'Przyjęto wypowiedź';
  const lines = [line(`#${id} ${accepted ? acceptedLabel : 'Nie przyjęto wypowiedzi'} · ${
    operationStatusLabel(entry.status)}`, accepted ? 'accent' : 'warning', entry.id)];
  for (const event of events) {
    if (event.type === 'user_utterance') {
      lines.push(line(`Ty · ${event.language ?? entry.from ?? '?'}`, 'muted', entry.id));
      if (event.text) lines.push(line(event.text, 'neutral', entry.id));
    } else if (event.type === 'turn_output') {
      const kind = event.from === event.to ?
        (compact ? 'Realizacja' : 'Realizacja wypowiedzi') :
          (compact ? 'Tłumaczenie' : 'Tłumaczenie wypowiedzi');
      const target = event.to ?? entry.to ?? '?';
      lines.push(line(`${kind} · ${target}`, 'accent', entry.id),
        line(event.text, 'neutral', entry.id));
    } else if (event.type === 'semantic_reading') {
      const act = event.dialogueAct?.act;
      const meaning = semanticSummary(event.meaning);
      const meaningText = meaning.replace(/^MeaningGraph:\s*/u, '');
      if (compact) {
        const summary = [act, meaningText].filter(Boolean).join(' · ');
        if (summary) lines.push(line(`Odczyt · ${summary}`, 'muted', entry.id));
      } else if (meaningText) {
        lines.push(line(`Odczyt${act ? ` · ${act}` : ''} · ${meaningText}`, 'muted', entry.id));
      }
      if (event.alternatives?.length) lines.push(line(`Alternatywy: ${event.alternatives.length}`,
        'muted', entry.id));
      if (event.informationLoss?.length) lines.push(line(`Utrata informacji: ${event.informationLoss.length}`,
        'warning', entry.id));
    } else if (event.type === 'engine_response') {
      if (accepted && result.responseStatus === 'ok' && typeof event.text === 'string' &&
          event.text.length) {
        lines.push(line(`Odpowiedź Engine · ${entry.to ?? '?'}`, 'accent', entry.id),
          line(event.text, 'neutral', entry.id));
      }
    } else if (event.type === 'diagnostic') {
      lines.push(line(diagnosticPresentation(event), 'warning', entry.id));
    }
  }
  const responseStatus = result.responseStatus;
  if (accepted && responseStatus && !['ok', 'not_requested', 'not_attempted'].includes(responseStatus)) {
    const hasResponseDiagnostic = events.some(event => event.type === 'diagnostic' &&
      ['RESPONSE_NOT_REALIZABLE', 'CHAT_RESPONSE_CONTRACT_INVALID', 'CHAT_RESPONSE_ERROR']
        .includes(event.code));
    if (!hasResponseDiagnostic) {
      lines.push(line(`Odpowiedź Engine niedostępna · ${operationStatusLabel(responseStatus)}`,
        'warning', entry.id));
    }
  }
  if (Number.isSafeInteger(result.eventCount) && Number.isSafeInteger(result.maxEvents) &&
      Number.isSafeInteger(result.turnCount) && Number.isSafeInteger(result.maxTurns)) {
    const counters = compact ? `Akty ${result.turnCount}/${result.maxTurns} · zdarzenia ${
      result.eventCount}/${result.maxEvents} · /details ${id}` : `Sesja · akty ${
      result.turnCount}/${result.maxTurns} · zdarzenia ${result.eventCount}/${result.maxEvents} · /details ${id}`;
    lines.push(line(counters, 'muted', entry.id));
  } else {
    lines.push(line(`/details ${id}`, 'muted', entry.id));
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

export function buildTranscript(view, {focus, width = Number.POSITIVE_INFINITY} = {}) {
  if (view.id === 'chat' && view.state.confirmReset) return confirmationLines(view, focus);
  const entries = view.state.entries ?? [];
  const lines = [];
  if (view.state.removedEntryCount) {
    lines.push(line(`Usunięto ${view.state.removedEntryCount} starszych wpisów`, 'muted'));
  }
  if (view.statusLine) lines.push(line(view.statusLine().text, 'muted'));
  if (!entries.length) {
    const emptyState = view.emptyStateLines?.() ?? ['Brak operacji. Wpisz tekst lub /help.'];
    lines.push(...emptyState.map(item => typeof item === 'string' ? line(item, 'muted') :
      line(item.text, item.tone ?? 'muted')));
    return lines;
  }
  for (const entry of entries) {
    if (view.id === 'translate') lines.push(...translatePresentationLines(entry));
    else if (view.id === 'chat') lines.push(...chatEventLines(entry, {compact: width < 60}));
    else if (view.id === 'forms') lines.push(...formsPresentationLines(entry, {
      selectedIndex: entry.id === view.state.searchEntryId ? view.state.selectedIndex : 0,
      interactive: entry.id === view.state.searchEntryId && view.state.result?.status === 'ambiguous'
    }));
    lines.push(line('', 'muted', entry.id));
  }
  return lines;
}
