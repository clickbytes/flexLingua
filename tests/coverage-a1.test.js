import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeCoverage} from '../tools/coverage-a1-lib.mjs';
const paths=['data/pl.json','data/en.json','data/concepts.json','data/morphology/pl.json','data/morphology/en.json','data/grammar/pl.json','data/grammar/en.json','data/coverage/a1-pilot.json'];
const read=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed]=await Promise.all(paths.map(read));
const input={pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed};
test('counts actual lexemes but never invents an A1 score',()=>{
 const r=analyzeCoverage(input);
 assert.equal(r.languages.pl.lexemes,Object.values(r.languages.pl.lexemesByGroup).reduce((a,b)=>a+b,0));
 assert.equal(r.languages.en.lexemes,Object.values(r.languages.en.lexemesByGroup).reduce((a,b)=>a+b,0));
 assert.equal(r.cefr.percentage,null);
 assert.ok(r.sharedCoreReferences>0);
});
test('A1 Batch 5: Polish and English movement are structurally present, not CEFR-certified',()=>{
 const r=analyzeCoverage(input);
 const movement=r.pilot.concepts.find(x=>x.id==='event.movement');
 assert.ok(movement.pl.lexemeIds.length>0);
 assert.ok(movement.en.lexemeIds.length>0);
 assert.equal(movement.hasBothLexicons,true);
 assert.equal(movement.hasBothMorphologies,true);
 assert.equal(movement.translationVerified,false,
   'Structural inventory does not automatically incorporate separate Batch 5 gold');
 assert.equal(r.pilot.constructions.find(x=>x.id==='question.yes_no').translationVerified,false);
 assert.equal(r.cefr.percentage,null);
});
test('rejects unknown concepts, duplicate lexemes and orphan morphological bindings',()=>{
 const bad=structuredClone(seed);bad.concepts.push({id:'does.not.exist'});
 assert.throws(()=>analyzeCoverage({...input,seed:bad}),/Unknown or duplicate pilot concept/);
 const duplicate=structuredClone(pl);duplicate.nouns.push(structuredClone(duplicate.nouns[0]));
 assert.throws(()=>analyzeCoverage({...input,pl:duplicate}),/Duplicate lexeme ID/);
 const orphan=structuredClone(plMorph);orphan.bindings.push({lexemeId:'pl.missing',paradigmId:Object.keys(orphan.paradigms)[0]});
 assert.throws(()=>analyzeCoverage({...input,plMorph:orphan}),/Orphan morphology binding/);
});

test('G1: structural coverage includes all modal operator lexemes with valid CORE refs',()=>{
 const report=analyzeCoverage(input);
 for(const [language,dictionary] of [['en',en],['pl',pl]]){
   assert.equal(report.languages[language].lexemesByGroup.modals,dictionary.modals.length);
   assert.ok(report.languages[language].distinctCoreReferences>0);
   assert.equal(report.cefr.percentage,null);
 }
 const dangling=structuredClone(en);
 dangling.modals[0].senses[0].coreRef.id='modality.not_registered';
 assert.throws(()=>analyzeCoverage({...input,en:dangling}),/Unknown CORE reference/);
});
