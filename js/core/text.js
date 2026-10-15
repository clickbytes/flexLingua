import {EngineError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';

export const MAX_SOURCE_TEXT_LENGTH = RESOURCE_LIMITS.sourceTextCodeUnits;

function requireBoundedText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new EngineError('SOURCE_TEXT_INVALID', 'Enter a sentence.');
  }
  if (text.length > MAX_SOURCE_TEXT_LENGTH) {
    throw new EngineError('SOURCE_TEXT_SIZE_LIMIT',
      `Source text exceeds ${MAX_SOURCE_TEXT_LENGTH} UTF-16 code units.`);
  }
}

/** Strict tokenization: unsupported punctuation is never silently discarded. */
export function tokenize(text) {
  requireBoundedText(text);
  const raw = text.trim().replace(/[.!]\s*$/u, '').toLocaleLowerCase();
  if (!/^[\p{L}\d:\-\s,]+$/u.test(raw) || /,,/u.test(raw)) {
    throw new Error('Only simple sentences with letters, spaces and a final period are supported.');
  }
  const tokens = raw.replace(/,/gu, ' , ').split(/\s+/u).filter(Boolean);
  if (tokens.length > 70) {
    throw new EngineError('SOURCE_TOKEN_LIMIT', 'Sentence exceeds the prototype limit.');
  }
  return tokens;
}

export function matchesTokens(tokens, index, phrase) {
  const expected = phrase.toLocaleLowerCase().split(/\s+/u);
  return expected.every((word, i) => tokens[index + i] === word) ? expected.length : 0;
}

export function sentenceText(parts, terminator = '.') {
  const text = parts.flat().join(' ').replace(/\s+/gu, ' ').replace(/\s+,/gu, ',').trim();
  return text.charAt(0).toLocaleUpperCase() + text.slice(1) + terminator;
}

/** Parse an ordered list of semantic roles and literal function words. */
export function parseConstructions(tokens, start, constructions, readRole) {
  for (const construction of constructions) {
    let index = start;
    const roles = {};
    let matches = true;
    for (const step of construction) {
      if (step.startsWith('@')) {
        const count = matchesTokens(tokens, index, step.slice(1));
        if (!count) { matches = false; break; }
        index += count;
      } else {
        const parsed = readRole(step, tokens, index);
        if (!parsed) { matches = false; break; }
        roles[step] = parsed.value;
        index = parsed.next;
      }
    }
    if (matches && index === tokens.length) return roles;
  }
  throw new Error('Sentence does not match a supported grammatical construction.');
}

/** Multiple independent sentences form a discourse; no implicit coreference. */
export function splitSentences(text, limit = RESOURCE_LIMITS.discourseEvents) {
  requireBoundedText(text);
  const parts = text.trim().split('.');
  if (parts.at(-1) === '') parts.pop();
  if (parts.some(part => !part.trim())) throw new Error('Empty discourse sentence.');
  if (parts.length > limit) {
    throw new EngineError('DISCOURSE_EVENT_LIMIT', `Discourse exceeds ${limit} events.`);
  }
  return parts.map(part => `${part.trim()}.`);
}
