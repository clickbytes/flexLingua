import {codePointCount, cursorIndexAtOrAfter, graphemes, layoutText, sanitizeText, textWidth} from './text.js';

export const MAX_DRAFT_CODE_POINTS = 4000;

function clampCursor(state, count) {
  state.cursor = Math.max(0, Math.min(Number.isFinite(state.cursor) ? state.cursor : 0, count));
  return state.cursor;
}

function setCursorFromPointOffset(state, draft, pointOffset) {
  state.cursor = cursorIndexAtOrAfter(draft, pointOffset);
  state.preferredColumn = null;
}

function deleteAt(state, start, end) {
  const items = graphemes(state.draft);
  const prefix = items.slice(0, start).join('');
  const next = prefix + items.slice(end).join('');
  state.draft = next;
  setCursorFromPointOffset(state, next, codePointCount(prefix));
  state.status = '';
  state.editorNotice = '';
  state.composerViewportTop ??= 0;
}

export function insertDraftText(state, value, {maxCodePoints = MAX_DRAFT_CODE_POINTS} = {}) {
  const insertion = sanitizeText(value);
  if (!insertion) return {accepted: true, changed: false};
  const draft = String(state.draft ?? '');
  const insertedPoints = codePointCount(insertion);
  if (codePointCount(draft) + insertedPoints > maxCodePoints) {
    return {accepted: false, changed: false, reason: 'too_many_code_points'};
  }

  const items = graphemes(draft);
  const cursor = clampCursor(state, items.length);
  const prefix = items.slice(0, cursor).join('');
  const suffix = items.slice(cursor).join('');
  const next = prefix + insertion + suffix;
  state.draft = next;
  setCursorFromPointOffset(state, next, codePointCount(prefix) + insertedPoints);
  state.status = '';
  state.editorNotice = '';
  state.composerViewportTop ??= 0;
  return {accepted: true, changed: next !== draft};
}

function moveVertical(state, direction, availableWidth) {
  const items = graphemes(state.draft);
  const layout = layoutText(state.draft, availableWidth);
  const cursor = clampCursor(state, items.length);
  const position = layout.cursorPositions[cursor] ?? {row: 0, column: 0};
  const targetRowIndex = position.row + direction;
  if (targetRowIndex < 0 || targetRowIndex >= layout.rows.length) return false;
  const preferredColumn = Number.isFinite(state.preferredColumn) ? state.preferredColumn : position.column;
  const candidates = layout.rows[targetRowIndex].positions;
  let selected = candidates[0] ?? {index: cursor, column: 0};
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.column - preferredColumn);
    const selectedDistance = Math.abs(selected.column - preferredColumn);
    if (distance < selectedDistance ||
        (distance === selectedDistance && candidate.column < selected.column)) selected = candidate;
  }
  state.cursor = selected.index;
  state.preferredColumn = preferredColumn;
  return true;
}

function moveToLogicalLineBoundary(state, end) {
  const items = graphemes(state.draft);
  const cursor = clampCursor(state, items.length);
  const previousLineFeed = items.lastIndexOf('\n', cursor - 1);
  const nextLineFeed = items.indexOf('\n', cursor);
  state.cursor = end ? (nextLineFeed < 0 ? items.length : nextLineFeed) : previousLineFeed + 1;
  state.preferredColumn = null;
}

export function editDraft(state, action, {width = 40, promptPrefix = '› '} = {}) {
  const prefixWidth = textWidth(promptPrefix);
  const availableWidth = Math.max(1, width - prefixWidth);
  const items = graphemes(state.draft);
  const cursor = clampCursor(state, items.length);
  if (action.type === 'text') return insertDraftText(state, action.value);
  if (action.type === 'backspace' && cursor > 0) {
    deleteAt(state, cursor - 1, cursor);
    return {accepted: true, changed: true};
  }
  if (action.type === 'delete' && cursor < items.length) {
    deleteAt(state, cursor, cursor + 1);
    return {accepted: true, changed: true};
  }
  if (action.type === 'cursor_left') {
    state.cursor = Math.max(0, cursor - 1);
    state.preferredColumn = null;
  } else if (action.type === 'cursor_right') {
    state.cursor = Math.min(items.length, cursor + 1);
    state.preferredColumn = null;
  } else if (action.type === 'cursor_home') {
    moveToLogicalLineBoundary(state, false);
  } else if (action.type === 'cursor_end') {
    moveToLogicalLineBoundary(state, true);
  } else if (action.type === 'cursor_up') {
    moveVertical(state, -1, availableWidth);
  } else if (action.type === 'cursor_down') {
    moveVertical(state, 1, availableWidth);
  }
  state.composerViewportTop ??= 0;
  return {accepted: true, changed: false};
}

/** Build only the visible composer rows and keep its cursor inside that viewport. */
export function layoutComposer(state, {width, height, prompt = 'Wpisz tekst…', focused = true} = {}) {
  const prefix = focused ? '› ' : '  ';
  const prefixWidth = textWidth(prefix);
  const availableWidth = Math.max(1, width - prefixWidth);
  const draft = String(state.draft ?? '');
  const displayText = draft || prompt;
  const displayLayout = layoutText(displayText, availableWidth);
  const draftLayout = draft ? displayLayout : layoutText('', availableWidth);
  const cursorIndex = clampCursor(state, draftLayout.graphemeCount);
  const cursor = draftLayout.cursorPositions[cursorIndex] ?? {row: 0, column: 0};
  const maximumTop = Math.max(0, displayLayout.rows.length - height);
  let top = Math.max(0, Math.min(Number(state.composerViewportTop) || 0, maximumTop));
  if (focused) {
    if (cursor.row < top) top = cursor.row;
    else if (cursor.row >= top + height) top = cursor.row - height + 1;
  }
  top = Math.max(0, Math.min(top, maximumTop));
  state.composerViewportTop = top;

  const visibleRows = displayLayout.rows.slice(top, top + height);
  const lines = visibleRows.map((row, index) => ({
    text: `${focused && index === 0 ? '› ' : '  '}${row.text}`,
    tone: draft ? 'neutral' : 'muted'
  }));
  const cursorVisible = focused && cursor.row >= top && cursor.row < top + height;
  return {
    lines,
    cursor: cursorVisible ? {
      row: cursor.row - top,
      column: Math.min(width - 1, prefixWidth + cursor.column)
    } : null,
    scrollTop: top,
    totalLines: displayLayout.rows.length
  };
}
