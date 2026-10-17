import {EventEmitter} from 'node:events';
import {createChatService} from '../app/chat-service.js';
import {createFormsService} from '../app/forms-service.js';
import {createTranslationService} from '../app/translation-service.js';
import {beginRequest, createWorkspaceState, finishRequest, invalidateRequests, isCurrentRequest,
  clearModeEntries, setFollowLatest, setViewportAnchor, WORKSPACE_MODES} from './state.js';
import {actionForKey} from './keymap.js';
import {editDraft, insertDraftText, layoutComposer, MAX_DRAFT_CODE_POINTS} from './composer.js';
import {createInputBridge} from './input.js';
import {resolveCommand} from './commands.js';
import {commandSuggestions, completeCommand, renderCommandPalette} from './command-palette.js';
import {computeLayout} from './layout.js';
import {createScreen, sanitizeText, textWidth, wrapText} from './screen.js';
import {graphemes, layoutText} from './text.js';
import {styleFor} from './theme.js';
import {buildTranscript} from './transcript.js';
import {buildDetailsLines, detailsSectionCount} from './details.js';
import {buildHelpLines} from './help.js';
import {createSettingsPanel, settingsFields, settingsLanguages, settingsLines,
  settingsSnapshot, settingsValue, setSettingsValue, validateSettings} from './settings.js';
import {createConfirmation, confirmationLines} from './confirmation.js';
import {createTranslateView} from './views/translate.js';
import {createChatView} from './views/chat.js';
import {createFormsView} from './views/forms.js';

const SMALL_TERMINAL_MESSAGE = 'Za mały terminal. Powiększ do co najmniej 40 kolumn i 12 wierszy.';

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

function composerLineCountFor(view, focus, width, state = view.state) {
  const prompt = state.draft || view.composerPrompt || 'Type here…';
  const prefix = focus.type === 'input' ? '› ' : '  ';
  const availableWidth = Math.max(1, width - textWidth(prefix));
  return layoutText(prompt, availableWidth).rows.length;
}

