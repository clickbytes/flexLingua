import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createMorphology, materializeInflections} from '../js/core/morphology/engine.js';
import {createMorphFeatureRegistry,flattenMorphFeatures} from '../js/core/morphology/features.js';
import {executeOperations} from '../js/core/morphology/operations.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createEnglishAdapter} from '../js/languages/en.js';
import {createPolishAdapter} from '../js/languages/pl.js';
const load=async p=>JSON.parse(await readFile(new URL(`../data/${p}`,import.meta.url),'utf8'));
const [concepts,baseFeatures,features,pl,en,plSpec,enSpec,ar,arSpec]=await Promise.all([
  'concepts.json','features.json','morphology/features.json','pl.json','en.json','morphology/pl.json',
  'morphology/en.json','morphology/ar-lexicon.json','morphology/ar.json'].map(load));
const engine=new Engine(concepts,baseFeatures);
const plMorph=createMorphology(plSpec,pl,features,{core:engine.core});
const enMorph=createMorphology(enSpec,en,features,{core:engine.core});
const arMorph=createMorphology(arSpec,ar,features,{core:engine.core});
engine.registerMorphology(plMorph).registerMorphology(enMorph).registerMorphology(arMorph)
  .registerLanguage(createPolishAdapter(pl,await load('grammar/pl.json'),{morphology:plMorph}))
  .registerLanguage(createEnglishAdapter(en,await load('grammar/en.json'),{morphology:enMorph}));
const generation=(language,lexemeId,features)=>engine.inflect({language,lexemeId,features}).map(x=>x.text);
const copy=x=>structuredClone(x);

test('v1.02 feature schema accepts nested controller agreement and refuses malformed dimensions',()=>{
 const r=createMorphFeatureRegistry(features);
 assert.deepEqual(flattenMorphFeatures({tense:'past',subject:{person:'third',number:'plural'}},r),
   {tense:'past',subject_person:'third',subject_number:'plural'});
 assert.deepEqual(r.unify({number:'singular'},{number:'plural'}),null);
 assert.deepEqual(r.unify({number:'plural'},{case:'dat'}),{number:'plural',case:'dat'});
 assert.throws(()=>r.supports({case:'ergative'}),/Unsupported morphology feature/);
 assert.throws(()=>flattenMorphFeatures(JSON.parse('{"subject":{"__proto__":"bad"}}'),r));
 const bad=copy(features);bad.dimensions.case.push('nom');
 assert.throws(()=>createMorphFeatureRegistry(bad),/Invalid morphology dimension/);
});

test('v1.02 nested agreement rejects conflicts without broadening supported dimensions',()=>{
 const r=createMorphFeatureRegistry(features);
 for (const input of [
  {subject_person:'first',subject:{person:'third'}},
  {subject:{person:'third'},subject_person:'first'}
 ]) assert.throws(()=>flattenMorphFeatures(input,r),/Conflicting morphology feature/);
 assert.deepEqual(flattenMorphFeatures({subject_person:'third',subject:{person:'third'}},r),
   {subject_person:'third'});
 assert.deepEqual(flattenMorphFeatures({subject:{person:'third'},object:{number:'plural'}},r),
   {subject_person:'third',object_number:'plural'});
 assert.throws(()=>flattenMorphFeatures({possessor:{number:'singular'}},r),
   /Unsupported morphology feature possessor_number/);
 assert.throws(()=>flattenMorphFeatures({custom_dimension:'value'},r),
   /Unsupported morphology feature custom_dimension/);
 assert.throws(()=>flattenMorphFeatures(JSON.parse('{"__proto__":"unsafe"}'),r),
   /Unsafe morphology feature path/);
});

