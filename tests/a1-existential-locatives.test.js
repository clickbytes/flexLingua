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

const proposition=node=>node.type==='question'?node.proposition:node;
const semanticSignature=node=>{
  const value=proposition(node);
  return {type:node.type,questionType:node.questionType,
    proposition:{version:value.version,type:value.type,kind:value.kind,
      roles:Object.fromEntries(Object.entries(value.roles).map(([role,ref])=>[
        role,{concept:ref.concept,number:ref.features.number}
      ])),features:value.features,relation:value.relation}};
};

test('A1-ENPL-12 preserves typed existence and ordinary location separately',()=>{
  assert.equal(gold.license,'project-authored');
  for(const row of gold.translations) {
    const output=engine.translate({from:row.from,to:row.to,text:row.input});
    assert.equal(output.text,row.expected,row.id+' target surface');
    assert.deepEqual(output.interlingua,row.core,row.id+' translated CORE');
    assert.deepEqual(engine.analyze({from:row.from,text:row.input}),row.core,row.id+' source CORE');
    assert.deepEqual(semanticSignature(engine.analyze({from:row.to,text:row.expected})),
      semanticSignature(row.core),row.id+' target CORE');
    const serialized=engine.realize({interlingua:row.core,to:'core'}).text;
    assert.deepEqual(engine.analyze({from:'core',text:serialized}),row.core,
      row.id+' CORE JSON round trip');
  }
  const existence=proposition(gold.translations.find(row=>row.id==='A1-ENPL-12-EN-NEG-01').core);
  const location=proposition(gold.translations.find(row=>row.id==='A1-ENPL-12-EN-LOC-NEG-01').core);
  assert.notEqual(existence.kind,location.kind);
  assert.notDeepEqual(existence.roles,location.roles);
});

test('A1-ENPL-12 refuses tense, agreement and relation outside the contract',()=>{
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(result.ok,false,row.id+' should be refused');
  }
});

test('A1-ENPL-12 grammar validation fails closed for replacement forms',()=>{
  const invalid=structuredClone(enGrammar);
  invalid.states.frames.existence.negativeVerbForms.singular='';
  assert.throws(()=>createRuleAdapter(en,invalid),/Invalid existence state frame/);
});
