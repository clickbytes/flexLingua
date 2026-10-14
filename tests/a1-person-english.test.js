import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar,morphFeatures,enMorphData,plMorphData]=
  await Promise.all([
    'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json',
    'morphology/features.json','morphology/en.json','morphology/pl.json'
  ].map(load));
const core=createCoreLanguage(ontology);
const enMorph=createMorphology(enMorphData,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphData,pl,morphFeatures,{core});
const engine=new Engine(ontology,features)
  .registerMorphology(enMorph)
  .registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));

const clauseOf=meaning=>meaning.type==='question'?meaning.proposition:meaning;
const assertSubject=(meaning,{person,number,anchor})=>{
  const subject=clauseOf(meaning).roles.agent;
  assert.deepEqual(subject.referent,{kind:'deictic',anchor});
  assert.deepEqual(subject.agreement,{person,number});
};

test('PERS-05 selects do/does from English person and number',()=>{
  const positive=[
    ['I read the book.','first','singular','speaker'],
    ['You read the book.','second','singular','addressee'],
    ['We read the book.','first','plural','speaker']
  ];
  for(const [text,person,number,anchor] of positive){
    const result=engine.translate({text,from:'en',to:'pl'});
    assertSubject(result.interlingua,{person,number,anchor});
  }

  const negative=engine.translate({text:'I do not read the book.',from:'en',to:'pl'});
  assertSubject(negative.interlingua,{person:'first',number:'singular',anchor:'speaker'});
  assert.equal(clauseOf(negative.interlingua).features.polarity,'negative');

  const question=engine.translate({text:'Do you read the book?',from:'en',to:'pl'});
  assertSubject(question.interlingua,{person:'second',number:'singular',anchor:'addressee'});
  assert.equal(question.interlingua.type,'question');
  assert.equal(clauseOf(question.interlingua).features.tense,'present');
  assert.equal(clauseOf(question.interlingua).features.polarity,'positive');
  assert.match(question.text,/^Czy ty czytasz książkę\?$/u);
});

test('PERS-05 keeps third-person singular and rejects person/auxiliary mismatches',()=>{
  const declaration=engine.translate({text:'The girl reads the book.',from:'en',to:'pl'});
  assert.equal(declaration.interlingua.roles.agent.concept,'person.girl');
  assert.equal(declaration.text,'Dziewczynka czyta książkę.');

  const question=engine.translate({text:'Does the girl read the book?',from:'en',to:'pl'});
  assert.equal(question.interlingua.type,'question');
  assert.equal(question.text,'Czy dziewczynka czyta książkę?');

  for(const text of ['I reads the book.','Does you read the book?','Do the girl read the book?']){
    assert.equal(engine.tryTranslate({text,from:'en',to:'pl'}).ok,false,text);
  }
});

test('PERS-05 keeps past do-support in CORE and refuses unsupported Polish past syntax',()=>{
  const past=engine.translate({text:'Did you not read the book?',from:'en',to:'en'});
  assert.equal(past.text,'Did you not read the book?');
  assertSubject(past.interlingua,{person:'second',number:'singular',anchor:'addressee'});
  assert.equal(clauseOf(past.interlingua).features.tense,'past');
  assert.equal(clauseOf(past.interlingua).features.polarity,'negative');

  const unsupported=engine.tryTranslate({text:'Did you read the book?',from:'en',to:'pl'});
  assert.equal(unsupported.ok,false);
  assert.match(unsupported.error.message,/No pl verb form supports/u);
});

test('PERS-05 preserves speaker/addressee, tense and polarity through EN↔PL',()=>{
  const polish=[
    ['Ja czytam książkę.','first','singular','speaker','positive'],
    ['My nie czytamy książki.','first','plural','speaker','negative'],
    ['Ty czytasz książkę.','second','singular','addressee','positive'],
    ['Wy nie czytacie książki.','second','plural','addressee','negative']
  ];
  for(const [text,person,number,anchor,polarity] of polish){
    const english=engine.translate({text,from:'pl',to:'en'});
    assertSubject(english.interlingua,{person,number,anchor});
    assert.equal(clauseOf(english.interlingua).features.tense,'present');
    assert.equal(clauseOf(english.interlingua).features.polarity,polarity);

    const returned=engine.translate({text:english.text,from:'en',to:'pl'});
    assert.equal(clauseOf(returned.interlingua).features.tense,'present');
    assert.equal(clauseOf(returned.interlingua).features.polarity,polarity);
    const returnedSubject=clauseOf(returned.interlingua).roles.agent;
    assert.deepEqual(returnedSubject.referent,{kind:'deictic',anchor});
    assert.equal(returnedSubject.agreement.person,person);
  }

  const polishQuestion=engine.translate({text:'Czy ty nie czytasz książki?',from:'pl',to:'en'});
  assert.equal(polishQuestion.interlingua.type,'question');
  assertSubject(polishQuestion.interlingua,{person:'second',number:'singular',anchor:'addressee'});
  assert.equal(clauseOf(polishQuestion.interlingua).features.tense,'present');
  assert.equal(clauseOf(polishQuestion.interlingua).features.polarity,'negative');
  const returnedQuestion=engine.translate({text:polishQuestion.text,from:'en',to:'pl'});
  assert.equal(returnedQuestion.interlingua.type,'question');
  assert.equal(clauseOf(returnedQuestion.interlingua).features.polarity,'negative');
  assert.equal(clauseOf(returnedQuestion.interlingua).roles.agent.agreement.person,'second');
});

test('PERS-05 English lexicon and morphology retain read/read/reads forms',()=>{
  const read=en.verbs.find(verb=>verb.id==='en.read.1');
  assert.equal(read.forms.base,'read');
  assert.equal(read.forms.present3sg,'reads');
  assert.deepEqual(enMorph.generate({lexemeId:'en.read.1',features:{mood:'indicative'}})
    .map(form=>form.text),['read']);
  assert.deepEqual(enMorph.generate({lexemeId:'en.read.1',features:{
    tense:'present',person:'third',number:'singular'
  }}).map(form=>form.text),['reads']);
});
