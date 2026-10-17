#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {cpus, release, totalmem} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createCoreLanguage} from '../js/core/core-language.js';
import {compileMorphology} from '../js/core/morphology/compiler.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SCRIPT=fileURLToPath(import.meta.url);
// These pinned expectations mirror the current engine limits; a changed refusal
// requires an intentional update to this benchmark and its ADR.
const EXPECTED_LIMITS=Object.freeze({slots:256,analyses:64,compiledForms:300000});
const load=async path=>JSON.parse(await readFile(resolve(ROOT,path),'utf8'));

function makeSlots({caseCount,numbers=['singular','plural'],persons=[],limit=Infinity,steps=true}) {
  const cases=Array.from({length:caseCount},(_,index)=>`case_${String(index+1).padStart(2,'0')}`);
  const slots=[];
  for(const gramCase of cases)for(const number of numbers) {
    for(const person of persons.length?persons:[null]) {
      const features={case:gramCase,number,...(person?{person}:{})};
      const suffix=`x${slots.length.toString(36)}`;
      slots.push({features,steps:steps?[{op:'append',value:suffix}]:[]});
      if(slots.length>=limit)return {cases,slots};
    }
  }
  return {cases,slots};
}

function syntheticDictionary(count,conceptId,{sameLemma=false}={}) {
  const nouns=Array.from({length:count},(_,index)=>{
    const id=`bench.noun.${index+1}`;
    const lemma=sameLemma?'homograph':`benchword${index+1}`;
    return {id,lemma,forms:{singular:lemma,plural:`${lemma}s`},senses:[{
      id:`${id}.sense.1`,coreRef:{kind:'concept',id:conceptId}
    }]};
  });
  return {language:'en',version:'1.0',nouns,verbs:[],adjectives:[],degrees:[],attitudes:[],
    quantifiers:[],functionWords:[],modals:[]};
}

function syntheticSpec(count,slots,{sameStem=false}={}) {
  const bindings=Array.from({length:count},(_,index)=>({
    lexemeId:`bench.noun.${index+1}`,paradigmId:'bench.noun',
    stems:{base:sameStem?'homograph':`benchstem${index+1}`},overrides:[]
  }));
  return {version:'1.11',language:'en',paradigms:{'bench.noun':{pos:'NOUN',slots}},bindings};
}

function memory() {
  const {rss,heapUsed,heapTotal}=process.memoryUsage();
  return {rssBytes:rss,heapUsedBytes:heapUsed,heapTotalBytes:heapTotal};
}

function checkExpectedRefusal(scenario,error,phase,startedAt,baseline) {
  const expected={
    'slots-257':{phase:'createMorphology',pattern:/Invalid paradigm bench\.noun/u},
    'analyses-65':{phase:'analyze',pattern:/Excessive morphology ambiguity/u},
    'compiled-forms-300001':{phase:'createMorphology',pattern:/Morphology compilation exceeds form limit/u}
  }[scenario];
  if(!expected)return null;
  if(phase!==expected.phase||!expected.pattern.test(error.message)) {
    throw new Error(`Unexpected ${scenario} failure at ${phase}: ${error.message}`);
  }
  return {scenario,outcome:'refused',phase,reason:error.message,expectedRefusal:true,
    elapsedMs:Number((performance.now()-startedAt).toFixed(3)),baseline,atRefusal:memory()};
}

