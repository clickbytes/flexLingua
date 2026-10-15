import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EVIDENCE_SOURCES,buildA1EvidenceLedger,verifyEvidenceFixture} from '../tools/a1-evidence-ledger-lib.mjs';

const get=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [manifest,ontology]=await Promise.all(['data/coverage/a1-targets.json','data/concepts.json'].map(get));
const corpora=Object.fromEntries(await Promise.all(EVIDENCE_SOURCES.map(async s=>[s.id,await get(s.fixture)])));
const status=kind=>Object.fromEntries(EVIDENCE_SOURCES.map(s=>
 [s.id,{status:kind,exitCode:kind==='pass'?0:kind==='not-run'?null:1}]));
const run=(changes={})=>buildA1EvidenceLedger({manifest,ontology,corpora,checks:status('pass'),...changes});
const byId=(report,id)=>report.targets.find(x=>x.id===id);

test('A1 VAL-03: all ten project-authored fixtures are inventoried',()=>{
 const report=run();
 assert.equal(report.totals.sources,10);
 assert.deepEqual({p:report.totals.positive,n:report.totals.negative,
   f:report.totals.morphologyCells,productive:report.totals.productiveOnly},
   {p:460,n:73,f:60,productive:2});
 assert.equal(report.verification.positiveVerified,460);
 const state=report.sources.find(x=>x.id==='state');
 assert.equal(state.samples.positive,40);
 assert.deepEqual(state.byDirection,{'en->pl':20,'pl->en':20});
 const composition=report.sources.find(x=>x.id==='composition');
 assert.deepEqual({positive:composition.samples.positive,negative:composition.samples.negative},
   {positive:12,negative:1});
 const spacetime=report.sources.find(x=>x.id==='spacetime');
 assert.deepEqual({positive:spacetime.samples.positive,negative:spacetime.samples.negative},
   {positive:64,negative:9});
 assert.deepEqual(spacetime.byDirection,{'en->pl':32,'pl->en':32});
 const heldout=report.sources.find(x=>x.id==='heldout');
 assert.deepEqual({positive:heldout.samples.positive,negative:heldout.samples.negative},
   {positive:200,negative:20});
 assert.deepEqual(heldout.byDirection,{'en->pl':100,'pl->en':100});
 assert.equal(report.sources.find(x=>x.id==='g2').classification,'development');
 assert.equal(heldout.classification,'held-out');
 assert.equal(heldout.authorIndependent,false);
 assert.deepEqual({positive:report.sampleQuality.heldOut.declared.positive,
   negative:report.sampleQuality.heldOut.declared.negative,
   verified:report.sampleQuality.heldOut.verified.positive},
   {positive:200,negative:20,verified:200});
 for(const kind of ['positive','negative'])
   assert.equal(Object.values(report.sampleQuality.declared.byDirection)
     .reduce((sum,row)=>sum+row[kind],0),report.sampleQuality.declared[kind]);
 assert.equal(Object.values(report.sampleQuality.declared.morphologyByLanguage)
   .reduce((sum,count)=>sum+count,0),report.totals.morphologyCells);
 assert.equal(report.sampleQuality.verified.positive,460);
 assert.equal(report.targetSummary.total,23);
 assert.deepEqual({concepts:report.targets.filter(x=>x.unitType==='concept').length,
   constructions:report.targets.filter(x=>x.unitType==='construction').length},
   {concepts:16,constructions:7});
 assert.ok(report.targets.every(x=>x.scopeStatus==='required'));
 assert.equal(byId(report,'event.open').matrixId,'construction.event.open');
 assert.equal(report.cefr.percentage,null);
 assert.equal(report.release.verified,false);
 assert.match(report.release.id,/^a1-evidence-v2-[a-f0-9]{20}$/);
 assert.ok(report.totals.crossSourceDuplicateUtterances>=0);
});

test('A1 VAL-03: individual project targets can be sampled or explicitly unannotated',()=>{
 const report=run();
 assert.equal(byId(report,'event.open').state,'sampled-both-directions');
 assert.equal(byId(report,'person.father').state,'sampled-both-directions');
 assert.equal(byId(report,'event.movement').state,'sampled-both-directions');
 assert.equal(byId(report,'person.mother').state,'sampled-both-directions');
 assert.ok(byId(report,'event.read').verifiedCases>0);
 assert.ok(report.sources.every(x=>x.byDirection['en->pl']>0&&x.byDirection['pl->en']>0));
});

