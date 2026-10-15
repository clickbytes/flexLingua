import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDialogueGoldReport,DIALOGUE_GOLD_SHA256,sha256Text} from '../tools/a1-evidence-ledger-lib.mjs';

const fixtureText=await readFile(new URL('./fixtures/gold-conversation-a1.json',import.meta.url),'utf8');
const fixture=JSON.parse(fixtureText);
const fixtureSha256=sha256Text(fixtureText);
const passingResults=fixture.scenes.map(scene=>({id:scene.id,status:'pass'}));

test('DIAL-05 report verifies each declared dialogue scene and act in both directions',()=>{
  assert.equal(fixtureSha256,DIALOGUE_GOLD_SHA256);
  const report=buildDialogueGoldReport({fixture,fixtureSha256,results:passingResults});
  assert.deepEqual(report.totals,{scenes:22,passed:22,failed:0,minimumTurns:3});
  assert.deepEqual(report.byDirection,{
    'en->pl':{passed:11,failed:0},'pl->en':{passed:11,failed:0}
  });
  assert.deepEqual(report.byAct.assert,{passed:22,failed:0});
  assert.deepEqual(report.byAct.ask,{passed:22,failed:0});
  assert.deepEqual(report.byAct.confirm,{passed:12,failed:0});
  assert.deepEqual(report.byAct.answer,{passed:10,failed:0});
  assert.ok(report.scenes.every(scene=>scene.acts.length===3&&
    scene.acts.every(act=>act.status==='pass')));
});

test('DIAL-05 report rejects an unpinned fixture, missing scene and duplicate result',()=>{
  assert.throws(()=>buildDialogueGoldReport({fixture,fixtureSha256:'0'.repeat(64),
    results:passingResults}),/unpinned/);
  assert.throws(()=>buildDialogueGoldReport({fixture,fixtureSha256,
    results:passingResults.slice(1)}),/every scene/);
  assert.throws(()=>buildDialogueGoldReport({fixture,fixtureSha256,
    results:[...passingResults,{...passingResults[0]}]}),/duplicate dialogue scene result/);
});
