import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createDiscourse,materializeEvent,validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,enMorphSpec,plMorphSpec,morphFeatures,gold]=
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

test('GEN-01 keeps event-local day, clock and date through discourse translation and CORE',()=>{
  for(const row of gold.cases) {
    const output=engine.translate({from:row.from,to:row.to,text:row.input});
    assert.equal(output.text,row.expected,row.id+' surface');
    assert.deepEqual(output.interlingua.events.map(temporal),row.expectedEvents,row.id+' source CORE');
    const target=engine.analyze({from:row.to,text:row.expected});
    assert.deepEqual(target.events.map(temporal),row.expectedEvents,row.id+' target CORE');
    const serialized=engine.realize({interlingua:output.interlingua,to:'core'}).text;
    assert.deepEqual(engine.analyze({from:'core',text:serialized}),output.interlingua,row.id+' CORE round trip');
  }
});

test('GEN-01 discourse projection rejects foreign fields and does not mutate events',()=>{
  const first=engine.analyze({from:'en',text:'The girl sees the dog at 07:05.'});
  const second=engine.analyze({from:'en',text:'The boy sees the cat on 2025-01-01.'});
  const before=structuredClone([first,second]);
  const discourse=createDiscourse([first,second]);
  validateInterlingua(discourse,engine.ontology,engine.features);
  assert.deepEqual([first,second],before);
  assert.deepEqual(temporal(materializeEvent(discourse,discourse.events[0])),temporal(first));
  assert.deepEqual(temporal(materializeEvent(discourse,discourse.events[1])),temporal(second));
  assert.throws(()=>createDiscourse([{...first,foreign:true},second]),/unsupported fields/);
});
