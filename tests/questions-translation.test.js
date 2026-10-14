import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,plGrammar,enGrammar,gold,morphFeatures,plMorphData,enMorphData]=
  await Promise.all([
    'data/concepts.json','data/features.json','data/pl.json','data/en.json',
    'data/grammar/pl.json','data/grammar/en.json',
    'tests/fixtures/gold-questions-v1.19.json','data/morphology/features.json',
    'data/morphology/pl.json','data/morphology/en.json'
  ].map(read));

const plain=()=>new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));

const withMorphology=()=>{
  const core=createCoreLanguage(ontology);
  const plMorph=createMorphology(plMorphData,pl,morphFeatures,{core});
  const enMorph=createMorphology(enMorphData,en,morphFeatures,{core});
  return new Engine(ontology,features).registerMorphology(plMorph).registerMorphology(enMorph)
    .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}))
    .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}));
};

function verifyGold(engine,row,from,to){
  const result=engine.translate({text:row.input,from,to});
  assert.equal(result.text,row.output,row.input);
  assert.equal(result.interlingua.type,'question');
  assert.equal(result.interlingua.questionType,row.kind);
  assert.equal(result.interlingua.proposition.features.tense,row.tense);
  assert.equal(result.interlingua.proposition.features.polarity,row.polarity);
  if(row.kind==='wh'){
    assert.equal(result.interlingua.targetRole,row.role);
    assert.equal(Object.hasOwn(result.interlingua.proposition.roles,row.role),false);
  }else{
    assert.equal(Object.hasOwn(result.interlingua,'targetRole'),false);
  }
  if(row.alternative) assert.ok(result.alternatives.includes(row.alternative));
  const restored=engine.analyze({text:result.text,from:to});
  assert.equal(restored.questionType,row.kind);
  assert.equal(restored.targetRole,row.role);
  assert.equal(restored.proposition.concept,result.interlingua.proposition.concept);
  assert.equal(restored.proposition.features.tense,row.tense);
  assert.equal(restored.proposition.features.polarity,row.polarity);
}

test('v1.19: independent EN→PL and PL→EN question corpus, with semantic round-trips',()=>{
  const engine=plain();
  assert.equal(gold.enToPl.length,12);
  assert.equal(gold.plToEn.length,10);
  for(const row of gold.enToPl)verifyGold(engine,row,'en','pl');
  for(const row of gold.plToEn)verifyGold(engine,row,'pl','en');
});

test('v1.19: questions also work with productive PL/EN morphology registered',()=>{
  const engine=withMorphology();
  for(const row of [
    gold.enToPl[0],gold.enToPl[5],gold.enToPl[9],
    gold.plToEn[0],gold.plToEn[4],gold.plToEn[8]
  ]){
    verifyGold(engine,row,gold.enToPl.includes(row)?'en':'pl',
      gold.enToPl.includes(row)?'pl':'en');
  }
});

test('v1.19: case alternation distinguishes Polish co and czego',()=>{
  const engine=plain();
  const affirmative=engine.analyze({text:'Co widzi dziewczynka?',from:'pl'});
  const negative=engine.analyze({text:'Czego nie widzi dziewczynka?',from:'pl'});
  assert.equal(affirmative.targetRole,'theme');
  assert.equal(negative.targetRole,'theme');
  assert.equal(affirmative.proposition.features.polarity,'positive');
  assert.equal(negative.proposition.features.polarity,'negative');
  assert.deepEqual(Object.keys(negative.proposition.roles),['agent']);
  assert.equal(engine.translate({text:'What does the girl not see?',from:'en',to:'pl'}).text,
    'Czego nie widzi dziewczynka?');
});

test('v1.19: Polish grammatical unknown definiteness is preserved as English variants',()=>{
  const engine=plain();
  const result=engine.translate({text:'Co widzi dziewczynka?',from:'pl',to:'en'});
  assert.equal(result.interlingua.proposition.roles.agent.features.definiteness,'unknown');
  assert.equal(result.text,'What does a girl see?');
  assert.ok(result.alternatives.includes('What does the girl see?'));
  assert.match(result.warnings.join(' '),/definiteness/i);
});

test('v1.19: sense ambiguity persists through question syntax',()=>{
  const engine=plain();
  const readings=engine.translate({text:'Does the girl see a bank?',from:'en',to:'pl'});
  assert.equal(readings.interlingua.proposition.roles.theme.concept,'place.financial_institution');
  assert.equal(readings.semanticAlternatives.length,1);
  assert.equal(readings.semanticAlternatives[0].interlingua.proposition.roles.theme.concept,
    'place.riverbank');
});

test('v1.19: malformed source questions are rejected explicitly',()=>{
  const engine=plain();
  for(const row of gold.invalid){
    const outcome=engine.tryTranslate({text:row.text,from:row.language,
      to:row.language==='en'?'pl':'en'});
    assert.equal(outcome.ok,false,row.text);
    assert.equal(typeof outcome.error.message,'string');
  }
  assert.throws(()=>engine.analyze({from:'en',text:'Where does the girl see the dog?'}),
    /Unsupported question construction/);
});

test('v1.19: grammar configuration rejects unsafe or incompatible interrogative rules',()=>{
  let altered=structuredClone(enGrammar);
  altered.questions.wh.agent.marker='<script>';
  assert.throws(()=>createRuleAdapter(en,altered),/interrogative grammar/i);
  altered=structuredClone(enGrammar);
  altered.questions.yesNo.auxiliaries.presentSingular='did';
  assert.throws(()=>createRuleAdapter(en,altered),/auxiliary question grammar/i);
  altered=structuredClone(plGrammar);
  altered.questions.wh.agent.agreement.number='triple';
  assert.throws(()=>new Engine(ontology,features)
    .registerLanguage(createRuleAdapter(pl,altered)),/subject-gap agreement/i);
});

test('v1.19: direct language adapter API also accepts controlled questions',()=>{
  const engine=plain();
  const enAdapter=engine.language('en');
  const plAdapter=engine.language('pl');
  const meaning=enAdapter.analyze('Does the girl see the dog?');
  assert.equal(meaning.type,'question');
  assert.equal(enAdapter.realize(meaning).text,'Does the girl see the dog?');
  assert.equal(plAdapter.realize(meaning).text,'Czy dziewczynka widzi psa?');
  const plMeaning=plAdapter.analyze('Kto widzi psa?');
  assert.equal(plMeaning.questionType,'wh');
  assert.equal(plMeaning.targetRole,'agent');
});

test('v1.19: questions do not change declarative regressions or enable unrestricted grammar',()=>{
  const engine=plain();
  assert.equal(engine.translate({text:'The girl saw the dog.',from:'en',to:'pl'}).text,
    'Dziewczynka widziała psa.');
  assert.equal(engine.translate({text:'Dziewczynka widziała psa.',from:'pl',to:'en'}).text,
    'A girl saw a dog.');
  const result=engine.tryTranslate({from:'en',to:'pl',
    text:'How does the girl see the dog?'});
  assert.equal(result.ok,false);
});
