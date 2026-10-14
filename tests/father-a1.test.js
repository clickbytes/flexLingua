import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [ontology,features,pl,en,pg,eg,pm,em,mf,gold]=await Promise.all([
 'data/concepts.json','data/features.json','data/pl.json','data/en.json',
 'data/grammar/pl.json','data/grammar/en.json','data/morphology/pl.json','data/morphology/en.json',
 'data/morphology/features.json','tests/fixtures/gold-father-a1.json'
].map(load));
const core=createCoreLanguage(ontology);
const plMorph=createMorphology(pm,pl,mf,{core});
const enMorph=createMorphology(em,en,mf,{core});
const make=(productive=false)=>{
 const engine=new Engine(ontology,features);
 if(productive)engine.registerMorphology(plMorph).registerMorphology(enMorph);
 return engine.registerLanguage(createRuleAdapter(pl,pg,productive?{morphology:plMorph}:{}))
   .registerLanguage(createRuleAdapter(en,eg,productive?{morphology:enMorph}:{}));
};

function leaf(node){return node.type==='question'?node.proposition:node;}
function evaluate(engine,from,to,rows){
 for(const row of rows){
  const result=engine.translate({text:row.input,from,to});
  assert.equal(result.text,row.expected,row.id);
  const node=leaf(result.interlingua);
  assert.equal(node.concept,row.concept,row.id);
  assert.equal(node.features.tense,row.tense,row.id);
  assert.equal(node.features.polarity,row.polarity,row.id);
  if(row.agent)assert.equal(node.roles.agent.concept,row.agent,row.id);
  else assert.equal(Object.hasOwn(node.roles,'agent'),false,row.id+' WH agent gap');
  assert.equal(node.roles.theme.concept,row.theme,row.id);
  const re=leaf(engine.analyze({text:row.expected,from:to}));
  assert.equal(re.concept,row.concept,row.id+' reverse CORE');
  assert.equal(re.features.tense,row.tense,row.id+' reverse tense');
  assert.equal(re.roles.theme.concept,row.theme,row.id+' reverse theme');
  assert.deepEqual(engine.analyze({text:JSON.stringify(result.interlingua),from:'core'}),result.interlingua);
 }
}
test('A1 Batch 4: manually authored father translations preserve CORE roles',()=>{
 assert.equal(gold.enToPl.length,8);
 assert.equal(gold.plToEn.length,8);
 evaluate(make(), 'en','pl',gold.enToPl);
 evaluate(make(), 'pl','en',gold.plToEn);
});
test('A1 Batch 4: productive morphology preserves bilingual father gold',()=>{
 evaluate(make(true),'en','pl',gold.enToPl);
 evaluate(make(true),'pl','en',gold.plToEn);
});
test('A1 Batch 4: full independent father declension, and inverse lookup',()=>{
 assert.equal(gold.morphology.length,16);
 for(const row of gold.morphology){
  const morph=row.language==='pl'?plMorph:enMorph;
  assert.ok(morph.generate({lexemeId:row.lexemeId,features:row.features}).some(x=>x.text===row.text),row.text);
  assert.ok(morph.analyze({text:row.text}).some(x=>x.lexemeId===row.lexemeId),row.text);
 }
});
test('A1 Batch 4: reject invalid case, person roles and agreement',()=>{
 for(const {from,input} of gold.invalid){
  assert.equal(make(true).tryTranslate({from,to:from==='pl'?'en':'pl',text:input}).ok,false,input);
 }
 assert.equal(ontology.concepts['person.father'].parent,'person');
 assert.equal(gold.license,'project-authored');
});