function transcriptRowsFor(view, focus, width) {
  return buildTranscript(view, {focus, width}).flatMap(item =>
    wrapText(item.text, width).map((text, index) => ({text, tone: item.tone ?? 'neutral',
      entryId: item.entryId ?? null,
      candidateIndex: index === 0 ? item.candidateIndex ?? null : null})));
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
    createChatView({chatService, capabilityCatalog: runtime.capabilityCatalog,
      state: workspaceState.modes.chat, workspaceState}),
    createFormsView({runtime, formsService, state: workspaceState.modes.forms, workspaceState})
  ];
  const screen = createScreen({terminal, styleFor});
  const events = new EventEmitter();
  const inputBridge = createInputBridge({terminal, onPaste: handlePaste});
  let started = false;
  let stopping = false;
  let stopPromise = null;
  let lastFrame = null;
  let cursorShown = null;

  function activeIndex() {
    return WORKSPACE_MODES.indexOf(workspaceState.activeMode);
  }

  function activeView() {
    return views[activeIndex()];
  }

  function commandContext() {
    return {activeMode: workspaceState.activeMode, runtime, modeStates: workspaceState.modes,
      settingsAvailable: true};
  }

  function commandEditorState() {
    return {draft: workspaceState.commandBuffer, cursor: workspaceState.commandCursor,
      composerViewportTop: workspaceState.commandViewportTop, status: '', editorNotice: ''};
  }

  function syncCommandEditorState(state) {
    workspaceState.commandBuffer = state.draft;
    workspaceState.commandCursor = state.cursor;
    workspaceState.commandViewportTop = state.composerViewportTop;
  }

  function clearCommandState() {
    workspaceState.commandBuffer = '';
    workspaceState.commandCursor = 0;
    workspaceState.commandViewportTop = 0;
    workspaceState.commandSelection = 0;
    workspaceState.commandNotice = '';
  }

  function openCommandPalette(initial = '/') {
    if (workspaceState.pendingConfirmation || activeView().state.confirmReset) return false;
    workspaceState.overlay = {type: 'command_palette'};
    workspaceState.commandBuffer = initial;
    workspaceState.commandCursor = graphemes(initial).length;
    workspaceState.commandViewportTop = 0;
    workspaceState.commandSelection = 0;
    workspaceState.commandNotice = '';
    workspaceState.overlayScrollTop = 0;
    draw();
    return true;
  }

  function closeCommandPalette() {
    if (workspaceState.overlay?.type !== 'command_palette') return false;
    workspaceState.overlay = null;
    clearCommandState();
    draw();
    return true;
  }

  function beginConfirmation(pendingConfirmation) {
    workspaceState.pendingConfirmation = createConfirmation(pendingConfirmation);
    workspaceState.overlay = {type: 'confirmation'};
    workspaceState.overlayScrollTop = 0;
    draw();
  }

  function setFocus(view, id) {
    if (focusTargetsFor(view).some(item => item.id === id)) {
      workspaceState.modes[view.id].focusRegionId = id;
      if (workspaceState.activeMode === view.id) workspaceState.focusRegion = {mode: view.id, id};
    }
  }

  function dimensions() {
    return {
      width: positiveSize(terminal.width, positiveSize(output.columns, 80)),
      height: positiveSize(terminal.height, positiveSize(output.rows, 24))
    };
  }

  function put(text, x, y, tone, maxWidth) {
    screen.put({x, y, tone, maxWidth}, text);
  }

  function positionCursor(cursor) {
    const visible = !!cursor;
    if (cursorShown !== visible) {
      terminal.hideCursor(!visible);
      cursorShown = visible;
    }
    if (visible && typeof terminal.moveTo === 'function') {
      terminal.moveTo(cursor.x, cursor.y);
    }
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
    const overlayType = workspaceState.overlay?.type;
    const overlayFooter = {
      command_palette: '↑/↓ wybór · Tab uzupełnij · Enter wykonaj · Esc zamknij · ^C wyjście',
      help: 'PgUp/PgDn przewiń · Esc zamknij · F1–F3 tryby · ^C wyjście',
      confirmation: '←/→ wybór · Enter zatwierdź · Esc anuluj · ^C wyjście',
      settings: '↑/↓ lub Tab fokus · Enter wybierz · Esc odrzuć · ^C wyjście',
      details: '←/→ lub Tab: sekcja · PgUp/PgDn: przewijaj · Esc: wróć'
    }[overlayType];
    if (overlayFooter) {
      put(overlayFooter, 1, layout.footer.y, 'muted', layout.width);
      return;
    }
    const action = focus.id === 'candidate' ? '↑/↓ wybór · Enter zatwierdź' :
      focus.type === 'selector' ? '←/→ język' :
      focus.id === 'history' ? 'PgUp/PgDn historia' :
        focus.id === 'details' ? 'Enter szczegóły' :
          view.id === 'chat' ? 'Enter wyślij' :
            view.id === 'forms' ? 'Enter szukaj' : 'Enter tłumacz';
    const required = view.id === 'chat' ? [
      `${state.turnCount ?? 0}/${state.maxTurns ?? '?'} tury · ${state.eventCount ?? 0}/${
        state.maxEvents ?? '?'} zdarzeń`, 'Enter', '^C'
    ] : [action, '/help', '^C wyjście'];
    const candidates = [
      '/help',
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
    const commandPaletteOpen = workspaceState.overlay?.type === 'command_palette';
    const editorState = commandPaletteOpen ? commandEditorState() : view.state;
    const editorFocus = commandPaletteOpen ? {type: 'input', id: 'command'} : focus;
    const editorView = commandPaletteOpen ? {state: editorState, composerPrompt: 'Wpisz polecenie…'} : view;
    const composerLines = composerLineCountFor(editorView, editorFocus, width, editorState);
    const layout = computeLayout({width, height, composerLines});
    screen.beginFrame(width, height);
    if (layout.tooSmall) {
      drawSmallTerminal(layout);
      lastFrame = {mode: view.id, layout, historyRows: []};
      const result = screen.commit();
      positionCursor(null);
      return result;
    }

    drawHeader(view, focus, width);
    let historyRows;
    const overlayType = workspaceState.overlay?.type;
    const panelOverlayType = overlayType;
    if (panelOverlayType === 'command_palette') {
      const suggestions = commandSuggestions(workspaceState.commandBuffer, commandContext());
      workspaceState.commandSelection = suggestions.length ?
        Math.max(0, Math.min(workspaceState.commandSelection, suggestions.length - 1)) : 0;
      historyRows = renderCommandPalette({buffer: workspaceState.commandBuffer,
        selectedIndex: workspaceState.commandSelection, width,
        height: layout.history.height - (workspaceState.commandNotice ? 1 : 0),
        context: commandContext()});
      if (workspaceState.commandNotice) {
        historyRows.push({text: workspaceState.commandNotice, tone: 'warning'});
      }
    } else if (panelOverlayType === 'help') {
      historyRows = buildHelpLines(commandContext());
    } else if (panelOverlayType === 'details') {
      const overlay = workspaceState.overlay;
      const modeState = workspaceState.modes[overlay.mode];
      const entry = modeState?.entries.find(item => item.id === overlay.entryId);
      historyRows = buildDetailsLines(entry, {mode: overlay.mode, sectionIndex: overlay.sectionIndex});
    } else if (panelOverlayType === 'confirmation') {
      historyRows = confirmationLines(workspaceState.pendingConfirmation);
    } else if (panelOverlayType === 'settings') {
      historyRows = settingsLines(workspaceState.overlay, runtime.capabilityCatalog);
    } else {
      historyRows = transcriptRowsFor(view, focus, width);
    }
    historyRows = historyRows.flatMap(item => wrapText(item.text, width).map((text, index) =>
      ({text, tone: item.tone ?? 'neutral', entryId: item.entryId ?? null,
        candidateIndex: index === 0 ? item.candidateIndex ?? null : null})));
    if (!commandPaletteOpen && view.state.editorNotice) {
      historyRows.push(...wrapText(view.state.editorNotice, width).map(text =>
        ({text, tone: 'warning', entryId: null})));
    }
    if (overlayType !== 'command_palette' && workspaceState.commandNotice) {
      historyRows.push(...wrapText(workspaceState.commandNotice, width).map(text =>
        ({text, tone: 'warning', entryId: null})));
    }
    const modeState = view.state;
    const maxStart = Math.max(0, historyRows.length - layout.history.height);
    let scrollTop = ['help', 'details', 'settings'].includes(panelOverlayType) ?
      Math.max(0, Math.min(workspaceState.overlayScrollTop, maxStart)) :
      panelOverlayType ? 0 : startIndexFor(modeState, historyRows, layout.history.height);
    if (panelOverlayType === 'settings') {
      const selectedRow = Math.max(0, historyRows.findIndex(row => row.text.startsWith('›')));
      if (selectedRow < scrollTop) scrollTop = selectedRow;
      if (selectedRow >= scrollTop + layout.history.height) {
        scrollTop = selectedRow - layout.history.height + 1;
      }
      scrollTop = Math.min(scrollTop, maxStart);
    }
    if (!panelOverlayType && view.id === 'forms' && focus.id === 'candidate') {
      const selectedCandidate = historyRows.findIndex(row =>
        row.entryId === modeState.searchEntryId && row.candidateIndex === modeState.selectedIndex);
      if (selectedCandidate >= 0) {
        if (selectedCandidate < scrollTop) scrollTop = selectedCandidate;
        else if (selectedCandidate >= scrollTop + layout.history.height) {
          scrollTop = selectedCandidate - layout.history.height + 1;
        }
        scrollTop = Math.min(scrollTop, maxStart);
        setFollowLatest(workspaceState, 'forms', false);
      }
    }
    if (['help', 'details', 'settings'].includes(panelOverlayType)) workspaceState.overlayScrollTop = scrollTop;
    if (!panelOverlayType) {
      modeState.scrollTop = scrollTop;
      const anchor = anchorAt(historyRows, scrollTop);
      if (anchor) modeState.viewportAnchor = anchor;
    }
    for (let offset = 0; offset < layout.history.height; offset++) {
      const row = historyRows[scrollTop + offset];
      if (!row) break;
      put(row.text, 1, layout.history.y + offset, row.tone, width);
    }
    put('─'.repeat(width), 1, layout.historySeparator.y, 'muted', width);

    const composer = layoutComposer(editorState, {width, height: layout.composer.height,
      prompt: commandPaletteOpen ? 'Wpisz polecenie…' : view.composerPrompt || 'Type here…',
      focused: commandPaletteOpen || (!panelOverlayType && focus.type === 'input')});
    if (commandPaletteOpen) syncCommandEditorState(editorState);
    for (let offset = 0; offset < composer.lines.length; offset++) {
      const row = composer.lines[offset];
      put(row.text, 1, layout.composer.y + offset, row.tone, width);
    }
    put('─'.repeat(width), 1, layout.composerSeparator.y, 'muted', width);
    drawFooter(view, focus, modeState, layout);
    lastFrame = {mode: view.id, layout, historyRows, overlayType: panelOverlayType};
    const result = screen.commit();
    positionCursor(composer.cursor ? {
      x: 1 + composer.cursor.column,
      y: layout.composer.y + composer.cursor.row
    } : null);
    return result;
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

  function showEditorNotice(message) {
    const view = activeView();
    view.state.editorNotice = message;
  }

  function handlePaste(text, metadata = {}) {
    if (workspaceState.overlay?.type === 'command_palette') {
      const editor = commandEditorState();
      if (metadata.tooLarge) {
        workspaceState.commandNotice = `Wklejony tekst przekracza limit ${MAX_DRAFT_CODE_POINTS} code points; bufor polecenia pozostał bez zmian.`;
        draw();
        return;
      }
      const result = insertDraftText(editor, text);
      syncCommandEditorState(editor);
      if (!result.accepted) {
        workspaceState.commandNotice = `Limit pola wynosi ${MAX_DRAFT_CODE_POINTS} code points; bufor polecenia pozostał bez zmian.`;
      } else if (result.changed) {
        workspaceState.commandSelection = 0;
        workspaceState.commandNotice = '';
      }
      draw();
      return;
    }
    if (workspaceState.overlay) return;
    const view = activeView();
    const focus = currentFocus(view, workspaceState);
    const {width, height} = dimensions();
    if (width < 40 || height < 12 || focus.type !== 'input') return;
    if (metadata.tooLarge) {
      showEditorNotice(`Wklejony tekst przekracza limit ${MAX_DRAFT_CODE_POINTS} code points; draft pozostał bez zmian.`);
      draw();
      return;
    }
    const result = insertDraftText(view.state, text);
    if (!result.accepted) {
      showEditorNotice(`Limit pola wynosi ${MAX_DRAFT_CODE_POINTS} code points; draft pozostał bez zmian.`);
    } else if (result.changed) {
      view.state.editorNotice = '';
      workspaceState.commandNotice = '';
      view.onDraftChange?.({runtime, state: view.state});
    }
    draw();
  }

  function editActiveDraft(action) {
    const view = activeView();
    const {width} = dimensions();
    const result = editDraft(view.state, action, {width});
    if (!result.accepted) {
      showEditorNotice(`Limit pola wynosi ${MAX_DRAFT_CODE_POINTS} code points; draft pozostał bez zmian.`);
    } else if (result.reason === 'too_many_code_points') {
      showEditorNotice(`Limit pola wynosi ${MAX_DRAFT_CODE_POINTS} code points; draft pozostał bez zmian.`);
    } else if (result.changed) {
      view.state.editorNotice = '';
      workspaceState.commandNotice = '';
      view.onDraftChange?.({runtime, state: view.state});
    }
    draw();
  }

  function updateChatDirectionState() {
    const snapshot = chatService.snapshot();
    const state = workspaceState.modes.chat;
    state.from = snapshot.from;
    state.to = snapshot.to;
    state.settings.from = snapshot.from;
    state.settings.to = snapshot.to;
    for (const key of ['turnCount', 'maxTurns', 'eventCount', 'maxEvents']) {
      if (Number.isSafeInteger(snapshot[key])) state[key] = snapshot[key];
    }
  }

  function commitSettings(draft) {
    const translate = workspaceState.modes.translate;
    const forms = workspaceState.modes.forms;
    if (translate.from !== draft.translate.from || translate.to !== draft.translate.to) {
      translate.from = draft.translate.from;
      translate.to = draft.translate.to;
      translate.settings.from = translate.from;
      translate.settings.to = translate.to;
      translate.result = null;
      translate.status = '';
    }
    if (forms.language !== draft.forms.language) {
      forms.language = draft.forms.language;
      forms.settings.language = forms.language;
      forms.result = null;
      forms.matches = [];
      forms.selectedIndex = 0;
      forms.status = '';
    }
    workspaceState.automaticDetails = draft.automaticDetails;
    updateChatDirectionState();
  }

  function applySettingsDraft(draft, {returnMode = workspaceState.activeMode} = {}) {
    const error = validateSettings(draft, runtime.capabilityCatalog);
    if (error) return {status: 'invalid', message: error};
    const previous = chatService.snapshot();
    const changed = chatService.setDirection(draft.chat);
    if (changed.status === 'reset_required') {
      beginConfirmation({type: 'settings_chat_direction', draft: structuredClone(draft),
        previousFrom: previous.from, previousTo: previous.to, returnMode});
      return {status: 'reset_required'};
    }
    if (changed.status !== 'ok') return {status: changed.status,
      message: changed.diagnostics?.[0]?.message ?? 'Nie można ustawić kierunku Chat.'};
    commitSettings(draft);
    workspaceState.overlay = null;
    workspaceState.commandNotice = 'Zastosowano ustawienia tylko dla tej sesji.';
    selectMode(returnMode);
    return {status: 'ok'};
  }

  function clearModePresentation(mode) {
    clearModeEntries(workspaceState, mode);
    const state = workspaceState.modes[mode];
    state.selectedEntryId = null;
    state.scrollTop = 0;
    if (mode === 'translate') {
      state.result = null;
      state.status = '';
    } else if (mode === 'forms') {
      state.result = null;
      state.matches = [];
      state.selectedIndex = 0;
      state.status = '';
    }
  }

  async function applyCommandAction(action) {
    if (workspaceState.busy) {
      workspaceState.commandNotice = 'Poczekaj na zakończenie bieżącej operacji.';
      draw();
      return false;
    }
    if (action.type === 'switch_mode') {
      if (action.from || action.language) {
        const draft = settingsSnapshot(workspaceState);
        if (action.mode === 'forms') draft.forms.language = action.language;
        else {
          draft[action.mode].from = action.from;
          draft[action.mode].to = action.to;
        }
        const result = applySettingsDraft(draft, {returnMode: action.mode});
        if (result.status === 'reset_required') return true;
        if (result.status !== 'ok') {
          workspaceState.commandNotice = result.message;
          draw();
          return false;
        }
        return true;
      }
      workspaceState.overlay = null;
      workspaceState.commandNotice = '';
      selectMode(action.mode);
      return true;
    }
    if (action.type === 'swap_direction') {
      const state = workspaceState.modes.translate;
      [state.from, state.to] = [state.to, state.from];
      state.settings.from = state.from;
      state.settings.to = state.to;
      state.result = null;
      state.selectedEntryId = null;
      state.status = '';
      workspaceState.overlay = null;
      workspaceState.commandNotice = '';
      selectMode('translate');
      return true;
    }
    if (action.type === 'open_panel' && action.panel === 'help') {
      workspaceState.overlay = {type: 'help'};
      workspaceState.overlayScrollTop = 0;
      workspaceState.commandNotice = '';
      draw();
      return true;
    }
    if (action.type === 'open_panel' && action.panel === 'settings') {
      workspaceState.overlay = createSettingsPanel(workspaceState);
      workspaceState.overlayScrollTop = 0;
      workspaceState.commandNotice = '';
      draw();
      return true;
    }
    if (action.type === 'open_details') {
      const modeState = workspaceState.modes[action.mode];
      const entry = modeState?.entries.find(item => item.id === action.entryId);
      if (!entry) {
        workspaceState.commandNotice = 'Nie znaleziono wpisu do pokazania w Details.';
        draw();
        return false;
      }
      workspaceState.overlay = {type: 'details', mode: action.mode, entryId: entry.id,
        sectionIndex: 0, scrollTop: 0};
      workspaceState.overlayScrollTop = 0;
      workspaceState.commandNotice = '';
      draw();
      return true;
    }
    if (action.type === 'confirm_clear') {
      beginConfirmation({type: 'clear_history', mode: action.mode});
      return true;
    }
    if (action.type === 'new_session') {
      beginConfirmation({type: 'reset_chat'});
      return true;
    }
    if (action.type === 'quit') {
      void stop(0);
      return true;
    }
    workspaceState.commandNotice = 'Polecenie nie ma aktywnej akcji w tej wersji.';
    draw();
    return false;
  }

  async function runResolvedCommand(result, {fromPalette = false, sourceMode = workspaceState.activeMode,
    clearSourceDraft = true} = {}) {
    if (workspaceState.busy) {
      workspaceState.commandNotice = 'Poczekaj na zakończenie bieżącej operacji.';
      draw();
      return false;
    }
    if (!fromPalette && clearSourceDraft) {
      const state = workspaceState.modes[sourceMode];
      state.draft = '';
      state.cursor = 0;
      state.editorNotice = '';
    }
    workspaceState.overlay = null;
    clearCommandState();
    workspaceState.commandNotice = '';
    return applyCommandAction(result.action);
  }

  function reportCommandError(message, {inPalette = false} = {}) {
    workspaceState.commandNotice = sanitizeText(message);
    if (inPalette) {
      workspaceState.overlay = {type: 'command_palette'};
    }
    draw();
  }

  async function confirmPendingAction() {
    const pending = workspaceState.pendingConfirmation;
    if (!pending || pending.running) return;
    pending.running = true;
    if (pending.selected === 1) {
      workspaceState.pendingConfirmation = null;
      workspaceState.overlay = null;
      workspaceState.commandNotice = 'Anulowano; stan i historia pozostały bez zmian.';
      draw();
      return;
    }
    if (pending.type === 'clear_history') {
      clearModePresentation(pending.mode);
      workspaceState.pendingConfirmation = null;
      workspaceState.overlay = null;
      workspaceState.commandNotice = pending.mode === 'chat' ?
        'Wyczyszczono historię prezentacji; kontekst Engine pozostał bez zmian.' :
        'Wyczyszczono historię prezentacji; draft pozostał bez zmian.';
      draw();
      return;
    }
    if (pending.type === 'reset_chat' || pending.type === 'chat_direction' ||
        pending.type === 'settings_chat_direction') {
      const previousDraft = workspaceState.modes.chat.draft;
      const previousCursor = workspaceState.modes.chat.cursor;
      let reset;
      try { reset = await chatService.reset(); }
      catch (error) { reset = {status: 'error', diagnostics: [{message: error?.message}]}; }
      if (reset.status !== 'ok') {
        workspaceState.pendingConfirmation = null;
        workspaceState.overlay = null;
        workspaceState.commandNotice = reset.diagnostics?.[0]?.message ?? 'Nie udało się zresetować sesji Chat.';
        draw();
        return;
      }
      const direction = pending.type === 'chat_direction' ?
        {from: pending.from, to: pending.to} : pending.draft?.chat;
      const changed = direction ? chatService.setDirection(direction) : {status: 'ok'};
      if (changed.status !== 'ok') {
        workspaceState.pendingConfirmation = null;
        workspaceState.overlay = null;
        workspaceState.commandNotice = changed.diagnostics?.[0]?.message ?? 'Nie udało się zmienić kierunku Chat.';
        draw();
        return;
      }
      clearModeEntries(workspaceState, 'chat');
      updateChatDirectionState();
      const state = workspaceState.modes.chat;
      state.draft = pending.type === 'reset_chat' ? '' : previousDraft;
      state.cursor = pending.type === 'reset_chat' ? 0 : previousCursor;
      state.scrollTop = 0;
      state.lastStatus = '';
      state.status = '';
      if (pending.type === 'settings_chat_direction') commitSettings(pending.draft);
      workspaceState.pendingConfirmation = null;
      workspaceState.overlay = null;
      workspaceState.commandNotice = pending.type === 'reset_chat' ?
        'Rozpoczęto nową lokalną sesję Chat.' :
        'Sesja Chat została zresetowana; zastosowano nowy kierunek i ustawienia.';
      selectMode(pending.returnMode ?? 'chat');
    }
  }

  function handleConfirmationAction(action) {
    const pending = workspaceState.pendingConfirmation;
    if (!pending) return false;
    if (pending.running) return true;
    if (action.type === 'select_tab') {
      workspaceState.pendingConfirmation = null;
      workspaceState.overlay = null;
      selectMode(WORKSPACE_MODES[action.index]);
      return true;
    }
    if (action.type === 'escape') {
      pending.selected = 1;
      void confirmPendingAction();
      return true;
    }
    if (action.type === 'cursor_left' || action.type === 'cursor_right' ||
        action.type === 'focus_next' || action.type === 'focus_previous' ||
        action.type === 'cursor_up' || action.type === 'cursor_down') {
      pending.selected = pending.selected === 0 ? 1 : 0;
      draw();
      return true;
    }
    if (action.type === 'submit') {
      void confirmPendingAction();
      return true;
    }
    return true;
  }

  async function dispatchSubmit(view, action, focus, {literalInput = false} = {}) {
    const state = view.state;
    if (action.type === 'submit' && focus?.type === 'input' && !state.draft.trim()) {
      state.editorNotice = 'Wpisz tekst przed wysłaniem; pusty draft nie uruchamia Engine.';
      draw();
      return;
    }
    if (action.type === 'submit' && focus?.type === 'input' && !literalInput) {
      const command = resolveCommand(state.draft, commandContext());
      if (command.kind === 'error') {
        reportCommandError(command.message);
        return;
      }
      if (command.kind === 'command') {
        await runResolvedCommand(command, {sourceMode: view.id});
        return;
      }
      if (command.kind === 'literal') {
        state.draft = command.text;
        state.cursor = graphemes(state.draft).length;
      }
    }
    const token = beginRequest(workspaceState, view.id, {draft: state.draft,
      from: state.from, to: state.to, language: state.language});
    if (!token) {
      draw();
      return;
    }
    const context = {runtime, events, focus, requestToken: token, workspaceState,
      setFocus: id => setFocus(view, id)};
    const previousEntryId = state.entries.at(-1)?.id;
    const followedLatest = state.followLatest;
    draw();
    try {
      const handled = typeof view.handleAction === 'function' ?
        await view.handleAction(action, context) : false;
      if (handled === false && typeof view.onSubmit === 'function') {
        if (!state.draft.trim()) {
          state.editorNotice = 'Wpisz tekst przed wysłaniem; pusty draft nie uruchamia Engine.';
        } else {
          await view.onSubmit({...context, state});
        }
      } else if (handled === false) {
        state.status = 'Draft saved for this mode.';
      }
      const latest = state.entries.at(-1);
      if (workspaceState.automaticDetails && followedLatest && state.followLatest &&
          !workspaceState.overlay && latest && latest.id !== previousEntryId) {
        workspaceState.overlay = {type: 'details', mode: view.id, entryId: latest.id,
          sectionIndex: 0, scrollTop: 0};
        workspaceState.overlayScrollTop = 0;
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
    if (['help', 'details'].includes(workspaceState.overlay?.type)) {
      const maxStart = Math.max(0, lastFrame.historyRows.length - lastFrame.layout.history.height);
      const amount = page ? Math.max(1, lastFrame.layout.history.height - 1) : 1;
      workspaceState.overlayScrollTop = Math.max(0, Math.min(
        workspaceState.overlayScrollTop + direction * amount, maxStart));
      draw();
      return;
    }
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

  async function dispatchNamedCommand(name, {fromPalette = false} = {}) {
    const result = resolveCommand(`/${name}`, commandContext());
    if (result.kind === 'error') {
      reportCommandError(result.message, {inPalette: fromPalette});
      return false;
    }
    if (result.kind !== 'command') return false;
    return runResolvedCommand(result, {fromPalette, clearSourceDraft: false});
  }

  async function submitPaletteBuffer() {
    const result = resolveCommand(workspaceState.commandBuffer, commandContext());
    if (result.kind === 'error') {
      reportCommandError(result.message, {inPalette: true});
      return;
    }
    if (result.kind === 'command') {
      await runResolvedCommand(result, {fromPalette: true});
      return;
    }
    if (result.kind !== 'literal') {
      reportCommandError('Wpisz polecenie rozpoczynające się od /.', {inPalette: true});
      return;
    }

    const view = activeView();
    const state = view.state;
    const previousDraft = state.draft;
    const previousCursor = state.cursor;
    const inputFocus = focusTargetsFor(view).find(item => item.type === 'input') ?? {id: 'draft', type: 'input'};
    workspaceState.overlay = null;
    clearCommandState();
    state.draft = result.text;
    state.cursor = graphemes(result.text).length;
    await dispatchSubmit(view, {type: 'submit'}, inputFocus, {literalInput: true});
    state.draft = previousDraft;
    state.cursor = previousCursor;
    draw();
  }

  function handleCommandPaletteAction(action) {
    if (action.type === 'escape') {
      closeCommandPalette();
      return true;
    }
    if (action.type === 'open_palette') return true;
    if (action.type === 'select_tab') {
      void dispatchNamedCommand(WORKSPACE_MODES[action.index], {fromPalette: true});
      return true;
    }
    if (action.type === 'new_session') {
      void dispatchNamedCommand('new', {fromPalette: true});
      return true;
    }
    if (action.type === 'submit') {
      void submitPaletteBuffer();
      return true;
    }
    const suggestions = commandSuggestions(workspaceState.commandBuffer, commandContext());
    if (action.type === 'cursor_up' || action.type === 'cursor_down' ||
        action.type === 'history_page_up' || action.type === 'history_page_down') {
      if (!suggestions.length) return true;
      const step = action.type === 'history_page_up' ? -5 : action.type === 'history_page_down' ? 5 :
        action.type === 'cursor_up' ? -1 : 1;
      workspaceState.commandSelection = Math.max(0, Math.min(
        workspaceState.commandSelection + step, suggestions.length - 1));
      workspaceState.commandNotice = '';
      draw();
      return true;
    }
    if (action.type === 'focus_next') {
      if (!suggestions.length) return true;
      const selected = suggestions[workspaceState.commandSelection] ?? suggestions[0];
      workspaceState.commandBuffer = completeCommand(workspaceState.commandBuffer, selected);
      workspaceState.commandCursor = graphemes(workspaceState.commandBuffer).length;
      workspaceState.commandViewportTop = 0;
      workspaceState.commandNotice = '';
      draw();
      return true;
    }
    if (action.type === 'focus_previous') {
      if (suggestions.length) workspaceState.commandSelection =
        (workspaceState.commandSelection - 1 + suggestions.length) % suggestions.length;
      draw();
      return true;
    }
    const editor = commandEditorState();
    const result = editDraft(editor, action, {width: dimensions().width});
    syncCommandEditorState(editor);
    if (result.changed) {
      workspaceState.commandSelection = 0;
      workspaceState.commandNotice = '';
    }
    draw();
    return true;
  }

  function handleHelpAction(action) {
    if (action.type === 'escape' || action.type === 'submit') {
      workspaceState.overlay = null;
      workspaceState.overlayScrollTop = 0;
      draw();
      return true;
    }
    if (action.type === 'open_palette') {
      openCommandPalette('/');
      return true;
    }
    if (action.type === 'select_tab') {
      void dispatchNamedCommand(WORKSPACE_MODES[action.index]);
      return true;
    }
    if (action.type === 'new_session') {
      void dispatchNamedCommand('new');
      return true;
    }
    if (action.type === 'history_page_up' || action.type === 'cursor_up') {
      scrollHistory(-1, action.type === 'history_page_up');
      return true;
    }
    if (action.type === 'history_page_down' || action.type === 'cursor_down') {
      scrollHistory(1, action.type === 'history_page_down');
      return true;
    }
    if (action.type === 'history_latest') {
      workspaceState.overlayScrollTop = Number.MAX_SAFE_INTEGER;
      draw();
      return true;
    }
    return true;
  }

  function handleDetailsAction(action) {
    const overlay = workspaceState.overlay;
    if (action.type === 'escape' || action.type === 'submit') {
      workspaceState.overlay = null;
      workspaceState.overlayScrollTop = 0;
      workspaceState.commandNotice = '';
      draw();
      return true;
    }
    if (action.type === 'select_tab') {
      workspaceState.overlay = null;
      workspaceState.overlayScrollTop = 0;
      selectMode(WORKSPACE_MODES[action.index]);
      return true;
    }
    if (action.type === 'open_palette') {
      openCommandPalette('/');
      return true;
    }
    if (action.type === 'new_session') {
      void dispatchNamedCommand('new');
      return true;
    }
    if (['focus_next', 'cursor_right'].includes(action.type)) {
      const modeState = workspaceState.modes[overlay.mode];
      const entry = modeState?.entries.find(item => item.id === overlay.entryId);
      if (entry) {
        const count = detailsSectionCount(entry);
        overlay.sectionIndex = (overlay.sectionIndex + 1) % count;
        workspaceState.overlayScrollTop = 0;
      }
      draw();
      return true;
    }
    if (['focus_previous', 'cursor_left'].includes(action.type)) {
      const modeState = workspaceState.modes[overlay.mode];
      const entry = modeState?.entries.find(item => item.id === overlay.entryId);
      if (entry) {
        const count = detailsSectionCount(entry);
        overlay.sectionIndex = (overlay.sectionIndex - 1 + count) % count;
        workspaceState.overlayScrollTop = 0;
      }
      draw();
      return true;
    }
    if (action.type === 'history_page_up' || action.type === 'cursor_up') {
      scrollHistory(-1, action.type === 'history_page_up');
      return true;
    }
    if (action.type === 'history_page_down' || action.type === 'cursor_down') {
      scrollHistory(1, action.type === 'history_page_down');
      return true;
    }
    if (action.type === 'history_latest') {
      workspaceState.overlayScrollTop = Number.MAX_SAFE_INTEGER;
      draw();
      return true;
    }
    if (action.type === 'text' && ['j', 'k'].includes(action.value.toLowerCase())) {
      scrollHistory(action.value.toLowerCase() === 'j' ? 1 : -1);
      return true;
    }
    return true;
  }

  function handleSettingsAction(action) {
    const panel = workspaceState.overlay;
    if (action.type === 'select_tab') {
      workspaceState.overlay = null;
      selectMode(WORKSPACE_MODES[action.index]);
      return true;
    }
    if (action.type === 'escape') {
      if (panel.list) panel.list = null;
      else workspaceState.overlay = null;
      draw();
      return true;
    }
    if (panel.list) {
      const field = settingsFields()[panel.selected];
      const options = field.id === 'automaticDetails' ? [false, true] :
        settingsLanguages(runtime.capabilityCatalog).map(item => item.code);
      if (['cursor_up', 'cursor_down', 'focus_next', 'focus_previous'].includes(action.type)) {
        const step = ['cursor_up', 'focus_previous'].includes(action.type) ? -1 : 1;
        panel.listSelected = (panel.listSelected + step + options.length) % options.length;
      } else if (action.type === 'submit') {
        setSettingsValue(panel.draft, field.id, options[panel.listSelected]);
        panel.list = null;
        panel.notice = '';
      }
      draw();
      return true;
    }
    const count = settingsFields().length + 3;
    if (['cursor_up', 'cursor_down', 'focus_next', 'focus_previous'].includes(action.type)) {
      const step = ['cursor_up', 'focus_previous'].includes(action.type) ? -1 : 1;
      panel.selected = (panel.selected + step + count) % count;
      draw();
      return true;
    }
    if (action.type === 'submit') {
      if (panel.selected < settingsFields().length) {
        const field = settingsFields()[panel.selected];
        const options = field.id === 'automaticDetails' ? [false, true] :
          settingsLanguages(runtime.capabilityCatalog).map(item => item.code);
        panel.listSelected = Math.max(0, options.indexOf(settingsValue(panel.draft, field.id)));
        panel.list = field.id;
      } else if (panel.selected === settingsFields().length) {
        const result = applySettingsDraft(panel.draft);
        if (!['ok', 'reset_required'].includes(result.status)) panel.notice = result.message;
      } else {
        workspaceState.overlay = null;
      }
      draw();
      return true;
    }
    return true;
  }

  function onKey(name, matches, data) {
    const action = actionForKey(name, data);
    const view = activeView();
    if (action.type === 'quit') {
      void stop(0);
      return;
    }
    const {width, height} = dimensions();
    if (width < 40 || height < 12) return;
    if (workspaceState.overlay?.type === 'command_palette') {
      handleCommandPaletteAction(action);
      return;
    }
    if (workspaceState.overlay?.type === 'help') {
      handleHelpAction(action);
      return;
    }
    if (workspaceState.overlay?.type === 'details') {
      handleDetailsAction(action);
      return;
    }
    if (workspaceState.overlay?.type === 'settings') {
      handleSettingsAction(action);
      return;
    }
    if (workspaceState.overlay?.type === 'confirmation') {
      handleConfirmationAction(action);
      return;
    }
    if (action.type === 'select_tab') {
      void dispatchNamedCommand(WORKSPACE_MODES[action.index]);
    } else if (action.type === 'open_palette') {
      openCommandPalette('/');
    } else if (action.type === 'focus_next' || action.type === 'focus_previous') {
      const targets = focusTargetsFor(view);
      const direction = action.type === 'focus_next' ? 1 : -1;
      const focus = currentFocus(view, workspaceState);
      const index = targets.findIndex(item => item.id === focus.id);
      const next = targets[(index + direction + targets.length) % targets.length];
      setFocus(view, next.id);
      draw();
    } else if (action.type === 'new_session') {
      void dispatchNamedCommand('new');
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
      if (action.type === 'text' && action.value === '/' && !view.state.draft.trim()) {
        openCommandPalette('/');
        return;
      }
      editActiveDraft(action);
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
      terminal.removeListener?.('paste', handlePaste);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      inputBridge.detach();
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
    terminal.on('paste', handlePaste);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    terminal.grabInput();
    inputBridge.attach();
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
