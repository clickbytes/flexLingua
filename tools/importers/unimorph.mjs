/** Safe, review-first TSV adapter. Never inserts data into active lexicons. */
import {lstat,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {createLexicon} from '../../js/core/lexicon.js';
import {createCoreLanguage} from '../../js/core/core-language.js';
import {createLanguageFeatureProfile,safeName} from '../../js/core/features.js';
import {loadProjectPlugins,PROJECT_ROOT} from '../project-plugins.mjs';

const LEXICON_CATEGORIES=new Set(['nouns','verbs','adjectives']);
const TAG_ID=/^[A-Za-z0-9][A-Za-z0-9_:-]{0,31}$/u;
const OUTPUT_NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}\.json$/u;
const MAX_TSV_LENGTH=15_000_000,MAX_ROWS=100_000;
const REPO_ROOT=PROJECT_ROOT;
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const keys=(value,expected)=>record(value) && Object.keys(value).sort().join(',')===expected.slice().sort().join(',');

function invalidProfile(message='Invalid or unsupported UniMorph mapping profile.') {
  throw new Error(message);
}

/** Validate mapping metadata against its language-local GEN-07 morphology profile. */
export function validateUniMorphProfile(profile) {
  if(!keys(profile,['version','language','featureProfile','posTags','tags','unsupportedTags','conflictPolicy']) ||
      profile.version!=='1.0' || !safeName(profile.language) || profile.conflictPolicy!=='review' ||
      !record(profile.posTags) || !Object.keys(profile.posTags).length || !record(profile.tags) ||
      !Array.isArray(profile.unsupportedTags))invalidProfile();
  try{Intl.getCanonicalLocales(profile.language);}catch{invalidProfile('Profile language must be a valid locale identifier.');}
  const featureProfile=createLanguageFeatureProfile(profile.featureProfile,{language:profile.language});
  const used=new Set();
  for(const [tag,category] of Object.entries(profile.posTags)) {
    if(!TAG_ID.test(tag) || used.has(tag) || !LEXICON_CATEGORIES.has(category))invalidProfile();
    used.add(tag);
  }
  for(const [tag,mapping] of Object.entries(profile.tags)) {
    if(!TAG_ID.test(tag) || used.has(tag) || !keys(mapping,['feature','value']) ||
        !safeName(mapping.feature) || !safeName(mapping.value) ||
        !featureProfile.morphology[mapping.feature]?.includes(mapping.value)) {
      invalidProfile(`UniMorph tag ${tag} maps to a feature value outside its declared language profile.`);
    }
    used.add(tag);
  }
  if(profile.unsupportedTags.some(tag=>!TAG_ID.test(tag) || used.has(tag)) ||
      new Set(profile.unsupportedTags).size!==profile.unsupportedTags.length)invalidProfile();
  return {...profile,featureProfile};
}

export function importUniMorph({tsv,profile:rawProfile,lexicon,plugin,core,source,author,license}) {
  const profile=validateUniMorphProfile(rawProfile);
  const morphology=plugin?.morphology;
  if(typeof tsv!=='string' || tsv.length>MAX_TSV_LENGTH ||
     (!record(lexicon) && (!plugin || typeof morphology?.inventory!=='function' ||
       typeof morphology?.describe!=='function')) ||
     !(record(core) || typeof core?.resolve==='function') ||
     typeof source!=='string' || !source.trim() ||
     typeof license!=='string' || !license.trim()) {
    throw new Error('Importer needs bounded input, matching plugin and CORE, source and license metadata.');
  }
  if(plugin && plugin.code!==profile.language) {
    throw new Error('Importer plugin does not match the mapping profile language.');
  }
  const dictionary=lexicon ? createLexicon(lexicon,{strict:lexicon.lexicalModel==='1.01'}) : null;
  if(dictionary && dictionary.language!==profile.language) {
    throw new Error('Importer needs matching language and CORE packages.');
  }
  const inventory=plugin ? morphology.inventory() : dictionary.entries;
  const runtimeFeatureProfile=plugin ? morphology.describe()?.featureProfile : null;
  if(plugin && (!Array.isArray(inventory) || runtimeFeatureProfile?.language!==profile.language ||
      Object.values(profile.tags).some(mapping=>
        !runtimeFeatureProfile.morphology?.[mapping.feature]?.includes(mapping.value)))) {
    throw new Error('UniMorph mapping does not match the language plugin feature inventory.');
  }
  const coreLanguage=typeof core.resolve==='function' ? core : createCoreLanguage(core);
  const data=[],review=[],seen=new Set();
  const rows=tsv.split(/\r?\n/gu);
  if(rows.length>MAX_ROWS)throw new Error('UniMorph input has too many records.');
  for(const [idx,line] of rows.entries()){
    if(!line.trim() || line.startsWith('#'))continue;
    const columns=line.split('\t');
    if(columns.length!==3 || columns.some(s=>!s.trim() || s.length>120)) {
      review.push({line:idx+1,reason:'invalid_columns',raw:line.slice(0,240)});continue;
    }
    const [lemma,text,tagString]=columns;
    const tags=tagString.split(';');
    const unknown=tags.filter(tag=>!Object.hasOwn(profile.posTags,tag) &&
      !Object.hasOwn(profile.tags,tag) && !profile.unsupportedTags.includes(tag));
    if(unknown.length){review.push({line:idx+1,reason:'unknown_tags',tags:unknown});continue;}
    const unsupported=tags.filter(tag=>profile.unsupportedTags.includes(tag));
    if(unsupported.length){review.push({line:idx+1,reason:'unsupported_tags',tags:unsupported});continue;}
    const posTags=tags.filter(tag=>Object.hasOwn(profile.posTags,tag));
    if(posTags.length!==1){review.push({line:idx+1,
      reason:posTags.length?'multiple_pos_tags':'missing_pos_tag',tags:posTags});continue;}
    const features={}; let conflict=false;
    for(const tag of tags){const mapping=profile.tags[tag];if(!mapping)continue;
      const {feature,value}=mapping;
      if(features[feature]!==undefined&&features[feature]!==value)conflict=true;
      features[feature]=value;
    }
    if(conflict){review.push({line:idx+1,reason:'conflicting_tags',tags});continue;}
    const matches=inventory.filter(item=>item.category===profile.posTags[posTags[0]] &&
      typeof item.lemma==='string' &&
      item.lemma.toLocaleLowerCase(profile.language)===lemma.toLocaleLowerCase(profile.language));
    if(matches.length!==1){review.push({line:idx+1,
      reason:matches.length?'ambiguous_lemma':'unmapped_core_lexeme',lemma});continue;}
    const lex=matches[0];
    const dangling=lex.senses.filter(sense=>{
      try{coreLanguage.resolve(sense.coreRef);return false;}catch{return true;}
    });
    if(dangling.length){review.push({line:idx+1,reason:'dangling_core_reference',lemma,
      coreRefs:dangling.map(sense=>sense.coreRef)});continue;}
    const key=JSON.stringify([lex.id,text,features]);
    if(seen.has(key))continue;
    seen.add(key);
    data.push({lexemeId:lex.id,form:text,features,coreRefs:lex.senses.map(s=>s.coreRef),
      source,...(author?{author}:{}),license,verified:false});
  }
  return {version:'1.11',importProfileVersion:profile.version,language:profile.language,
    mappingProfile:profile,source,...(author?{author}:{}),license,status:'staging',candidates:data,review,
    statistics:{acceptedForReview:data.length,unmappedOrRejected:review.length}};
}

