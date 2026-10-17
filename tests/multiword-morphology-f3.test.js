import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology,materializeInflections} from '../js/core/morphology/engine.js';
import {executeOperations,validateOperations} from '../js/core/morphology/operations.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const paths=['data/concepts.json','data/en.json','data/pl.json',
  'data/morphology/en.json','data/morphology/pl.json','data/morphology/features.json',
  'tests/fixtures/gold-multiword-morphology-f3.json'];
const [concepts,en,pl,enSpec,plSpec,features,gold]=await Promise.all(paths.map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enSpec,en,features,{core});
const plMorph=createMorphology(plSpec,pl,features,{core});
const enCells=[
  ['base',{mood:'indicative'}],
  ['present3sg',{tense:'present',number:'singular',person:'third'}],
  ['present3pl',{tense:'present',number:'plural',person:'third'}],
  ['past',{tense:'past'}]
];
const plCells=[
  ['presentSingular',{tense:'present',number:'singular',person:'third'}],
  ['presentPlural',{tense:'present',number:'plural',person:'third'}],
  ['pastMasculine',{tense:'past',number:'singular',gender:'masculine'}],
  ['pastFeminine',{tense:'past',number:'singular',gender:'feminine'}],
  ['pastNeuter',{tense:'past',number:'singular',gender:'neuter'}],
  ['pastVirile',{tense:'past',number:'plural',pluralClass:'virile'}],
  ['pastNonvirile',{tense:'past',number:'plural',pluralClass:'nonvirile'}]
];

test('F3: all five bilingual verb pairs have validated morphology bindings',()=>{
 assert.equal(gold.pairs.length,5);
 const seen=new Set();
 for(const pair of gold.pairs){
   assert.equal(core.resolve({kind:'concept',id:pair.concept}).type,'event');
   for(const [lang,morph] of [['en',enMorph],['pl',plMorph]]){
     const id=pair[lang].id;
     assert.ok(!seen.has(id),id);
     seen.add(id);
     assert.ok(morph.has(id),id);
     assert.ok(morph.lexicon.get(id).senses.some(s=>s.coreRef.id===pair.concept));
   }
 }
});

test('F3: 55 independent gold surface cells and inverse analyses match CORE',()=>{
 let cells=0;
 for(const pair of gold.pairs){
   for(const [lang,morph,map] of [['en',enMorph,enCells],['pl',plMorph,plCells]]){
     const entry=pair[lang];
     for(const [key,features] of map){
       const expected=entry[key];
       const actual=morph.generate({lexemeId:entry.id,features});
       assert.deepEqual(actual.map(item=>item.text),[expected],
         `${entry.id}/${key}: expected independently reviewed surface`);
       assert.ok(actual[0].coreRefs.some(ref=>ref.kind==='concept'&&ref.id===pair.concept));
       const inverse=morph.analyze({text:expected});
       assert.ok(inverse.some(reading=>reading.lexemeId===entry.id &&
         Object.keys(features).every(k=>reading.features[k]===features[k])),entry.id+'/'+key);
       cells++;
     }
   }
 }
 assert.equal(cells,55);
});

test('F3: existing explicit dictionary forms agree with generated paradigms',()=>{
 assert.doesNotThrow(()=>materializeInflections(en,enMorph,{assertLegacy:true}));
 assert.doesNotThrow(()=>materializeInflections(pl,plMorph,{assertLegacy:true}));
});

test('F3: particle is attached after inflecting the verb head, not at phrase end',()=>{
 const look=enMorph.paradigm({lexemeId:'en.look_for.1'});
 assert.ok(look.some(x=>x.text==='looks for'));
 assert.equal(look.some(x=>x.text==='look fors'),false);
 const wait=plMorph.paradigm({lexemeId:'pl.czekac_na.1'});
 assert.ok(wait.some(x=>x.text==='czekała na'));
 assert.equal(wait.some(x=>x.text==='czeka nała'),false);
});

test('F3: malformed particle append operation and absent stems fail closed',()=>{
 assert.throws(()=>validateOperations([{op:'appendStem',key:'../escape'}]),/stem key/);
 assert.throws(()=>executeOperations({stem:'look',stems:{},steps:[{op:'appendStem',key:'particle'}]}),
   /Unknown lexical stem/);
 const bad=structuredClone(enSpec);
 bad.bindings.find(x=>x.lexemeId==='en.look_for.1').stems.particle='';
 assert.throws(()=>createMorphology(bad,en,features,{core}),/Invalid morphology stem/);
 const incomplete=structuredClone(enSpec);
 delete incomplete.paradigms['en.noun.regular'].slots[1].steps[0].value;
 assert.throws(()=>createMorphology(incomplete,en,features,{core}),/Invalid morphology operation/);
});

test('F3: no morphological binding changes CORE semantic ambiguity and old verbs remain covered',()=>{
 assert.equal(enMorph.has('en.see.1'),true);
 assert.equal(plMorph.has('pl.widziec.1'),true);
 assert.equal(enMorph.analyze({text:'looked for'}).some(r=>r.lexemeId==='en.look_for.1'),true);
 assert.equal(plMorph.analyze({text:'szukały'}).some(r=>r.lexemeId==='pl.szukac.1'),true);
});