test('v1.03 generated PL and EN paradigm forms agree with stored legacy cells',()=>{
 for(const [data,morph] of [[pl,plMorph],[en,enMorph]]){
  const derived=materializeInflections(data,morph,{assertLegacy:true});
  for(const group of ['nouns','verbs'])for(const lex of data[group]){
   const generated=morph.paradigm({lexemeId:lex.id});
   assert.ok(generated.length,`${lex.id} lacks produced forms`);
   assert.ok(generated.every(x=>x.coreRefs.length>0));
   assert.deepEqual(derived[group].find(x=>x.id===lex.id).forms,
      materializeInflections(derived,morph,{assertLegacy:true})[group].find(x=>x.id===lex.id).forms);
  }
 }
});

test('v1.03 one base plus paradigm generates all cases of the regular Polish fox noun',()=>{
 assert.deepEqual(generation('pl','pl.lis.1',{number:'singular',case:'nom'}),['lis']);
 assert.deepEqual(generation('pl','pl.lis.1',{number:'singular',case:'dat'}),['lisowi']);
 assert.deepEqual(generation('pl','pl.lis.1',{number:'plural',case:'dat'}),['lisom']);
 assert.deepEqual(generation('pl','pl.lis.1',{number:'plural',case:'inst'}),['lisami']);
 assert.deepEqual(generation('pl','pl.lis.1',{number:'plural',case:'loc'}),['lisach']);
 assert.equal(pl.nouns.find(x=>x.id==='pl.lis.1').forms?.plural?.dat,undefined);
});

test('GRAM-02 Polish adjective paradigm covers locative agreement across three genders and both plural classes',()=>{
 const cases=['nom','acc','gen','dat','loc'];
 const cells=[
  ...cases.map(grammaticalCase=>({number:'singular',gender:'feminine',case:grammaticalCase})),
  ...cases.flatMap(grammaticalCase=>grammaticalCase==='acc'?
   [{number:'singular',gender:'masculine',animacy:'animate',case:grammaticalCase},
    {number:'singular',gender:'masculine',animacy:'inanimate',case:grammaticalCase}]:
   [{number:'singular',gender:'masculine',case:grammaticalCase}]),
  ...cases.map(grammaticalCase=>({number:'singular',gender:'neuter',case:grammaticalCase})),
  ...['virile','nonvirile'].flatMap(pluralClass=>cases.map(grammaticalCase=>
   ({number:'plural',pluralClass,case:grammaticalCase})))
 ];
 for(const cell of cells)assert.equal(generation('pl','pl.big.adj.1',cell).length,1,JSON.stringify(cell));
 assert.equal(cells.length,26);
 assert.deepEqual(generation('pl','pl.big.adj.1',{number:'singular',gender:'feminine',case:'loc'}),['dużej']);
 assert.deepEqual(generation('pl','pl.big.adj.1',{number:'singular',gender:'masculine',case:'loc'}),['dużym']);
 assert.deepEqual(generation('pl','pl.big.adj.1',{number:'singular',gender:'neuter',case:'loc'}),['dużym']);
 assert.deepEqual(generation('pl','pl.big.adj.1',{number:'plural',pluralClass:'virile',case:'loc'}),['dużych']);
 assert.deepEqual(generation('pl','pl.big.adj.1',{number:'plural',pluralClass:'nonvirile',case:'loc'}),['dużych']);
 assert.deepEqual(generation('pl','pl.small.adj.1',{number:'singular',gender:'feminine',case:'loc'}),['małej']);
 assert.deepEqual(generation('pl','pl.red.adj.1',{number:'plural',pluralClass:'nonvirile',case:'loc'}),['czerwonych']);
 assert.deepEqual(generation('en','en.big.adj.1',{number:'singular'}),['big']);
 assert.deepEqual(generation('en','en.big.adj.1',{number:'plural'}),['big']);
});

test('GRAM-02 refuses an adjective exception outside the declared paradigm',()=>{
 const invalid=copy(plSpec);
 invalid.bindings.find(binding=>binding.lexemeId==='pl.big.adj.1').overrides.push({
  when:{number:'singular',gender:'feminine',case:'loc',animacy:'animate'},
  mode:'replace',forms:[{text:'dużej'}]
 });
 assert.throws(()=>createMorphology(invalid,pl,features,{core:engine.core}),/Override targets nonexistent paradigm cell/);
});

