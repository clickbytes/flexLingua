const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
const CSI = '\u009b';
const OSC = '\u009d';
const DCS = '\u0090';
const SOS = '\u0098';
const PM = '\u009e';
const APC = '\u009f';
const ST = '\u009c';
const CONTROL_STRING_INTRODUCERS = new Set([0x90, 0x98, 0x9d, 0x9e, 0x9f]);

function codePointAt(value, index) {
  const codePoint = value.codePointAt(index);
  return {codePoint, next: index + (codePoint > 0xffff ? 2 : 1)};
}

function consumeCsi(value, index) {
  let cursor = index;
  while (cursor < value.length) {
    const {codePoint, next} = codePointAt(value, cursor);
    cursor = next;
    if (codePoint >= 0x40 && codePoint <= 0x7e) return cursor;
  }
  return value.length;
}

function consumeSingleShift(value, index) {
  return index < value.length ? codePointAt(value, index).next : value.length;
}

function consumeControlString(value, index) {
  let cursor = index;
  while (cursor < value.length) {
    const {codePoint, next} = codePointAt(value, cursor);
    if (codePoint === 0x07 || codePoint === 0x9c) return next;
    if (codePoint === 0x1b && value[next] === '\\') return next + 1;
    cursor = next;
  }
  return value.length;
}

/** Remove terminal control strings and controls while preserving ordinary Unicode text. */
export function sanitizeText(value) {
  const source = String(value ?? '').replace(/\r\n?/gu, '\n').replace(/\t/gu, '    ');
  let output = '';
  let index = 0;
  while (index < source.length) {
    const {codePoint, next} = codePointAt(source, index);
    const following = source[next];
    if (codePoint === 0x1b) {
      const intro = source[next];
      if (intro === '[') index = consumeCsi(source, next + 1);
      else if (intro === 'O' || intro === 'N') index = consumeSingleShift(source, next + 1);
      else if (intro === ']' || intro === 'P' || intro === 'X' || intro === '^' || intro === '_') {
        index = consumeControlString(source, next + 1);
      } else {
        index = following === undefined ? next : next + (source.codePointAt(next) > 0xffff ? 2 : 1);
      }
      continue;
    }
    if (codePoint === 0x9b) {
      index = consumeCsi(source, next);
      continue;
    }
    if (codePoint === 0x8e || codePoint === 0x8f) {
      index = consumeSingleShift(source, next);
      continue;
    }
    if (CONTROL_STRING_INTRODUCERS.has(codePoint)) {
      index = consumeControlString(source, next);
      continue;
    }
    if (codePoint === 0x9c || (codePoint < 0x20 && codePoint !== 0x0a) ||
        (codePoint >= 0x7f && codePoint <= 0x9f)) {
      index = next;
      continue;
    }
    output += source.slice(index, next);
    index = next;
  }
  return output;
}

export function graphemes(value) {
  return Array.from(segmenter.segment(sanitizeText(value)), item => item.segment);
}

export function graphemeWidth(value) {
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

export function textWidth(value) {
  return graphemes(value).reduce((width, item) => width + graphemeWidth(item), 0);
}

export function codePointCount(value) {
  let count = 0;
  for (const _point of String(value ?? '')) count += 1;
  return count;
}

/** Return grapheme-preserving visual rows and cursor coordinates for an editable draft. */
export function layoutText(value, maxWidth) {
  const width = Math.max(1, Math.floor(maxWidth));
  const items = graphemes(value);
  const rows = [];
  const cursorPositions = new Array(items.length + 1);
  let row = null;

  function startRow(index) {
    row = {start: index, end: index, text: '', width: 0, positions: []};
    rows.push(row);
    const position = {row: rows.length - 1, column: 0};
    cursorPositions[index] = position;
    row.positions.push({index, column: 0});
  }

  function addCluster(index) {
    const item = items[index];
    const itemWidth = graphemeWidth(item);
    if (row.width > 0 && row.width + itemWidth > width) startRow(index);
    const before = {row: rows.length - 1, column: row.width};
    cursorPositions[index] = before;
    row.positions.push({index, column: row.width});
    row.text += item;
    row.width += itemWidth;
    row.end = index + 1;
    const after = {row: rows.length - 1, column: row.width};
    cursorPositions[index + 1] = after;
    row.positions.push({index: index + 1, column: row.width});
  }

  startRow(0);
  let index = 0;
  while (index < items.length) {
    if (items[index] === '\n') {
      cursorPositions[index] = {row: rows.length - 1, column: row.width};
      row.end = index;
      startRow(index + 1);
      index += 1;
      continue;
    }

    const whitespace = /^\s+$/u.test(items[index]);
    let tokenEnd = index + 1;
    let tokenWidth = graphemeWidth(items[index]);
    while (tokenEnd < items.length && items[tokenEnd] !== '\n' &&
        /^\s+$/u.test(items[tokenEnd]) === whitespace) {
      tokenWidth += graphemeWidth(items[tokenEnd]);
      tokenEnd += 1;
    }
    if (!whitespace && tokenWidth <= width && row.width > 0 && row.width + tokenWidth > width) {
      startRow(index);
    }
    while (index < tokenEnd) {
      addCluster(index);
      index += 1;
    }
  }

  cursorPositions[items.length] ??= {row: rows.length - 1, column: row.width};
  return {rows, cursorPositions, graphemeCount: items.length, width};
}

export function cursorIndexAtOrAfter(value, pointOffset) {
  const target = Math.max(0, Number.isFinite(pointOffset) ? pointOffset : 0);
  const items = graphemes(value);
  let points = 0;
  for (let index = 0; index < items.length; index++) {
    if (points >= target) return index;
    points += codePointCount(items[index]);
    if (points >= target) return index + 1;
  }
  return items.length;
}
