import {readFile,writeFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {verifyEvidenceFixture} from './a1-evidence-ledger-lib.mjs';
import {buildA1Report} from './report-a1-lib.mjs';

const args=process.argv.slice(2);
const allowed=new Set(['--strict','--output']);
for(let i=0;i<args.length;i++){
  if(!allowed.has(args[i]))throw new Error('Usage: npm run report:a1 -- [--strict] [--output file.json]');
  if(args[i]==='--output'){
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing --output filename.');
    i++;
  }
}
if(args.filter(a=>a==='--output').length>1)throw new Error('Duplicate --output.');
const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [ontology,features,pl,en,plMorph,enMorph,plGrammar,enGrammar,seed]=await Promise.all([
  'data/core/concepts.json','data/core/features.json','data/pl.json','data/en.json',
  'data/morphology/pl.json','data/morphology/en.json',
  'data/grammar/pl.json','data/grammar/en.json',
  'data/coverage/a1-pilot.json'
].map(load));
const corpusText=await readFile(new URL('../data/coverage/a1-gold-g2.json',import.meta.url),'utf8');
verifyEvidenceFixture('g2',corpusText);
const corpus=JSON.parse(corpusText);
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));
const report=buildA1Report(engine,{pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed},corpus);
const output=JSON.stringify(report,null,2)+'\n';
const path=args.indexOf('--output');
if(path>=0)await writeFile(args[path+1],output,'utf8');
else process.stdout.write(output);
if(args.includes('--strict')&&report.behavioral.summary.failed>0)process.exitCode=1;