test('v1.04 operations support harmony, morphophonology and non-concatenative templates',()=>{
 assert.equal(executeOperations({stem:'kitap',steps:[{op:'softenFinal'}, {op:'harmonicSuffix',template:'I'}]}).text,'kitabı');
 assert.equal(executeOperations({stem:'kitap',steps:[{op:'softenFinal'},{op:'harmonicSuffix',template:'A'}]}).text,'kitaba');
 assert.equal(executeOperations({stem:'kitap',steps:[{op:'harmonicSuffix',template:'lAr'}]}).text,'kitaplar');
 assert.equal(executeOperations({stem:'gör',steps:[{op:'harmonicSuffix',template:'I'}]}).text,'görü');
 assert.equal(executeOperations({stem:'lis',steps:[{op:'prepend',value:'przed'},{op:'append',value:'em'}]}).text,'przedlisem');
 assert.equal(executeOperations({stem:'go',steps:[{op:'reduplicate',mode:'whole',value:'-'}]}).text,'go-go');
 assert.equal(executeOperations({stem:'t',stems:{root:'كتب'},steps:[{op:'rootTemplate',template:'{1}َ{2}َ{3}َ'}]}).text,'كَتَبَ');
 assert.throws(()=>executeOperations({stem:'go',steps:[{op:'replaceRegex',pattern:'.*'}]}),/Unknown morphology operation/);
 assert.throws(()=>executeOperations({stem:'abc',steps:[{op:'stripSuffix',value:'x'}]}),/does not end/);
});

test('v1.05 irregulars and stem variants are data, not branches in JS',()=>{
 assert.deepEqual(generation('en','en.child.1',{number:'plural'}),['children']);
 assert.deepEqual(generation('en','en.go.1',{tense:'past'}),['went']);
 assert.deepEqual(generation('en','en.see.1',{tense:'past'}),['saw']);
 assert.deepEqual(generation('en','en.give.1',{tense:'past'}),['gave']);
 assert.deepEqual(generation('en','en.fox.1',{number:'plural'}),['foxes']);
 assert.deepEqual(generation('pl','pl.kot.1',{number:'singular',case:'loc'}),['kocie']);
 assert.deepEqual(generation('pl','pl.dziecko.1',{number:'plural',case:'nom'}),['dzieci']);
 assert.deepEqual(generation('pl','pl.pies.1',{number:'singular',case:'nom'}),['pies']);
});

test('v1.05 paradigms are inherited and overrides replace, add or block rather than leak',()=>{
 const edit=copy(enSpec);
 const child=edit.bindings.find(b=>b.lexemeId==='en.child.1');
 child.overrides.push({when:{number:'singular'},mode:'addVariant',forms:[{text:'childe',variant:'historical'}]});
 const m=createMorphology(edit,en,features,{core:engine.core});
 assert.deepEqual(m.generate({lexemeId:'en.child.1',features:{number:'singular'}}).map(x=>x.text),['child','childe']);
 assert.equal(m.analyze({text:'childe'})[0].variant,'historical');
 const blocked=copy(enSpec);
 blocked.bindings.find(b=>b.lexemeId==='en.child.1').overrides.push({when:{number:'singular'},mode:'block',forms:[]});
 const bb=createMorphology(blocked,en,features,{core:engine.core});
 assert.deepEqual(bb.generate({lexemeId:'en.child.1',features:{number:'singular'}}),[]);
});

