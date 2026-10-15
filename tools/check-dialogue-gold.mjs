import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildDialogueGoldReport,sha256Text} from './a1-evidence-ledger-lib.mjs';

const fixturePath='tests/fixtures/gold-conversation-a1.json';
const fixtureText=await readFile(new URL('../'+fixturePath,import.meta.url),'utf8');
const fixture=JSON.parse(fixtureText);
const root=fileURLToPath(new URL('../',import.meta.url));
const run=spawnSync(process.execPath,['--test','tests/dialogue-engine-a1.test.js'],{
  cwd:root,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024
});
const output=String(run.stdout||'')+'\n'+String(run.stderr||'');
const results=fixture.scenes.map(scene=>{
  const escaped=scene.id.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const failed=new RegExp('^not ok \\d+ - '+escaped+':','mu').test(output);
  const passed=new RegExp('^ok \\d+ - '+escaped+':','mu').test(output);
  return {id:scene.id,status:passed&&!failed?'pass':'fail'};
});
const report=buildDialogueGoldReport({fixture,fixtureSha256:sha256Text(fixtureText),results});
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(run.error)throw run.error;
if(run.status!==0||report.totals.failed!==0)process.exitCode=run.status||1;
