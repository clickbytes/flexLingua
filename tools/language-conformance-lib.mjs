import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {validateInterlingua} from '../js/core/interlingua.js';
import {DEFAULT_DATA_ROOT,loadLanguagePackages,loadLanguagePackage,
  validateLanguageManifest} from './language-packages.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CAPABILITIES=new Set(['end_to_end','syntax','morphology','core_semantics',
  'refusal','information_loss']);
const OPERATIONS=new Set(['translate','roundtrip','morphology','core_validate','invalid_manifest']);
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const sha256=value=>createHash('sha256').update(value).digest('hex');

export function validateLanguageConformanceFixture(fixture) {
  if(!fixture || typeof fixture!=='object' || Array.isArray(fixture) ||
      fixture.schemaVersion!==1 || fixture.license!=='project-authored' ||
      typeof fixture.origin!=='string' || !fixture.origin.trim() ||
      !Array.isArray(fixture.cases) || !fixture.cases.length || fixture.cases.length>2000) {
    throw new Error('Invalid language conformance fixture header.');
  }
  const ids=new Set();
  for(const row of fixture.cases) {
    if(!row || typeof row!=='object' || Array.isArray(row) ||
        typeof row.id!=='string' || !/^[A-Z0-9][A-Z0-9._-]{0,95}$/u.test(row.id) ||
        ids.has(row.id) || !CAPABILITIES.has(row.capability) ||
        !OPERATIONS.has(row.operation) || typeof row.source!=='string' || !row.source.trim()) {
      throw new Error('Invalid or duplicate language conformance case.');
    }
    ids.add(row.id);
    if(row.operation==='translate' &&
        (typeof row.from!=='string' || typeof row.to!=='string' ||
          typeof row.input!=='string' || (!row.expectedRefusal && typeof row.expected!=='string'))) {
      throw new Error(`Invalid translation case: ${row.id}`);
    }
    if(row.operation==='roundtrip' &&
        (typeof row.language!=='string' || typeof row.input!=='string' ||
          typeof row.expected!=='string')) throw new Error(`Invalid roundtrip case: ${row.id}`);
    if(row.operation==='morphology' &&
        (typeof row.language!=='string' || typeof row.lexemeId!=='string' ||
          !row.features || typeof row.features!=='object' ||
          !Array.isArray(row.expectedForms) || !row.expectedForms.length)) {
      throw new Error(`Invalid morphology case: ${row.id}`);
    }
    if(row.operation==='core_validate' &&
        (!row.core || typeof row.core!=='object' || row.expectedValid!==true)) {
      throw new Error(`Invalid CORE case: ${row.id}`);
    }
    if(row.operation==='invalid_manifest' &&
        (typeof row.language!=='string' || !Array.isArray(row.mutation) ||
          row.mutation.length!==2 || typeof row.expectedError!=='string')) {
      throw new Error(`Invalid manifest refusal case: ${row.id}`);
    }
  }
  return true;
}

async function createPackageEngine() {
  const packages=await loadLanguagePackages();
  const coreSpec=packages[0]?.packages.core;
  if(!coreSpec)throw new Error('Language conformance requires a shared CORE package.');
  const features=await readJson(resolve(DEFAULT_DATA_ROOT,'features.json'));
  const engine=new Engine(coreSpec,features),morphologies=new Map();
  for(const {manifest,packages:parts} of packages) {
    if(!manifest.capabilities.morphology)continue;
    const morphology=createMorphology(parts.morphology,parts.morphologyLexicon,
      parts.morphologyFeatures,{core:engine.core});
    engine.registerMorphology(morphology);
    morphologies.set(manifest.language,morphology);
  }
  for(const {manifest,packages:parts} of packages) {
    if(!manifest.capabilities.parsing || !manifest.capabilities.realization)continue;
    engine.registerLanguage(createRuleAdapter(parts.lexicon,parts.grammar,{
      morphology:morphologies.get(manifest.language)
    }));
  }
  return {engine,packages};
}

