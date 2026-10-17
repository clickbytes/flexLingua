import {EventEmitter} from 'node:events';
import {createChatService} from '../app/chat-service.js';
import {createFormsService} from '../app/forms-service.js';
import {createTranslationService} from '../app/translation-service.js';
import {beginRequest, createWorkspaceState, finishRequest, invalidateRequests, isCurrentRequest,
  WORKSPACE_MODES} from './state.js';
import {TABS, actionForKey} from './keymap.js';
import {styleFor} from './theme.js';
import {createTranslateView} from './views/translate.js';
import {createChatView} from './views/chat.js';
import {createFormsView} from './views/forms.js';

const SMALL_TERMINAL_MESSAGE = 'Terminal too small. Resize to at least 40 columns and 12 rows.';
const MAX_INPUT_CODEPOINTS = 4000;

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu, '');
}

const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

function graphemes(value) {
  return Array.from(segmenter.segment(value), item => item.segment);
}

function graphemeWidth(value) {
  if (!value || /^\p{Mark}+$/u.test(value)) return 0;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)) return 2;
  const code = value.codePointAt(0);
  if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) return 0;
  if (code >= 0x1100 && (code <= 0x115f || code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6))) return 2;
  return 1;
}

function textWidth(value) {
  return graphemes(sanitizeText(value)).reduce((width, item) => width + graphemeWidth(item), 0);
}

