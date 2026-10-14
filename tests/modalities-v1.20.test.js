import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {MODALITY_VERSION,createModality,createNegation,createEvent,createQuestion,
  participant,validateInterlingua} from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,pl,en,pg,eg,gold,morphFeatures,pm,em]=await Promise.all([
  'data/concepts.json','data/features.json','data/pl.json','data/en.json',
  'data/grammar/pl.json','data/grammar/en.json',
  'tests/fixtures/gold-modality-v1.20.json','data/morphology/features.json',
  'data/morphology/pl.json','data/morphology/en.json'
].map(read));

function setup(productive=false) {
  const engine=new Engine(concepts,features);
  if(productive){
    const core=createCoreLanguage(concepts);
    const morphPl=createMorphology(pm,pl,morphFeatures,{core});
    const morphEn=createMorphology(em,en,morphFeatures,{core});
    engine.registerMorphology(morphPl).registerMorphology(morphEn);
    return engine.registerLanguage(createRuleAdapter(pl,pg,{morphology:morphPl}))
      .registerLanguage(createRuleAdapter(en,eg,{morphology:morphEn}));
  }
  return engine.registerLanguage(createRuleAdapter(pl,pg))
    .registerLanguage(createRuleAdapter(en,eg));
}
const contentOf=node=>node?.type==='question'?contentOf(node.proposition):
  node?.type==='scope'?contentOf(node.operand):
  node?.type==='modality'?contentOf(node.operand):node;
const partsOf=node=>{
  const n=node?.type==='question'?node.proposition:node;
  if(n?.type==='scope')return {mode:'negative',modal:n.operand};
  if(n?.type==='modality')
    return {mode:n.operand.type==='scope'?'prohibition':'positive',modal:n};
  throw new Error('Not a modal semantic document.');
};

function verify(engine,row,from,to) {
  const output=engine.translate({text:row.input,from,to});
  assert.equal(output.text,row.output,row.input);
  const outer=output.interlingua;
  const {modal,mode}=partsOf(outer);
  assert.equal(modal.version,MODALITY_VERSION);
  assert.equal(mode,row.mode);
  assert.equal(modal.operator,row.operator);
  assert.equal(contentOf(outer).concept,'event.visual_perception');
  assert.equal(contentOf(outer).features.tense,'present');
  assert.equal(contentOf(outer).features.polarity,'positive');
  if(row.question){
    assert.equal(outer.questionType,row.question);
    if(row.role) {
      assert.equal(outer.targetRole,row.role);
      assert.equal(Object.hasOwn(contentOf(outer).roles,row.role),false);
    }
  }
  const restored=engine.analyze({text:output.text,from:to});
  assert.equal(partsOf(restored).modal.operator,row.operator);
  assert.equal(partsOf(restored).mode,row.mode);
  assert.equal(contentOf(restored).concept,contentOf(outer).concept);
  assert.deepEqual(Object.keys(contentOf(restored).roles).sort(),
    Object.keys(contentOf(outer).roles).sort());
  const json=engine.realize({interlingua:outer,to:'core'}).text;
  assert.deepEqual(engine.analyze({text:json,from:'core'}),outer);
}

test('Batch C: 17 independent bilingual modal translations with semantic round trips',()=>{
  const engine=setup();
  assert.equal(gold.enToPl.length,9);
  assert.equal(gold.plToEn.length,8);
  for(const row of gold.enToPl)verify(engine,row,'en','pl');
  for(const row of gold.plToEn)verify(engine,row,'pl','en');
});

test('Batch C: modal vocabulary resolves in the CORE operator registry',()=>{
  const engine=setup();
  for(const [language,lemma,operator] of [
    ['en','can','modality.ability'],['en','must','modality.obligation'],
    ['pl','móc','modality.ability'],['pl','musieć','modality.obligation']
  ]){
    const lex=engine.lookupLexemes({language,lemma});
    assert.equal(lex.length,1);
    assert.equal(lex[0].category,'modals');
    assert.equal(lex[0].senses[0].coreRef.id,operator);
    assert.equal(engine.resolveCoreRef({kind:'operator',id:operator}).arity,1);
  }
  assert.equal(engine.capabilities().modalityDocumentVersion,MODALITY_VERSION);
});

