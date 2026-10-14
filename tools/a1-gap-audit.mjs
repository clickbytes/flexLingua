import {readFile,writeFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {evaluateA1Gold} from './a1-gold-lib.mjs';
import {auditA1Gaps} from './a1-gap-audit-lib.mjs';

const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=='--output'||!args[1]||args[1].startsWith('--')))
  throw new Error('Usage: node tools/a1-gap-audit.mjs [--output report.json]');
const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [ontology,features,pl,en,plMorph,enMorph,plGrammar,enGrammar,seed,corpus,manifest]=
  await Promise.all([
    'data/concepts.json','data/features.json','data/pl.json','data/en.json',
    'data/morphology/pl.json','data/morphology/en.json','data/grammar/pl.json',
    'data/grammar/en.json','data/coverage/a1-pilot.json',
    'data/coverage/a1-gold-g2.json','data/coverage/a1-targets.json'
  ].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));
const benchmark=evaluateA1Gold(engine,corpus);
const audit=auditA1Gaps({manifest,inventory:{ontology,pl,en,plMorph,enMorph,plGrammar,enGrammar,seed},
  corpus,benchmark});
const output=JSON.stringify(audit,null,2)+'\n';
if(args.length)await writeFile(args[1],output,'utf8');else process.stdout.write(output);
if(benchmark.status==='fail')process.exitCode=1; // No silently successful audit over failing gold.
