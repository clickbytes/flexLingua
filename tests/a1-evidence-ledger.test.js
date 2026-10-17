import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {A1_CONSTRUCTION_REGISTRY_PATH,EVIDENCE_SOURCES,buildA1EvidenceLedger,verifyEvidenceFixture} from '../tools/a1-evidence-ledger-lib.mjs';

const get=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [manifest,ontology,constructionRegistry]=await Promise.all(['data/coverage/a1-targets.json','data/concepts.json',A1_CONSTRUCTION_REGISTRY_PATH].map(get));
const corpora=Object.fromEntries(await Promise.all(EVIDENCE_SOURCES.map(async s=>[s.id,await get(s.fixture)])));
const status=kind=>Object.fromEntries(EVIDENCE_SOURCES.map(s=>
 [s.id,{status:kind,exitCode:kind==='pass'?0:kind==='not-run'?null:1}]));
const run=(changes={})=>buildA1EvidenceLedger({manifest,ontology,corpora,checks:status('pass'),constructionRegistry,...changes});
const byId=(report,id)=>report.targets.find(x=>x.id===id);

test('A1 VAL-03: all fifteen project-authored fixtures are inventoried',()=>{
 const report=run();
 assert.equal(report.totals.sources,15);
 assert.deepEqual({p:report.totals.positive,n:report.totals.negative,
   f:report.totals.morphologyCells,productive:report.totals.productiveOnly},
   {p:538,n:99,f:60,productive:2});
 assert.equal(report.verification.positiveVerified,538);
 const basic=report.sources.find(x=>x.id==='enplbasic');
 assert.equal(corpora.enplbasic.license,'project-authored');
 assert.equal(corpora.enplbasic.provenance.source,'project-authored');
 assert.ok(corpora.enplbasic.provenance.rights);
 assert.equal(corpora.enplbasic.provenance.reviewedAt,'2026-10-17');
 assert.ok(corpora.enplbasic.provenance.permittedUse);
 assert.deepEqual({positive:basic.samples.positive,negative:basic.samples.negative},
   {positive:2,negative:2});
 const family01=report.constructionCoverage.families.find(x=>x.id==='A1-ENPL-01');
 assert.equal(family01.implementationStatus,'implemented');
 assert.equal(family01.evidenceStatus,'verified');
 assert.deepEqual(family01.declared.positive,{'en->pl':1,'pl->en':1});
 assert.deepEqual(family01.declared.refusal,{'en->pl':2,'pl->en':0});
 assert.deepEqual(family01.executed.positive['en->pl'],{pass:1,fail:0,'not-run':0});
 assert.equal(report.release.inputs.constructionRegistrySha256,report.constructionCoverage.registrySha256);
 const family08=report.constructionCoverage.families.find(x=>x.id==='A1-ENPL-08');
 assert.equal(family08.implementationStatus,'planned');
 assert.equal(family08.evidenceStatus,'planned');
 assert.ok(family08.knownGaps.length>0);
 const family02=report.constructionCoverage.families.find(x=>x.id==='A1-ENPL-02');
 assert.deepEqual(family02.evidence[0].caseResults.filter(x=>x.id.startsWith('STATE-EN-2')).map(x=>x.id),
   ['STATE-EN-21','STATE-EN-22','STATE-EN-23','STATE-EN-24']);
 assert.equal(family02.evidence[0].suiteStatus,'pass');
 const bareBeverages=report.sources.find(x=>x.id==='barebeverages');
 assert.deepEqual({positive:bareBeverages.samples.positive,negative:bareBeverages.samples.negative},
   {positive:8,negative:5});
 assert.deepEqual(bareBeverages.byDirection,{'en->pl':4,'pl->en':4});
 const existential=report.sources.find(x=>x.id==='existential');
 assert.deepEqual({positive:existential.samples.positive,negative:existential.samples.negative},
   {positive:4,negative:6});
 assert.deepEqual(existential.byDirection,{'en->pl':2,'pl->en':2});
 const paststate=report.sources.find(x=>x.id==='paststate');
 assert.deepEqual({positive:paststate.samples.positive,negative:paststate.samples.negative},
   {positive:10,negative:7});
 assert.deepEqual(paststate.byDirection,{'en->pl':5,'pl->en':5});
 const progressive=report.sources.find(x=>x.id==='progressive');
 assert.deepEqual({positive:progressive.samples.positive,negative:progressive.samples.negative},
   {positive:12,negative:7});
 assert.deepEqual(progressive.byDirection,{'en->pl':6,'pl->en':6});
 const state=report.sources.find(x=>x.id==='state');
 assert.equal(state.samples.positive,48);
 assert.deepEqual(state.byDirection,{'en->pl':24,'pl->en':24});
 const composition=report.sources.find(x=>x.id==='composition');
 assert.deepEqual({positive:composition.samples.positive,negative:composition.samples.negative},
   {positive:46,negative:1});
 assert.deepEqual(composition.byDirection,{'en->pl':26,'pl->en':20});
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
 assert.equal(report.sampleQuality.verified.positive,538);
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
 checks.state={status:'fail',exitCode:1,error:'state fixture assertion failed'};
 const report=run({checks});
 assert.equal(report.verification.status,'fail');
 assert.equal(report.verification.suitesFailed,2);
 assert.ok(report.verification.positiveVerified<report.totals.positive);
 assert.equal(report.sources.find(x=>x.id==='actions').status,'fail');
 assert.equal(report.constructionCoverage.families.find(x=>x.id==='A1-ENPL-02').evidenceStatus,'fail');
 assert.equal(report.release.verified,false);
 assert.ok(report.sampleQuality.verified.positive<report.sampleQuality.declared.positive);
 const unverified=run({checks:status('not-run')});
 assert.equal(unverified.verification.status,'not-run');
 assert.equal(unverified.verification.positiveVerified,0);
 assert.equal(byId(unverified,'event.open').state,'declared-unverified');
 const unverifiedFamily=unverified.constructionCoverage.families.find(x=>x.id==='A1-ENPL-01');
 assert.equal(unverifiedFamily.evidenceStatus,'declared-unverified');
 assert.equal(unverifiedFamily.executed.positive['en->pl']['not-run'],1);
 assert.equal(unverified.constructionCoverage.families.find(x=>x.id==='A1-ENPL-08').evidenceStatus,'planned');
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
 const duplicateFamily=structuredClone(constructionRegistry);
 duplicateFamily.families[1].id=duplicateFamily.families[0].id;
 assert.throws(()=>run({constructionRegistry:duplicateFamily}),/duplicate A1 construction family/);
 const missingCase=structuredClone(constructionRegistry);
 missingCase.families[0].evidence[0].positiveCases['en->pl'][0]='A1-ENPL-01-MISSING';
 assert.throws(()=>run({constructionRegistry:missingCase}),/missing case, wrong kind or direction/);
 const wrongDirection=structuredClone(constructionRegistry);
 wrongDirection.families[0].evidence[0].positiveCases['en->pl'][0]='A1-ENPL-01-PL-01';
 assert.throws(()=>run({constructionRegistry:wrongDirection}),/missing case, wrong kind or direction/);
 const wrongCore=structuredClone(constructionRegistry);
 wrongCore.families[0].coreContract.kind=['identity'];
 assert.throws(()=>run({constructionRegistry:wrongCore}),/CORE contract mismatch/);
 const wrongPolarity=structuredClone(constructionRegistry);
 wrongPolarity.families[0].polarity=['negative'];
 assert.throws(()=>run({constructionRegistry:wrongPolarity}),/CORE contract mismatch/);
 const wrongSuite=structuredClone(constructionRegistry);
 wrongSuite.families[0].evidence[0].suite='tests/a1-state-gold.test.js';
 assert.throws(()=>run({constructionRegistry:wrongSuite}),/Invalid A1 construction evidence reference/);
});

test('A1 VAL-03: catalog-only CLI does not claim any executed checks',()=>{
 const proc=spawnSync(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only'],
   {cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30000});
 assert.equal(proc.status,0,proc.stderr);
 const report=JSON.parse(proc.stdout);
 assert.equal(report.verification.status,'not-run');
 assert.equal(report.verification.suitesNotRun,15);
 assert.equal(report.cefr.percentage,null);
 assert.equal(report.constructionCoverage.families.find(x=>x.id==='A1-ENPL-01').evidenceStatus,'declared-unverified');
 assert.equal(report.constructionCoverage.families.find(x=>x.id==='A1-ENPL-08').evidenceStatus,'planned');
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
 'data/concepts.json','data/coverage/a1-targets.json',A1_CONSTRUCTION_REGISTRY_PATH,
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
