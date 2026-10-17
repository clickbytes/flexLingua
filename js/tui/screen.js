import {graphemes, graphemeWidth, sanitizeText, textWidth} from './text.js';

export {graphemes, graphemeWidth, sanitizeText, textWidth} from './text.js';

function wrapLongToken(token, width) {
  const lines = [];
  let line = '';
  let lineWidth = 0;
  for (const item of graphemes(token)) {
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
  if (line || !lines.length) lines.push(line);
  return lines;
}

function wrapLine(sourceLine, width) {
  const tokens = sourceLine.match(/\S+|\s+/gu) ?? [];
  const lines = [];
  let line = '';
  let lineWidth = 0;
  for (const token of tokens) {
    const tokenWidth = textWidth(token);
    if (/^\s+$/u.test(token)) {
      if (!line) continue;
      if (lineWidth + tokenWidth <= width) {
        line += token;
        lineWidth += tokenWidth;
      } else {
        lines.push(line.trimEnd());
        line = '';
        lineWidth = 0;
      }
      continue;
    }
    if (tokenWidth <= width) {
      if (line && lineWidth + tokenWidth > width) {
        lines.push(line.trimEnd());
        line = '';
        lineWidth = 0;
      }
      line += token;
      lineWidth += tokenWidth;
      continue;
    }
    if (line) {
      lines.push(line.trimEnd());
      line = '';
      lineWidth = 0;
    }
    const chunks = wrapLongToken(token, width);
    lines.push(...chunks.slice(0, -1));
    line = chunks.at(-1) ?? '';
    lineWidth = textWidth(line);
  }
  if (line || !lines.length) lines.push(line.trimEnd());
  return lines;
}

export function wrapText(value, maxWidth) {
  const width = Math.max(1, Math.floor(maxWidth));
  return sanitizeText(value).split('\n').flatMap(line => wrapLine(line, width));
}

export function fitText(value, maxWidth) {
  return wrapText(value, Math.max(1, maxWidth))[0] ?? '';
}

function positiveDimension(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

/** Compose and diff terminal frames by row; full clears are reserved for resize/start. */
export function createScreen({terminal, styleFor} = {}) {
  if (!terminal || typeof terminal.put !== 'function' || typeof styleFor !== 'function') {
    throw new Error('Screen requires a terminal and a palette style resolver.');
  }

  let width = 0;
  let height = 0;
  let previousRows = null;
  let frame = null;

  function clear() {
    terminal.eraseDisplay?.();
    previousRows = null;
  }

  function beginFrame(nextWidth, nextHeight) {
    const screenWidth = positiveDimension(nextWidth);
    const screenHeight = positiveDimension(nextHeight);
    if (screenWidth !== width || screenHeight !== height) {
      width = screenWidth;
      height = screenHeight;
      clear();
    }
    frame = Array.from({length: height}, () => []);
  }

  function put({x, y, tone = 'neutral', maxWidth} = {}, value) {
    if (!frame || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const column = Math.floor(x);
    const row = Math.floor(y);
    if (column < 1 || column > width || row < 1 || row > height) return false;
    const available = Math.min(width - column + 1,
      Number.isFinite(maxWidth) ? Math.max(0, Math.floor(maxWidth)) : width - column + 1);
    if (!available) return false;
    const text = fitText(value, available);
    if (!text) return false;
    frame[row - 1].push({x: column, text, tone});
    return true;
  }

  function commit() {
    if (!frame) return {changedRows: 0};
    let changedRows = 0;
    const nextRows = frame.map(writes => JSON.stringify(writes));
    for (let index = 0; index < height; index++) {
      if (previousRows?.[index] === nextRows[index]) continue;
      const y = index + 1;
      terminal.put({x: 1, y, wrap: false, attr: styleFor('neutral')}, ' '.repeat(width));
      for (const write of frame[index]) {
        terminal.put({x: write.x, y, wrap: false, attr: styleFor(write.tone)}, write.text);
      }
      changedRows++;
    }
    previousRows = nextRows;
    frame = null;
    return {changedRows};
  }

  return Object.freeze({beginFrame, put, commit, clear,
    size: () => ({width, height})});
}
