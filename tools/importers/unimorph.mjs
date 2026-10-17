/** Safe, review-first TSV adapter. Never inserts data into active lexicons. */
import {lstat,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createLexicon} from '../../js/core/lexicon.js';
import {createCoreLanguage} from '../../js/core/core-language.js';
import {createLanguageFeatureProfile,safeName} from '../../js/core/features.js';

const LEXICON_CATEGORIES=new Set(['nouns','verbs','adjectives']);
const TAG_ID=/^[A-Za-z0-9][A-Za-z0-9_:-]{0,31}$/u;
const OUTPUT_NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}\.json$/u;
const MAX_TSV_LENGTH=15_000_000,MAX_ROWS=100_000;
const REPO_ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const STAGING_DIR=resolve(REPO_ROOT,'import-staging','unimorph');
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

export function importUniMorph({tsv,profile:rawProfile,lexicon,core,source,license}) {
  const profile=validateUniMorphProfile(rawProfile);
  if(typeof tsv!=='string' || tsv.length>MAX_TSV_LENGTH || !record(lexicon) || !record(core) ||
     lexicon.language!==profile.language || typeof source!=='string' || !source.trim() ||
     typeof license!=='string' || !license.trim()) {
    throw new Error('Importer needs bounded input, matching language and CORE packages, source and license metadata.');
  }
  const dictionary=createLexicon(lexicon,{strict:lexicon.lexicalModel==='1.01'});
  const coreLanguage=createCoreLanguage(core);
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
    const matches=dictionary.lookup(lemma).filter(x=>x.category===profile.posTags[posTags[0]]);
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
      source,license,verified:false});
  }
  return {version:'1.11',importProfileVersion:profile.version,language:profile.language,
    mappingProfile:profile,source,license,status:'staging',candidates:data,review,
    statistics:{acceptedForReview:data.length,unmappedOrRejected:review.length}};
}

function parseOptions(args) {
  const accepted=new Set(['--profile','--lexicon','--core','--input','--source','--license','--out']);
  const options={};
  for(let index=0;index<args.length;index+=2) {
    const key=args[index],value=args[index+1];
    if(!accepted.has(key) || Object.hasOwn(options,key) || typeof value!=='string' ||
        !value || value.startsWith('--'))throw new Error('Invalid arguments.');
    options[key]=value;
  }
  if([...accepted].some(key=>!Object.hasOwn(options,key))) {
    throw new Error('Usage: --profile mapping.json --lexicon package.json --core concepts.json --input forms.tsv --source SOURCE --license LICENSE --out result.json');
  }
  return options;
}

async function prepareStagingDirectory() {
  try {
    const entry=await lstat(STAGING_DIR);
    if(!entry.isDirectory() || entry.isSymbolicLink())throw new Error('Importer staging directory must be a real directory.');
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    await mkdir(STAGING_DIR,{recursive:true});
  }
  const actual=await realpath(STAGING_DIR);
  if(actual!==STAGING_DIR)throw new Error('Importer staging path resolves outside the designated directory.');
  return actual;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const options=parseOptions(process.argv.slice(2));
    if(!OUTPUT_NAME.test(options['--out'])) {
      throw new Error('--out must be a JSON filename without a directory path.');
    }
    const inputStats=await stat(options['--input']);
    if(inputStats.size>MAX_TSV_LENGTH)throw new Error('UniMorph input exceeds the size limit.');
    const [tsv,profileText,lexiconText,coreText]=await Promise.all([
      readFile(options['--input'],'utf8'),readFile(options['--profile'],'utf8'),
      readFile(options['--lexicon'],'utf8'),readFile(options['--core'],'utf8')]);
    const result=importUniMorph({tsv,profile:JSON.parse(profileText),
      lexicon:JSON.parse(lexiconText),core:JSON.parse(coreText),
      source:options['--source'],license:options['--license']});
    const staging=await prepareStagingDirectory();
    const output=resolve(staging,options['--out']);
    await writeFile(output,JSON.stringify(result,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    console.log(`${JSON.stringify(result.statistics)} ${output}`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
