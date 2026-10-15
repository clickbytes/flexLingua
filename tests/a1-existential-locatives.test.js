import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,enMorphSpec,plMorphSpec,morphFeatures,gold]=
  await Promise.all([
    'data/concepts.json','data/features.json','data/en.json','data/pl.json',
    'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json',
    'data/morphology/pl.json','data/morphology/features.json',
    'tests/fixtures/gold-a1-existential-locatives.json'
  ].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));

function locationSignature(node) {
  return {
    version:node.version,type:node.type,kind:node.kind,
    roles:Object.fromEntries(Object.entries(node.roles).map(([role,ref])=>[
      role,{concept:ref.concept,number:ref.features.number}
    ])),
    features:node.features,relation:node.relation
  };
}

test('A1-ENPL-04 preserves location CORE across existential and ordinary locative order',()=>{
  assert.equal(gold.license,'project-authored');
  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]) {
    for(const row of rows) {
      const output=engine.translate({from,to,text:row.input});
      assert.equal(output.text,row.expected,row.id+' target surface');
      assert.deepEqual(output.interlingua,row.core,row.id+' translated CORE');
      assert.deepEqual(engine.analyze({from,text:row.input}),row.core,row.id+' source CORE');
      assert.deepEqual(locationSignature(engine.analyze({from:to,text:row.expected})),
        locationSignature(row.core),row.id+' target CORE');
      const serialized=engine.realize({interlingua:row.core,to:'core'}).text;
      assert.deepEqual(engine.analyze({from:'core',text:serialized}),row.core,
        row.id+' CORE JSON round trip');
    }
  }
});

test('A1-ENPL-04 explicitly refuses existential forms beyond its declared scope',()=>{
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(result.ok,false,row.id+' should be refused');
  }
});

test('A1-ENPL-04 validates existential markers and tense declarations',()=>{
  const invalid=structuredClone(enGrammar);
  delete invalid.states.frames.location.existentialMarker;
  assert.throws(()=>createRuleAdapter(en,invalid),/Invalid location state frame/);
});
