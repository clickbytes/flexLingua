import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createEvent,createModality,validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));

const polishFuture=[
  'Dziewczynka będzie czytać książkę.',
  'Chłopiec będzie czytać książkę.',
  'Dziewczynki będą czytać książkę.',
  'Chłopcy będą czytać książkę.',
  'Dziewczynka będzie widzieć psa.',
  'Chłopiec będzie widzieć psa.',
  'Dziewczynka będzie pisać książkę.',
  'Ojciec będzie dawać książkę siostrze.',
  'Dziewczynka będzie otwierać książkę.',
  'Chłopiec będzie spać.',
  'Siostra będzie pomagać chłopcu.',
  'Ojciec będzie pracować.',
  'Dziewczynka da książkę siostrze.',
  'Chłopiec da książkę siostrze.'
];

const intentionPairs=[
  ['A girl is going to read a book.','Dziewczynka zamierza czytać książkę.'],
  ['A boy is going to see a dog.','Chłopiec zamierza widzieć psa.'],
  ['Girls are going to read books.','Dziewczynki zamierzają czytać książki.'],
  ['Boys are going to write books.','Chłopcy zamierzają pisać książki.'],
  ['A sister is going to help a boy.','Siostra zamierza pomagać chłopcu.'],
  ['A girl is going to open a book.','Dziewczynka zamierza otwierać książkę.'],
  ['A father is going to work.','Ojciec zamierza pracować.'],
  ['A boy is going to sleep.','Chłopiec zamierza spać.'],
  ['A father is going to learn a lesson.','Ojciec zamierza uczyć się lekcji.'],
  ['A sister is going to wait for a dog.','Siostra zamierza czekać na psa.'],
  ['A girl is going to read books.','Dziewczynka zamierza czytać książki.'],
  ['A boy is going to see cats.','Chłopiec zamierza widzieć koty.'],
  ['Girls are going to help boys.','Dziewczynki zamierzają pomagać chłopcom.'],
  ['Boys are going to sleep.','Chłopcy zamierzają spać.'],
  ['A father is going to open a book.','Ojciec zamierza otwierać książkę.'],
  ['A sister is going to learn a lesson.','Siostra zamierza uczyć się lekcji.'],
  ['A brother is going to wait for a dog.','Brat zamierza czekać na psa.'],
  ['Girls are going to write books.','Dziewczynki zamierzają pisać książki.'],
  ['A girl is going to work.','Dziewczynka zamierza pracować.'],
  ['A boy is going to read a book.','Chłopiec zamierza czytać książkę.']
];

test('A2-01: Polish future forms retain future tense, aspect and round-trip through CORE/English',()=>{
  assert.equal(polishFuture.length,14);
  for(const text of polishFuture) {
    const result=engine.translate({from:'pl',to:'en',text});
    assert.equal(result.interlingua.features.tense,'future',text);
    assert.equal(result.interlingua.features.aspect,text.includes(' da ')?'perfective':'imperfective',text);
    validateInterlingua(result.interlingua,engine.ontology,engine.features);
    const reread=engine.analyze({from:'core',text:JSON.stringify(result.interlingua)});
    assert.equal(reread.features.tense,'future',text);
    assert.equal(engine.analyze({from:'en',text:result.text}).features.tense,'future',text);
  }
});

test('A2-01: English and Polish intention remain a distinct modality over future events',()=>{
  assert.equal(intentionPairs.length,20);
  for(const [english,polish] of intentionPairs) {
    const fromEnglish=engine.translate({from:'en',to:'pl',text:english});
    assert.equal(fromEnglish.text,polish,english);
    assert.equal(fromEnglish.interlingua.type,'modality',english);
    assert.equal(fromEnglish.interlingua.operator,'modality.intention',english);
    assert.equal(fromEnglish.interlingua.operand.features.tense,'future',english);
    assert.equal(fromEnglish.interlingua.operand.features.aspect,'unknown',english);
    const fromPolish=engine.translate({from:'pl',to:'en',text:polish});
    assert.equal(fromPolish.text,english,polish);
    assert.equal(fromPolish.interlingua.type,'modality',polish);
    assert.equal(fromPolish.interlingua.operator,'modality.intention',polish);
    assert.equal(fromPolish.interlingua.operand.features.tense,'future',polish);
    assert.equal(fromPolish.interlingua.operand.features.aspect,'imperfective',polish);
    validateInterlingua(engine.analyze({from:'core',text:JSON.stringify(fromPolish.interlingua)}),
      engine.ontology,engine.features);
  }
});

test('A2-01: the engine refuses ungrounded Polish aspect and malformed intention scope',()=>{
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The girl will see the dog.'}).ok,false);
  const englishFuture=engine.analyze({from:'en',text:'The girl will see the dog.'});
  assert.equal(englishFuture.features.tense,'future');
  assert.equal(englishFuture.features.aspect,'unknown');
  assert.equal(engine.analyze({from:'en',text:engine.realize({to:'en',interlingua:englishFuture}).text})
    .features.tense,'future');
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The father is going to give a book to the sister.'}).ok,false);
  const parsed=engine.analyze({from:'en',text:'The girl sees the dog.'});
  const futureUnknown=createEvent(parsed.concept,parsed.roles,
    {tense:'future',polarity:'positive',aspect:'unknown'});
  assert.throws(()=>engine.realize({to:'pl',interlingua:futureUnknown}),/No pl verb form/u);
  assert.throws(()=>createModality('modality.intention',parsed),/Unsupported modality/u);
  const malformed={version:'1.20',type:'modality',operator:'modality.intention',
    operand:{...parsed,features:{...parsed.features,tense:'present'}}};
  assert.throws(()=>validateInterlingua(malformed,engine.ontology,engine.features),
    /affirmative future/u);
});
