import { createRuleAdapter } from '../core/grammar.js';

/** Bounded Italian present-tense declarative adapter. */
export function createItalianAdapter(dictionary, grammar) {
  if (dictionary?.language !== 'it' || grammar?.language !== 'it')
    throw new Error('Italian adapter requires Italian lexicon and grammar data.');
  return createRuleAdapter(dictionary, grammar);
}