test('v1.06 inverse lookup preserves overlapping grammatical analyses',()=>{
 const readings=engine.analyzeForm({language:'pl',text:'koty'});
 assert.deepEqual(new Set(readings.map(r=>r.features.case)),new Set(['nom','acc','voc']));
 assert.ok(readings.every(x=>x.lexemeId==='pl.kot.1'));
 assert.deepEqual(new Set(engine.analyzeForm({language:'en',text:'children'}).map(x=>x.features.number)),new Set(['plural']));
 assert.deepEqual(engine.analyzeForm({language:'en',text:'unknownform'}),[]);
 assert.equal(engine.inspectParadigm({language:'pl',lexemeId:'pl.kot.1'}).length,14);
});

test('v1.06 generated forms roundtrip across complete bounded morphology inventories',()=>{
 for(const morph of [plMorph,enMorph,arMorph]){
  for(const lex of morph.lexicon.entries){
   if(!morph.has(lex.id))continue;
   for(const form of morph.paradigm({lexemeId:lex.id})){
    assert.ok(morph.analyze({text:form.text}).some(answer=>
      answer.lexemeId===form.lexemeId && JSON.stringify(answer.features)===JSON.stringify(form.features)),`${lex.id} ${form.text}`);
   }
  }
 }
});

test('v1.07 new nouns with NO stored inflections translate through productive morphology',()=>{
 assert.equal(en.nouns.find(x=>x.id==='en.fox.1').forms.plural,undefined);
 assert.equal(pl.nouns.find(x=>x.id==='pl.lis.1').forms.singular,undefined);
 assert.equal(engine.translate({text:'The girl saw the fox.',from:'en',to:'pl'}).text,'Dziewczynka widziała lisa.');
 assert.equal(engine.translate({text:'The children saw the fox.',from:'en',to:'pl'}).text,'Dzieci widziały lisa.');
 assert.equal(engine.translate({text:'The girl saw the children.',from:'en',to:'pl'}).text,'Dziewczynka widziała dzieci.');
 assert.match(engine.translate({text:'Dziewczynka widziała lisa.',from:'pl',to:'en'}).text,/girl saw a fox/);
});

test('v1.09 lexical meaning resolver preserves morphological ambiguity AND semantic ambiguity',()=>{
 const bank=engine.resolveWord({language:'en',text:'banks'});
 assert.deepEqual(new Set(bank.map(x=>x.coreRef.id)),new Set(['place.financial_institution','place.riverbank']));
 assert.equal(bank[0].coreRef.id,'place.financial_institution');
 const river=engine.resolveWord({language:'en',text:'banks',context:{topics:['place.river']}});
 assert.equal(river[0].coreRef.id,'place.riverbank');
 assert.ok(river.every(x=>x.features.number==='plural'));
 assert.equal(engine.resolveWord({language:'pl',text:'koty'}).length,3);
});

test('v1.10 Arabic root-template proof uses shared engine and remains a morphology-only package',()=>{
 assert.deepEqual(generation('ar','ar.kataba.1',{tense:'past',person:'third',number:'singular',gender:'masculine'}),['كَتَبَ']);
 assert.deepEqual(generation('ar','ar.kataba.1',{tense:'present',person:'third',number:'singular',gender:'masculine'}),['يَكْتُبُ']);
 assert.equal(engine.analyzeForm({language:'ar',text:'كَتَبَ'})[0].coreRefs[0].id,'event.write');
 assert.ok(!engine.capabilities().languages.some(l=>l.code==='ar'));
 assert.ok(engine.capabilities().morphologies.some(l=>l.language==='ar'));
});

