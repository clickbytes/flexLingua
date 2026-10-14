import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createLexicon} from '../js/core/lexicon.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('F3: distinct CORE meanings and bilingual controlled translations',()=>{
  const e=engine();
  for(const [input,expected,concept]of [
    ['The girl looks for the dog.','Dziewczynka szuka psa.','event.search'],
    ['The girl listens to the boy.','Dziewczynka słucha chłopca.','event.auditory_attention'],
    ['The girl waits for the boy.','Dziewczynka czeka na chłopca.','event.wait_for_entity']
  ]){
    const translation=e.translate({from:'en',to:'pl',text:input});
    assert.equal(translation.text,expected);
    assert.equal(translation.interlingua.concept,concept);
    const back=e.analyze({text:expected,from:'pl'});
    assert.equal(back.concept,concept);
    assert.deepEqual(e.analyze({from:'core',text:JSON.stringify(translation.interlingua)}),
      translation.interlingua);
  }
  assert.notEqual(e.analyze({from:'en',text:'The girl looks at the dog.'}).concept,
    e.analyze({from:'en',text:'The girl looks for the dog.'}).concept);
});

test('F3: Polish case governance distinguishes lexical genitive from prepositions',()=>{
  const e=engine();
  for(const [input,expected]of [
    ['The girl does not look for the dog.','Dziewczynka nie szuka psa.'],
    ['The girl does not listen to the boy.','Dziewczynka nie słucha chłopca.'],
    ['The girl does not wait for the boy.','Dziewczynka nie czeka na chłopca.']
  ]) {
    const translated=e.translate({text:input,from:'en',to:'pl'});
    assert.equal(translated.text,expected);
    assert.equal(translated.interlingua.features.polarity,'negative');
    assert.equal(e.analyze({text:expected,from:'pl'}).features.polarity,'negative');
  }
});

test('F3: compositional WH questions preserve an unfilled theme role',()=>{
  const e=engine();
  for(const [input,expected,concept]of [
    ['What does the girl look for?','Czego szuka dziewczynka?','event.search'],
    ['What does the girl listen to?','Czego słucha dziewczynka?','event.auditory_attention'],
    ['What does the girl wait for?','Na co czeka dziewczynka?','event.wait_for_entity'],
    ['What did the girl wait for?','Na co czekała dziewczynka?','event.wait_for_entity'],
    ['What does the girl not wait for?','Na co nie czeka dziewczynka?','event.wait_for_entity']
  ]) {
    const result=e.translate({text:input,from:'en',to:'pl'});
    assert.equal(result.text,expected,input);
    assert.equal(result.interlingua.type,'question');
    assert.equal(result.interlingua.questionType,'wh');
    assert.equal(result.interlingua.targetRole,'theme');
    assert.equal(result.interlingua.proposition.concept,concept);
    assert.equal(Object.hasOwn(result.interlingua.proposition.roles,'theme'),false);
    const restored=e.analyze({text:result.text,from:'pl'});
    assert.equal(restored.proposition.concept,concept);
    assert.equal(restored.proposition.features.polarity,result.interlingua.proposition.features.polarity);
  }
});

test('F3: ability modality applies compositionally to newly defined meanings',()=>{
  const e=engine();
  for(const [input,expected,concept]of [
    ['The girl can look for the dog.','Dziewczynka może szukać psa.','event.search'],
    ['The girl can wait for the boy.','Dziewczynka może czekać na chłopca.','event.wait_for_entity'],
    ['What can the girl wait for?','Na co może czekać dziewczynka?','event.wait_for_entity']
  ]) {
    const result=e.translate({text:input,from:'en',to:'pl'});
    assert.equal(result.text,expected);
    const modal=result.interlingua.type==='question'?result.interlingua.proposition:result.interlingua;
    assert.equal(modal.operator,'modality.ability');
    assert.equal(modal.operand.concept,concept);
    assert.equal(e.analyze({text:expected,from:'pl'}).type,result.interlingua.type);
  }
});

test('F3: invalid particle placement and unlicensed questions fail explicitly',()=>{
  const e=engine();
  for(const [from,input]of [
    ['en','The girl looks the dog for.'],
    ['en','The girl waits the boy.'],
    ['en','What does the girl wait?'],
    ['pl','Dziewczynka czeka chłopca.'],
    ['pl','Czego czeka dziewczynka?'],
    ['pl','Na co szuka dziewczynka?'],
    ['pl','Co słucha dziewczynka?']
  ]) {
    assert.equal(e.tryTranslate({text:input,from,to:from==='en'?'pl':'en'}).ok,false,input);
  }
});

test('F3: canonical lexemes and concepts validate without direct word-pair mappings',()=>{
  const core=createCoreLanguage(concepts);
  const eni=createLexicon(en,{strict:true}),pli=createLexicon(pl,{strict:true});
  assert.equal(eni.validateCore(core),true);
  assert.equal(pli.validateCore(core),true);
  for(const [enLemma,plLemma,concept]of [
    ['look for','szukać','event.search'],
    ['listen to','słuchać','event.auditory_attention'],
    ['wait for','czekać na','event.wait_for_entity']
  ]) {
    assert.equal(eni.lookup(enLemma)[0].senses[0].coreRef.id,concept);
    assert.equal(pli.lookup(plLemma)[0].senses[0].coreRef.id,concept);
    assert.equal(core.resolve({kind:'concept',id:concept}).type,'event');
  }
});