function wrapText(value, maxWidth) {
  const width = Math.max(1, Math.floor(maxWidth));
  const safe = sanitizeText(value);
  const lines = [];
  for (const sourceLine of safe.split('\n')) {
    let line = '';
    let lineWidth = 0;
    for (const item of graphemes(sourceLine)) {
      const itemWidth = graphemeWidth(item);
      if (line && lineWidth + itemWidth > width) {
        lines.push(line);
        line = '';
        lineWidth = 0;
      }
      if (itemWidth <= width) {
        line += item;
        lineWidth += itemWidth;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fitText(value, maxWidth) {
  const lines = wrapText(value, Math.max(1, maxWidth));
  return lines[0] ?? '';
}

function positiveSize(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function fieldText(view, focused) {
  const prefix = focused ? '› ' : '  ';
  return `${prefix}${view.fieldLabel}:`;
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
  if (index < 0) {
    index = 0;
  }
  workspaceState.modes[view.id].focusRegionId = targets[index].id;
  workspaceState.focusRegion = {mode: view.id, id: targets[index].id};
  return targets[index];
}

function focusIndexFor(view, workspaceState) {
  const focus = currentFocus(view, workspaceState);
  return focusTargetsFor(view).findIndex(item => item.id === focus.id);
}

function buildHeader(width, activeIndex) {
  const compact = width < 60;
  const tabs = TABS.map((tab, index) => ({
    text: `${index === activeIndex ? '[' : ''}${compact ? tab.label : `${tab.key} ${tab.label}`}${index === activeIndex ? ']' : ''}`,
    tone: index === activeIndex ? 'accent' : 'neutral',
    index
  }));
  const segments = [{text: compact ? 'flex' : 'flexLingua', tone: 'accent'},
    {text: compact ? ' | ' : '  ·  ', tone: 'muted'}];
  for (let index = 0; index < tabs.length; index++) {
    if (index) segments.push({text: compact ? ' | ' : '  ·  ', tone: 'muted'});
    segments.push(tabs[index]);
  }
  let column = 1;
  const hitboxes = [];
  for (const segment of segments) {
    if (segment.index !== undefined) {
      hitboxes.push({index: segment.index, start: column, end: column + textWidth(segment.text) - 1});
    }
    segment.start = column;
    column += textWidth(segment.text);
  }
  return {segments, hitboxes};
}

function asPanelLines(panel, view, focusIndex) {
  const lines = [];
  if (panel.kind === 'input') {
    lines.push({text: fieldText(view, focusIndex === 0), tone: focusIndex === 0 ? 'accent' : 'neutral'});
    lines.push({text: view.state.draft || 'Type here…', tone: focusIndex === 0 ? 'neutral' : 'muted'});
    lines.push({text: `${focusIndex === 1 ? '›' : ' '} [${view.actionLabel}]`, tone: focusIndex === 1 ? 'accent' : 'muted'});
    if (view.state.status) lines.push({text: view.state.status, tone: 'warning'});
  }
  for (const line of panel.lines ?? []) lines.push(typeof line === 'string' ? {text: line} : line);
  return lines;
}

function buildContentRows(view, width, workspaceState) {
  const description = view.render({width, compact: width < 60, state: view.state,
    focus: currentFocus(view, workspaceState), focusIndex: focusIndexFor(view, workspaceState)});
  const panels = description?.panels?.length ? description.panels : [{title: view.label, kind: 'input'}];
  const focusIndex = focusIndexFor(view, workspaceState);
  const rows = [];
  const addPanel = (panel, panelWidth) => {
    rows.push({text: panel.title ?? view.label, tone: 'accent'});
    for (const item of asPanelLines(panel, view, focusIndex)) {
      for (const text of wrapText(item.text, panelWidth)) {
        rows.push({text, tone: item.tone ?? 'neutral'});
      }
    }
    if (panels.length > 1) rows.push({text: '', tone: 'muted'});
  };

  if (view.id === 'translate' && width >= 100 && panels.length === 2) {
    const paneWidth = Math.floor((width - 3) / 2);
    const leftRows = [];
    const rightRows = [];
    const collect = (panel, target) => {
      target.push({text: panel.title ?? view.label, tone: 'accent'});
      for (const item of asPanelLines(panel, view, focusIndex)) {
        for (const text of wrapText(item.text, paneWidth)) target.push({text, tone: item.tone ?? 'neutral'});
      }
    };
    collect(panels[0], leftRows);
    collect(panels[1], rightRows);
    for (let index = 0; index < Math.max(leftRows.length, rightRows.length); index++) {
      const left = leftRows[index] ?? {text: '', tone: 'neutral'};
      const right = rightRows[index] ?? {text: '', tone: 'neutral'};
      rows.push({split: true, left, right, paneWidth});
    }
  } else {
    for (const panel of panels) addPanel(panel, width);
  }

  return rows;
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
  const events = new EventEmitter();
  let started = false;
  let stopping = false;
  let stopPromise = null;
  let headerHitboxes = [];

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

  function put(text, x, y, tone = 'neutral', maxWidth = dimensions().width) {
    const safe = fitText(text, maxWidth);
    terminal.put({x, y, wrap: false, attr: styleFor(tone)}, safe);
  }

  function drawHeader(width) {
    const header = buildHeader(width, activeIndex());
    headerHitboxes = header.hitboxes;
    for (const segment of header.segments) put(segment.text, segment.start, 1, segment.tone, width - segment.start + 1);
  }

  function drawFooter(width, height) {
    const view = activeView();
    const focus = currentFocus(view, workspaceState);
    const focusLabel = focus.label;
    const scrollHint = (view.state.details && focus.id === 'details') || focus.id === 'history' ?
      ' · j/k scroll' : '';
    const newSessionHint = view.id === 'chat' ? ' · Ctrl+N new session' : '';
    const busyHint = workspaceState.busy ? ' · working…' : '';
    const text = width < 60 ? `F1–F3 tabs · Tab focus: ${focusLabel}${scrollHint} · Enter · Esc · Ctrl+C exit` :
      `F1/F2/F3 tabs · Tab/Shift+Tab focus: ${focusLabel}${scrollHint} · Enter · Esc${newSessionHint}${busyHint} · Ctrl+C exit`;
    put(text, 1, height, 'muted', width);
  }

  function draw() {
    if (!started || stopping) return;
    const {width, height} = dimensions();
    terminal.eraseDisplay();
    if (width < 40 || height < 12) {
      if (height < 3) {
        put('Terminal too small.', 1, 1, 'warning', width);
        return;
      }
      drawHeader(width);
      put('─'.repeat(Math.max(1, width)), 1, 2, 'muted', width);
      let row = 3;
      const messageLimit = height >= 4 ? height - 1 : height;
      for (const line of wrapText(SMALL_TERMINAL_MESSAGE, width)) {
        if (row > messageLimit) break;
        put(line, 1, row++, 'warning', width);
      }
      if (height >= 4) drawFooter(width, height);
      return;
    }

    drawHeader(width);
    put('─'.repeat(Math.max(1, width)), 1, 2, 'muted', width);

    const view = activeView();
    const statusLine = typeof view.statusLine === 'function' ? view.statusLine() : null;
    const contentStart = statusLine ? 4 : 3;
    if (statusLine) put(statusLine.text, 1, 3, statusLine.tone ?? 'muted', width);
    const rows = buildContentRows(view, width, workspaceState);
    const contentHeight = Math.max(0, height - contentStart);
    const maxScroll = Math.max(0, rows.length - contentHeight);
    const scrollTop = Math.max(0, Math.min(Number(view.state.scrollTop) || 0, maxScroll));
    if (view.state.scrollTop !== undefined) view.state.scrollTop = scrollTop;
    let row = contentStart;
    for (const content of rows.slice(scrollTop, scrollTop + contentHeight)) {
      if (row >= height) break;
      if (content.split) {
        put(content.left.text, 1, row, content.left.tone, content.paneWidth);
        put('│', content.paneWidth + 2, row, 'muted', 1);
        put(content.right.text, content.paneWidth + 4, row, content.right.tone,
          width - content.paneWidth - 3);
      } else {
        put(content.text, 1, row, content.tone, width);
      }
      row++;
    }
    drawFooter(width, height);
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

  function onKey(name) {
    const action = actionForKey(name);
    const view = activeView();
    if (action.type === 'quit') {
      void stop(0);
    } else if (action.type === 'select_tab') {
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
    } else if (action.type === 'submit') {
      void dispatchSubmit(view, action, currentFocus(view, workspaceState));
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

  function onMouse(name, data = {}) {
    if (!/LEFT.*(?:PRESSED|BUTTON)/u.test(name) || data.y !== 1) return;
    const hit = headerHitboxes.find(item => data.x >= item.start && data.x <= item.end);
    if (hit) selectMode(WORKSPACE_MODES[hit.index]);
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
      terminal.removeListener?.('mouse', onMouse);
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
    terminal.on('mouse', onMouse);
    terminal.on('resize', onResize);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    terminal.grabInput({mouse: 'button'});
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
