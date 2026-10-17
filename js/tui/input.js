import {StringDecoder} from 'node:string_decoder';
import {sanitizeText} from './text.js';

const PASTE_START = Buffer.from('\u001b[200~', 'ascii');
const PASTE_END = Buffer.from('\u001b[201~', 'ascii');
const MAX_PASTE_BYTES = 64 * 1024;

function longestMarkerPrefixSuffix(buffer, marker) {
  const maximum = Math.min(buffer.length, marker.length - 1);
  for (let length = maximum; length > 0; length -= 1) {
    if (buffer.subarray(buffer.length - length).equals(marker.subarray(0, length))) return length;
  }
  return 0;
}

function looksLikeUnbracketedPaste(buffer) {
  const rawText = buffer.toString('utf8');
  const text = sanitizeText(rawText);
  const containsLineBreak = /\n/u.test(text);
  const containsEmbeddedControl = /[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/u.test(text);
  const containsText = /[^\x00-\x20\x7f-\x9f]/u.test(text);
  if (!containsLineBreak && !containsEmbeddedControl) return false;
  if (!containsText) return false;
  if (/\u001b|[\u008e\u008f\u0090\u0098\u009b\u009d\u009e\u009f]/u.test(rawText)) {
    const nonEmptyLines = text.split('\n').filter(line => /[^\s]/u.test(line));
    return nonEmptyLines.length > 1;
  }
  return true;
}

/** Preserve Terminal Kit's key parser while exposing bracketed paste as one text event. */
export function createInputBridge({terminal, stdin = terminal?.stdin, onPaste,
  maxPasteBytes = MAX_PASTE_BYTES, markerTimeoutMs = 120} = {}) {
  const parseKeys = terminal?.onStdin;
  if (!stdin || typeof stdin.on !== 'function' || typeof stdin.removeListener !== 'function' ||
      typeof parseKeys !== 'function') {
    return Object.freeze({attach() {}, detach() {}, attached: () => false});
  }

  let attached = false;
  let pasting = false;
  let overflow = false;
  let pasteBytes = 0;
  let pasteParts = [];
  let pending = Buffer.alloc(0);
  let markerTimer = null;
  let keyDecoder = new StringDecoder('utf8');

  function clearMarkerTimer() {
    if (markerTimer) clearTimeout(markerTimer);
    markerTimer = null;
  }

  function emitPaste() {
    const text = overflow ? null : Buffer.concat(pasteParts).toString('utf8');
    onPaste?.(text, {bracketed: true, tooLarge: overflow});
    pasteParts = [];
    pasteBytes = 0;
    overflow = false;
  }

  function flushKeyDecoder() {
    const tail = keyDecoder.end();
    keyDecoder = new StringDecoder('utf8');
    if (tail) parseKeys(Buffer.from(tail, 'utf8'));
  }

  function collectPaste(buffer) {
    if (!buffer.length || overflow) return;
    pasteBytes += buffer.length;
    if (pasteBytes > maxPasteBytes) {
      overflow = true;
      pasteParts = [];
      return;
    }
    pasteParts.push(buffer);
  }

  function deliverRegular(buffer, {fallback = true} = {}) {
    if (!buffer.length) return;
    if (buffer.length > maxPasteBytes) {
      onPaste?.(null, {bracketed: false, tooLarge: true});
      return;
    }
    if (fallback && looksLikeUnbracketedPaste(buffer)) {
      onPaste?.(buffer.toString('utf8'), {bracketed: false, tooLarge: false});
      return;
    }
    const text = keyDecoder.write(buffer);
    if (text) parseKeys(Buffer.from(text, 'utf8'));
  }

  function schedulePartialFlush() {
    clearMarkerTimer();
    if (!pending.length) return;
    markerTimer = setTimeout(() => {
      markerTimer = null;
      const held = pending;
      pending = Buffer.alloc(0);
      if (pasting) collectPaste(held);
      else deliverRegular(held, {fallback: false});
    }, markerTimeoutMs);
    markerTimer.unref?.();
  }

  function processChunk(chunk) {
    clearMarkerTimer();
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let remaining = pending.length ? Buffer.concat([pending, incoming]) : incoming;
    pending = Buffer.alloc(0);

    while (remaining.length) {
      if (pasting) {
        const end = remaining.indexOf(PASTE_END);
        if (end >= 0) {
          collectPaste(remaining.subarray(0, end));
          remaining = remaining.subarray(end + PASTE_END.length);
          pasting = false;
          emitPaste();
          continue;
        }
        const heldLength = longestMarkerPrefixSuffix(remaining, PASTE_END);
        const completeLength = remaining.length - heldLength;
        collectPaste(remaining.subarray(0, completeLength));
        pending = remaining.subarray(completeLength);
        schedulePartialFlush();
        return;
      }

      const start = remaining.indexOf(PASTE_START);
      if (start >= 0) {
        deliverRegular(remaining.subarray(0, start));
        flushKeyDecoder();
        remaining = remaining.subarray(start + PASTE_START.length);
        pasting = true;
        continue;
      }

      const heldLength = longestMarkerPrefixSuffix(remaining, PASTE_START);
      const completeLength = remaining.length - heldLength;
      deliverRegular(remaining.subarray(0, completeLength));
      pending = remaining.subarray(completeLength);
      schedulePartialFlush();
      return;
    }
  }

  function setBracketedPaste(enabled) {
    if (!stdin.isTTY || !terminal.stdout?.isTTY || typeof terminal.raw !== 'function') return;
    terminal.raw(enabled ? '\u001b[?2004h' : '\u001b[?2004l');
  }

  function attach() {
    if (attached) return;
    stdin.removeListener('data', parseKeys);
    stdin.on('data', processChunk);
    attached = true;
    setBracketedPaste(true);
  }

  function detach() {
    if (!attached) return;
    clearMarkerTimer();
    stdin.removeListener('data', processChunk);
    setBracketedPaste(false);
    attached = false;
    pending = Buffer.alloc(0);
    pasteParts = [];
    pasteBytes = 0;
    overflow = false;
    pasting = false;
    keyDecoder = new StringDecoder('utf8');
  }

  return Object.freeze({attach, detach, attached: () => attached});
}