async function runCase(scenario) {
  const [concepts,en,baseFeatures,morphologyFeatures]=await Promise.all([
    load('data/core/concepts.json'),load('data/en.json'),load('data/core/features.json'),
    load('data/morphology/features.json')
  ]);
  const core=createCoreLanguage(concepts);
  const sampleSense=en.nouns.find(noun=>noun.senses?.length)?.senses[0];
  const conceptId=sampleSense?.coreRef?.id||sampleSense?.concept;
  if(!conceptId)throw new Error('Benchmark requires an existing English noun sense.');

  let lexemeCount=10,slotCount=0,fixture,featureSpec=structuredClone(morphologyFeatures);
  if(scenario==='10-cases-x-2-number') {
    fixture=makeSlots({caseCount:10});
  } else if(scenario==='10-cases-x-2-number-x-3-person') {
    fixture=makeSlots({caseCount:10,persons:['first','second','third']});
  } else if(scenario==='slots-256'||scenario==='slots-257') {
    const desired=scenario==='slots-256'?EXPECTED_LIMITS.slots:EXPECTED_LIMITS.slots+1;
    fixture=makeSlots({caseCount:43,persons:['first','second','third'],limit:desired});
  } else if(scenario==='analyses-65') {
    lexemeCount=EXPECTED_LIMITS.analyses+1;
    fixture={cases:[],slots:[{features:{number:'singular'},steps:[]}]};
  } else if(scenario==='compiled-forms-300001') {
    lexemeCount=Math.ceil((EXPECTED_LIMITS.compiledForms+1)/EXPECTED_LIMITS.slots);
    fixture=makeSlots({caseCount:43,persons:['first','second','third'],limit:EXPECTED_LIMITS.slots});
  } else {
    throw new Error(`Unknown benchmark scenario: ${scenario}`);
  }
  slotCount=fixture.slots.length;
  featureSpec.dimensions.case=fixture.cases.length?fixture.cases:
    morphologyFeatures.dimensions.case;
  const dictionary=syntheticDictionary(lexemeCount,conceptId,{sameLemma:scenario==='analyses-65'});
  const spec=syntheticSpec(lexemeCount,fixture.slots,{sameStem:scenario==='analyses-65'});
  global.gc?.();
  const baseline=memory(),startedAt=performance.now();
  let morphology;
  try {
    morphology=createMorphology(spec,dictionary,featureSpec,{core});
  } catch(error) {
    const refusal=checkExpectedRefusal(scenario,error,'createMorphology',startedAt,baseline);
    if(refusal)return {...refusal,lexemeCount,slotCount};
    throw error;
  }
  const builtAt=performance.now(),afterBuild=memory();

  if(scenario==='analyses-65') {
    try {
      morphology.analyze({text:'homograph'});
    } catch(error) {
      const refusal=checkExpectedRefusal(scenario,error,'analyze',startedAt,baseline);
      if(refusal)return {...refusal,lexemeCount,slotCount,
        buildMs:Number((builtAt-startedAt).toFixed(3)),afterBuild};
      throw error;
    }
    throw new Error('65-way inverse ambiguity unexpectedly succeeded.');
  }

  const artifactStarted=performance.now();
  const artifact=compileMorphology(morphology);
  const artifactMs=performance.now()-artifactStarted;
  const forms=artifact.readings;
  const rounds=Math.max(10,Math.ceil(20000/forms.length));
  let generationChecksum=0;
  const generationStarted=performance.now();
  for(let round=0;round<rounds;round++)for(const form of forms) {
    const result=morphology.generate({lexemeId:form.lexemeId,features:form.features});
    if(result.length!==1||result[0].text!==form.text)throw new Error('Generation parity failed.');
    generationChecksum+=result[0].text.length;
  }
  const generationMs=performance.now()-generationStarted;
  let inverseChecksum=0;
  const inverseStarted=performance.now();
  for(let round=0;round<rounds;round++)for(const form of forms) {
    const result=morphology.analyze({text:form.text});
    if(!result.some(reading=>reading.lexemeId===form.lexemeId&&
        JSON.stringify(reading.features)===JSON.stringify(form.features))) {
      throw new Error('Inverse parity failed.');
    }
    inverseChecksum+=result.length;
  }
  const inverseMs=performance.now()-inverseStarted;
  const finalMemory=memory();
  return {scenario,outcome:'measured',lexemeCount,slotCount,forms:forms.length,rounds,
    buildMs:Number((builtAt-startedAt).toFixed(3)),artifactMs:Number(artifactMs.toFixed(3)),
    generationMs:Number(generationMs.toFixed(3)),inverseMs:Number(inverseMs.toFixed(3)),
    generationQueries:forms.length*rounds,inverseQueries:forms.length*rounds,
    artifactBytes:Buffer.byteLength(JSON.stringify(artifact)),
    artifactSha256:createHash('sha256').update(JSON.stringify(artifact)).digest('hex'),
    generationChecksum,inverseChecksum,baseline,afterBuild,afterArtifact:finalMemory,
    rssDeltaBytes:finalMemory.rssBytes-baseline.rssBytes,
    heapDeltaBytes:finalMemory.heapUsedBytes-baseline.heapUsedBytes};
}

