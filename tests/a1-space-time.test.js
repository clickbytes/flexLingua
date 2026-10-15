import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {verifyEvidenceFixture} from '../tools/a1-evidence-ledger-lib.mjs';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const load=async path=>JSON.parse(await read(path));
const [ontology,features,pl,en,pg,eg,pm,em,mf,goldText]=await Promise.all([
  'data/concepts.json','data/features.json','data/pl.json','data/en.json',
  'data/grammar/pl.json','data/grammar/en.json','data/morphology/pl.json',
  'data/morphology/en.json','data/morphology/features.json'
].map(load).concat([read('tests/fixtures/gold-space-time-a1.json')]));
const coreLanguage=createCoreLanguage(ontology);
const morphPl=createMorphology(pm,pl,mf,{core:coreLanguage});
const morphEn=createMorphology(em,en,mf,{core:coreLanguage});
const engine=new Engine(ontology,features)
  .registerMorphology(morphPl).registerMorphology(morphEn)
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:morphPl}))
  .registerLanguage(createRuleAdapter(en,eg,{morphology:morphEn}));
const gold=JSON.parse(goldText);

function signature(node) {
  const roles=Object.fromEntries(Object.entries(node.roles).map(([key,ref])=>[key,{
    concept:ref.concept,number:ref.features.number,
    ...(ref.quantifier?{quantifier:ref.quantifier}:{})
  }]));
  return {
    type:node.type,
    ...(node.kind?{kind:node.kind}:{}),
    ...(node.concept?{concept:node.concept}:{}),
    ...(node.relation?{relation:node.relation}:{}),
    roles,
    features:{tense:node.features.tense,polarity:node.features.polarity},
    ...(node.timeReference?{timeReference:node.timeReference}:{}),
    ...(node.clockTime?{clockTime:node.clockTime}:{}),
    ...(node.calendarDate?{calendarDate:node.calendarDate}:{})
  };
}

test('SPACE-06: frozen project-authored sample covers four bilingual subcategories',()=>{
  assert.equal(gold.schemaVersion,1);
  assert.equal(gold.license,'project-authored');
  assert.equal(verifyEvidenceFixture('spacetime',goldText),
    '03a6ff2530977242b8becd6c9c18ae07b3a986e8d5508672980aea2f3ca17357');
  assert.equal(gold.pairs.length,32);
  const counts=Object.fromEntries(['direction','location','time','quantity'].map(category=>[
    category,gold.pairs.filter(pair=>pair.category===category).length
  ]));
  assert.deepEqual(counts,{direction:8,location:8,time:8,quantity:8});
  assert.equal(gold.pairs.length*2,64);
  for(const pair of gold.pairs)for(const [from,to,input,expected] of [
    ['en','pl',pair.en,pair.pl],['pl','en',pair.pl,pair.en]
  ]) {
    const source=engine.analyze({from,text:input});
    assert.deepEqual(signature(source),pair.core,`${pair.id} ${from} CORE`);
    const translated=engine.translate({from,to,text:input});
    assert.equal(translated.text,expected,`${pair.id} ${from}->${to} surface`);
    assert.deepEqual(signature(translated.interlingua),pair.core,`${pair.id} translated CORE`);
    const target=engine.analyze({from:to,text:expected});
    assert.deepEqual(signature(target),pair.core,`${pair.id} target CORE`);
    const serialized=engine.realize({to:'core',interlingua:translated.interlingua}).text;
    assert.deepEqual(engine.analyze({from:'core',text:serialized}),translated.interlingua,
      `${pair.id} CORE JSON roundtrip`);
  }
});

test('SPACE-06: unsupported spatial, temporal, and quantity constructions refuse',()=>{
  assert.equal(gold.unsupported.length,9);
  for(const row of gold.unsupported) {
    const translated=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(translated.ok,false,row.id);
  }
  const valid=engine.translate({from:'en',to:'core',text:'Five girls see a dog.'}).interlingua;
  const invalid=structuredClone(valid);
  invalid.roles.agent.quantifier.value=21;
  assert.throws(()=>engine.analyze({from:'core',text:JSON.stringify(invalid)}),/quantifier/u);
});
