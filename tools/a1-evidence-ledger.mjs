import {readFile,rename,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {A1_CONSTRUCTION_REGISTRY_PATH,EVIDENCE_SOURCES,buildA1EvidenceLedger,sha256Text,verifyEvidenceFixture} from './a1-evidence-ledger-lib.mjs';

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

const loadText=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [manifestText,ontologyText,constructionRegistryText]=await Promise.all([
 loadText('data/coverage/a1-targets.json'),loadText('data/core/concepts.json'),loadText(A1_CONSTRUCTION_REGISTRY_PATH)
]);
const manifest=JSON.parse(manifestText),ontology=JSON.parse(ontologyText),
 constructionRegistry=JSON.parse(constructionRegistryText);
const corpora={},fixtureDigests={};
// Validate every pinned gold file before launching any suite or writing a report.
for(const source of EVIDENCE_SOURCES){
 const text=await loadText(source.fixture);
 fixtureDigests[source.id]=verifyEvidenceFixture(source.id,text);
 corpora[source.id]=JSON.parse(text);
}

const cwd=fileURLToPath(new URL('../',import.meta.url));
const checks={};
for(const source of EVIDENCE_SOURCES){
 if(catalogOnly){
   checks[source.id]={status:'not-run',exitCode:null,execution:null};
   continue;
 }
 const run=spawnSync(process.execPath,source.args,{
   cwd,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024
 });
 const passed=run.status===0&&!run.error&&!run.signal;
 checks[source.id]={
   status:passed?'pass':'fail',exitCode:run.status??null,
   execution:{kind:'benchmark',runtime:'node',executable:process.execPath,
     version:process.version,pid:run.pid??null,args:source.args,
     exitCode:run.status??null,signal:run.signal??null},
   ...(passed?{}:{error:(run.error?.message||'')+'\n'+String(run.stderr||run.stdout||'').slice(-1600)})
 };
}
const report=buildA1EvidenceLedger({manifest,ontology,corpora,checks,constructionRegistry,
 inputDigests:{manifest:sha256Text(manifestText),ontology:sha256Text(ontologyText),
   constructionRegistry:sha256Text(constructionRegistryText),fixtures:fixtureDigests}});
report.execution={kind:'ledger',runtime:'node',executable:process.execPath,
 version:process.version,pid:process.pid,args:process.argv.slice(1)};
const output=JSON.stringify(report,null,2)+'\n';
if(outputAt>=0){
 const target=resolve(cwd,args[outputAt+1]);
 const temporary=target+'.tmp-'+randomUUID();
 try{
   await writeFile(temporary,output,{encoding:'utf8',flag:'wx'});
   await rename(temporary,target);
 }catch(error){
   await rm(temporary,{force:true});
   throw error;
 }
}else process.stdout.write(output);
if(!catalogOnly&&report.verification.status!=='pass')process.exitCode=1;
