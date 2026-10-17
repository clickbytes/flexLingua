import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createMorphology} from '../js/core/morphology/engine.js';
import {morphologyCoverage,compileMorphology} from '../js/core/morphology/compiler.js';
import {importUniMorph} from '../tools/importers/unimorph.mjs';
import {createCoreLanguage} from '../js/core/core-language.js';
const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}`,import.meta.url),'utf8'));
const [core,features,pl,en,plSpec,enSpec]=await Promise.all([
  'concepts.json','morphology/features.json','pl.json','en.json','morphology/pl.json','morphology/en.json'].map(load));
const unimorphProfile=JSON.parse(await readFile(new URL('./fixtures/unimorph-profile-pl.json',import.meta.url),'utf8'));
const make=(code,dictionary,spec)=>createMorphology(spec,dictionary,features,{core:createCoreLanguage(core)});
const morphPL=make('pl',pl,plSpec),morphEN=make('en',en,enSpec);
const compileLanguageScript=fileURLToPath(new URL('../tools/compile-language.mjs',import.meta.url));
const unimorphScript=fileURLToPath(new URL('../tools/importers/unimorph.mjs',import.meta.url));
const unimorphFixture=fileURLToPath(new URL('./fixtures/unimorph-sample.tsv',import.meta.url));
const unimorphProfileFixture=fileURLToPath(new URL('./fixtures/unimorph-profile-pl.json',import.meta.url));
const plLexiconFixture=fileURLToPath(new URL('../data/pl.json',import.meta.url));
const coreFixture=fileURLToPath(new URL('../data/concepts.json',import.meta.url));
const stagingDirectory=join(fileURLToPath(new URL('../',import.meta.url)),'import-staging','unimorph');

test('v1.08 importer maps only unambiguous, CORE-linked existing lexemes to review staging',async()=>{
 const text=await readFile(new URL('./fixtures/unimorph-sample.tsv',import.meta.url),'utf8');
 const result=importUniMorph({tsv:text,profile:unimorphProfile,lexicon:pl,core,
  source:'self-authored fixture',license:'test data'});
 assert.equal(result.status,'staging');
 assert.equal(result.candidates.length,2);
 assert.equal(result.review.length,2);
 assert.deepEqual(new Set(result.review.map(x=>x.reason)),new Set(['unmapped_core_lexeme','unknown_tags']));
 assert.deepEqual(result.candidates.map(x=>x.form),['kotu','koty']);
 assert.ok(result.candidates.every(x=>x.coreRefs[0].id==='animal.cat'&&x.verified===false));
 assert.throws(()=>importUniMorph({tsv:text,profile:unimorphProfile,lexicon:pl,core,
  source:'local',license:''}),/needs bounded input/);
});

test('v1.08 importer never guesses an unknown tag or changes source lexicon',()=>{
 const input='kot\tkotowi\tN;SG;DAT\nkot\tkotie\tN;SG;CAUS\n';
 const saved=structuredClone(pl);
 const result=importUniMorph({tsv:input,profile:unimorphProfile,lexicon:pl,core,
  source:'fixture',license:'self-authored'});
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

test('v1.12 compiled tables retain the Polish exception classes and inverse cells',()=>{
 const compiled=compileMorphology(morphPL);
 const child=compiled.readings.filter(row=>row.lexemeId==='pl.dziecko.1');
 const lesson=compiled.readings.filter(row=>row.lexemeId==='pl.lekcja.1');
 assert.ok(child.some(row=>row.text==='dzieciom'&&row.features.case==='dat'));
 assert.ok(child.some(row=>row.text==='dziećmi'&&row.features.case==='inst'));
 assert.ok(lesson.some(row=>row.text==='lekcji'&&row.features.number==='singular'&&row.features.case==='gen'));
 assert.ok(lesson.some(row=>row.text==='lekcjami'&&row.features.number==='plural'&&row.features.case==='inst'));
 assert.ok(!lesson.some(row=>row.text==='lekcjy'));
 assert.ok(morphPL.analyze({text:'lekcji'}).some(row=>row.lexemeId==='pl.lekcja.1'&&row.features.case==='gen'));
});

test('compile-language CLI writes valid finite table without dependencies',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'flexlingua-test-'));
 try{
  const file=join(temp,'en.json');
  const cmd=spawnSync(process.execPath,[compileLanguageScript,
    'en','--output',file],{encoding:'utf8'});
  assert.equal(cmd.status,0,cmd.stderr);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.language,'en');
  assert.ok(data.readings.some(x=>x.text==='children'));
  const bad=spawnSync(process.execPath,[compileLanguageScript,
    'not-a-language'],{encoding:'utf8'});
  assert.notEqual(bad.status,0);
 }finally{await rm(temp,{force:true,recursive:true});}
});

test('v1.08 importer CLI writes staging results but not lexicon JSON',async()=>{
 const fileName=`test-${process.pid}-${Date.now()}.json`;
 const file=join(stagingDirectory,fileName);
 try{
  const cmd=spawnSync(process.execPath,[unimorphScript,
    '--profile',unimorphProfileFixture,'--lexicon',plLexiconFixture,'--core',coreFixture,'--input',unimorphFixture,
    '--source','self-authored','--license','test','--out',fileName],{encoding:'utf8'});
  assert.equal(cmd.status,0,cmd.stderr);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.status,'staging');
  assert.equal(data.language,'pl');
  assert.equal(data.statistics.acceptedForReview,2);
  assert.ok(data.candidates.every(candidate=>candidate.verified===false));
  const escapeName=`escape-${process.pid}-${Date.now()}.json`;
  const bad=spawnSync(process.execPath,[unimorphScript,
    '--profile',unimorphProfileFixture,'--lexicon',plLexiconFixture,'--core',coreFixture,'--input',unimorphFixture,
    '--source','self-authored','--license','test','--out',`../${escapeName}`],{encoding:'utf8'});
  assert.notEqual(bad.status,0);
  await assert.rejects(readFile(join(stagingDirectory,'..',escapeName)));
 }finally{await rm(file,{force:true});}
});
