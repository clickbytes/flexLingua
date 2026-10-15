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
    'tests/fixtures/gold-a1-past-state-predication.json'
  ].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));
const staticEngine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));

function signature(node) {
  return {
    kind:node.kind,predicate:node.predicate,
    roles:Object.fromEntries(Object.entries(node.roles).map(([role,ref])=>[
      role,{concept:ref.concept,number:ref.features.number}
    ])),
    tense:node.features.tense,polarity:node.features.polarity
  };
}

test('A1-ENPL-05 preserves past predication CORE and Polish agreement in both directions',()=>{
  assert.equal(gold.license,'project-authored');
  assert.equal(gold.enToPl.length,5);
  assert.equal(gold.plToEn.length,5);
  const agreementClasses=new Set();
  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]) {
    for(const row of rows) {
      const result=engine.translate({from,to,text:row.input});
      assert.equal(result.text,row.expected,row.id+' target surface');
      assert.deepEqual(signature(engine.analyze({from,text:row.input})),row.core,
        row.id+' source CORE');
      assert.deepEqual(signature(result.interlingua),row.core,row.id+' translated CORE');
      assert.deepEqual(signature(engine.analyze({from:to,text:row.expected})),row.core,
        row.id+' target CORE');
      assert.deepEqual(engine.analyze({from:'core',text:engine.realize({
        interlingua:result.interlingua,to:'core'
      }).text}),result.interlingua,row.id+' CORE round trip');
      if(to==='pl') {
        const subject=pl.nouns.find(noun=>noun.senses.some(sense=>
          sense.coreRef?.kind==='concept'&&sense.coreRef.id===row.core.roles.subject.concept));
        agreementClasses.add(row.core.roles.subject.number==='singular'
          ?subject.gender:subject.pluralClass);
      }
    }
  }
  assert.deepEqual(agreementClasses,new Set(['feminine','masculine','neuter','nonvirile','virile']));
});

test('A1-ENPL-05 refuses past negation, questions, malformed agreement, and other state kinds',()=>{
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(result.ok,false,row.id+' should be refused');
  }
});

test('A1-ENPL-05 keeps the stored-form adapter aligned with productive morphology',()=>{
  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]) {
    for(const row of rows) {
      assert.equal(staticEngine.translate({from,to,text:row.input}).text,row.expected,row.id);
    }
  }
});

test('A1-ENPL-05 rejects incomplete or widened past predication configuration',()=>{
  const missingTense=structuredClone(plGrammar);
  missingTense.states.supportedTenses=['present'];
  assert.throws(()=>createRuleAdapter(pl,missingTense,{morphology:plMorph}),/past predication state contract/);
  const unknownMode=structuredClone(plGrammar);
  unknownMode.states.pastPredication='all';
  assert.throws(()=>createRuleAdapter(pl,unknownMode,{morphology:plMorph}),/past predication state contract/);
});
