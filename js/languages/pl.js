import { createRuleAdapter } from '../core/grammar.js';

/** Polish case, agreement, aspect and constructions come from data/grammar/pl.json. */
export function createPolishAdapter(dictionary, grammar, options = {}) {
  return createRuleAdapter(dictionary, grammar, options);
}
