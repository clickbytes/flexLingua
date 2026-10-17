import {appendOperation, isCurrentRequest} from '../state.js';

function unique(values) {
  return [...new Set(values)];
}

function nextValue(values, current, direction) {
  if (!values.length) return current;
  const index = values.indexOf(current);
  return values[(index + direction + values.length) % values.length];
}

function meaningSummary(meaning) {
  if (!meaning || typeof meaning !== 'object') return 'MeaningGraph: unavailable.';
  const events = Array.isArray(meaning.events) ? meaning.events : [];
  const types = unique(events.map(event => event?.type ?? event?.predicate).filter(Boolean));
  const label = meaning.concept ?? (types.length ? types.join(', ') :
    Array.isArray(meaning.events) ? `${events.length} event(s)` : meaning.type ?? 'graph');
  const roles = Object.entries(meaning.roles ?? {}).map(([role, value]) =>
    `${role}: ${value?.concept ?? 'unspecified'}`);
  return `MeaningGraph: ${label}${roles.length ? ` · ${roles.join(', ')}` : ''}`;
}

function diagnosticText(item) {
  if (typeof item === 'string') return item;
  return item?.message ?? item?.code ?? 'No diagnostic message.';
}

export function createTranslateView({runtime, translationService, state: modeState, workspaceState} = {}) {
  if (!runtime?.capabilityCatalog || typeof translationService?.translate !== 'function') {
    throw new Error('Translate view requires the application runtime and translation service.');
  }

  const catalog = runtime.capabilityCatalog;
  const languages = catalog.listLanguages().map(item => item.code);
  const availableDirections = catalog.listDirections({availableOnly: true});
  const preferred = availableDirections.find(item => item.from === 'en' && item.to === 'pl') ??
    availableDirections[0];
  const defaultFrom = preferred?.from ?? (languages.includes('en') ? 'en' : languages[0] ?? null);
  const defaultTo = preferred?.to ?? (languages.includes('pl') ? 'pl' :
    languages.find(code => code !== defaultFrom) ?? defaultFrom);
  const state = modeState ?? {draft: '', cursor: 0, status: '', settings: {}, from: defaultFrom,
    to: defaultTo, result: null, details: false, scrollTop: 0, selectedEntryId: null};
  state.settings ??= {};
  state.result ??= null;
  state.details ??= false;
  state.selectedEntryId ??= null;
  if (state.from === undefined) state.from = state.settings.from ?? defaultFrom;
  if (state.to === undefined) state.to = state.settings.to ?? defaultTo;
  state.settings.from = state.from;
  state.settings.to = state.to;

  function hasDirection(from, to) {
    return catalog.translation({from, to}).status === 'available';
  }

  function directionLabel() {
    const direction = catalog.translation({from: state.from, to: state.to});
    if (direction.status === 'available') return 'limited subset';
    if (direction.status === 'direction_unavailable') return 'unsupported (manifest restriction)';
    if (direction.status === 'capability_unavailable') return 'unsupported (capability unavailable)';
    if (direction.status === 'package_unavailable') return 'unsupported (package unavailable)';
    if (direction.status === 'runtime_unavailable') return 'unsupported (runtime unavailable)';
    return 'unsupported';
  }

  function hasOperation(language, operation) {
    const item = catalog.language(language);
    if (!item || item.status !== 'available') return false;
    return operation === 'analyze' ? item.runtimeCapabilities.parsing :
      operation === 'realize' ? item.runtimeCapabilities.realization : false;
  }

  function canSwap() {
    return hasDirection(state.to, state.from);
  }

  function focusTargets() {
    const items = [{id: 'source', type: 'input', label: 'Source text'}];
    if (languages.length) items.push({id: 'from', type: 'selector', label: 'Source language'});
    if (languages.length) items.push({id: 'to', type: 'selector', label: 'Target language'});
    items.push({id: 'translate', type: 'action', label: 'Translate'});
    if (canSwap()) items.push({id: 'swap', type: 'action', label: 'Swap direction'});
    if (state.result) items.push({id: 'details', type: 'action', label: 'Details'});
    return items;
  }

  function clearResult() {
    state.result = null;
    state.selectedEntryId = null;
    state.details = false;
    state.scrollTop = 0;
    state.status = '';
  }

  function changeFrom(step) {
    const next = nextValue(languages, state.from, step);
    if (next === state.from) return false;
    state.from = next;
    state.settings.from = next;
    clearResult();
    return true;
  }

  function changeTo(step) {
    const next = nextValue(languages, state.to, step);
    if (next === state.to) return false;
    state.to = next;
    state.settings.to = next;
    clearResult();
    return true;
  }

  function swapDirection() {
    if (!canSwap()) return false;
    [state.from, state.to] = [state.to, state.from];
    state.settings.from = state.from;
    state.settings.to = state.to;
    clearResult();
    return true;
  }

  async function translate({requestToken} = {}) {
    const input = state.draft;
    const from = state.from;
    const to = state.to;
    let result;
    try {
      result = await translationService.translate({from, to, text: input});
    } catch (error) {
      result = {status: 'error', text: null, meaning: null, alternatives: [],
        informationLoss: [], diagnostics: [{code: error?.code ?? 'TRANSLATION_SERVICE_ERROR',
          message: error?.message ?? 'The translation service failed.'}]};
    }
    if (workspaceState && requestToken && !isCurrentRequest(workspaceState, requestToken)) return null;
    state.result = result;
    state.status = result.status;
    state.details = false;
    if (!workspaceState) state.scrollTop = 0;
    const entry = workspaceState && appendOperation(workspaceState, 'translate', {
      input, from, to, status: result.status, accepted: result.status === 'ok',
      output: result.text, rawResult: result
    }, requestToken);
    if (entry) state.selectedEntryId = entry.id;
    if (result.status === 'ok' && state.draft === input) {
      state.draft = '';
      state.cursor = 0;
    }
    return result;
  }

  function toggleDetails() {
    if (!state.result) return false;
    state.details = !state.details;
    state.scrollTop = 0;
    return true;
  }

  function handleAction(action, {focus, requestToken} = {}) {
    if (state.details && focus?.id === 'details' && action.type === 'text' &&
        ['j', 'k'].includes(action.value.toLowerCase())) {
      state.scrollTop = Math.max(0, state.scrollTop + (action.value.toLowerCase() === 'j' ? 1 : -1));
      return true;
    }
    if (action.type === 'escape' && state.details) {
      state.details = false;
      state.scrollTop = 0;
      return true;
    }
    if (focus?.id === 'from' && ['cursor_left', 'cursor_right', 'submit'].includes(action.type)) {
      changeFrom(action.type === 'cursor_left' ? -1 : 1);
      return true;
    }
    if (focus?.id === 'to' && ['cursor_left', 'cursor_right', 'submit'].includes(action.type)) {
      changeTo(action.type === 'cursor_left' ? -1 : 1);
      return true;
    }
    if (focus?.id === 'swap' && action.type === 'submit') {
      swapDirection();
      return true;
    }
    if (focus?.id === 'details' && (action.type === 'submit' ||
        (action.type === 'text' && action.value.toLowerCase() === 'i'))) {
      toggleDetails();
      return true;
    }
    if ((focus?.id === 'source' || focus?.id === 'translate') && action.type === 'submit') {
      return translate({requestToken});
    }
    return false;
  }

  function renderInputPanel(focus) {
    const sourceFocused = focus?.id === 'source';
    const fromFocused = focus?.id === 'from';
    const toFocused = focus?.id === 'to';
    const translateFocused = focus?.id === 'translate';
    const swapFocused = focus?.id === 'swap';
    const detailsFocused = focus?.id === 'details';
    const directionSupported = hasDirection(state.from, state.to);
    return [
      {text: `${fromFocused ? '›' : ' '} From: ${state.from ?? 'unavailable'}${
        hasOperation(state.from, 'analyze') ? '' : ' (analysis unavailable)'}  ←/→`,
        tone: fromFocused ? 'accent' : 'neutral'},
      {text: `${toFocused ? '›' : ' '} To: ${state.to ?? 'unavailable'}${
        hasOperation(state.to, 'realize') ? '' : ' (realization unavailable)'}  ←/→`,
        tone: toFocused ? 'accent' : 'neutral'},
      {text: `Direction: ${state.from ?? '—'}→${state.to ?? '—'} · ${directionLabel()}`,
        tone: directionSupported ? 'muted' : 'warning'},
      {text: `${sourceFocused ? '›' : ' '} Source text`, tone: sourceFocused ? 'accent' : 'neutral'},
      {text: state.draft || 'Type a sentence here.', tone: sourceFocused ? 'neutral' : 'muted'},
      {text: `${translateFocused ? '›' : ' '} [Translate]`, tone: translateFocused ? 'accent' : 'neutral'},
      {text: canSwap() ? `${swapFocused ? '›' : ' '} [Swap]` : '  Swap unavailable for this direction.',
        tone: canSwap() && swapFocused ? 'accent' : canSwap() ? 'neutral' : 'muted'},
      {text: state.result ? `${detailsFocused ? '›' : ' '} [i] Details` : '  Details available after translating.',
        tone: detailsFocused ? 'accent' : 'muted'},
      ...(state.status ? [{text: `Status: ${state.status}`, tone: state.status === 'ok' ? 'muted' : 'warning'}] : [])
    ];
  }

  function renderResultPanel() {
    if (!languages.length) return [
      {text: 'No language packages are available.', tone: 'warning'},
      {text: 'Translation cannot be started until a language plugin is available.', tone: 'muted'}
    ];
    if (!availableDirections.length && !state.result) return [
      {text: 'No declared translation direction is currently available.', tone: 'warning'},
      {text: 'Known language pairs remain selectable so their exact refusal can be shown.', tone: 'muted'}
    ];
    if (!state.result) return [
      {text: `Direction: ${state.from ?? '—'}→${state.to ?? '—'} · ${
        directionLabel()}`,
        tone: hasDirection(state.from, state.to) ? 'muted' : 'warning'},
      {text: 'No translation yet.', tone: 'muted'}
    ];
    const result = state.result;
    const lines = [{text: `Status: ${result.status}`, tone: result.status === 'ok' ? 'accent' : 'error'}];
    if (result.text) lines.push({text: result.text, tone: 'neutral'});
    if (result.meaning) lines.push({text: meaningSummary(result.meaning), tone: 'muted'});
    if (result.status !== 'ok') {
      for (const item of result.diagnostics ?? []) lines.push({text: diagnosticText(item), tone: 'warning'});
    }
    if (state.details) {
      const detail = JSON.stringify({meaning: result.meaning ?? null,
        alternatives: result.alternatives ?? [], informationLoss: result.informationLoss ?? [],
        diagnostics: result.diagnostics ?? []}, null, 2);
      lines.push({text: 'MeaningGraph and diagnostics:', tone: 'accent'});
      lines.push(...detail.split('\n').map(text => ({text, tone: 'neutral'})));
    }
    return lines;
  }

  return {
    id: 'translate',
    label: 'Translate',
    state,
    fieldLabel: 'Source text',
    actionLabel: 'Translate',
    focusTargets,
    handleAction,
    onSubmit: translate,
    onDraftChange() {
      clearResult();
    },
    render({focus}) {
      return {panels: [
        {title: 'Direction and source', lines: renderInputPanel(focus)},
        {title: 'Result', lines: renderResultPanel()}
      ]};
    }
  };
}
