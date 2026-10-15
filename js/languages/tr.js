import { createRuleAdapter } from '../core/grammar.js';

/** Demonstration-only Turkish SOV and case marking; not a CEFR level claim. */
export function createTurkishAdapter(dictionary, grammar) {
  if(dictionary?.language!=='tr' || grammar?.language!=='tr')
    throw new Error('Turkish adapter requires Turkish lexicon and grammar data.');
  return createRuleAdapter(dictionary, grammar);
}
