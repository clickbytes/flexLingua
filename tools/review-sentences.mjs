import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {isDeepStrictEqual} from 'node:util';
import {runLanguageConformance} from './language-conformance-lib.mjs';

const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u,value=>value.slice(1)));
const load=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));

function inputPath(args) {
  const filtered=args.filter(arg=>arg!=='--report'),at=filtered.indexOf('--input');
  if(at<0||!filtered[at+1]||filtered.length!==2)
    throw new Error('Usage: node tools/review-sentences.mjs --input <fixture.json> [--report]');
  const path=resolve(root,filtered[at+1]),inside=relative(root,path);
  if(inside.startsWith('..')||isAbsolute(inside)||!path.endsWith('.json'))throw new Error('Input must be a JSON file inside the repository.');
  return path;
}

function rowsFrom(fixture) {
  const refusals=[...(fixture.unsupported||fixture.invalid||[])].map(row=>({...row,expectedRefusal:true}));
  if(Array.isArray(fixture.cases))return [...fixture.cases,...refusals];
  if(Array.isArray(fixture.translations))return [...fixture.translations,...refusals];
  if(Array.isArray(fixture.enToPl)&&Array.isArray(fixture.plToEn))return [
    ...fixture.enToPl.map(row=>({...row,from:'en',to:'pl'})),
    ...fixture.plToEn.map(row=>({...row,from:'pl',to:'en'})),...refusals
  ];
  throw new Error('Fixture must expose cases, translations, or enToPl/plToEn arrays.');
}

const fixturePath=inputPath(process.argv.slice(2));
const reportMode=process.argv.includes('--report');
if(reportMode) {
  const report=await runLanguageConformance({fixturePath:relative(root,fixturePath)});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.status==='fail')process.exitCode=1;
} else {
const [concepts,features,en,pl,enGrammar,plGrammar,enMorphSpec,plMorphSpec,morphFeatures,fixture]=
  await Promise.all(['data/concepts.json','data/features.json','data/en.json','data/pl.json',
    'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json','data/morphology/pl.json',
    'data/morphology/features.json'].map(load).concat(
      JSON.parse(await readFile(fixturePath,'utf8'))));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
const engine=new Engine(concepts,features).registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));
const rows=rowsFrom(fixture);
if(!rows.length||rows.length>2000)throw new Error('Sentence fixture must contain 1..2000 rows.');

let mismatches=0;
for(const [index,row] of rows.entries()) {
  const id=row.id??`ROW-${index+1}`,from=row.from,to=row.to??(from==='en'?'pl':'en');
  if(!['en','pl'].includes(from)||!['en','pl'].includes(to)||from===to||typeof row.input!=='string')
    throw new Error(`Invalid sentence row: ${id}`);
  const result=engine.tryTranslate({from,to,text:row.input});
  const actual=result.ok?result.value.text:null;
  const expectedCore=row.expectedCore;
  const coreMatches=expectedCore===undefined || (result.ok &&
    isDeepStrictEqual(result.value.interlingua,expectedCore));
  const warningMatches=row.expectedWarningIncludes===undefined || (result.ok &&
    (result.value.warnings||[]).some(warning=>warning.includes(row.expectedWarningIncludes)));
  const errorMatches=!row.expectedError || (!result.ok&&result.error.code===row.expectedError);
  const status=row.expectedRefusal
    ?result.ok||!errorMatches?'mismatch':'refused'
    :result.ok&&row.expected===undefined?'review':result.ok&&actual===row.expected&&
      coreMatches&&warningMatches?'match':'mismatch';
  if(status==='mismatch')mismatches++;
  console.log(JSON.stringify({id,capability:row.capability??null,from,to,input:row.input,expected:row.expected??null,
    expectedRefusal:row.expectedRefusal??false,reason:row.reason??null,
    actual,status,core:result.ok?result.value.interlingua:null,
    warnings:result.ok?result.value.warnings||[]:[],error:result.ok?null:result.error}));
}
if(mismatches)process.exitCode=1;
}
