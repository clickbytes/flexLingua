import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {runLanguageConformance,validateLanguageConformanceFixture}
  from '../tools/language-conformance-lib.mjs';

const fixturePath='tests/fixtures/generic-language-conformance.json';
const fixture=JSON.parse(await readFile(new URL('./fixtures/generic-language-conformance.json',import.meta.url),'utf8'));

test('generic conformance fixture has stable, project-authored cases',()=>{
  assert.equal(validateLanguageConformanceFixture(fixture),true);
  assert.equal(new Set(fixture.cases.map(row=>row.id)).size,fixture.cases.length);
  assert.ok(fixture.cases.every(row=>row.source.startsWith('Project-authored')));
  assert.ok(fixture.cases.some(row=>row.operation==='morphology'&&row.language==='ar'));
  assert.ok(fixture.cases.some(row=>row.capability==='information_loss'));
});

test('package/capability report runs the static cases and keeps unsupported separate',async()=>{
  const report=await runLanguageConformance({fixturePath});
  const failures=report.cases.filter(row=>row.status==='fail');
  assert.equal(report.status,'pass',JSON.stringify(failures,null,2));
  assert.equal(report.totals.cases,fixture.cases.length);
  assert.equal(report.totals.pass,fixture.cases.length);
  assert.match(report.source.fixtureSha256,/^[a-f0-9]{64}$/u);
  const statuses=new Map(report.packages.map(item=>[item.language,item.capabilities]));
  assert.deepEqual(statuses.get('ar').morphology.status,'pass');
  assert.equal(statuses.get('ar').syntax.status,'unsupported');
  assert.equal(statuses.get('it').morphology.status,'unsupported');
  assert.equal(statuses.get('it').syntax.status,'pass');
  assert.ok(statuses.has('tr'));
});

test('review-sentences report mode emits the machine-readable contract',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const result=spawnSync(process.execPath,[
    'tools/review-sentences.mjs','--input',fixturePath,'--report'
  ],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.type,'language_conformance_report');
  assert.equal(report.status,'pass');
  assert.equal(report.totals.cases,fixture.cases.length);
});
