import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createMorphology} from '../js/core/morphology/engine.js';
import {morphologyCoverage,compileMorphology} from '../js/core/morphology/compiler.js';
import {importUniMorph} from '../tools/importers/unimorph.mjs';
import {createCoreLanguage} from '../js/core/core-language.js';
const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}`,import.meta.url),'utf8'));
const [core,features,pl,en,plSpec,enSpec]=await Promise.all([
  'concepts.json','morphology/features.json','pl.json','en.json','morphology/pl.json','morphology/en.json'].map(load));
const make=(code,dictionary,spec)=>createMorphology(spec,dictionary,features,{core:createCoreLanguage(core)});
const morphPL=make('pl',pl,plSpec),morphEN=make('en',en,enSpec);

test('v1.08 importer maps only unambiguous, CORE-linked existing lexemes to review staging',async()=>{
 const text=await readFile(new URL('./fixtures/unimorph-sample.tsv',import.meta.url),'utf8');
 const result=importUniMorph({tsv:text,language:'pl',lexicon:pl,source:'self-authored fixture',license:'test data'});
 assert.equal(result.status,'staging');
 assert.equal(result.candidates.length,2);
 assert.equal(result.review.length,2);
 assert.deepEqual(new Set(result.review.map(x=>x.reason)),new Set(['unmapped_core_lexeme','unknown_tags']));
 assert.deepEqual(result.candidates.map(x=>x.form),['kotu','koty']);
 assert.ok(result.candidates.every(x=>x.coreRefs[0].id==='animal.cat'&&x.verified===false));
 assert.throws(()=>importUniMorph({tsv:text,language:'pl',lexicon:pl,source:'local',license:''}),/needs bounded input/);
});

test('v1.08 importer never guesses an unknown tag or changes source lexicon',()=>{
 const input='kot\tkotowi\tN;SG;DAT\nkot\tkotie\tN;SG;CAUS\n';
 const saved=structuredClone(pl);
 const result=importUniMorph({tsv:input,language:'pl',lexicon:pl,source:'fixture',license:'self-authored'});
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].form,'kotowi');
 assert.equal(result.review.length,1);
 assert.deepEqual(pl,saved);
});

test('v1.11 compiled inverse table is deterministic, language-tagged and CORE-linked',()=>{
 const before=compileMorphology(morphPL);
 const after=compileMorphology(morphPL);
 assert.deepEqual(before,after);
 assert.equal(before.kind,'finite-relation-table');
 assert.equal(before.language,'pl');
 assert.ok(before.readings.length>=200);
 assert.equal(before.readings.find(x=>x.text==='kotu').coreRefs[0].id,'animal.cat');
 assert.equal(new Set(before.readings.filter(x=>x.text==='koty').map(x=>x.features.case)).size,3);
});

test('v1.11 coverage reports exactly what is bound, not arbitrary word counts',()=>{
 for(const m of [morphEN,morphPL]){
  const coverage=morphologyCoverage(m);
  assert.equal(coverage.percentage,100);
  assert.equal(coverage.coveredLexemes,coverage.eligibleLexemes);
  assert.deepEqual(coverage.missingLexemes,[]);
  assert.ok(coverage.forms>20);
 }
 const incomplete=structuredClone(plSpec);
 incomplete.bindings=incomplete.bindings.filter(x=>x.lexemeId!=='pl.kot.1');
 const report=morphologyCoverage(make('pl',pl,incomplete));
 assert.ok(report.percentage<100);
 assert.ok(report.missingLexemes.includes('pl.kot.1'));
});

test('compile-language CLI writes valid finite table without dependencies',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'flexlingua-test-'));
 try{
  const file=join(temp,'en.json');
  const cmd=spawnSync(process.execPath,[new URL('../tools/compile-language.mjs',import.meta.url).pathname,
    'en','--output',file],{encoding:'utf8'});
  assert.equal(cmd.status,0,cmd.stderr);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.language,'en');
  assert.ok(data.readings.some(x=>x.text==='children'));
  const bad=spawnSync(process.execPath,[new URL('../tools/compile-language.mjs',import.meta.url).pathname,
    'not-a-language'],{encoding:'utf8'});
  assert.notEqual(bad.status,0);
 }finally{await rm(temp,{force:true,recursive:true});}
});

test('v1.08 importer CLI writes staging results but not lexicon JSON',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'flexlingua-import-'));
 try{
  const file=join(temp,'staging.json');
  const cmd=spawnSync(process.execPath,[new URL('../tools/importers/unimorph.mjs',import.meta.url).pathname,
    '--language','pl','--input',new URL('./fixtures/unimorph-sample.tsv',import.meta.url).pathname,
    '--source','self-authored','--license','test','--out',file],{encoding:'utf8'});
  assert.equal(cmd.status,0,cmd.stderr);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.status,'staging');
  assert.equal(data.statistics.acceptedForReview,2);
 }finally{await rm(temp,{force:true,recursive:true});}
});
