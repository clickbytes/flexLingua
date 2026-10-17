function hasSentenceOperation(capabilities, operation) {
  return capabilities.some(item => item.channel === 'sentence' && item.operation === operation &&
    item.status === 'implemented');
}

function pluginInventory(runtime) {
  const registry = runtime.plugins;
  const manifests = new Map((runtime.languages ?? []).map(item => [item.code, item]));
  const plugins = new Map();
  for (const code of registry?.list?.() ?? []) {
    const manifest = manifests.get(code);
    if (!manifest || manifest.status === 'unavailable') continue;
    try {
      const plugin = registry.get(code);
      const capabilities = plugin.capabilities();
      if (Array.isArray(capabilities)) plugins.set(code, {manifest, capabilities});
    } catch {}
  }

  const directions = [];
  for (const [from, source] of plugins) {
    if (!hasSentenceOperation(source.capabilities, 'analyze')) continue;
    for (const [to, target] of plugins) {
      if (!hasSentenceOperation(target.capabilities, 'realize')) continue;
      const direction = `${from}->${to}`;
      if ([source.manifest, target.manifest].some(item => item.directions !== undefined &&
          !item.directions.includes(direction))) continue;
      directions.push({from, to});
    }
  }
  directions.sort((left, right) => left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to));
  return {plugins, directions};
}

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

export function createTranslateView({runtime, translationService} = {}) {
  if (!runtime?.plugins || typeof translationService?.translate !== 'function') {
    throw new Error('Translate view requires the application runtime and translation service.');
  }

  const inventory = pluginInventory(runtime);
  const directions = inventory.directions;
  const languages = [...inventory.plugins.keys()];
  const preferred = directions.find(item => item.from === 'en' && item.to === 'pl') ?? directions[0];
  const defaultFrom = preferred?.from ?? (languages.includes('en') ? 'en' : languages[0] ?? null);
  const defaultTo = preferred?.to ?? (languages.includes('pl') ? 'pl' : languages[0] ?? null);
  const state = {draft: '', cursor: 0, focusIndex: 0, status: '', from: defaultFrom,
    to: defaultTo, result: null, details: false, scrollTop: 0};

  function hasDirection(from, to) {
    return directions.some(item => item.from === from && item.to === to);
  }

  function hasOperation(language, operation) {
    const plugin = inventory.plugins.get(language);
    return !!plugin && hasSentenceOperation(plugin.capabilities, operation);
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
    state.details = false;
    state.scrollTop = 0;
    state.status = '';
  }

  function changeFrom(step) {
    const next = nextValue(languages, state.from, step);
    if (next === state.from) return false;
    state.from = next;
    clearResult();
    return true;
  }

  function changeTo(step) {
    const next = nextValue(languages, state.to, step);
    if (next === state.to) return false;
    state.to = next;
    clearResult();
    return true;
  }

  function swapDirection() {
    if (!canSwap()) return false;
    [state.from, state.to] = [state.to, state.from];
    clearResult();
    return true;
  }

  function translate() {
    try {
      state.result = translationService.translate({from: state.from, to: state.to, text: state.draft});
      state.status = state.result.status;
    } catch (error) {
      state.result = {status: 'error', text: null, meaning: null, alternatives: [],
        informationLoss: [], diagnostics: [{code: error?.code ?? 'TRANSLATION_SERVICE_ERROR',
          message: error?.message ?? 'The translation service failed.'}]};
      state.status = 'error';
    }
    state.details = false;
    state.scrollTop = 0;
  }

  function toggleDetails() {
    if (!state.result) return false;
    state.details = !state.details;
    state.scrollTop = 0;
    return true;
  }

  function handleAction(action, {focus} = {}) {
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
      translate();
      return true;
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
      {text: `Direction: ${state.from ?? '—'}→${state.to ?? '—'} · ${
        directionSupported ? 'supported' : 'unsupported'}`,
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
    if (!state.result) return [
      {text: `Direction: ${state.from ?? '—'}→${state.to ?? '—'} · ${
        hasDirection(state.from, state.to) ? 'supported' : 'unsupported'}`,
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
