import {EngineError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';

export const MAX_SOURCE_TEXT_LENGTH = RESOURCE_LIMITS.sourceTextCodeUnits;
export const TEXT_PROFILE_VERSION = '1.0';
const TEXT_SEGMENTATION = 'unicode-whitespace-v1';
const TOKEN_PATTERN = /[\p{L}\d][\p{L}\p{M}\d]*(?:['’ʼ\-:][\p{L}\d][\p{L}\p{M}\d]*)*|,/uy;
const VALIDATED_TEXT_PROFILES = new WeakSet();
const PHRASE_TOKENS_BY_PROFILE = new WeakMap();
const MAX_CACHED_PHRASES = 4096;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createTextProfile(locale, options = {}) {
  if (!record(options) || Object.keys(options).some(key => key !== 'segmentation')) {
    throw new Error('Invalid or unsupported text segmentation profile.');
  }
  const segmentation=options.segmentation ?? TEXT_SEGMENTATION;
  if (typeof locale !== 'string' || !locale || segmentation !== TEXT_SEGMENTATION) {
    throw new Error('Invalid or unsupported text segmentation profile.');
  }
  let canonical;
  try { [canonical] = Intl.getCanonicalLocales(locale); }
  catch { throw new Error('Text profile must declare a valid locale.'); }
  if (!canonical) throw new Error('Text profile must declare a valid locale.');
  const profile=Object.freeze({version:TEXT_PROFILE_VERSION, locale:canonical, normalization:'NFC',
    caseFold:'locale-lower', segmentation:TEXT_SEGMENTATION});
  VALIDATED_TEXT_PROFILES.add(profile);
  return profile;
}

export function validateTextProfile(profile, {locale} = {}) {
  if (record(profile) && VALIDATED_TEXT_PROFILES.has(profile)) return profile;
  if (!record(profile) || Object.keys(profile).sort().join(',') !==
      'caseFold,locale,normalization,segmentation,version' ||
      profile.version !== TEXT_PROFILE_VERSION || profile.normalization !== 'NFC' ||
      profile.caseFold !== 'locale-lower' || profile.segmentation !== TEXT_SEGMENTATION ||
      (locale !== undefined && profile.locale !== locale)) {
    throw new Error('Invalid or unsupported text profile.');
  }
  const canonical = createTextProfile(profile.locale);
  if (canonical.version !== profile.version || canonical.locale !== profile.locale ||
      canonical.normalization !== profile.normalization || canonical.caseFold !== profile.caseFold ||
      canonical.segmentation !== profile.segmentation) {
    throw new Error('Text profile locale must use its canonical form.');
  }
  return canonical;
}

/** Resolve the written signal declaration of one compiled language package. */
export function textProfileForSignal(signalModule, language) {
  if (!record(signalModule) || signalModule.channel !== 'written' ||
      typeof language !== 'string' || !language) {
    throw new Error('Missing written signal profile for language.');
  }
  const profile = validateTextProfile(signalModule.textProfile ?? signalModule.profile);
  if (profile.locale.split('-')[0] !== language) {
    throw new Error('Written signal locale does not match language.');
  }
  return profile;
}

const DEFAULT_TEXT_PROFILE = createTextProfile('und');

function requireBoundedText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new EngineError('SOURCE_TEXT_INVALID', 'Enter a sentence.');
  }
  if (text.length > MAX_SOURCE_TEXT_LENGTH) {
    throw new EngineError('SOURCE_TEXT_SIZE_LIMIT',
      `Source text exceeds ${MAX_SOURCE_TEXT_LENGTH} UTF-16 code units.`);
  }
}

function bodyRange(text) {
  let start = text.length - text.trimStart().length;
  let end = text.trimEnd().length;
  if (/[.!]$/u.test(text.slice(start,end))) end--;
  while (end > start && /\s/u.test(text[end-1])) end--;
  if (start >= end) throw new EngineError('SOURCE_TEXT_INVALID', 'Enter a sentence.');
  return {start,end};
}

function appendNormalized(source, sourceOffset, locale) {
  if (typeof Intl.Segmenter !== 'function') {
    throw new EngineError('SOURCE_SEGMENTER_UNAVAILABLE',
      'Unicode grapheme segmentation is unavailable.');
  }
  let text = '';
  const sourceMap = [];
  const segmenter = new Intl.Segmenter(locale, {granularity:'grapheme'});
  for (const item of segmenter.segment(source)) {
    const normalized = item.segment.normalize('NFC')
      .toLocaleLowerCase(locale).normalize('NFC');
    const start = sourceOffset + item.index;
    const end = start + item.segment.length;
    text += normalized;
    for (let i=0;i<normalized.length;i++) sourceMap.push({start,end});
  }
  return {text,sourceMap};
}

/** Normalize by the declared language profile and retain original UTF-16 spans. */
export function tokenizeDetailed(text, rawProfile = DEFAULT_TEXT_PROFILE) {
  requireBoundedText(text);
  const profile = validateTextProfile(rawProfile);
  if (/\p{C}/u.test(text)) {
    throw new EngineError('SOURCE_CHARACTER_UNSUPPORTED',
      'Control, format, private-use, and unassigned characters are unsupported.');
  }
  const {start,end} = bodyRange(text);
  const {text:normalized,sourceMap} = appendNormalized(text.slice(start,end),start,profile.locale);
  const tokens = [], spans = [];
  let index = 0;
  while (index < normalized.length) {
    const point = String.fromCodePoint(normalized.codePointAt(index));
    if (/^\s$/u.test(point)) { index += point.length; continue; }
    TOKEN_PATTERN.lastIndex = index;
    const match = TOKEN_PATTERN.exec(normalized);
    if (!match) {
      const span = sourceMap[index];
      throw new EngineError('SOURCE_CHARACTER_UNSUPPORTED',
        `Unsupported source character at UTF-16 offset ${span?.start ?? start}.`);
    }
    const tokenStart = index;
    index += match[0].length;
    if (match[0] === ',' && tokens.at(-1) === ',') {
      throw new EngineError('SOURCE_CHARACTER_UNSUPPORTED',
        `Repeated comma at UTF-16 offset ${sourceMap[tokenStart]?.start ?? start}.`);
    }
    const first = sourceMap[tokenStart], last = sourceMap[index-1];
    tokens.push(match[0]);
    spans.push({start:first.start,end:last.end});
    if (tokens.length > 70) {
      throw new EngineError('SOURCE_TOKEN_LIMIT', 'Sentence exceeds the prototype limit.');
    }
  }
  if (!tokens.length) throw new EngineError('SOURCE_TEXT_INVALID', 'Enter a sentence.');
  Object.defineProperties(tokens, {
    sourceSpans:{value:spans,enumerable:false},
    textProfile:{value:profile,enumerable:false}
  });
  return {tokens,spans,normalizedText:normalized,profile};
}

/** Strict tokenizer: unsupported punctuation is never silently discarded. */
export function tokenize(text, profile = DEFAULT_TEXT_PROFILE) {
  return tokenizeDetailed(text,profile).tokens;
}

export function matchesTokens(tokens, index, phrase, rawProfile = tokens?.textProfile || DEFAULT_TEXT_PROFILE) {
  const profile = validateTextProfile(rawProfile);
  // Cache lexical normalization, never a match against a mutable token array.
  // Validated profiles are immutable; weak keys isolate locales/package lifetimes.
  const cacheable = typeof phrase === 'string' && phrase.length <= MAX_SOURCE_TEXT_LENGTH;
  let phrases = cacheable ? PHRASE_TOKENS_BY_PROFILE.get(profile) : undefined;
  let expected = phrases?.get(phrase);
  if (!expected) {
    expected = phrase.normalize('NFC').toLocaleLowerCase(profile.locale)
      .normalize('NFC').split(/\s+/u);
    if (cacheable) {
      if (!phrases) {
        phrases = new Map();
        PHRASE_TOKENS_BY_PROFILE.set(profile, phrases);
      }
      if (phrases.size >= MAX_CACHED_PHRASES) phrases.delete(phrases.keys().next().value);
      phrases.set(phrase, expected);
    }
  }
  return expected.every((word, i) => tokens[index + i] === word) ? expected.length : 0;
}

export function sentenceText(parts, terminator = '.', locale = 'und') {
  let text = parts.flat().join(' ').replace(/\s+/gu, ' ').replace(/\s+,/gu, ',').trim();
  text = text.normalize('NFC');
  const [first,...rest]=Array.from(text);
  return (first?.toLocaleUpperCase(locale)||'') + rest.join('') + terminator;
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
