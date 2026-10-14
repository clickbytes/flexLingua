import {readFile,writeFile} from 'node:fs/promises';
import {analyzeCoverage} from './coverage-a1-lib.mjs';
const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const paths=['data/pl.json','data/en.json','data/concepts.json','data/morphology/pl.json','data/morphology/en.json',
  'data/grammar/pl.json','data/grammar/en.json','data/coverage/a1-pilot.json'];
const [pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed]=await Promise.all(paths.map(load));
const report=JSON.stringify(analyzeCoverage({pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed}),null,2)+'\n';
const flag=process.argv.indexOf('--output');
if(flag>=0){
  const path=process.argv[flag+1];
  if(!path||path.startsWith('--'))throw new Error('Usage: node tools/coverage-a1.mjs [--output filename.json]');
  await writeFile(path,report,'utf8');
}else process.stdout.write(report);
