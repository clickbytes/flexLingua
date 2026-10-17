import {EventEmitter} from 'node:events';
import {createChatService} from '../app/chat-service.js';
import {createFormsService} from '../app/forms-service.js';
import {createTranslationService} from '../app/translation-service.js';
import {beginRequest, createWorkspaceState, finishRequest, invalidateRequests, isCurrentRequest,
  setFollowLatest, setViewportAnchor, WORKSPACE_MODES} from './state.js';
import {actionForKey} from './keymap.js';
import {computeLayout} from './layout.js';
import {createScreen, sanitizeText, textWidth, wrapText} from './screen.js';
import {styleFor} from './theme.js';
import {buildTranscript} from './transcript.js';
import {createTranslateView} from './views/translate.js';
import {createChatView} from './views/chat.js';
import {createFormsView} from './views/forms.js';

const SMALL_TERMINAL_MESSAGE = 'Za mały terminal. Powiększ do co najmniej 40 kolumn i 12 wierszy.';
const MAX_INPUT_CODEPOINTS = 4000;

function positiveSize(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function focusTargetsFor(view) {
  const configured = typeof view.focusTargets === 'function' ? view.focusTargets() : null;
  return Array.isArray(configured) && configured.length ? configured : [
    {id: 'draft', type: 'input', label: view.fieldLabel},
    {id: 'action', type: 'action', label: view.actionLabel}
  ];
}

function currentFocus(view, workspaceState) {
  const targets = focusTargetsFor(view);
  const savedId = workspaceState.focusRegion?.mode === view.id ?
    workspaceState.focusRegion.id : workspaceState.modes[view.id].focusRegionId;
  let index = targets.findIndex(item => item.id === savedId);
  if (index < 0) index = 0;
  workspaceState.modes[view.id].focusRegionId = targets[index].id;
  workspaceState.focusRegion = {mode: view.id, id: targets[index].id};
  return targets[index];
}

function composerLinesFor(view, focus, width) {
  const state = view.state;
  const prompt = state.draft || view.composerPrompt || 'Type here…';
  const prefix = focus.type === 'input' ? '› ' : '  ';
  const availableWidth = Math.max(1, width - textWidth(prefix));
  const lines = wrapText(prompt, availableWidth);
  return lines.map((text, index) => ({text: `${index === 0 ? prefix : '  '}${text}`,
    tone: state.draft ? 'neutral' : 'muted'}));
}

function transcriptRowsFor(view, focus, width) {
  return buildTranscript(view, {focus}).flatMap(item =>
    wrapText(item.text, width).map(text => ({text, tone: item.tone ?? 'neutral',
      entryId: item.entryId ?? null})));
}

function anchorAt(rows, requestedIndex) {
  if (!rows.length) return null;
  const index = Math.max(0, Math.min(requestedIndex, rows.length - 1));
  let entryIndex = index;
  while (entryIndex < rows.length && !rows[entryIndex].entryId) entryIndex++;
  if (entryIndex >= rows.length) {
    entryIndex = index;
    while (entryIndex >= 0 && !rows[entryIndex].entryId) entryIndex--;
  }
  if (entryIndex < 0) return null;
  const entryId = rows[entryIndex].entryId;
  let firstIndex = entryIndex;
  while (firstIndex > 0 && rows[firstIndex - 1].entryId === entryId) firstIndex--;
  return {entryId, offset: Math.max(0, entryIndex - firstIndex)};
}

function startIndexFor(modeState, rows, viewportHeight) {
  const maxStart = Math.max(0, rows.length - viewportHeight);
  if (modeState.followLatest) return maxStart;
  const anchor = modeState.viewportAnchor;
  if (!anchor) return Math.min(Number(modeState.scrollTop) || 0, maxStart);
  const entryStart = rows.findIndex(row => row.entryId === anchor.entryId);
  if (entryStart < 0) return maxStart;
  return Math.min(entryStart + Math.max(0, Number(anchor.offset) || 0), maxStart);
}

function modeMetadata(view, focus) {
  const state = view.state;
  if (view.id === 'forms') {
    const language = state.language ?? '?';
    return `${focus.id === 'language' ? '›' : ''}${language} · local`;
  }
  const from = state.from ?? '?';
  const to = state.to ?? '?';
  if (focus.id === 'from') return `›${from} → ${to} · local`;
  if (focus.id === 'to') return `${from} → ›${to} · local`;
  return `${from} → ${to} · local`;
}

export function createTui({runtime, terminal, output = process.stdout, services = {}} = {}) {
  if (!runtime?.engine) throw new Error('TUI requires an initialized application runtime.');
  if (!terminal || typeof terminal.grabInput !== 'function' || typeof terminal.put !== 'function') {
    throw new Error('TUI requires a Terminal Kit terminal instance.');
  }

  const translationService = services.translation ?? createTranslationService(runtime);
  const chatService = services.chat ?? createChatService(runtime);
  const formsService = services.forms ?? createFormsService(runtime);
  const workspaceState = createWorkspaceState();
  const views = [
    createTranslateView({runtime, translationService, state: workspaceState.modes.translate, workspaceState}),
    createChatView({chatService, state: workspaceState.modes.chat, workspaceState}),
    createFormsView({runtime, formsService, state: workspaceState.modes.forms, workspaceState})
  ];
  const screen = createScreen({terminal, styleFor});
  const events = new EventEmitter();
  let started = false;
  let stopping = false;
  let stopPromise = null;
  let lastFrame = null;

  function activeIndex() {
    return WORKSPACE_MODES.indexOf(workspaceState.activeMode);
  }

  function activeView() {
    return views[activeIndex()];
  }

  function setFocus(view, id) {
    if (focusTargetsFor(view).some(item => item.id === id)) {
      workspaceState.modes[view.id].focusRegionId = id;
      if (workspaceState.activeMode === view.id) workspaceState.focusRegion = {mode: view.id, id};
    }
  }

  events.on('newSession', ({activeMode} = {}) => {
    if (activeMode !== 'chat') return;
    const view = views[WORKSPACE_MODES.indexOf('chat')];
    view.onNewSession?.({setFocus: id => setFocus(view, id)});
    draw();
  });

  function dimensions() {
    return {
      width: positiveSize(terminal.width, positiveSize(output.columns, 80)),
      height: positiveSize(terminal.height, positiveSize(output.rows, 24))
    };
  }

  function put(text, x, y, tone, maxWidth) {
    screen.put({x, y, tone, maxWidth}, text);
  }

  function drawHeader(view, focus, width) {
    const compact = width < 60;
    const segments = [
      {text: compact ? 'flex' : 'flexLingua', tone: 'accent'},
      {text: view.label, tone: 'neutral'},
      {text: modeMetadata(view, focus), tone: 'muted'}
    ];
    let column = 1;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (index) {
        put(' · ', column, 1, 'muted', width - column + 1);
        column += textWidth(' · ');
      }
      put(segment.text, column, 1, segment.tone, width - column + 1);
      column += textWidth(segment.text);
    }
  }

  function drawFooter(view, focus, state, layout) {
    const action = focus.type === 'selector' ? '←/→ język' :
      focus.id === 'history' ? 'PgUp/PgDn historia' :
        focus.id === 'details' ? 'Enter szczegóły' :
          view.id === 'chat' ? 'Enter wyślij' :
            view.id === 'forms' ? 'Enter szukaj' : 'Enter tłumacz';
    const required = [action, '/help', '^C wyjście'];
    const candidates = [
      state.unseenCount ? `${state.unseenCount} nowych · ^End najnowsze` : 'PgUp/PgDn historia',
      'F1–F3 tryby',
      view.id === 'chat' ? 'Ctrl+N /new' : 'Tab fokus'
    ];
    let parts = required;
    for (const candidate of candidates) {
      const next = [...parts.slice(0, -1), candidate, parts.at(-1)];
      if (textWidth(next.join(' · ')) <= layout.width) parts = next;
    }
    const text = parts.join(' · ');
    put(text, 1, layout.footer.y, 'muted', layout.width);
  }

  function drawSmallTerminal(layout) {
    if (layout.height === 1) {
      put('^C', 1, 1, 'warning', layout.width);
      return;
    }
    put(layout.width < 20 ? 'flex' : 'flex · za mały terminal', 1, 1, 'accent', layout.width);
    if (layout.height >= 3) {
      let row = 2;
      for (const line of wrapText(SMALL_TERMINAL_MESSAGE, layout.width)) {
        if (row >= layout.height) break;
        put(line, 1, row++, 'warning', layout.width);
      }
    }
    put(layout.width < 16 ? '^C' : '^C wyjście · powiększ do 40×12', 1, layout.height, 'muted', layout.width);
  }

  function draw() {
    if (!started || stopping) return {changedRows: 0};
    const {width, height} = dimensions();
    const view = activeView();
    const focus = currentFocus(view, workspaceState);
    const composerLines = composerLinesFor(view, focus, width);
    const layout = computeLayout({width, height, composerLines: composerLines.length});
    screen.beginFrame(width, height);
    if (layout.tooSmall) {
      drawSmallTerminal(layout);
      lastFrame = {mode: view.id, layout, historyRows: []};
      return screen.commit();
    }

    drawHeader(view, focus, width);
    const historyRows = transcriptRowsFor(view, focus, width);
    const modeState = view.state;
    const scrollTop = startIndexFor(modeState, historyRows, layout.history.height);
    modeState.scrollTop = scrollTop;
    const anchor = anchorAt(historyRows, scrollTop);
    if (anchor) modeState.viewportAnchor = anchor;
    for (let offset = 0; offset < layout.history.height; offset++) {
      const row = historyRows[scrollTop + offset];
      if (!row) break;
      put(row.text, 1, layout.history.y + offset, row.tone, width);
    }
    put('─'.repeat(width), 1, layout.historySeparator.y, 'muted', width);

    const visibleComposer = composerLines.slice(-layout.composer.height);
    for (let offset = 0; offset < visibleComposer.length; offset++) {
      const row = visibleComposer[offset];
      put(row.text, 1, layout.composer.y + offset, row.tone, width);
    }
    put('─'.repeat(width), 1, layout.composerSeparator.y, 'muted', width);
    drawFooter(view, focus, modeState, layout);
    lastFrame = {mode: view.id, layout, historyRows};
    return screen.commit();
  }

  function selectMode(mode) {
    if (!WORKSPACE_MODES.includes(mode)) return false;
    const previousMode = workspaceState.activeMode;
    if (workspaceState.focusRegion?.mode === previousMode) {
      workspaceState.modes[previousMode].focusRegionId = workspaceState.focusRegion.id;
    }
    workspaceState.activeMode = mode;
    currentFocus(activeView(), workspaceState);
    draw();
    return true;
  }

  function editDraft(action) {
    const view = activeView();
    const state = view.state;
    const previousDraft = state.draft;
    const chars = Array.from(state.draft);
    const cursor = Math.min(state.cursor, chars.length);
    if (action.type === 'text') {
      const insert = Array.from(sanitizeText(action.value).replace(/\n/gu, ''));
      if (!insert.length || chars.length + insert.length > MAX_INPUT_CODEPOINTS) return;
      chars.splice(cursor, 0, ...insert);
      state.cursor = cursor + insert.length;
      state.status = '';
    } else if (action.type === 'backspace' && cursor > 0) {
      chars.splice(cursor - 1, 1);
      state.cursor = cursor - 1;
      state.status = '';
    } else if (action.type === 'delete' && cursor < chars.length) {
      chars.splice(cursor, 1);
      state.status = '';
    } else if (action.type === 'cursor_left') {
      state.cursor = Math.max(0, cursor - 1);
    } else if (action.type === 'cursor_right') {
      state.cursor = Math.min(chars.length, cursor + 1);
    } else if (action.type === 'cursor_home') {
      state.cursor = 0;
    } else if (action.type === 'cursor_end') {
      state.cursor = chars.length;
    }
    state.draft = chars.join('');
    if (state.draft !== previousDraft) view.onDraftChange?.({runtime, state});
  }

  async function dispatchSubmit(view, action, focus) {
    const state = view.state;
    const token = beginRequest(workspaceState, view.id, {draft: state.draft,
      from: state.from, to: state.to, language: state.language});
    if (!token) {
      draw();
      return;
    }
    const context = {runtime, events, focus, requestToken: token, workspaceState,
      setFocus: id => setFocus(view, id)};
    draw();
    try {
      const handled = typeof view.handleAction === 'function' ?
        await view.handleAction(action, context) : false;
      if (handled === false && typeof view.onSubmit === 'function') {
        await view.onSubmit({...context, state});
      } else if (handled === false) {
        state.status = 'Draft saved for this mode.';
      }
    } catch (error) {
      if (isCurrentRequest(workspaceState, token)) {
        state.status = sanitizeText(error?.message || 'Action failed.');
      }
    } finally {
      finishRequest(workspaceState, token);
      draw();
    }
  }

  function scrollHistory(direction, page = false) {
    if (!lastFrame || lastFrame.mode !== workspaceState.activeMode || lastFrame.layout.tooSmall) return;
    const mode = workspaceState.activeMode;
    const state = workspaceState.modes[mode];
    const rows = lastFrame.historyRows;
    const viewportHeight = lastFrame.layout.history.height;
    const maxStart = Math.max(0, rows.length - viewportHeight);
    const current = startIndexFor(state, rows, viewportHeight);
    const amount = page ? Math.max(1, viewportHeight - 1) : 1;
    const next = Math.max(0, Math.min(current + direction * amount, maxStart));
    if (direction > 0 && next >= maxStart) {
      setFollowLatest(workspaceState, mode, true);
    } else {
      const anchor = anchorAt(rows, next);
      if (anchor) setViewportAnchor(workspaceState, mode, anchor.entryId, anchor.offset);
      state.scrollTop = next;
    }
    draw();
  }

  function onKey(name) {
    const action = actionForKey(name);
    const view = activeView();
    if (action.type === 'quit') {
      void stop(0);
      return;
    }
    const {width, height} = dimensions();
    if (width < 40 || height < 12) return;
    if (action.type === 'select_tab') {
      selectMode(WORKSPACE_MODES[action.index]);
    } else if (action.type === 'focus_next' || action.type === 'focus_previous') {
      const targets = focusTargetsFor(view);
      const direction = action.type === 'focus_next' ? 1 : -1;
      const focus = currentFocus(view, workspaceState);
      const index = targets.findIndex(item => item.id === focus.id);
      const next = targets[(index + direction + targets.length) % targets.length];
      setFocus(view, next.id);
      draw();
    } else if (action.type === 'new_session') {
      events.emit('newSession', {activeMode: view.id});
    } else if (action.type === 'history_page_up') {
      scrollHistory(-1, true);
    } else if (action.type === 'history_page_down') {
      scrollHistory(1, true);
    } else if (action.type === 'history_latest') {
      setFollowLatest(workspaceState, view.id, true);
      draw();
    } else if (action.type === 'submit') {
      void dispatchSubmit(view, action, currentFocus(view, workspaceState));
    } else if (action.type === 'text' && ['j', 'k'].includes(action.value.toLowerCase()) &&
        ['history', 'details'].includes(currentFocus(view, workspaceState).id)) {
      scrollHistory(action.value.toLowerCase() === 'j' ? 1 : -1);
    } else if (typeof view.handleAction === 'function' &&
        view.handleAction(action, {runtime, events, focus: currentFocus(view, workspaceState),
          workspaceState, setFocus: id => setFocus(view, id)})) {
      draw();
    } else if (action.type === 'escape') {
      const targets = focusTargetsFor(view);
      const focus = currentFocus(view, workspaceState);
      if (focus.id !== targets[0].id) setFocus(view, targets[0].id);
      else view.state.status = '';
      draw();
    } else if (currentFocus(view, workspaceState).type === 'input') {
      editDraft(action);
      draw();
    }
  }

  function onResize() {
    draw();
  }

  function onSignal() {
    void stop(0);
  }

  async function stop(code = 0) {
    if (stopPromise) return stopPromise;
    stopping = true;
    invalidateRequests(workspaceState);
    stopPromise = (async () => {
      terminal.removeListener?.('key', onKey);
      terminal.removeListener?.('resize', onResize);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      try {
        await terminal.grabInput(false, true);
      } catch {}
      terminal.hideCursor(false);
      terminal.styleReset();
      terminal.fullscreen(false);
      process.exitCode = code;
    })();
    return stopPromise;
  }

  function start() {
    if (started) return;
    started = true;
    terminal.fullscreen(true);
    terminal.hideCursor(true);
    terminal.on('key', onKey);
    terminal.on('resize', onResize);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    terminal.grabInput();
    draw();
  }

  return Object.freeze({
    start,
    stop,
    draw,
    selectMode,
    on: events.on.bind(events),
    off: events.off.bind(events),
    getState: () => structuredClone(workspaceState)
  });
}
