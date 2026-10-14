import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [ontology, features, en, pl, enGrammar, plGrammar] = await Promise.all([
  '../data/concepts.json', '../data/features.json', '../data/en.json', '../data/pl.json',
  '../data/grammar/en.json', '../data/grammar/pl.json'
].map(read));
const engine = new Engine(ontology, features)
  .registerLanguage(createRuleAdapter(en, enGrammar))
  .registerLanguage(createRuleAdapter(pl, plGrammar));

const valid = [
  ['en', 'I go.', 'first', 'singular', 'speaker'],
  ['en', 'We go.', 'first', 'plural', 'speaker'],
  ['en', 'You go.', 'second', 'singular', 'addressee'],
  ['en', 'You go.', 'second', 'plural', 'addressee'],
  ['pl', 'Ja idę.', 'first', 'singular', 'speaker'],
  ['pl', 'My idziemy.', 'first', 'plural', 'speaker'],
  ['pl', 'Ty idziesz.', 'second', 'singular', 'addressee'],
  ['pl', 'Wy idziecie.', 'second', 'plural', 'addressee']
];

test('PERS-03 parser and realization preserve first/second person and both numbers', () => {
  for (const [language, text, person, number, anchor] of valid) {
    const candidates = engine.language(language).analyzeCandidates(text);
    assert.ok(candidates.some(({interlingua}) => {
      const role = interlingua.roles.agent;
      return role.referent?.anchor === anchor && role.agreement?.person === person &&
        role.agreement?.number === number;
    }), `${language}: ${text} has the expected person and number`);
    assert.equal(engine.translate({text, from:language, to:language}).text, text);
  }
});

test('PERS-03 default third person keeps singular/plural agreement and rejects mismatches', () => {
  const thirdPerson = [
    ['en', 'The girl goes.'],
    ['en', 'The girls go.'],
    ['pl', 'Dziewczynka idzie.'],
    ['pl', 'Dziewczynki idą.']
  ];
  for (const [language, text] of thirdPerson) {
    const candidates = engine.language(language).analyzeCandidates(text);
    assert.ok(candidates.length > 0, `${language}: ${text} parses`);
    assert.ok(candidates.every(({interlingua}) => !('referent' in interlingua.roles.agent)),
      `${language}: ${text} remains an ordinary third-person participant`);
    assert.equal(engine.translate({text, from:language, to:language}).text, text);
  }

  const mismatches = [
    ['en', 'I goes.'], ['en', 'We goes.'], ['en', 'The girl go.'], ['en', 'The girls goes.'],
    ['pl', 'Ja idzie.'], ['pl', 'My idziecie.'], ['pl', 'Ty idziemy.'], ['pl', 'Wy idziemy.'],
    ['pl', 'Dziewczynka idą.'], ['pl', 'Dziewczynki idzie.']
  ];
  for (const [language, text] of mismatches) {
    assert.equal(engine.tryTranslate({text, from:language, to:language}).ok, false,
      `${language}: ${text} must not match a different person-number form`);
  }
});
