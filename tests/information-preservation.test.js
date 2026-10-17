import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,enMorphSpec,plMorphSpec,morphFeatures,timeGold]=
  await Promise.all(['data/concepts.json','data/features.json','data/en.json','data/pl.json',
    'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json','data/morphology/pl.json',
    'data/morphology/features.json','tests/fixtures/gold-gen01-discourse-time.json'].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
const engine=new Engine(concepts,features).registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));
const temporal=event=>Object.fromEntries(['timeReference','clockTime','calendarDate']
  .filter(key=>Object.hasOwn(event,key)).map(key=>[key,event[key]]));

test('EN → PL marks known definiteness neutralized by Polish while retaining source CORE',()=>{
  const result=engine.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  assert.equal(result.text,'Dziewczynka widzi psa.');
  assert.equal(result.interlingua.roles.agent.features.definiteness,'definite');
  assert.equal(result.interlingua.roles.theme.features.definiteness,'definite');
  assert.deepEqual(result.informationLoss,[
    {path:'#/roles/agent/features/definiteness',feature:'definiteness',
      cause:'target-grammar-does-not-mark-definiteness',status:'unavoidable'},
    {path:'#/roles/theme/features/definiteness',feature:'definiteness',
      cause:'target-grammar-does-not-mark-definiteness',status:'unavoidable'}
  ]);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.alternatives));
});

test('PL → EN marks unknown definiteness as ambiguous while retaining warning and alternatives',()=>{
  const result=engine.translate({text:'Siostra widziała kota.',from:'pl',to:'en'});
  assert.equal(result.text,'A sister saw a cat.');
  assert.equal(result.interlingua.roles.agent.features.definiteness,'unknown');
  assert.equal(result.interlingua.roles.theme.features.definiteness,'unknown');
  assert.deepEqual(result.informationLoss,[
    {path:'#/roles/agent/features/definiteness',feature:'definiteness',
      cause:'source-definiteness-unspecified-target-default',status:'ambiguous'},
    {path:'#/roles/theme/features/definiteness',feature:'definiteness',
      cause:'source-definiteness-unspecified-target-default',status:'ambiguous'},
    {path:'#/features/aspect',feature:'aspect',
      cause:'target-grammar-does-not-encode-aspect',status:'unavoidable'}
  ]);
  assert.ok(result.warnings.some(warning=>warning.includes('definiteness')));
  assert.ok(result.alternatives.length>0);
});

test('PL aspect omitted by English is reported on the exact CORE feature path',()=>{
  const result=engine.translate({text:'Dziewczynka widzi psa.',from:'pl',to:'en'});
  assert.equal(result.interlingua.features.aspect,'imperfective');
  assert.ok(result.informationLoss.some(item=>item.path==='#/features/aspect' &&
    item.feature==='aspect' && item.cause==='target-grammar-does-not-encode-aspect' &&
    item.status==='unavoidable'));
});

test('discourse keeps event-local dates separate and does not report them as lost',()=>{
  const row=timeGold.cases.find(item=>item.id==='GEN01-EN-DATE');
  const result=engine.translate({text:row.input,from:row.from,to:row.to});
  assert.equal(result.text,row.expected);
  assert.deepEqual(result.interlingua.events.map(temporal),row.expectedEvents);
  assert.deepEqual(engine.analyze({text:row.expected,from:row.to}).events.map(temporal),
    row.expectedEvents);
  assert.ok(result.informationLoss.every(item=>
    !['timeReference','clockTime','calendarDate'].includes(item.feature)));
  assert.ok(result.informationLoss.some(item=>item.path.startsWith('#/events/0/')));
  assert.ok(result.informationLoss.some(item=>item.path.startsWith('#/events/1/')));
});

test('unsupported CORE role and unknown semantic field remain refusals',()=>{
  const meaning=engine.analyze({text:'The girl sees the dog.',from:'en'});
  const withUnknownRole={...meaning,roles:{...meaning.roles,instrument:meaning.roles.theme}};
  const unknownRole=engine.tryTranslate({text:JSON.stringify(withUnknownRole),from:'core',to:'pl'});
  assert.equal(unknownRole.ok,false);
  assert.equal(Object.hasOwn(unknownRole,'value'),false);

  const withUnknownField={...meaning,foreignMeaning:true};
  const unknownField=engine.tryTranslate({text:JSON.stringify(withUnknownField),from:'core',to:'pl'});
  assert.equal(unknownField.ok,false);
  assert.equal(Object.hasOwn(unknownField,'value'),false);
});