function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

function summarize(scenario,trials) {
  const first=trials[0];
  if(trials.some(item=>item.outcome!==first.outcome||item.reason!==first.reason||
      item.artifactSha256!==first.artifactSha256)) {
    throw new Error(`Non-deterministic benchmark result for ${scenario}.`);
  }
  if(first.outcome==='refused')return {scenario,trials:trials.length,outcome:first.outcome,
    phase:first.phase,reason:first.reason,elapsedMsMedian:median(trials.map(item=>item.elapsedMs)),
    rssAtRefusalBytesMedian:median(trials.map(item=>item.atRefusal.rssBytes)),
    rssDeltaAtRefusalBytesMedian:median(trials.map(item=>
      item.atRefusal.rssBytes-item.baseline.rssBytes)),
    stableRefusal:true,lexemeCount:first.lexemeCount,slotCount:first.slotCount};
  return {scenario,trials:trials.length,outcome:first.outcome,lexemeCount:first.lexemeCount,
    slotCount:first.slotCount,forms:first.forms,artifactBytes:first.artifactBytes,
    artifactSha256:first.artifactSha256,
    buildMsMedian:median(trials.map(item=>item.buildMs)),
    artifactMsMedian:median(trials.map(item=>item.artifactMs)),
    generationMsMedian:median(trials.map(item=>item.generationMs)),
    inverseMsMedian:median(trials.map(item=>item.inverseMs)),
    generationQueries:first.generationQueries,inverseQueries:first.inverseQueries,
    rssAfterBuildDeltaBytesMedian:median(trials.map(item=>
      item.afterBuild.rssBytes-item.baseline.rssBytes)),
    heapAfterBuildDeltaBytesMedian:median(trials.map(item=>
      item.afterBuild.heapUsedBytes-item.baseline.heapUsedBytes)),
    rssDeltaBytesMedian:median(trials.map(item=>item.rssDeltaBytes)),
    heapDeltaBytesMedian:median(trials.map(item=>item.heapDeltaBytes)),
    deterministicArtifact:true};
}

async function runSuite() {
  const scenarios=[
    ['10-cases-x-2-number',3],
    ['10-cases-x-2-number-x-3-person',3],
    ['slots-256',3],
    ['slots-257',3],
    ['analyses-65',3],
    ['compiled-forms-300001',3]
  ];
  const results=[];
  for(const [scenario,repetitions] of scenarios) {
    const trials=[];
    for(let index=0;index<repetitions;index++) {
      const child=spawnSync(process.execPath,[SCRIPT,'--case',scenario],{
        cwd:ROOT,encoding:'utf8',maxBuffer:4*1024*1024,
        env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS||''} --expose-gc`.trim()}
      });
      if(child.error)throw child.error;
      if(child.status!==0)throw new Error(child.stderr||`Benchmark child failed: ${scenario}`);
      trials.push(JSON.parse(child.stdout));
    }
    results.push(summarize(scenario,trials));
  }
  const hardware=cpus();
  return {benchmark:'morphology-finite-table-v1',node:process.version,platform:process.platform,
    osRelease:release(),architecture:process.arch,logicalCpus:hardware.length,
    cpuModel:hardware[0]?.model||'unknown',totalMemoryBytes:totalmem(),
    limits:EXPECTED_LIMITS,results};
}

if(process.argv[2]==='--case') {
  runCase(process.argv[3]).then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
    .catch(error=>{console.error(error.stack||error);process.exitCode=1;});
} else {
  runSuite().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error.stack||error);process.exitCode=1;});
}
