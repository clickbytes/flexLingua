import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coreGatePlan,runCoreGates} from '../tools/check-core-gates-lib.mjs';

test('F0: the offline local runner includes the actual project gates and full test inventory',()=>{
  const plan=coreGatePlan(['z.test.js','a.test.js']);
  assert.deepEqual(plan.map(x=>x.name),
    ['lexicon','morphology','gold','a1-gold','coverage','full-node-tests']);
  assert.deepEqual(plan.at(-1).args,['--test','tests/a.test.js','tests/z.test.js']);
  assert.equal(plan.some(x=>x.name==='standalone-parity'),false);
  const withGui=coreGatePlan(['z.test.js'],{includeStandalone:true});
  assert.deepEqual(withGui.at(-1),{name:'standalone-parity',
    args:['tools/build-standalone.mjs','--check']});
});

test('F0: gate planner rejects unsafe paths, duplicates and missing test inventory',()=>{
  for(const files of [[],['../secrets.test.js'],['ui.js'],['a.test.js','a.test.js']])
    assert.throws(()=>coreGatePlan(files),/unique, bounded/);
});

test('F0: runner accumulates errors rather than hiding other failing checks',()=>{
  let called=0;
  const spawn=(_bin,_args)=>{
    called++;
    return called===2?{status:1,stdout:'failure',stderr:'malformed morphology'}:
      {status:0,stdout:'passed',stderr:''};
  };
  const plan=coreGatePlan(['a.test.js']);
  const report=runCoreGates(plan,{spawn,nodePath:'/usr/bin/node',cwd:'/repo'});
  assert.equal(called,6);
  assert.deepEqual(report.summary,{total:6,passed:5,failed:1});
  assert.equal(report.status,'fail');
  assert.equal(report.githubActionsVerified,false);
  assert.equal(report.releaseVerified,false);
  assert.match(report.rows[1].stderrTail,/malformed morphology/);
});

test('F0: process errors and timeouts must fail, never be marked green',()=>{
  const p=coreGatePlan(['a.test.js']);
  const report=runCoreGates(p,{spawn:()=>({status:null,error:new Error('ENOENT'),signal:null})});
  assert.equal(report.summary.failed,6);
  assert.equal(report.rows[0].error,'ENOENT');
});

test('F0: package advertises the local runner but keeps CI/release gates strict',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.scripts['check:core-local'],'node tools/check-core-gates.mjs');
  assert.match(pkg.scripts['check:release'],/check:standalone/);
  assert.match(pkg.scripts['check:release'],/npm test/);
});
