import { createRuleAdapter } from '../core/grammar.js';

/** English is data + the generic rule interpreter, not a separate parser. */
export function createEnglishAdapter(dictionary, grammar, options = {}) {
  return createRuleAdapter(dictionary, grammar, options);
}
