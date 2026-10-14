import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createMorphology, materializeInflections} from '../js/core/morphology/engine.js';
import {createMorphFeatureRegistry,flattenMorphFeatures} from '../js/core/morphology/features.js';
import {executeOperations} from '../js/core/morphology/operations.js';
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