function runCase(row,{engine,packagesByLanguage}) {
  const result={id:row.id,capability:row.capability,source:row.source,status:'fail'};
  try {
    if(row.operation==='translate') {
      const output=engine.tryTranslate({from:row.from,to:row.to,text:row.input});
      result.from=row.from;result.to=row.to;result.input=row.input;
      result.expected=row.expected??null;
      result.actual=output.ok?output.value.text:null;
      result.actualCore=output.ok?output.value.interlingua:null;
      result.warnings=output.ok?output.value.warnings||[]:[];
      result.error=output.ok?null:output.error;
      if(row.expectedRefusal===true) {
        result.status=!output.ok && (!row.expectedError || output.error.code===row.expectedError) ?
          'pass':'fail';
      } else {
        const textMatches=output.ok && output.value.text===row.expected;
        const coreMatches=row.expectedCore===undefined || (output.ok &&
          isDeepStrictEqual(output.value.interlingua,row.expectedCore));
        const warningMatches=row.expectedWarningIncludes===undefined || (output.ok &&
          result.warnings.some(warning=>warning.includes(row.expectedWarningIncludes)));
        result.status=textMatches&&coreMatches&&warningMatches?'pass':'fail';
      }
    } else if(row.operation==='roundtrip') {
      const core=engine.analyze({from:row.language,text:row.input});
      const output=engine.realize({interlingua:core,to:row.language});
      result.language=row.language;result.input=row.input;result.expected=row.expected;
      result.actual=output.text;result.actualCore=core;result.warnings=output.warnings||[];
      result.status=output.text===row.expected && (row.expectedCore===undefined ||
        isDeepStrictEqual(core,row.expectedCore))?'pass':'fail';
    } else if(row.operation==='morphology') {
      const forms=engine.inflect({language:row.language,lexemeId:row.lexemeId,
        features:row.features}).map(form=>form.text);
      const analyses=forms.flatMap(text=>engine.analyzeForm({language:row.language,text}));
      result.language=row.language;result.lexemeId=row.lexemeId;result.features=row.features;
      result.expectedForms=row.expectedForms;result.actualForms=forms;
      result.reverseFound=analyses.some(item=>item.lexemeId===row.lexemeId);
      result.status=isDeepStrictEqual(forms,row.expectedForms) && result.reverseFound?'pass':'fail';
    } else if(row.operation==='core_validate') {
      validateInterlingua(row.core,engine.ontology,engine.features);
      result.expectedValid=row.expectedValid;result.actualValid=true;
      result.status='pass';
    } else {
      const loaded=packagesByLanguage.get(row.language);
      if(!loaded)throw new Error(`Unknown package in manifest case: ${row.language}`);
      const altered=structuredClone(loaded.manifest);
      altered[row.mutation[0]]=row.mutation[1];
      try {
        validateLanguageManifest(altered,{language:row.language});
        result.status='fail';result.error='Invalid manifest was accepted.';
      } catch(error) {
        result.status=error.message.includes(row.expectedError)?'pass':'fail';
        result.error=error.message;
      }
      result.language=row.language;result.expectedRefusal=row.expectedError;
    }
  } catch(error) {
    result.error={code:error?.code||null,message:error?.message||String(error)};
  }
  return result;
}

function packageCapabilityRows(loadedPackages,caseResults) {
  const axes=['morphology','syntax','core_semantics','end_to_end','refusal','information_loss'];
  return loadedPackages.map(({manifest})=>{
    const language=manifest.language;
    const capabilities={};
    for(const capability of axes) {
      const cases=caseResults.filter(item=>{
        const row=item._row;
        if(row.capability!==capability && !(capability==='syntax' &&
            row.capability==='end_to_end'))return false;
        if(capability==='morphology'||capability==='syntax')return row.language===language ||
          (capability==='syntax' && (row.from===language||row.to===language));
        if(capability==='end_to_end')return row.from===language||row.to===language;
        if(capability==='refusal')return row.language===language||row.from===language;
        if(capability==='information_loss')return row.language===language||row.to===language;
        return false;
      });
      const declared=capability==='morphology'?manifest.capabilities.morphology:
        capability==='syntax'?manifest.capabilities.parsing&&manifest.capabilities.realization:
        capability==='end_to_end'?manifest.capabilities.directions.length>0:
        capability==='refusal'?manifest.capabilities.parsing:
        capability==='information_loss'?manifest.capabilities.realization:false;
      capabilities[capability]={status:!declared?'unsupported':!cases.length?'not-run':
        cases.every(item=>item.status==='pass')?'pass':'fail',caseIds:cases.map(item=>item.id)};
    }
    capabilities.questions={status:!manifest.capabilities.questions?'unsupported':'not-run',caseIds:[]};
    return {language,status:manifest.status,demonstrationLevel:manifest.demonstrationLevel,
      declared:{...manifest.capabilities},capabilities};
  });
}

export async function runLanguageConformance({fixturePath}) {
  const absolute=resolve(ROOT,fixturePath),inside=relative(ROOT,absolute);
  if(inside.startsWith('..')||isAbsolute(inside)||!absolute.endsWith('.json'))
    throw new Error('Conformance fixture must be a JSON file inside the repository.');
  const fixtureBytes=await readFile(absolute),fixture=JSON.parse(fixtureBytes.toString('utf8'));
  validateLanguageConformanceFixture(fixture);
  const {engine,packages}=await createPackageEngine();
  const packagesByLanguage=new Map(packages.map(item=>[item.manifest.language,item]));
  const results=fixture.cases.map(row=>({...runCase(row,{engine,packagesByLanguage}),_row:row}));
  const clean=execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim()==='';
  const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  const caseResults=results.map(({_row,...item})=>item);
  const failCount=caseResults.filter(item=>item.status==='fail').length;
  return {
    schemaVersion:1,type:'language_conformance_report',status:failCount?'fail':'pass',
    source:{repositoryHead:sha,workingTreeClean:clean,
      fixture:inside.replaceAll('\\','/'),fixtureSha256:sha256(fixtureBytes),
      manifests:packages.map(({manifest})=>`data/languages/${manifest.language}.json`)},
    totals:{cases:caseResults.length,pass:caseResults.filter(item=>item.status==='pass').length,
      fail:failCount},
    packages:packageCapabilityRows(packages,results),
    core:{status:caseResults.some(item=>item.capability==='core_semantics'&&item.status==='pass')?
      'pass':caseResults.some(item=>item.capability==='core_semantics')?'fail':'not-run',
      caseIds:caseResults.filter(item=>item.capability==='core_semantics').map(item=>item.id)},
    cases:caseResults
  };
}
