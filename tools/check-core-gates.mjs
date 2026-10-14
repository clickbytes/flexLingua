import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {coreGatePlan,runCoreGates} from './check-core-gates-lib.mjs';

const args=process.argv.slice(2);
if(args.some(x=>x!=='--include-standalone')||args.length>1){
  throw new Error('Usage: node tools/check-core-gates.mjs [--include-standalone]');
}
const cwd=fileURLToPath(new URL('..',import.meta.url));
const files=(await readdir(new URL('../tests/',import.meta.url))).filter(x=>x.endsWith('.test.js'));
const plan=coreGatePlan(files,{includeStandalone:args.includes('--include-standalone')});
const report=runCoreGates(plan,{spawn:spawnSync,nodePath:process.execPath,cwd});
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(report.status!=='pass')process.exitCode=1;
