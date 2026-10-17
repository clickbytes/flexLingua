import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,enMorphSpec,plMorphSpec,morphFeatures,gold]=
  await Promise.all(['data/concepts.json','data/features.json','data/en.json','data/pl.json',
    'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json','data/morphology/pl.json',
    'data/morphology/features.json','tests/fixtures/gold-a1-enpl-composition-v2.json'].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
const engine=new Engine(concepts,features).registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));

const proposition=node=>node.type==='question'?node.proposition:node;
const conceptsIn=node=>Object.values(node.roles).map(ref=>ref.concept ??
  (ref.referent?.kind==='anaphoric'?'anaphoric-third-person':
    ref.referent?.anchor==='speaker'?'speaker':ref.referent?.anchor==='demonstrative'?'deictic.proximal':null));

test('A1 EN-PL composition v2 preserves the declared semantic dimensions',()=>{
  for(const row of gold.cases) {
    const output=engine.translate({from:row.from,to:row.to,text:row.input});
    assert.equal(output.text,row.expected,row.id+' target surface');
    const clause=proposition(output.interlingua),shape=row.shape;
    assert.equal(output.interlingua.type,shape.type,row.id+' wrapper type');
    assert.equal(clause.kind??clause.concept,shape.kind??shape.concept,row.id+' CORE kind');
    assert.equal(clause.features.polarity,shape.polarity,row.id+' polarity');
    if(shape.aspect)assert.equal(clause.features.aspect,shape.aspect,row.id+' aspect');
    if(shape.relation)assert.equal(clause.relation,shape.relation,row.id+' relation');
    if(shape.questionType)assert.equal(output.interlingua.questionType,shape.questionType,row.id+' question');
    assert.deepEqual(conceptsIn(clause),shape.roleConcepts,row.id+' semantic roles');
  }
});

test('A1 EN-PL composition v2 keeps unsupported combinations explicit',()=>{
  for(const row of gold.unsupported) {
    const result=engine.tryTranslate({from:row.from,to:row.to,text:row.input});
    assert.equal(result.ok,false,row.id);
  }
});
