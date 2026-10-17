export const WORKSPACE_MODES = Object.freeze(['translate', 'chat', 'forms']);
export const MAX_MODE_ENTRIES = 200;

function createModeState() {
  return {
    draft: '',
    cursor: 0,
    focusRegionId: null,
    status: '',
    settings: {},
    entries: [],
    selectedEntryId: null,
    viewportAnchor: null,
    followLatest: true,
    unseenCount: 0,
    removedEntryCount: 0,
    scrollTop: 0
  };
}

export function createWorkspaceState({activeMode = 'translate'} = {}) {
  const mode = WORKSPACE_MODES.includes(activeMode) ? activeMode : 'translate';
  return {
    activeMode: mode,
    focusRegion: {mode, id: null},
    overlay: null,
    commandBuffer: '',
    commandCursor: 0,
    commandViewportTop: 0,
    commandSelection: 0,
    commandNotice: '',
    overlayScrollTop: 0,
    pendingConfirmation: null,
    automaticDetails: false,
    busy: false,
    requestId: 0,
    pendingRequest: null,
    nextEntryId: 1,
    modes: Object.fromEntries(WORKSPACE_MODES.map(name => [name, createModeState()]))
  };
}

export function beginRequest(state, mode, input) {
  if (!state || !WORKSPACE_MODES.includes(mode) || state.busy) return null;
  const requestId = ++state.requestId;
  const capturedInput = input && typeof input === 'object' ?
    Object.freeze(structuredClone(input)) : input;
  const token = Object.freeze({requestId, mode, input: capturedInput});
  state.busy = true;
  state.pendingRequest = token;
  return token;
}

export function isCurrentRequest(state, token) {
  return !!state && !!token && state.busy && state.requestId === token.requestId &&
    state.pendingRequest === token;
}

export function finishRequest(state, token) {
  if (!isCurrentRequest(state, token)) return false;
  state.busy = false;
  state.pendingRequest = null;
  return true;
}

export function invalidateRequests(state) {
  if (!state) return;
  state.requestId++;
  state.busy = false;
  state.pendingRequest = null;
}

export function appendOperation(state, mode, operation, token = null) {
  if (!state || !WORKSPACE_MODES.includes(mode) || !operation ||
      (token && (!isCurrentRequest(state, token) || token.mode !== mode))) return null;
  const target = state.modes[mode];
  const id = `op-${state.nextEntryId++}`;
  const entry = {
    id,
    mode,
    input: operation.input ?? null,
    ...(operation.from === undefined ? {} : {from: operation.from}),
    ...(operation.to === undefined ? {} : {to: operation.to}),
    ...(operation.language === undefined ? {} : {language: operation.language}),
    status: operation.status ?? 'error',
    accepted: operation.accepted === true,
    output: operation.output ?? null,
    rawResult: operation.rawResult ?? null,
    events: Array.isArray(operation.events) ? operation.events : []
  };
  target.entries.push(entry);
  if (target.followLatest) target.unseenCount = 0;
  else target.unseenCount++;
  const removed = target.entries.splice(0, Math.max(0, target.entries.length - MAX_MODE_ENTRIES));
  if (removed.length) {
    target.removedEntryCount += removed.length;
    const remainingIds = new Set(target.entries.map(item => item.id));
    if (!remainingIds.has(target.selectedEntryId)) {
      target.selectedEntryId = target.entries[0]?.id ?? null;
    }
    if (!remainingIds.has(target.viewportAnchor?.entryId)) {
      target.viewportAnchor = target.entries.length ? {entryId: target.entries[0].id, offset: 0} : null;
      target.scrollTop = 0;
    }
  }
  if (target.followLatest) {
    target.selectedEntryId = id;
    target.viewportAnchor = {entryId: id, offset: 0};
    target.scrollTop = Number.MAX_SAFE_INTEGER;
  }
  return entry;
}

export function updateOperation(state, mode, id, patch) {
  const target = state?.modes?.[mode];
  const entry = target?.entries.find(item => item.id === id);
  if (!entry || !patch || typeof patch !== 'object') return null;
  for (const key of ['status', 'accepted', 'output', 'rawResult', 'events']) {
    if (Object.hasOwn(patch, key)) entry[key] = key === 'events' && !Array.isArray(patch[key]) ? [] : patch[key];
  }
  return entry;
}

export function clearModeEntries(state, mode, {resetRemovedEntryCount = true} = {}) {
  const target = state?.modes?.[mode];
  if (!target) return false;
  target.entries = [];
  target.selectedEntryId = null;
  target.viewportAnchor = null;
  target.unseenCount = 0;
  if (resetRemovedEntryCount) target.removedEntryCount = 0;
  target.scrollTop = 0;
  return true;
}

export function setViewportAnchor(state, mode, entryId, offset = 0) {
  const target = state?.modes?.[mode];
  if (!target || !target.entries.some(entry => entry.id === entryId)) return false;
  target.viewportAnchor = {entryId, offset: Number.isFinite(offset) ? Math.max(0, offset) : 0};
  target.selectedEntryId = entryId;
  target.followLatest = false;
  return true;
}

export function setFollowLatest(state, mode, followLatest) {
  const target = state?.modes?.[mode];
  if (!target) return false;
  target.followLatest = !!followLatest;
  if (target.followLatest) {
    target.unseenCount = 0;
    const latest = target.entries.at(-1);
    if (latest) {
      target.selectedEntryId = latest.id;
      target.viewportAnchor = {entryId: latest.id, offset: 0};
    }
    target.scrollTop = latest ? Number.MAX_SAFE_INTEGER : 0;
  }
  return true;
}
