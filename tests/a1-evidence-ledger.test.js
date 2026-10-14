import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {EVIDENCE_SOURCES,buildA1EvidenceLedger} from '../tools/a1-evidence-ledger-lib.mjs';

const get=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [manifest,ontology]=await Promise.all(['data/coverage/a1-targets.json','data/concepts.json'].map(get));
const corpora=Object.fromEntries(await Promise.all(EVIDENCE_SOURCES.map(async s=>[s.id,await get(s.fixture)])));
const status=kind=>Object.fromEntries(EVIDENCE_SOURCES.map(s=>
 [s.id,{status:kind,exitCode:kind==='pass'?0:kind==='not-run'?null:1}]));
const run=(changes={})=>buildA1EvidenceLedger({manifest,ontology,corpora,checks:status('pass'),...changes});
const byId=(report,id)=>report.targets.find(x=>x.id===id);

test('A1 Batch 7: all seven independent project-authored fixtures are inventoried',()=>{
 const report=run();
 assert.equal(report.totals.sources,7);
 assert.deepEqual({p:report.totals.positive,n:report.totals.negative,
   f:report.totals.morphologyCells,productive:report.totals.productiveOnly},
   {p:155,n:35,f:60,productive:2});
 assert.equal(report.verification.positiveVerified,155);
 assert.equal(report.targetSummary.total,23);
 assert.deepEqual({concepts:report.targets.filter(x=>x.unitType==='concept').length,
   constructions:report.targets.filter(x=>x.unitType==='construction').length},
   {concepts:16,constructions:7});
 assert.ok(report.targets.every(x=>x.scopeStatus==='required'));
 assert.equal(byId(report,'event.open').matrixId,'construction.event.open');
 assert.equal(report.cefr.percentage,null);
 assert.equal(report.release.verified,false);
 assert.ok(report.totals.crossSourceDuplicateUtterances>=0);
});

test('A1 Batch 7: individual project targets can be sampled or explicitly unannotated',()=>{
 const report=run();
 assert.equal(byId(report,'event.open').state,'sampled-both-directions');
 assert.equal(byId(report,'person.father').state,'sampled-both-directions');
 assert.equal(byId(report,'event.movement').state,'sampled-both-directions');
 assert.equal(byId(report,'person.mother').state,'not-explicitly-annotated');
 assert.ok(byId(report,'event.read').verifiedCases>0);
 assert.ok(report.sources.every(x=>x.byDirection['en->pl']>0&&x.byDirection['pl->en']>0));
});

test('A1 Batch 7: suite failures must not be reported as verified successes',()=>{
 const checks=status('pass');
 checks.actions={status:'fail',exitCode:1,error:'fixture assertion failed'};
 const report=run({checks});
 assert.equal(report.verification.status,'fail');
 assert.equal(report.verification.suitesFailed,1);
 assert.ok(report.verification.positiveVerified<report.totals.positive);
 assert.equal(report.sources.find(x=>x.id==='actions').status,'fail');
 assert.equal(report.release.verified,false);
 const unverified=run({checks:status('not-run')});
 assert.equal(unverified.verification.status,'not-run');
 assert.equal(unverified.verification.positiveVerified,0);
 assert.equal(byId(unverified,'event.open').state,'declared-unverified');
 assert.equal(unverified.cefr.percentage,null);
});

test('A1 Batch 7: reject duplicate case IDs, unknown concepts and false green statuses',()=>{
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

test('A1 Batch 7: catalog-only CLI does not claim any executed checks',()=>{
 const proc=spawnSync(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only'],
   {cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30000});
 assert.equal(proc.status,0,proc.stderr);
 const report=JSON.parse(proc.stdout);
 assert.equal(report.verification.status,'not-run');
 assert.equal(report.verification.suitesNotRun,7);
 assert.equal(report.cefr.percentage,null);
});