test('v1.11 pathological or unknown morphology input fails closed',()=>{
 assert.deepEqual(generation('pl','pl.kot.1',{number:'dual',case:'gen'}),[]);
 assert.throws(()=>engine.inflect({language:'pl',lexemeId:'pl.missing.1',features:{number:'singular'}}),/Unsupported morphology lexeme/);
 assert.throws(()=>engine.inflect({language:'pl',lexemeId:'pl.kot.1',features:{number:'singular',case:'hax'}}),/Unsupported morphology feature/);
 assert.throws(()=>engine.analyzeForm({language:'pl',text:'<script>'}),/Invalid morphology surface/);
 const bad=copy(plSpec);bad.paradigms['pl.noun.masc_animate'].extends='pl.noun.masc_inanimate';
 assert.throws(()=>createMorphology(bad,pl,features,{core:engine.core}),/Cyclic morphology/);
 const unbound=copy(plSpec);unbound.bindings[0].lexemeId='pl.nonexistent';
 assert.throws(()=>createMorphology(unbound,pl,features,{core:engine.core}),/lacks canonical CORE/);
 const unsafe=copy(plSpec);unsafe.paradigms['pl.noun.masc_animate'].slots[0].steps=[{op:'eval',value:'danger'}];
 assert.throws(()=>createMorphology(unsafe,pl,features,{core:engine.core}),/Unknown morphology operation/);
});

