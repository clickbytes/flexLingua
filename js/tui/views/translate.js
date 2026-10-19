import {appendOperation, isCurrentRequest} from '../state.js';

function nextValue(values, current, direction) {
  if (!values.length) return current;
  const index = values.indexOf(current);
  return values[(index + direction + values.length) % values.length];
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
    to: defaultTo, result: null, scrollTop: 0, selectedEntryId: null, entries: []};
  state.settings ??= {};
  state.result ??= null;
  state.entries ??= [];
  if (state.from === undefined) state.from = state.settings.from ?? defaultFrom;
  if (state.to === undefined) state.to = state.settings.to ?? defaultTo;
  state.settings.from = state.from;
  state.settings.to = state.to;

  function directionStatus(from = state.from, to = state.to) {
    return catalog.translation({from, to});
  }

  function canSwap() {
    return directionStatus(state.to, state.from).status === 'available';
  }

  function activeEntry() {
    return state.entries.find(entry=>entry.id===state.selectedEntryId)||state.entries.at(-1)||null;
  }

  function completeRealizations(entry=activeEntry()) {
    return (entry?.rawResult?.interpretations||[]).flatMap(interpretation=>
      (interpretation.realizations||[]).map(realization=>({...realization,
        meaning:interpretation.meaning})));
  }

  function cyclePreview(step) {
    const entry=activeEntry();
    const rows=completeRealizations(entry);
    if(!entry||rows.length<2)return false;
    const result=entry.rawResult||{};
    const former=rows.findIndex(item=>item.id===result.previewId);
    const selected=rows[(Math.max(0,former)+step+rows.length)%rows.length];
    entry.rawResult={...result,previewId:selected.id,preview:{
      id:selected.id,interpretationId:selected.interpretationId,meaning:selected.meaning,
      text:selected.text,kind:selected.kind,assumptions:selected.assumptions,
      informationLoss:selected.informationLoss,
      ...(Array.isArray(selected.segments)?{segments:selected.segments}:{})}};
    state.result=entry.rawResult;
    state.status=entry.status;
    if(workspaceState?.modes?.translate)
      workspaceState.modes.translate.historyRevision++;
    return true;
  }

  function focusTargets() {
    const items = [{id: 'source', type: 'input', label: 'Source text'}];
    if (languages.length) items.push({id: 'from', type: 'selector', label: 'Source language'});
    if (languages.length) items.push({id: 'to', type: 'selector', label: 'Target language'});
    if (canSwap()) items.push({id: 'swap', type: 'action', label: 'Swap direction'});
    if(completeRealizations().length>1)
      items.push({id:'preview',type:'action',label:'Pełne warianty zdania'});
    if (state.entries.length) items.push({id: 'details', type: 'action', label: 'Details'});
    return items;
  }

  function clearLatestResult() {
    state.result = null;
    state.status = '';
  }

  function changeFrom(step) {
    const next = nextValue(languages, state.from, step);
    if (next === state.from) return false;
    state.from = next;
    state.settings.from = next;
    clearLatestResult();
    return true;
  }

  function changeTo(step) {
    const next = nextValue(languages, state.to, step);
    if (next === state.to) return false;
    state.to = next;
    state.settings.to = next;
    clearLatestResult();
    return true;
  }

  function swapDirection() {
    if (!canSwap()) return false;
    [state.from, state.to] = [state.to, state.from];
    state.settings.from = state.from;
    state.settings.to = state.to;
    clearLatestResult();
    return true;
  }

  function openDetails() {
    if (!workspaceState || !state.entries.length) return false;
    const selected = state.entries.find(entry => entry.id === state.selectedEntryId);
    const entry = selected ?? state.entries.at(-1);
    workspaceState.overlay = {type: 'details', mode: 'translate', entryId: entry.id,
      sectionIndex: 0, scrollTop: 0};
    workspaceState.overlayScrollTop = 0;
    return true;
  }

  async function translate({requestToken} = {}) {
    const input = state.draft;
    const from = state.from;
    const to = state.to;
    let result;
    try {
      result = await translationService.translate({from,to,text:input,includeSegments:true});
    } catch (error) {
      result = {status: 'error', text: null, meaning: null, alternatives: [],
        informationLoss: [], diagnostics: [{code: error?.code ?? 'TRANSLATION_SERVICE_ERROR',
          message: error?.message ?? 'The translation service failed.'}]};
    }
    if (workspaceState && requestToken && !isCurrentRequest(workspaceState, requestToken)) return null;
    state.result = result;
    state.status = result.status;
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

  function handleAction(action, {focus, requestToken} = {}) {
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
    if(focus?.id==='preview'&&['cursor_left','cursor_right','submit'].includes(action.type)){
      return cyclePreview(action.type==='cursor_left'?-1:1);
    }
    if (focus?.id === 'details' && (action.type === 'submit' ||
        (action.type === 'text' && action.value.toLowerCase() === 'i'))) {
      return openDetails();
    }
    if ((focus?.id === 'source' || focus?.id === 'translate') && action.type === 'submit') {
      return translate({requestToken});
    }
    return false;
  }

  function statusLine() {
    const direction = directionStatus();
    const pair = `${state.from ?? '—'}→${state.to ?? '—'}`;
    if (direction.status === 'available') {
      return {text: `Ograniczony zakres zdań · ${pair} · kierunek dostępny`};
    }
    const reason = direction.code ?? direction.status;
    return {text: `${pair} · nieobsługiwany: ${reason}`};
  }

  return {
    id: 'translate',
    label: 'Translate',
    state,
    fieldLabel: 'Source text',
    composerPrompt: 'Wpisz zdanie lub /polecenie…',
    actionLabel: 'Translate',
    focusTargets,
    handleAction,
    onSubmit: translate,
    onDraftChange() {
      clearLatestResult();
    },
    statusLine
  };
}