test('A1 VAL-03: duplicate observations are counted by kind and translation direction',()=>{
 const baseline=run();
 const duplicate=structuredClone(corpora);
 duplicate.father.enToPl.push({...structuredClone(duplicate.family.enToPl[0]),id:'VAL03-DUP'});
 const report=run({corpora:duplicate});
 assert.equal(report.sampleQuality.duplicates.repeatSamples,
   baseline.sampleQuality.duplicates.repeatSamples+1);
 assert.equal(report.sampleQuality.duplicates.byDirection['en->pl'].positive,
   baseline.sampleQuality.duplicates.byDirection['en->pl'].positive+1);
 assert.equal(report.sources.find(x=>x.id==='father').sampleQuality.duplicateRepeats,
   baseline.sources.find(x=>x.id==='father').sampleQuality.duplicateRepeats+1);
});

test('A1 VAL-03: suite failures must not be reported as verified successes',()=>{
 const checks=status('pass');
 checks.actions={status:'fail',exitCode:1,error:'fixture assertion failed'};
 const report=run({checks});
 assert.equal(report.verification.status,'fail');
 assert.equal(report.verification.suitesFailed,1);
 assert.ok(report.verification.positiveVerified<report.totals.positive);
 assert.equal(report.sources.find(x=>x.id==='actions').status,'fail');
 assert.equal(report.release.verified,false);
 assert.ok(report.sampleQuality.verified.positive<report.sampleQuality.declared.positive);
 const unverified=run({checks:status('not-run')});
 assert.equal(unverified.verification.status,'not-run');
 assert.equal(unverified.verification.positiveVerified,0);
 assert.equal(byId(unverified,'event.open').state,'declared-unverified');
 assert.equal(unverified.cefr.percentage,null);
});

test('A1 VAL-03: reject duplicate case IDs, unknown concepts and false green statuses',()=>{
 const duplicate=structuredClone(corpora);
 duplicate.family.plToEn[0].id=duplicate.family.enToPl[0].id;
 assert.throws(()=>run({corpora:duplicate}),/duplicate sample ID/i);
 const unknown=structuredClone(corpora);
 unknown.actions.enToPl[0].concept='event.nonexistent';
 assert.throws(()=>run({corpora:unknown}),/Unknown sample CORE concept/);
 const fake=status('pass');
 fake.father.exitCode=1;
 assert.throws(()=>run({checks:fake}),/fabricated test result/);
});

test('A1 VAL-03: catalog-only CLI does not claim any executed checks',()=>{
 const proc=spawnSync(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only'],
   {cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30000});
 assert.equal(proc.status,0,proc.stderr);
 const report=JSON.parse(proc.stdout);
 assert.equal(report.verification.status,'not-run');
 assert.equal(report.verification.suitesNotRun,10);
 assert.equal(report.cefr.percentage,null);
 assert.equal(report.execution.runtime,'node');
 assert.ok(Number.isInteger(report.execution.pid));
 assert.ok(report.sources.every(x=>x.fixtureIntegrity==='verified'));
 assert.ok(report.sources.every(x=>x.status==='not-run'&&x.exitCode===null&&x.execution===null));
 const second=spawnSync(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only'],
   {cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30000});
 assert.equal(second.status,0,second.stderr);
 assert.equal(JSON.parse(second.stdout).release.id,report.release.id);
});

const projectFiles=[
 'tools/a1-evidence-ledger.mjs','tools/a1-evidence-ledger-lib.mjs',
 'data/concepts.json','data/coverage/a1-targets.json',
 ...EVIDENCE_SOURCES.map(source=>source.fixture)
];
async function fixtureProject(){
 const root=await mkdtemp(join(tmpdir(),'flexlingua-evidence-'));
 for(const path of projectFiles){
   const source=fileURLToPath(new URL('../'+path,import.meta.url));
   const destination=join(root,path);
   await mkdir(dirname(destination),{recursive:true});
   await copyFile(source,destination);
 }
 return root;
}

test('A1 VAL-03: fixture hashes fail closed before suite execution or report output',async()=>{
 const heldout=EVIDENCE_SOURCES.find(source=>source.id==='heldout');
 const validText=await readFile(new URL('../'+heldout.fixture,import.meta.url),'utf8');
 assert.equal(verifyEvidenceFixture('heldout',validText),heldout.sha256);
 assert.throws(()=>verifyEvidenceFixture('heldout',validText+'\n'),/integrity check failed/);

 const root=await fixtureProject();
 try{
   const fixturePath=join(root,heldout.fixture);
   await writeFile(fixturePath,validText+'\n','utf8');
   const outputPath=join(root,'ledger.json');
   const changed=spawnSync(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only','--output',outputPath],
     {cwd:root,encoding:'utf8',timeout:30000});
   assert.notEqual(changed.status,0);
   assert.match(changed.stderr,/integrity check failed/);
   await assert.rejects(access(outputPath));

   await rm(fixturePath);
   const missing=spawnSync(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only'],
     {cwd:root,encoding:'utf8',timeout:30000});
   assert.notEqual(missing.status,0);
 }finally{
   await rm(root,{recursive:true,force:true});
 }
});
