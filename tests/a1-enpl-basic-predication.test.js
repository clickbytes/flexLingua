import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createPolishAdapter} from '../js/languages/pl.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [ontology, features, morphologyFeatures, en, pl, enGrammar, plGrammar,
  enMorphology, plMorphology] = await Promise.all([
  '../data/concepts.json', '../data/features.json', '../data/morphology/features.json',
  '../data/en.json', '../data/pl.json', '../data/grammar/en.json', '../data/grammar/pl.json',
  '../data/morphology/en.json', '../data/morphology/pl.json'
].map(read));

const core = createCoreLanguage(ontology);
const enMorph = createMorphology(enMorphology, en, morphologyFeatures, {core});
const plMorph = createMorphology(plMorphology, pl, morphologyFeatures, {core});
const engine = new Engine(ontology, features).registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en, enGrammar, {morphology:enMorph}))
  .registerLanguage(createPolishAdapter(pl, plGrammar, {morphology:plMorph}));

const thisReferent = {referent:{kind:'deictic',anchor:'demonstrative'},
  agreement:{person:'third',number:'singular'}};
const book = (definiteness, modifiers) => ({concept:'object.book',features:{definiteness,number:'singular'},
  ...(modifiers ? {modifiers:[{concept:modifiers}]} : {})});

test('A1-ENPL-01 translates proximal demonstratives and class predication through CORE', () => {
  const examples = [
    ['This is a book.', 'To jest książka.', {
      version:'1.31',type:'state',kind:'classification',
      roles:{subject:thisReferent,category:book('unknown')},
      features:{tense:'present',polarity:'positive'}
    }],
    ['This is a small book.', 'To jest mała książka.', {
      version:'1.31',type:'state',kind:'classification',
      roles:{subject:thisReferent,category:book('unknown','quality.small')},
      features:{tense:'present',polarity:'positive'}
    }],
    ['This is a simple book.', 'To jest prosta książka.', {
      version:'1.31',type:'state',kind:'classification',
      roles:{subject:thisReferent,category:book('unknown','quality.simple')},
      features:{tense:'present',polarity:'positive'}
    }],
    ['This book is small.', 'Ta książka jest mała.', {
      version:'1.23',type:'state',kind:'predication',predicate:'quality.small',
      roles:{subject:{...book('definite'),demonstrative:'proximal'}},
      features:{tense:'present',polarity:'positive'}
    }]
  ];

  for (const [source, target, expected] of examples) {
    const meaning=engine.analyze({text:source,from:'en'});
    assert.deepEqual(meaning,expected,source);
    assert.equal(engine.translate({text:source,from:'en',to:'pl'}).text,target,source);
    assert.deepEqual(engine.analyze({text:target,from:'pl'}),expected,target);
    assert.deepEqual(engine.analyze({text:engine.realize({interlingua:meaning,to:'core'}).text,
      from:'core'}),expected,source);
  }
});

test('A1-ENPL-01 keeps simple bounded and preserves declared failures', () => {
  assert.equal(engine.translate({text:'This is a simple cat.',from:'en',to:'pl'}).text,
    'To jest prosty kot.');
  for (const text of ['This is an easy book.', 'These book is small.']) {
    assert.throws(() => engine.analyze({text,from:'en'}), undefined, text);
  }
});
