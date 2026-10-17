import {formsPresentationLines, operationStatusLabel, semanticSummary,
  translatePresentationLines} from './presentation.js';

function entryNumber(entry) {
  return String(entry.id ?? '').replace(/^op-/u, '');
}

function line(text, tone = 'neutral', entryId = null) {
  return {text: String(text ?? ''), tone, entryId};
}

function chatEventLines(entry) {
  const id = entryNumber(entry);
  const events = entry.events ?? [];
  if (!events.length) return [line(`#${id} ${operationStatusLabel(entry.status)}`, 'warning', entry.id)];
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
  return lines.length ? lines : [line(`#${id} ${operationStatusLabel(entry.status)}`, 'warning', entry.id)];
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
    const emptyState = view.emptyStateLines?.() ?? ['Brak operacji. Wpisz tekst lub /help.'];
    lines.push(...emptyState.map(item => typeof item === 'string' ? line(item, 'muted') :
      line(item.text, item.tone ?? 'muted')));
    return lines;
  }
  for (const entry of entries) {
    if (view.id === 'translate') lines.push(...translatePresentationLines(entry));
    else if (view.id === 'chat') lines.push(...chatEventLines(entry));
    else if (view.id === 'forms') lines.push(...formsPresentationLines(entry, {
      selectedIndex: entry.id === view.state.searchEntryId ? view.state.selectedIndex : 0,
      interactive: entry.id === view.state.searchEntryId && view.state.result?.status === 'ambiguous'
    }));
    lines.push(line('', 'muted', entry.id));
  }
  return lines;
}