function parseOptions(args) {
  const accepted=new Set(['--profile','--input','--source','--author','--license','--out']);
  const options={};
  for(let index=0;index<args.length;index+=2) {
    const key=args[index],value=args[index+1];
    if(!accepted.has(key) || Object.hasOwn(options,key) || typeof value!=='string' ||
        !value || value.startsWith('--'))throw new Error('Invalid arguments.');
    options[key]=value;
  }
  if([...accepted].some(key=>!Object.hasOwn(options,key))) {
    throw new Error('Usage: --profile mapping.json --input forms.tsv --source SOURCE --author AUTHOR --license LICENSE --out result.json');
  }
  return options;
}

function isWithin(root,target) {
  const rel=relative(root,target);
  return rel==='' || (rel!=='..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function createSafeChildDirectory(parent,name) {
  const path=resolve(parent,name);
  try {
    const entry=await lstat(path);
    if(!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('Importer staging path must contain only real directories.');
    }
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    await mkdir(path);
  }
  const [parentReal,pathReal]=await Promise.all([realpath(parent),realpath(path)]);
  if(!isWithin(parentReal,pathReal) || pathReal===parentReal) {
    throw new Error('Importer staging path resolves outside the language package.');
  }
  return pathReal;
}

async function prepareStagingDirectory(language) {
  const repoRoot=await realpath(REPO_ROOT);
  const languagesRoot=await realpath(resolve(repoRoot,'languages'));
  if(!isWithin(repoRoot,languagesRoot) || languagesRoot===repoRoot) {
    throw new Error('Importer languages directory must remain inside the project root.');
  }
  const packagePath=resolve(languagesRoot,language);
  const entry=await lstat(packagePath);
  if(!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Importer language package must be a real directory.');
  }
  const packageRoot=await realpath(packagePath);
  if(!isWithin(languagesRoot,packageRoot) || packageRoot===languagesRoot) {
    throw new Error('Importer language package resolves outside languages/.');
  }
  const importRoot=await createSafeChildDirectory(packageRoot,'import-staging');
  return createSafeChildDirectory(importRoot,'unimorph');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const options=parseOptions(process.argv.slice(2));
    if(!options['--author'].trim()) {
      throw new Error('--author must identify the data curator.');
    }
    if(!OUTPUT_NAME.test(options['--out'])) {
      throw new Error('--out must be a JSON filename without a directory path.');
    }
    const inputStats=await stat(options['--input']);
    if(inputStats.size>MAX_TSV_LENGTH)throw new Error('UniMorph input exceeds the size limit.');
    const [tsv,profileText]=await Promise.all([
      readFile(options['--input'],'utf8'),readFile(options['--profile'],'utf8')]);
    const profile=validateUniMorphProfile(JSON.parse(profileText));
    const {core,registry}=await loadProjectPlugins({codes:[profile.language]});
    const result=importUniMorph({tsv,profile,plugin:registry.get(profile.language),core,
      source:options['--source'],author:options['--author'],license:options['--license']});
    const staged={...result,status:'unverified',author:options['--author'],
      candidates:result.candidates.map(candidate=>({...candidate,author:options['--author'],
        status:'unverified',verified:false}))};
    const staging=await prepareStagingDirectory(profile.language);
    const output=resolve(staging,options['--out']);
    if(!isWithin(staging,output) || output===staging) {
      throw new Error('--out must remain inside the language staging directory.');
    }
    await writeFile(output,JSON.stringify(staged,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    console.log(`${JSON.stringify(staged.statistics)} ${output}`);
  }catch(error){console.error([error.code,error.message].filter(Boolean).join(': '));process.exitCode=1;}
}
