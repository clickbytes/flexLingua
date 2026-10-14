import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EVIDENCE_SOURCES,buildA1EvidenceLedger} from './a1-evidence-ledger-lib.mjs';

const args=process.argv.slice(2);
const catalogOnly=args.includes('--catalog-only');
const outputAt=args.indexOf('--output');
const known=new Set(['--catalog-only','--output']);
for(let i=0;i<args.length;i++){
 if(!known.has(args[i]))throw new Error('Usage: node tools/a1-evidence-ledger.mjs [--catalog-only] [--output report.json]');
 if(args[i]==='--output'){
   if(i!==outputAt||!args[i+1]||args[i+1].startsWith('--'))
     throw new Error('Invalid output path.');
   i++;
 }
}
if(args.filter(x=>x==='--catalog-only').length>1||args.filter(x=>x==='--output').length>1)
 throw new Error('Duplicate evidence ledger option.');
const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [manifest,ontology]=await Promise.all(['data/coverage/a1-targets.json','data/concepts.json'].map(load));
const corpora=Object.fromEntries(await Promise.all(EVIDENCE_SOURCES.map(async source=>
 [source.id,await load(source.fixture)])));
const cwd=fileURLToPath(new URL('../',import.meta.url));
const checks={};
for(const source of EVIDENCE_SOURCES){
 if(catalogOnly){
   checks[source.id]={status:'not-run',exitCode:null};
   continue;
 }
 const run=spawnSync(process.execPath,source.args,{
   cwd,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024
 });
 const passed=run.status===0&&!run.error&&!run.signal;
 checks[source.id]={
   status:passed?'pass':'fail',exitCode:run.status??null,
   ...(passed?{}:{error:(run.error?.message||'')+'\n'+String(run.stderr||run.stdout||'').slice(-1600)})
 };
}
const report=buildA1EvidenceLedger({manifest,ontology,corpora,checks});
const output=JSON.stringify(report,null,2)+'\n';
if(outputAt>=0)await writeFile(args[outputAt+1],output,'utf8');
else process.stdout.write(output);
if(!catalogOnly&&report.verification.status!=='pass')process.exitCode=1;
