import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [ontology, features, morphologyFeatures, en, enGrammar, enMorphology] = await Promise.all([
  '../data/concepts.json', '../data/features.json', '../data/morphology/features.json',
  '../data/en.json', '../data/grammar/en.json', '../data/morphology/en.json'
].map(read));

const core = createCoreLanguage(ontology);
const morphology = createMorphology(enMorphology, en, morphologyFeatures, {core});
const english = createRuleAdapter(en, enGrammar, {morphology});
const engine = new Engine(ontology, features).registerMorphology(morphology)
  .registerLanguage(english);

const predication = (subject, polarity = 'positive', tense = 'present') => ({
  version: '1.23', type: 'state', kind: 'predication', predicate: 'quality.big',
  roles: {subject}, features: {tense, polarity}
});

const possession = (owner, definiteness = 'indefinite', polarity = 'positive', tense = 'present') => ({
  version: '1.23', type: 'state', kind: 'possession',
  roles: {
    owner,
    owned: {concept: 'object.book', features: {definiteness, number: 'singular'}}
  },
  features: {tense, polarity}
});

const question = proposition => ({
  version: '1.19', type: 'question', questionType: 'yes_no', proposition
});

const speaker = {referent: {kind: 'deictic', anchor: 'speaker'},
  agreement: {person: 'first', number: 'singular'}};
const addressee = {referent: {kind: 'deictic', anchor: 'addressee'},
  agreement: {person: 'second', number: 'singular'}};
const girl = {concept: 'person.girl', features: {definiteness: 'definite', number: 'singular'}};

test('STATE-03 declares and reverse-analyzes present and past forms of be and have', () => {
  const paradigms = [
    ['en.be.state.1', [
      ['first', 'singular', 'am'], ['second', 'singular', 'are'],
      ['third', 'singular', 'is'], ['first', 'plural', 'are'],
      ['second', 'plural', 'are'], ['third', 'plural', 'are'],
      ['first', 'singular', 'was', 'past'], ['second', 'singular', 'were', 'past'],
      ['third', 'singular', 'was', 'past'], ['first', 'plural', 'were', 'past'],
      ['second', 'plural', 'were', 'past'], ['third', 'plural', 'were', 'past']
    ]],
    ['en.have.state.1', [
      ['first', 'singular', 'have'], ['second', 'singular', 'have'],
      ['third', 'singular', 'has'], ['first', 'plural', 'have'],
      ['second', 'plural', 'have'], ['third', 'plural', 'have'],
      ['first', 'singular', 'had', 'past'], ['second', 'singular', 'had', 'past'],
      ['third', 'singular', 'had', 'past'], ['first', 'plural', 'had', 'past'],
      ['second', 'plural', 'had', 'past'], ['third', 'plural', 'had', 'past']
    ]]
  ];

  for (const [lexemeId, cells] of paradigms) {
    for (const [person, number, text, tense = 'present'] of cells) {
      const formFeatures = {tense, person, number};
      assert.deepEqual(morphology.generate({lexemeId, features: formFeatures})
        .map(form => form.text), [text]);
      assert.ok(morphology.analyze({text}).some(form => form.lexemeId === lexemeId &&
        JSON.stringify(form.features) === JSON.stringify(formFeatures)),
      `${lexemeId} reverse-analyzes ${text} for ${person} ${number}`);
    }
  }
});

test('STATE-03 analyzes and realizes be as a typed property predication', () => {
  const examples = [
    ['I am big.', predication(speaker)],
    ['You are big.', predication(addressee)],
    ['She is big.', predication(girl)],
    ['I was big.', predication(speaker, 'positive', 'past')],
    ['You were big.', predication(addressee, 'positive', 'past')],
    ['She was big.', predication(girl, 'positive', 'past')]
  ];

  for (const [text, expected] of examples) {
    const meaning = text.startsWith('She ')
      ?english.analyzeCandidates(text)[0].interlingua
      :engine.analyze({text, from: 'en'});
    assert.deepEqual(meaning, expected);
    const output = engine.realize({interlingua: meaning, to: 'en'}).text;
    assert.deepEqual(engine.analyze({text: output, from: 'en'}), expected);
    assert.deepEqual(engine.analyze({text: engine.realize({interlingua: meaning, to: 'core'}).text,
      from: 'core'}), expected);
  }
  assert.deepEqual(english.analyzeCandidates('She has a book.')[0].interlingua,
    possession(girl));
});

test('STATE-03 analyzes have and do-support questions as typed possession', () => {
  const expected = possession(speaker);
  assert.deepEqual(engine.analyze({text: 'I have a book.', from: 'en'}), expected);
  const pastStatement=possession(speaker,'indefinite','positive','past');
  assert.deepEqual(engine.analyze({text:'I had a book.',from:'en'}),pastStatement);
  const auxiliary=en.functionWords.find(item=>item.id==='en.be.aux');
  assert.ok(auxiliary.senses.some(sense=>sense.coreRef?.id==='grammar.auxiliary'));
  assert.ok(en.verbs.find(item=>item.id==='en.be.state.1').senses
    .some(sense=>sense.coreRef?.id==='grammar.state_copula'));

  const expectedQuestion = question(possession(girl));
  const analyzedQuestion = engine.analyze({text: 'Does she have a book?', from: 'en'});
  assert.deepEqual(analyzedQuestion, expectedQuestion);
  const output = engine.realize({interlingua: analyzedQuestion, to: 'en'}).text;
  assert.deepEqual(engine.analyze({text: output, from: 'en'}), expectedQuestion);
  assert.deepEqual(engine.analyze({text: engine.realize({interlingua: analyzedQuestion, to: 'core'}).text,
    from: 'core'}), expectedQuestion);

  const past=question(possession(girl,'indefinite','positive','past'));
  const pastQuestion=engine.analyze({text:'Did she have a book?',from:'en'});
  assert.deepEqual(pastQuestion,past);
  const pastOutput=engine.realize({interlingua:pastQuestion,to:'en'}).text;
  assert.deepEqual(engine.analyze({text:pastOutput,from:'en'}),past);
});

test('STATE-03 rejects agreement errors, incomplete clauses and auxiliary collisions', () => {
  for (const text of [
    'I is big.', 'I were big.', 'She were big.', 'Does you have a book?',
    'Does she has a book?', 'Did she had a book?',
    'She is.', 'Does she have?', 'Have a book.', 'I am not big.',
    'I do not have a book.', 'She is reading a book.', 'I have seen the dog.'
  ]) {
    assert.throws(() => engine.analyze({text, from: 'en'}), undefined, text);
  }
});
