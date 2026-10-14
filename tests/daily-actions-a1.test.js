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
 'tests/fixtures/gold-daily-actions-a1.json'
].map(load));
const core=createCoreLanguage(ontology);
const pMorph=createMorphology(pm,pl,mf,{core});
const eMorph=createMorphology(em,en,mf,{core});
const make=(productive=false)=>{
 const e=new Engine(ontology,features);
 if(productive)e.registerMorphology(pMorph).registerMorphology(eMorph);
 return e.registerLanguage(createRuleAdapter(pl,pg,productive?{morphology:pMorph}:{}))
  .registerLanguage(createRuleAdapter(en,eg,productive?{morphology:eMorph}:{}));
};

function eventOf(value){return value.type==='question'?value.proposition:value;}
function expectGold(semantic,row){
 const node=eventOf(semantic);
 assert.equal(node.concept,row.concept,row.id);
 assert.equal(node.roles.agent.concept,row.agent,row.id);
 if(row.theme===null) {
  assert.equal(semantic.type,'question',row.id);
  assert.equal(semantic.questionType,'wh',row.id);
  assert.equal(semantic.targetRole,'theme',row.id);
  assert.equal(Object.hasOwn(node.roles,'theme'),false,row.id+' must keep WH theme gap');
 } else assert.equal(node.roles.theme.concept,row.theme,row.id);
 assert.equal(node.features.tense,row.tense,row.id);
 assert.equal(node.features.polarity,row.polarity,row.id);
}
function exercise(engine,rows,from,to){
 for(const row of rows){
  const value=engine.translate({text:row.input,from,to});
  assert.equal(value.text,row.expected,row.id);
  expectGold(value.interlingua,row);
  expectGold(engine.analyze({text:value.text,from:to}),row);
  assert.deepEqual(engine.analyze({text:JSON.stringify(value.interlingua),from:'core'}),value.interlingua);
 }
}

test('A1 Batch 6: original bilingual gold preserves meaning through both plain directions',()=>{
 assert.equal(gold.enToPl.length,10);
 assert.equal(gold.plToEn.length,10);
 exercise(make(),gold.enToPl,'en','pl');
 exercise(make(),gold.plToEn,'pl','en');
});
test('A1 Batch 6: productive grammar passes the same independent gold',()=>{
 exercise(make(true),gold.enToPl,'en','pl');
 exercise(make(true),gold.plToEn,'pl','en');
});
test('A1 Batch 6: productive-only window inflections work, without claiming plain support',()=>{
 assert.equal(gold.productiveOnly.length,2);
 const productive=make(true),plain=make(false);
 for(const row of gold.productiveOnly){
  const value=productive.translate({text:row.input,from:row.from,to:row.to});
  assert.equal(value.text,row.expected,row.id);
  expectGold(value.interlingua,row);
  assert.equal(eventOf(productive.analyze({text:row.expected,from:row.to})).concept,row.concept);
  assert.equal(plain.tryTranslate({text:row.input,from:row.from,to:row.to}).ok,false,row.id);
 }
});
test('A1 Batch 6: separate 15-cell morphology oracle and inverse lookup',()=>{
 assert.equal(gold.morphology.length,15);
 for(const row of gold.morphology){
  const morph=row.language==='pl'?pMorph:eMorph;
  assert.ok(morph.generate({lexemeId:row.lexemeId,features:row.features}).some(x=>x.text===row.text),row.text);
  assert.ok(morph.analyze({text:row.text}).some(x=>x.lexemeId===row.lexemeId),row.text);
 }
});
test('A1 Batch 6: unsafe theme roles, agreement and filled WH gaps fail closed',()=>{
 assert.equal(gold.invalid.length,5);
 const e=make(true);
 for(const row of gold.invalid)
  assert.equal(e.tryTranslate({text:row.input,from:row.from,to:row.from==='pl'?'en':'pl'}).ok,false,row.input);
 const invalid={version:'0.2',type:'event',concept:'event.open',
  roles:{agent:{concept:'person.father',features:{number:'singular',definiteness:'unknown'}},
   theme:{concept:'person.sister',features:{number:'singular',definiteness:'unknown'}}},
  features:{tense:'present',polarity:'positive',aspect:'unknown'}};
 assert.equal(e.tryTranslate({text:JSON.stringify(invalid),from:'core',to:'en'}).ok,false);
});
test('A1 Batch 6: distinct write/open meanings and independently mutable oracle',()=>{
 const e=make();
 const writing=e.translate({text:'The father writes the book.',from:'en',to:'pl'});
 const opening=e.translate({text:'The father opens the book.',from:'en',to:'pl'});
 assert.equal(writing.interlingua.concept,'event.write');
 assert.equal(opening.interlingua.concept,'event.open');
 assert.notEqual(writing.interlingua.concept,opening.interlingua.concept);
 assert.equal(e.translate({text:'The sister does not write the book.',from:'en',to:'pl'}).text,
   'Siostra nie pisze książki.');
 const corrupted={...gold.enToPl[0],concept:'event.open'};
 assert.throws(()=>expectGold(writing.interlingua,corrupted),{code:'ERR_ASSERTION',message:/A1A-EN-01/});
 assert.equal(gold.license,'project-authored');
 assert.equal(ontology.concepts['event.open'].roleTypes.theme,'physical_object');
});
