import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseNodeTestSummaries} from './check-core-gates.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2];
if(!['quick','full'].includes(mode))
  throw new Error('Usage: node tools/local-check.mjs quick|full');

const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root}`,...args],
  {cwd:root,encoding:'utf8'}).trim();

function run(command,args,{log}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,
      stdio:['ignore','pipe','pipe']});
    let tail='';
    const receive=chunk=>{
      const value=chunk.toString();
      if(log)log.write(value);
    tail=(tail+value).slice(-6000);
    };
    child.stdout.on('data',receive);
    child.stderr.on('data',receive);
    child.once('error',reject);
    child.once('close',code=>resolve({code:code??1,tail}));
  });
}

function assertPushedHead(sha){
  if(process.stdin.isTTY)return;
  const chunks=[];
  // Git supplies refs on stdin to pre-push. Manual CLI runs supply no refs.
  process.stdin.setEncoding('utf8');
  return new Promise((resolve,reject)=>{
    process.stdin.on('data',chunk=>chunks.push(chunk));
    process.stdin.on('end',()=>{
      for(const line of chunks.join('').split(/\r?\n/u).filter(Boolean)){
        const fields=line.trim().split(/\s+/u);
        if(fields.length!==4){reject(new Error('Invalid pre-push ref record.'));return;}
        if(!/^0+$/u.test(fields[1])&&fields[1]!==sha){
          reject(new Error('Pre-push can verify only the current HEAD. Push each checked branch separately.'));
          return;
        }
      }
      resolve();
    });
    process.stdin.resume();
  });
}

async function main(){
  const sha=git('rev-parse','HEAD');
  if(mode==='quick'){
    const result=await run(process.execPath,['tools/a1-evidence-ledger.mjs','--catalog-only']);
    if(result.code!==0)throw new Error('A1 fixture catalog failed:\n'+result.tail);
    process.stdout.write('Local fixture catalog PASS.\n');
    return;
  }
  await assertPushedHead(sha);
  if(git('status','--porcelain=v1','--untracked-files=no'))
    throw new Error('Commit tracked changes before the local full check.');
  const fixture=JSON.parse(await readFile(join(root,'data/coverage/a1-heldout-v1.json'),'utf8'));
  const pairs=fixture.groups.flatMap(group=>group.pairs);
  if(pairs.length!==100||fixture.unsupported.length!==20)
    throw new Error('A1 H1 pilot must keep 100 bilingual pairs and 20 refusals.');
  const directory=join(root,'.local-checks');
  await mkdir(directory,{recursive:true});
  const logPath=join(directory,sha+'.log');
  const reportPath=join(directory,sha+'.json');
  const log=createWriteStream(logPath,{encoding:'utf8'});
  process.stdout.write('Running local release checks for '+sha+'...\n');
  const result=process.platform==='win32'?
    await run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run check:release'],{log}):
    await run('npm',['run','check:release'],{log});
  await new Promise((resolve,reject)=>log.end(error=>error?reject(error):resolve()));
  const output=await readFile(logPath,'utf8');
  const report={schemaVersion:1,sourceSha:sha,command:'npm run check:release',
    status:result.code===0?'PASS':'FAIL',exitCode:result.code,
    a1Pilot:{fixture:'data/coverage/a1-heldout-v1.json',
      positive:{'en->pl':pairs.length,'pl->en':pairs.length},
      refusals:fixture.unsupported.length},
    nodeTestRuns:parseNodeTestSummaries(output),
    note:'Node runs may overlap; do not add their counts as unique cases.',
    log:'.local-checks/'+sha+'.log'};
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  if(git('rev-parse','HEAD')!==sha||git('status','--porcelain=v1','--untracked-files=no'))
    throw new Error('HEAD or tracked files changed during the check; rerun on the final commit.');
  process.stdout.write('Local release checks '+report.status+' for '+sha+'. Report: '+reportPath+'\n');
  if(result.code!==0){
    process.stderr.write('See '+logPath+' for the failing command and case.\n'+
      result.tail.split(/\r?\n/u).slice(-24).join('\n')+'\n');
    process.exitCode=1;
  }
}

main().catch(error=>{process.stderr.write('Local check failed: '+error.message+'\n');process.exitCode=1;});