test('v1.12 Polish exception classes and English f/fe plurals cover 50 authored cells',()=>{
 const fixtureOntology=copy(concepts);
 Object.assign(fixtureOntology.concepts,{
  'fixture.wife':{type:'entity',parent:'person',label:'wife'},
  'fixture.knife':{type:'entity',parent:'physical_object',label:'knife'},
  'fixture.wolf':{type:'entity',parent:'animal',label:'wolf'},
  'fixture.leaf':{type:'entity',parent:'plant',label:'leaf'}
 });
 const fixtureCore=createCoreLanguage(fixtureOntology);
 const plFixture=copy(pl),plFixtureSpec=copy(plSpec);
 plFixture.nouns.push({id:'pl.stacja.1',lemma:'stacja',forms:{
  singular:{nom:'stacja',gen:'stacji',dat:'stacji',acc:'stację',inst:'stacją',loc:'stacji',voc:'stacjo'},
  plural:{nom:'stacje',gen:'stacji',dat:'stacjom',acc:'stacje',inst:'stacjami',loc:'stacjach',voc:'stacje'}
 },senses:[{id:'pl.stacja.1.sense.1',coreRef:{kind:'concept',id:'place.station'}}]});
 plFixtureSpec.bindings.push({lexemeId:'pl.stacja.1',paradigmId:'pl.noun.feminine_cja',
  stems:{base:'stacj',lemma:'stacja'},overrides:[]});
 const plFixtureMorph=createMorphology(plFixtureSpec,plFixture,features,{core:fixtureCore});
 const enFixture=copy(en),enFixtureSpec=copy(enSpec);
 const EnglishGold=[
  ['wife','fixture.wife','en.noun.fe_to_ves','wives'],
  ['knife','fixture.knife','en.noun.fe_to_ves','knives'],
  ['wolf','fixture.wolf','en.noun.f_to_ves','wolves'],
  ['leaf','fixture.leaf','en.noun.f_to_ves','leaves']
 ];
 for(const [lemma,concept] of EnglishGold){
  const id=`en.fixture.${lemma}.1`;
  enFixture.nouns.push({id,lemma,forms:{singular:lemma,plural:`${lemma}s`},senses:[{
   id:`${id}.sense.1`,coreRef:{kind:'concept',id:concept}
  }]});
  enFixtureSpec.bindings.push({lexemeId:id,paradigmId:EnglishGold.find(row=>row[0]===lemma)[2],
   stems:{base:lemma},overrides:[]});
 }
 const enFixtureMorph=createMorphology(enFixtureSpec,enFixture,features,{core:fixtureCore});
 const cells=[];
 const plGold=[
  ['pl.lekcja.1',[
   ['singular','nom','lekcja'],['singular','gen','lekcji'],['singular','dat','lekcji'],
   ['singular','acc','lekcję'],['singular','inst','lekcją'],['singular','loc','lekcji'],
   ['singular','voc','lekcjo'],['plural','nom','lekcje'],['plural','gen','lekcji'],
   ['plural','dat','lekcjom'],['plural','acc','lekcje'],['plural','inst','lekcjami'],
   ['plural','loc','lekcjach'],['plural','voc','lekcje']
  ]],
  ['pl.dziecko.1',[
   ['singular','nom','dziecko'],['singular','gen','dziecka'],['singular','dat','dziecku'],
   ['singular','acc','dziecko'],['singular','inst','dzieckiem'],['singular','loc','dziecku'],
   ['singular','voc','dziecko'],['plural','nom','dzieci'],['plural','gen','dzieci'],
   ['plural','dat','dzieciom'],['plural','acc','dzieci'],['plural','inst','dziećmi'],
   ['plural','loc','dzieciach'],['plural','voc','dzieci']
  ]],
  ['pl.stacja.1',[
   ['singular','nom','stacja'],['singular','gen','stacji'],['singular','dat','stacji'],
   ['singular','acc','stację'],['singular','inst','stacją'],['singular','loc','stacji'],
   ['singular','voc','stacjo'],['plural','nom','stacje'],['plural','gen','stacji'],
   ['plural','dat','stacjom'],['plural','acc','stacje'],['plural','inst','stacjami'],
   ['plural','loc','stacjach'],['plural','voc','stacje']
  ]]
 ];
 for(const [lexemeId,rows] of plGold)for(const [number,gramCase,text] of rows){
  cells.push({language:'pl',lexemeId,features:{number,case:gramCase},text,morph:plFixtureMorph});
 }
 for(const [lemma,,paradigmId,plural] of EnglishGold){
  const lexemeId=`en.fixture.${lemma}.1`;
  cells.push({language:'en',lexemeId,features:{number:'singular'},text:lemma,morph:enFixtureMorph});
  cells.push({language:'en',lexemeId,features:{number:'plural'},text:plural,morph:enFixtureMorph});
  assert.equal(enFixtureSpec.bindings.find(b=>b.lexemeId===lexemeId).paradigmId,paradigmId);
 }
 assert.equal(cells.length,50);
 assert.equal(plFixtureMorph.paradigms.get('pl.noun.feminine_cja').slots.size,14);
 assert.equal(plFixtureMorph.paradigms.get('pl.noun.neuter_irregular_plural').slots.size,14);
 for(const {lexemeId,features:cell,text,morph} of cells){
  const generated=morph.generate({lexemeId,features:cell});
  assert.deepEqual(generated.map(form=>form.text),[text],`${lexemeId} ${JSON.stringify(cell)}`);
  assert.ok(morph.analyze({text}).some(form=>form.lexemeId===lexemeId&&
   JSON.stringify(form.features)===JSON.stringify(cell)),`${lexemeId} inverse ${text}`);
 }
 const exception=plFixtureMorph.generate({lexemeId:'pl.lekcja.1',features:{number:'plural',case:'nom'}})[0];
 assert.equal(exception.source,'rule');
 assert.deepEqual(generation('pl','pl.kot.1',{number:'plural',case:'nom'}),['koty']);
 assert.deepEqual(enFixtureMorph.generate({lexemeId:'en.fox.1',features:{number:'plural'}}).map(x=>x.text),['foxes']);
});

test('v1.12 legacy assertion preserves original form tables and catches a mutated class',()=>{
 const before=copy(pl);
 const materialized=materializeInflections(pl,plMorph,{assertLegacy:true});
 assert.deepEqual(pl,before);
 assert.deepEqual(pl.nouns.find(x=>x.id==='pl.dziecko.1').forms,{});
 assert.equal(materialized.nouns.find(x=>x.id==='pl.dziecko.1').forms.plural.inst,'dziećmi');
 const changed=copy(plSpec);
 const slot=changed.paradigms['pl.noun.feminine_cja'].slots.find(x=>
  x.features.number==='singular'&&x.features.case==='gen');
 slot.steps[0].value='u';
 const broken=createMorphology(changed,pl,features,{core:engine.core});
 assert.throws(()=>materializeInflections(pl,broken,{assertLegacy:true}),/Legacy form discrepancy for pl.lekcja.1/);
});