test('Batch C: necessity, absence of duty and prohibition have distinct semantic scope',()=>{
  const engine=setup();
  const must=engine.analyze({text:'The girl must see the dog.',from:'en'});
  const notRequired=engine.analyze({text:'The girl does not have to see the dog.',from:'en'});
  const forbidden=engine.analyze({text:'The girl must not see the dog.',from:'en'});
  assert.equal(must.type,'modality');
  assert.equal(notRequired.type,'scope');
  assert.equal(notRequired.operand.type,'modality');
  assert.equal(forbidden.type,'modality');
  assert.equal(forbidden.operand.type,'scope');
  assert.notDeepEqual(forbidden,notRequired);
  assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(forbidden)}),forbidden);
  assert.equal(engine.realize({interlingua:forbidden,to:'en'}).text,
    'The girl must not see the dog.');
  assert.throws(()=>engine.realize({interlingua:forbidden,to:'pl'}),/prohibition|Unsupported/);
});

test('Batch C: bounded modal validation rejects malformed, unsupported scopes',()=>{
  const engine=setup();
  const ref=id=>participant(id,'definite');
  const event=createEvent('event.visual_perception',
    {agent:ref('person.girl'),theme:ref('animal.dog')},
    {tense:'present',polarity:'positive',aspect:'unknown'});
  const valid=doc=>validateInterlingua(doc,engine.ontology,engine.features);
  assert.doesNotThrow(()=>valid(createNegation(createModality('modality.ability',event))));
  assert.doesNotThrow(()=>valid(createModality('modality.obligation',createNegation(event))));
  assert.throws(()=>createModality('modality.fake',event),/Unsupported modality/);
  assert.throws(()=>createModality('modality.ability',createNegation(event)),/Unsupported modality/);
  assert.throws(()=>valid(createModality('modality.ability',
    {...event,features:{...event.features,tense:'past'}})),/present-tense/);
  assert.throws(()=>valid({...createModality('modality.ability',event),operator:'modality.fake'}),/modality/);
  assert.throws(()=>valid({...createModality('modality.ability',event),malicious:1}),/modality/);
  const withGap={...event,roles:{agent:ref('person.girl')}};
  const wh=createQuestion(createModality('modality.ability',withGap),
    {questionType:'wh',targetRole:'theme'});
  assert.equal(valid(wh),wh);
  assert.throws(()=>valid({...wh,targetRole:'recipient'}),/targetRole/);
  assert.throws(()=>valid({...wh,proposition:createModality('modality.ability',event)}),/gap/);
});

test('Batch C: negative cases and unknown articles are not silently rewritten',()=>{
  const engine=setup();
  const outcome=engine.translate({text:'Dziewczynka nie musi widzieć psa.',from:'pl',to:'en'});
  assert.ok(outcome.alternatives.includes('The girl does not have to see the dog.'));
  assert.ok(outcome.warnings.some(w=>/definiteness|aspect/i.test(w)));
  const fromEnglish=engine.analyze({text:'The girl cannot see the dog.',from:'en'});
  const embedded=contentOf(fromEnglish);
  assert.equal(embedded.features.polarity,'positive');
  const fromPolish=engine.analyze({text:'Dziewczynka nie może widzieć psa.',from:'pl'});
  assert.equal(contentOf(fromPolish).features.polarity,'positive');
});

test('Batch C: modal grammar accepts productive morphology and rejects unsafe forms',()=>{
  const engine=setup(true);
  for(const row of [gold.enToPl[0],gold.enToPl[5],gold.plToEn[0],gold.plToEn[5]]){
    verify(engine,row,gold.enToPl.includes(row)?'en':'pl',
      gold.enToPl.includes(row)?'pl':'en');
  }
  const bad=structuredClone(pg);
  const wrong=structuredClone(pl);
  wrong.modals[0].forms.positive.singular='!';
  assert.throws(()=>createRuleAdapter(wrong,pg),/modal lexical paradigm/);
  bad.modality.infinitivePath='__proto__';
  assert.throws(()=>createRuleAdapter(pl,bad),/modal grammar configuration/);
});

test('Batch C: unsupported modal forms fail explicitly instead of guessing',()=>{
  const engine=setup();
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({text:row.text,from:row.from,to:row.from==='pl'?'en':'pl'});
    assert.equal(result.ok,false,row.text);
  }
  assert.equal(engine.tryTranslate({text:'Can the girl not see the dog?',from:'en',to:'pl'}).ok,false);
  assert.equal(engine.tryTranslate({text:'Czy dziewczynka nie może widzieć psa?',from:'pl',to:'en'}).ok,false);
});
