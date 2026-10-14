import { createRuleAdapter } from '../core/grammar.js';

/** Turkish SOV and case marking are defined in JSON, not custom JS branches. */
export function createTurkishAdapter(dictionary, grammar) {
  return createRuleAdapter(dictionary, grammar);
}
