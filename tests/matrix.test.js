/** Deterministic cross-product regression: not an evaluation of unrestricted language coverage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import { createEvent, participant } from '../js/core/interlingua.js';

const load = async path => JSON.parse(await readFile(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const [ontology, features, en, pl, enGrammar, plGrammar] = await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine = new Engine(ontology, features)
  .registerLanguage(createRuleAdapter(en, enGrammar))
  .registerLanguage(createRuleAdapter(pl, plGrammar));

function preserved(reference, actual) {
  assert.equal(actual.concept, reference.concept);
  assert.equal(actual.features.tense, reference.features.tense);
  assert.equal(actual.features.polarity, reference.features.polarity);
  for (const role of Object.keys(reference.roles)) {
    assert.equal(actual.roles[role].concept, reference.roles[role].concept, `Changed concept for ${role}`);
    assert.equal(actual.roles[role].features.number, reference.roles[role].features.number,
      `Changed number for ${role}`);
  }
}

test('Matrix: 192 semantic frame variants survive EN→PL→EN analysis of role and number', () => {
  const subjects = ['person.girl','person.boy','animal.dog','animal.cat'];
  const objects = ['object.book','object.apple','animal.dog'];
  const numbers = ['singular','plural'];
  const tenses = ['past','present'];
  const polarities = ['positive','negative'];
  let covered = 0;
  for (const agent of subjects) for (const theme of objects)
    for (const agentNumber of numbers) for (const themeNumber of numbers)
      for (const tense of tenses) for (const polarity of polarities) {
        const meaning = createEvent('event.visual_perception', {
          agent: participant(agent, 'definite', agentNumber),
          theme: participant(theme, 'indefinite', themeNumber)
        }, { tense, polarity, aspect:'unknown' });
        const enText = engine.realize({ interlingua: meaning, to: 'en' }).text;
        const fromEnglish = engine.analyze({ text:enText, from:'en' });
        preserved(meaning, fromEnglish);
        const plText = engine.realize({ interlingua:fromEnglish, to:'pl' }).text;
        const fromPolish = engine.analyze({ text:plText, from:'pl' });
        preserved(meaning, fromPolish);
        covered++;
      }
  assert.equal(covered, 192);
});
