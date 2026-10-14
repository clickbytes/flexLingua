import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [ontology,features,pl,en,pg,eg,pm,em,morphFeatures,gold]=await Promise.all([
 'data/concepts.json','data/features.json','data/pl.json','data/en.json',
 'data/grammar/pl.json','data/grammar/en.json','data/morphology/pl.json','data/morphology/en.json',
 'data/morphology/features.json','tests/fixtures/gold-family-actions-a1.json'
].map(load));
const core=createCoreLanguage(ontology);
const pMorph=createMorphology(pm,pl,morphFeatures,{core});
const eMorph=createMorphology(em,en,morphFeatures,{core});
const bare=()=>new Engine(ontology,features)
 .registerLanguage(createRuleAdapter(pl,pg)).registerLanguage(createRuleAdapter(en,eg));
const productive=()=>new Engine(ontology,features).registerMorphology(pMorph).registerMorphology(eMorph)
 .registerLanguage(createRuleAdapter(pl,pg,{morphology:pMorph}))
 .registerLanguage(createRuleAdapter(en,eg,{morphology:eMorph}));

function check(engine,rows,from,to){
 for(const row of rows){
   const result=engine.translate({from,to,text:row.input});
   assert.equal(result.text,row.expected,row.id);
   if(row.alternative)assert.ok(result.semanticAlternatives.some(x=>x.text===row.alternative),row.id+' lost ambiguity');
   assert.equal(result.interlingua.concept,row.concept,row.id);
   const reverse=engine.analyze({from:to,text:row.expected});
   assert.equal(reverse.concept,row.concept,row.id+' semantic roundtrip');
   assert.equal(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}).concept,
     row.concept,row.id+' CORE JSON');
 }
}
test('A1 Batch 3: original bilingual family and daily activity gold (plain)',()=>{
 assert.equal(gold.enToPl.length,8);
 assert.equal(gold.plToEn.length,8);
 check(bare(),gold.enToPl,'en','pl');
 check(bare(),gold.plToEn,'pl','en');
});
test('A1 Batch 3: identical gold also works with productive morphology',()=>{
 check(productive(),gold.enToPl,'en','pl');
 check(productive(),gold.plToEn,'pl','en');
});
test('A1 Batch 3: independent morphology oracle generates and inversely analyzes forms',()=>{
 assert.equal(gold.morphology.length,18);
 for(const row of gold.morphology){
  const morph=row.language==='pl'?pMorph:eMorph;
  const outputs=morph.generate({lexemeId:row.lexemeId,features:row.features}).map(x=>x.text);
  assert.ok(outputs.includes(row.text),row.lexemeId+' '+JSON.stringify(row.features)+' '+outputs);
  assert.ok(morph.analyze({text:row.text}).some(x=>x.lexemeId===row.lexemeId),
    row.lexemeId+' missing inverse '+row.text);
 }
});
test('A1 Batch 3: dative governance and CORE role typing refuse bad constructions',()=>{
 const engine=productive();
 for(const {from,input} of gold.invalid){
  const failure=engine.tryTranslate({from,to:from==='pl'?'en':'pl',text:input});
  assert.equal(failure.ok,false,input);
 }
 const good=engine.translate({from:'en',to:'pl',text:'The brother helps the sister.'});
 assert.equal(good.interlingua.roles.theme.concept,'person.sister');
 assert.equal(good.text,'Brat pomaga siostrze.');
 const invalidCore={version:'0.2',type:'event',concept:'event.help',
  roles:{agent:{concept:'person.sister',features:{number:'singular',definiteness:'unknown'}},
   theme:{concept:'object.book',features:{number:'singular',definiteness:'unknown'}}},
  features:{tense:'present',polarity:'positive',aspect:'unknown'}};
 assert.equal(engine.tryTranslate({from:'core',to:'en',text:JSON.stringify(invalidCore)}).ok,false);
});
test('A1 Batch 3: original gold remains separate from Oxford and A1 certification',()=>{
 assert.equal(gold.license,'project-authored');
 assert.equal(gold.schemaVersion,1);
 assert.equal(ontology.concepts['event.read'].roleTypes.theme,'physical_object');
 assert.equal(ontology.concepts['event.help'].roleTypes.theme,'person');
 assert.equal(pg.frames['event.help'].cases.theme,'dat');
 assert.equal(eg.frames['event.help'].linearizations.length,1);
});

test('A1 Batch 3: English read keeps present and past readings instead of guessing',()=>{
 const result=bare().translate({from:'en',to:'pl',text:'The sisters read the books.'});
 assert.equal(result.text,'Siostry czytały książki.');
 assert.equal(result.interlingua.features.tense,'past');
 assert.ok(result.semanticAlternatives.some(x=>
   x.text==='Siostry czytają książki.'&&x.interlingua.features.tense==='present'));
});

test('A1 Batch 3: semantic roles and tense survive translation of reading and helping',()=>{
 const engine=productive();
 const checks=[
  {from:'en',input:'The brother read the book.',tense:'past',polarity:'positive',
    concept:'event.read',agent:'person.brother',theme:'object.book'},
  {from:'pl',input:'Brat pomaga siostrze.',tense:'present',polarity:'positive',
    concept:'event.help',agent:'person.brother',theme:'person.sister'},
  {from:'en',input:'The sister does not help the boy.',tense:'present',polarity:'negative',
    concept:'event.help',agent:'person.sister',theme:'person.boy'}
 ];
 for(const row of checks){
  const translated=engine.translate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
  const node=translated.interlingua;
  assert.equal(node.concept,row.concept,row.input);
  assert.equal(node.features.tense,row.tense,row.input);
  assert.equal(node.features.polarity,row.polarity,row.input);
  assert.equal(node.roles.agent.concept,row.agent,row.input);
  assert.equal(node.roles.theme.concept,row.theme,row.input);
  const after=engine.analyze({from:row.from==='en'?'pl':'en',text:translated.text});
  assert.equal(after.concept,row.concept,row.input+' target concept');
  assert.equal(after.features.tense,row.tense,row.input+' target tense');
  assert.equal(after.features.polarity,row.polarity,row.input+' target polarity');
 }
});
