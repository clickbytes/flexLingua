import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology, materializeInflections} from '../js/core/morphology/engine.js';
import {createPolishAdapter} from '../js/languages/pl.js';

const load = async path => JSON.parse(await readFile(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const [concepts, coreFeatures, morphologyFeatures, en, pl, enGrammar, plGrammar, plSpec] = await Promise.all([
  'concepts.json', 'features.json', 'morphology/features.json', 'en.json', 'pl.json',
  'grammar/en.json', 'grammar/pl.json', 'morphology/pl.json'
].map(load));
const engine = new Engine(concepts, coreFeatures);
const morphology = createMorphology(plSpec, pl, morphologyFeatures, {core: engine.core});
engine.registerMorphology(morphology)
  .registerLanguage(createRuleAdapter(en, enGrammar))
  .registerLanguage(createPolishAdapter(pl, plGrammar, {morphology}));
const personalLexemes = [
  'pl.dac.1', 'pl.dawac.1', 'pl.widziec.1', 'pl.czytac.1', 'pl.pomagac.1',
  'pl.szukac.1', 'pl.sluchac.1', 'pl.otwierac.1', 'pl.pisac.1', 'pl.isc.1'
];

test('PERS-04 generates the accepted present forms across regular and irregular families', () => {
  const accepted = [
    ['pl.czytac.1', 'first', 'singular', 'czytam'],
    ['pl.czytac.1', 'second', 'singular', 'czytasz'],
    ['pl.czytac.1', 'first', 'plural', 'czytamy'],
    ['pl.czytac.1', 'second', 'plural', 'czytacie'],
    ['pl.dawac.1', 'first', 'singular', 'daję'],
    ['pl.dawac.1', 'second', 'singular', 'dajesz'],
    ['pl.widziec.1', 'first', 'singular', 'widzę'],
    ['pl.widziec.1', 'second', 'plural', 'widzicie'],
    ['pl.pisac.1', 'first', 'singular', 'piszę'],
    ['pl.isc.1', 'first', 'singular', 'idę'],
    ['pl.isc.1', 'second', 'singular', 'idziesz'],
    ['pl.isc.1', 'first', 'plural', 'idziemy'],
    ['pl.isc.1', 'second', 'plural', 'idziecie']
  ];

  for (const [lexemeId, person, number, text] of accepted) {
    const features = {tense: 'present', person, number};
    assert.deepEqual(morphology.generate({lexemeId, features}).map(form => form.text), [text]);
    assert.ok(morphology.analyze({text}).some(form =>
      form.lexemeId === lexemeId && JSON.stringify(form.features) === JSON.stringify(features)));
  }

  assert.doesNotThrow(() => materializeInflections(pl, morphology, {assertLegacy: true}));
});

test('PERS-04 generates and reverse-analyzes every declared first/second-person past cell', () => {
  for (const lexemeId of personalLexemes) {
    const cells = morphology.paradigm({lexemeId}).filter(form =>
      ['first', 'second'].includes(form.features.person));
    assert.equal(cells.length, lexemeId === 'pl.dac.1' ? 8 : 12,
      `${lexemeId} has every declared present and past person cell`);
    for (const cell of cells) {
      const generated = morphology.generate({lexemeId, features: cell.features});
      assert.deepEqual(generated.map(form => form.text), [cell.text], `${lexemeId}: ${JSON.stringify(cell.features)}`);
      assert.ok(morphology.analyze({text: cell.text}).some(form =>
        form.lexemeId === lexemeId && JSON.stringify(form.features) === JSON.stringify(cell.features)),
      `${lexemeId}: reverse analysis of ${cell.text}`);
    }
  }
});

test('PERS-04 preserves the suppletive iść past forms and never guesses unknown speaker gender', () => {
  const regularAndStemAlternation = [
    ['pl.czytac.1', {tense: 'past', person: 'first', number: 'singular', gender: 'masculine'}, 'czytałem'],
    ['pl.czytac.1', {tense: 'past', person: 'first', number: 'singular', gender: 'feminine'}, 'czytałam'],
    ['pl.czytac.1', {tense: 'past', person: 'second', number: 'singular', gender: 'feminine'}, 'czytałaś'],
    ['pl.czytac.1', {tense: 'past', person: 'first', number: 'plural', pluralClass: 'virile'}, 'czytaliśmy'],
    ['pl.czytac.1', {tense: 'past', person: 'second', number: 'plural', pluralClass: 'nonvirile'}, 'czytałyście'],
    ['pl.dawac.1', {tense: 'past', person: 'first', number: 'singular', gender: 'masculine'}, 'dawałem'],
    ['pl.widziec.1', {tense: 'past', person: 'second', number: 'plural', pluralClass: 'virile'}, 'widzieliście'],
    ['pl.pisac.1', {tense: 'past', person: 'first', number: 'plural', pluralClass: 'nonvirile'}, 'pisałyśmy']
  ];
  for (const [lexemeId, features, text] of regularAndStemAlternation) {
    assert.deepEqual(morphology.generate({lexemeId, features}).map(form => form.text), [text]);
  }

  const expected = [
    [{tense: 'past', person: 'first', number: 'singular', gender: 'masculine'}, 'szedłem'],
    [{tense: 'past', person: 'first', number: 'singular', gender: 'feminine'}, 'szłam'],
    [{tense: 'past', person: 'second', number: 'singular', gender: 'masculine'}, 'szedłeś'],
    [{tense: 'past', person: 'second', number: 'singular', gender: 'feminine'}, 'szłaś'],
    [{tense: 'past', person: 'first', number: 'plural', pluralClass: 'virile'}, 'szliśmy'],
    [{tense: 'past', person: 'first', number: 'plural', pluralClass: 'nonvirile'}, 'szłyśmy'],
    [{tense: 'past', person: 'second', number: 'plural', pluralClass: 'virile'}, 'szliście'],
    [{tense: 'past', person: 'second', number: 'plural', pluralClass: 'nonvirile'}, 'szłyście']
  ];
  for (const [features, text] of expected) {
    assert.deepEqual(morphology.generate({lexemeId: 'pl.isc.1', features}).map(form => form.text), [text]);
  }

  assert.deepEqual(morphology.generate({
    lexemeId: 'pl.czytac.1', features: {tense: 'past', person: 'first', number: 'singular'}
  }), []);
  const alternatives = morphology.generate({
    lexemeId: 'pl.czytac.1', features: {tense: 'past', person: 'first', number: 'singular'}, exact: false
  });
  assert.deepEqual(new Set(alternatives.map(form => form.text)), new Set(['czytałem', 'czytałam']));
  assert.deepEqual(new Set(alternatives.map(form => form.features.gender)), new Set(['masculine', 'feminine']));
  assert.ok(engine.language('en').analyzeCandidates('I saw the dog.').length > 0,
    'the source first-person past is understood');
  assert.equal(engine.tryTranslate({text: 'The girl saw the dog.', from: 'en', to: 'pl'}).ok, true,
    'the same past event can be realized when Polish gender is known');
  assert.equal(engine.tryTranslate({text: 'I saw the dog.', from: 'en', to: 'pl'}).ok, false,
    'English first-person past does not select an unknown Polish speaker gender');
  for (const wrong of ['czytamysz', 'idęsz', 'szedłam', 'szedłyśmy']) {
    assert.deepEqual(morphology.analyze({text: wrong}), [], `${wrong} is not a declared form`);
  }
});
