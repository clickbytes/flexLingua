import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createPolishAdapter} from '../js/languages/pl.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [ontology, features, morphFeatures, en, pl, enGrammar, plGrammar, plSpec] = await Promise.all([
  '../data/concepts.json', '../data/features.json', '../data/morphology/features.json',
  '../data/en.json', '../data/pl.json', '../data/grammar/en.json',
  '../data/grammar/pl.json', '../data/morphology/pl.json'
].map(read));

const core = createCoreLanguage(ontology);
const morphology = createMorphology(plSpec, pl, morphFeatures, {core});
const engine = new Engine(ontology, features).registerMorphology(morphology)
  .registerLanguage(createRuleAdapter(en, enGrammar))
  .registerLanguage(createPolishAdapter(pl, plGrammar, {morphology}));

const expectedPossession = polarity => ({
  version: '1.23',
  type: 'state',
  kind: 'possession',
  roles: {
    owner: {
      referent: {kind: 'deictic', anchor: 'speaker'},
      agreement: {person: 'first', number: 'singular'}
    },
    owned: {concept: 'object.book', features: {definiteness: 'unknown', number: 'singular'}}
  },
  features: {tense: 'present', polarity}
});

const expectedPredication = (polarity, subject = 'object.apple', number = 'singular') => ({
  version: '1.23',
  type: 'state',
  kind: 'predication',
  predicate: 'quality.big',
  roles: {
    subject: {concept: subject, features: {definiteness: 'unknown', number}}
  },
  features: {tense: 'present', polarity}
});

test('STATE-02 declares and reverse-analyzes every present person form of być and mieć', () => {
  const paradigms = [
    ['pl.byc.1', [
      ['first', 'singular', 'jestem'], ['second', 'singular', 'jesteś'],
      ['third', 'singular', 'jest'], ['first', 'plural', 'jesteśmy'],
      ['second', 'plural', 'jesteście'], ['third', 'plural', 'są']
    ]],
    ['pl.miec.1', [
      ['first', 'singular', 'mam'], ['second', 'singular', 'masz'],
      ['third', 'singular', 'ma'], ['first', 'plural', 'mamy'],
      ['second', 'plural', 'macie'], ['third', 'plural', 'mają']
    ]]
  ];

  for (const [lexemeId, cells] of paradigms) {
    for (const [person, number, text] of cells) {
      const features = {tense: 'present', person, number};
      assert.deepEqual(morphology.generate({lexemeId, features}).map(form => form.text), [text]);
      assert.ok(morphology.analyze({text}).some(form =>
        form.lexemeId === lexemeId && JSON.stringify(form.features) === JSON.stringify(features)),
      `${lexemeId} reverse-analyzes ${text}`);
    }
  }
});

test('STATE-02 analyzes, realizes, and CORE-roundtrips positive and negative possession', () => {
  const examples = [
    ['Mam książkę.', 'positive'],
    ['Nie mam książki.', 'negative']
  ];

  for (const [text, polarity] of examples) {
    const meaning = engine.analyze({text, from: 'pl'});
    assert.deepEqual(meaning, expectedPossession(polarity), `${text} has typed possession meaning`);
    assert.equal(engine.realize({interlingua: meaning, to: 'pl'}).text, text);

    const coreJson = engine.realize({interlingua: meaning, to: 'core'}).text;
    assert.deepEqual(engine.analyze({text: coreJson, from: 'core'}), meaning);
  }
});

test('STATE-02 uses third-person agreement when the owner is stated', () => {
  const text = 'Dziewczynka ma książkę.';
  const meaning = engine.analyze({text, from: 'pl'});

  assert.equal(meaning.type, 'state');
  assert.equal(meaning.kind, 'possession');
  assert.equal(meaning.roles.owner.concept, 'person.girl');
  assert.equal(meaning.roles.owned.concept, 'object.book');
  assert.equal(engine.realize({interlingua: meaning, to: 'pl'}).text, text);
});

test('STATE-02 parses and realizes Polish copular property predication with negation', () => {
  const examples = [
    ['Jabłko jest duże.', 'positive', 'object.apple', 'singular'],
    ['Dziewczynka jest duża.', 'positive', 'person.girl', 'singular'],
    ['Chłopiec jest duży.', 'positive', 'person.boy', 'singular'],
    ['Jabłka są duże.', 'positive', 'object.apple', 'plural'],
    ['Jabłko nie jest duże.', 'negative', 'object.apple', 'singular']
  ];

  for (const [text, polarity, subject, number] of examples) {
    const meaning = engine.analyze({text, from: 'pl'});
    assert.deepEqual(meaning, expectedPredication(polarity, subject, number),
      `${text} has typed predication meaning`);
    assert.equal(engine.analyzeCandidates({text, from: 'pl'})[0].lexicalSenses.verb,
      'pl.byc.1.sense.1', 'jest must resolve to the state copula, not pl.jest.aux');
    assert.equal(engine.realize({interlingua: meaning, to: 'pl'}).text, text);

    const coreJson = engine.realize({interlingua: meaning, to: 'core'}).text;
    assert.deepEqual(engine.analyze({text: coreJson, from: 'core'}), meaning);
  }
});

test('STATE-02 rejects unsupported predication frame declarations', () => {
  const invalidGrammar = structuredClone(plGrammar);
  invalidGrammar.states.frames.predication.predicateCase = 'unsupportedCase';
  assert.throws(() => new Engine(ontology, features)
    .registerLanguage(createRuleAdapter(pl, invalidGrammar)), /Unknown state grammatical case/);

  const genderlessGrammar = structuredClone(plGrammar);
  genderlessGrammar.states.frames.predication.allowImplicitDeicticSubject = true;
  assert.throws(() => createRuleAdapter(pl, genderlessGrammar), /Invalid predication state frame/);
});

test('STATE-02 refuses unsupported targets, mismatched agreement, and ambiguous copula readings', () => {
  const unsupportedTarget = engine.tryTranslate({text: 'Mam książkę.', from: 'pl', to: 'en'});
  assert.equal(unsupportedTarget.ok, false);
  assert.match(unsupportedTarget.error.message, /Unsupported state construction/);
  const unsupportedCopulaTarget = engine.tryTranslate({text: 'Jabłko jest duże.', from: 'pl', to: 'en'});
  assert.equal(unsupportedCopulaTarget.ok, false);
  assert.match(unsupportedCopulaTarget.error.message, /Unsupported state construction/);

  assert.throws(() => engine.analyze({text: 'Ja ma książkę.', from: 'pl'}), /zgadza|agree/iu);
  assert.throws(() => engine.analyze({text: 'Ja jestem książką.', from: 'pl'}),
    /does not match|nie pasuje|konstrukcji/iu);
  assert.throws(() => engine.analyze({text: 'Jabłko jest duża.', from: 'pl'}),
    /does not match|nie pasuje|konstrukcji/iu);
  assert.throws(() => engine.analyze({text: 'Jestem duży.', from: 'pl'}),
    /does not match|nie pasuje|konstrukcji/iu);
  assert.throws(() => engine.analyze({text: 'Książka jest.', from: 'pl'}),
    /does not match|nie pasuje|konstrukcji/iu);
  assert.throws(() => engine.analyze({text: 'Jest książka.', from: 'pl'}),
    /does not match|nie pasuje|konstrukcji/iu);
  assert.throws(() => engine.analyze({text: 'Jabłko jest książką.', from: 'pl'}),
    /does not match|nie pasuje|konstrukcji/iu);
});
