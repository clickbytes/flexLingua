import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,pg,eg,pm,em,mf,gold]=await Promise.all([
 'data/concepts.json','data/features.json','data/pl.json','data/en.json',
 'data/grammar/pl.json','data/grammar/en.json','data/morphology/pl.json',
 'data/morphology/en.json','data/morphology/features.json',
 'tests/fixtures/gold-movement-a1.json'
].map(load));
const core=createCoreLanguage(ontology);
const morphPl=createMorphology(pm,pl,mf,{core}),morphEn=createMorphology(em,en,mf,{core});
const make=(productive=false)=>{
 const engine=new Engine(ontology,features);
 if(productive)engine.registerMorphology(morphPl).registerMorphology(morphEn);
 return engine.registerLanguage(createRuleAdapter(pl,pg,productive?{morphology:morphPl}:{}))
   .registerLanguage(createRuleAdapter(en,eg,productive?{morphology:morphEn}:{}));
};
function check(engine,from,to,rows){
 for(const row of rows){
  const result=engine.translate({from,to,text:row.input});
  assert.equal(result.text,row.expected,row.id);
  const n=result.interlingua.type==='question'?result.interlingua.proposition:result.interlingua;
  assert.equal(n.concept,'event.movement',row.id);
  assert.deepEqual(Object.keys(n.roles),['agent'],row.id);
  assert.equal(n.roles.agent.concept,row.agent,row.id);
  assert.equal(n.features.tense,row.tense,row.id);
  assert.equal(n.features.polarity,row.polarity,row.id);
  const read=engine.analyze({from:to,text:result.text});
  const reverse=read.type==='question'?read.proposition:read;
  assert.equal(reverse.concept,row.concept,row.id);
  assert.equal(reverse.roles.agent.concept,row.agent,row.id);
  assert.equal(reverse.features.tense,row.tense,row.id);
  assert.equal(reverse.features.polarity,row.polarity,row.id);
  assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),result.interlingua);
 }
}

test('A1 Batch 5: original bilingual movement gold via normal grammar',()=>{
 assert.equal(gold.enToPl.length,9);
 assert.equal(gold.plToEn.length,9);
 check(make(),'en','pl',gold.enToPl);
 check(make(),'pl','en',gold.plToEn);
});
test('A1 Batch 5: same oracle via productive PL/EN morphology',()=>{
 check(make(true),'en','pl',gold.enToPl);
 check(make(true),'pl','en',gold.plToEn);
});
test('A1 Batch 5: irregular go/iść morphology and inverse readings',()=>{
 assert.equal(gold.morphology.length,11);
 for(const row of gold.morphology){
  const morphology=row.language==='pl'?morphPl:morphEn;
  assert.ok(morphology.generate({lexemeId:row.lexemeId,features:row.features})
    .some(x=>x.text===row.text),row.text);
  assert.ok(morphology.analyze({text:row.text})
    .some(x=>x.lexemeId===row.lexemeId),row.text);
 }
});
test('A1 Batch 5: fail closed on agreement errors and incomplete destination phrases',()=>{
 assert.equal(gold.invalid.length,4);
 for(const row of gold.invalid){
  const output=make(true).tryTranslate({text:row.input,from:row.from,
    to:row.from==='pl'?'en':'pl'});
  assert.equal(output.ok,false,row.input);
 }
 assert.deepEqual(ontology.concepts['event.movement'].roles,['agent']);
 assert.deepEqual(pg.frames['event.movement'].linearizations,[['agent','@verb']]);
 assert.equal(gold.license,'project-authored');
});
