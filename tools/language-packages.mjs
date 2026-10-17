import {readdir,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateTextProfile} from '../js/core/text.js';

export const LANGUAGE_PACKAGE_VERSION='1.0';
export const DEFAULT_DATA_ROOT=resolve(fileURLToPath(new URL('../data/',import.meta.url)));
const LANGUAGE_CODE=/^[a-z]{2,8}$/u;
const PACKAGE_KEYS=['core','lexicon','grammar','morphology','morphologyLexicon','morphologyFeatures'];
const CAPABILITY_KEYS=['parsing','realization','morphology','questions','frames','directions'];
const isRecord=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const hasExactKeys=(value,keys)=>isRecord(value) &&
  Object.keys(value).sort().join(',')===keys.slice().sort().join(',');

function packageError(code,message) {
  const error=new Error(message);
  error.code=code;
  return error;
}

function auditShape(audit,withLegacy=false) {
  const fields=withLegacy?['enabled','legacyInflections','reason']:['enabled','reason'];
  if(!hasExactKeys(audit,fields) || typeof audit.enabled!=='boolean' ||
      (withLegacy && typeof audit.legacyInflections!=='boolean') ||
      (audit.enabled ? audit.reason!==null : typeof audit.reason!=='string' || !audit.reason.trim()))return false;
  return !withLegacy || !audit.legacyInflections || audit.enabled;
}

export function validateLanguageManifest(manifest,{language}={}) {
  if(!hasExactKeys(manifest,['version','language','status','demonstrationLevel','scope','tokenizer',
      'packages','capabilities','audits']) || manifest.version!==LANGUAGE_PACKAGE_VERSION ||
      !LANGUAGE_CODE.test(manifest.language) || (language!==undefined && manifest.language!==language) ||
      !['controlled-subset','limited-demo','morphology-only'].includes(manifest.status) ||
      !['controlled','limited','structural'].includes(manifest.demonstrationLevel) ||
      typeof manifest.scope!=='string' || !manifest.scope.trim() || manifest.scope.length>512 ||
      !isRecord(manifest.tokenizer) ||
      !hasExactKeys(manifest.packages,PACKAGE_KEYS) ||
      !manifest.packages.core ||
      Object.values(manifest.packages).some(path=>path!==null &&
        (typeof path!=='string' || !path.trim() || isAbsolute(path) ||
          path.split(/[\\/]/u).includes('..') || !/^[A-Za-z0-9_./-]+\.json$/u.test(path))) ||
      !hasExactKeys(manifest.capabilities,CAPABILITY_KEYS) ||
      ['parsing','realization','morphology','questions'].some(key=>typeof manifest.capabilities[key]!=='boolean') ||
      !Array.isArray(manifest.capabilities.frames) || manifest.capabilities.frames.length>128 ||
      manifest.capabilities.frames.some(frame=>typeof frame!=='string' ||
        !/^(event|state)\.[a-z][a-z0-9_.]*$/u.test(frame)) ||
      new Set(manifest.capabilities.frames).size!==manifest.capabilities.frames.length ||
      !Array.isArray(manifest.capabilities.directions) || manifest.capabilities.directions.length>32 ||
      manifest.capabilities.directions.some(direction=>typeof direction!=='string' ||
        !/^([a-z]{2,8})->([a-z]{2,8})$/u.test(direction) || direction.split('->')[0]===direction.split('->')[1]) ||
      new Set(manifest.capabilities.directions).size!==manifest.capabilities.directions.length ||
      !hasExactKeys(manifest.audits,['strictLexicon','morphology']) ||
      !auditShape(manifest.audits.strictLexicon) || !auditShape(manifest.audits.morphology,true)) {
    throw packageError('LANGUAGE_PACKAGE_MANIFEST_INVALID','Invalid language package manifest.');
  }
  const {packages,capabilities,audits}=manifest;
  try{validateTextProfile(manifest.tokenizer,{locale:manifest.language});}
  catch{throw packageError('LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
    `Language package ${manifest.language} declares an unsupported tokenizer profile.`);}
  const expectedLevel={
    'controlled-subset':'controlled','limited-demo':'limited','morphology-only':'structural'
  }[manifest.status];
  if(manifest.demonstrationLevel!==expectedLevel)throw packageError(
    'LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
    `Language package ${manifest.language} demonstration level does not match its status.`);
  if((capabilities.parsing || capabilities.realization) && (!packages.grammar || !packages.lexicon) ||
      capabilities.questions && (!capabilities.parsing || !capabilities.realization) ||
      capabilities.morphology !== !!packages.morphology ||
      capabilities.morphology !== !!packages.morphologyLexicon ||
      capabilities.morphology !== !!packages.morphologyFeatures ||
      audits.strictLexicon.enabled && !packages.lexicon ||
      audits.morphology.enabled && !capabilities.morphology ||
      manifest.status==='morphology-only' &&
        (capabilities.parsing || capabilities.realization || capabilities.questions || !capabilities.morphology) ||
      manifest.status!=='morphology-only' && (!capabilities.parsing || !capabilities.realization)) {
    throw packageError('LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
      `Language package ${manifest.language} declares capabilities inconsistent with its package paths.`);
  }
  return structuredClone(manifest);
}

function isWithin(root,target) {
  const rel=relative(root,target);
  return rel==='' || (rel!=='..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function resolvePackageFile(dataRoot,relativePath,language) {
  if(typeof relativePath!=='string' || !relativePath || isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/u).includes('..')) {
    throw packageError('LANGUAGE_PACKAGE_PATH_INVALID',`Invalid data path in language package ${language}.`);
  }
  const root=resolve(dataRoot),file=resolve(root,relativePath);
  if(!isWithin(root,file))throw packageError('LANGUAGE_PACKAGE_PATH_INVALID',
    `Language package ${language} points outside the data directory.`);
  let rootReal,fileReal;
  try{[rootReal,fileReal]=await Promise.all([realpath(root),realpath(file)]);}
  catch(error){
    if(error.code==='ENOENT')throw packageError('LANGUAGE_PACKAGE_FILE_MISSING',
      `Missing language package file: data/${relativePath}`);
    throw error;
  }
  if(!isWithin(rootReal,fileReal))throw packageError('LANGUAGE_PACKAGE_PATH_INVALID',
    `Language package ${language} resolves outside the data directory.`);
  let data;
  try{data=JSON.parse(await readFile(fileReal,'utf8'));}
  catch(error){
    if(error instanceof SyntaxError)throw packageError('LANGUAGE_PACKAGE_JSON_INVALID',
      `Invalid JSON package file: data/${relativePath}`);
    throw error;
  }
  return {path:fileReal,data};
}

function requireLanguage(code,packageName,data) {
  if(data && data.language!==code)throw packageError('LANGUAGE_PACKAGE_LANGUAGE_MISMATCH',
    `Language package ${code} has a ${packageName} language mismatch.`);
}

function requireVersion(value,expected,packageName,code) {
  if(value!==expected)throw packageError('LANGUAGE_PACKAGE_VERSION_MISMATCH',
    `Language package ${code} has an unsupported ${packageName} version.`);
}

function equalLists(left,right) {
  const sortedLeft=[...left].sort(),sortedRight=[...right].sort();
  return sortedLeft.length===sortedRight.length &&
    sortedLeft.every((value,index)=>value===sortedRight[index]);
}

function actualFrames(grammar) {
  const events=Object.keys(grammar.frames||{});
  const states=Object.keys(grammar.states?.frames||{}).map(kind=>`state.${kind}`);
  return [...events,...states].sort();
}

function validatePackageContents(manifest,packages) {
  const {language,capabilities,audits}=manifest;
  requireVersion(packages.core.version,'1.0','CORE',language);
  requireLanguage(language,'lexicon',packages.lexicon);
  requireLanguage(language,'grammar',packages.grammar);
  requireLanguage(language,'morphology',packages.morphology);
  requireLanguage(language,'morphology lexicon',packages.morphologyLexicon);
  if(packages.lexicon && !['1.0','1.01'].includes(packages.lexicon.version))
    requireVersion(packages.lexicon.version,'1.01','lexicon',language);
  if(packages.grammar && !['0.6','1.0'].includes(packages.grammar.version))
    requireVersion(packages.grammar.version,'1.0','grammar',language);
  if(packages.morphology)requireVersion(packages.morphology.version,'1.11','morphology',language);
  if(packages.morphologyFeatures)requireVersion(packages.morphologyFeatures.version,'1.02',
    'morphology features',language);
  if(packages.morphologyFeatures && (!isRecord(packages.morphologyFeatures.dimensions) ||
      !Object.keys(packages.morphologyFeatures.dimensions).length)) {
    throw packageError('LANGUAGE_PACKAGE_VERSION_MISMATCH',
      `Language package ${language} has an invalid morphology feature registry.`);
  }
  if(packages.morphology?.featureProfile?.language &&
      packages.morphology.featureProfile.language!==language) {
    throw packageError('LANGUAGE_PACKAGE_LANGUAGE_MISMATCH',
      `Language package ${language} has a morphology feature-profile language mismatch.`);
  }
  if(audits.strictLexicon.enabled && packages.lexicon?.lexicalModel!=='1.01') {
    throw packageError('LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
      `Language package ${language} requests strict lexical audit without lexical model 1.01.`);
  }
  if(audits.morphology.legacyInflections && !packages.morphologyLexicon) {
    throw packageError('LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
      `Language package ${language} requests legacy inflection checks without a morphology lexicon.`);
  }
  if(packages.grammar) {
    const questionSupport=!!packages.grammar.questions;
    if(capabilities.questions!==questionSupport ||
        !equalLists(capabilities.frames,actualFrames(packages.grammar))) {
      throw packageError('LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
        `Language package ${language} declares syntax capabilities that differ from its grammar.`);
    }
  } else if(capabilities.frames.length || capabilities.questions) {
    throw packageError('LANGUAGE_PACKAGE_CAPABILITY_MISMATCH',
      `Language package ${language} declares syntax without a grammar package.`);
  }
  return packages;
}

async function readManifest(dataRoot,language) {
  if(typeof language!=='string' || !LANGUAGE_CODE.test(language)) {
    throw packageError('LANGUAGE_PACKAGE_CODE_INVALID','Invalid language package code.');
  }
  const file=await resolvePackageFile(dataRoot,`languages/${language}.json`,language);
  let manifest;
  try{manifest=validateLanguageManifest(file.data,{language});}
  catch(error){if(error.code)throw error;throw packageError('LANGUAGE_PACKAGE_MANIFEST_INVALID',
    `Invalid language package manifest: ${language}.`);}
  return manifest;
}

export async function loadLanguagePackage(language,{dataRoot=DEFAULT_DATA_ROOT}={}) {
  const root=resolve(dataRoot);
  const manifest=await readManifest(root,language);
  const packages={};
  for(const key of PACKAGE_KEYS) {
    const path=manifest.packages[key];
    packages[key]=path===null?null:(await resolvePackageFile(root,path,language)).data;
  }
  validatePackageContents(manifest,packages);
  return {manifest,packages};
}

export async function loadLanguagePackages({dataRoot=DEFAULT_DATA_ROOT}={}) {
  const root=resolve(dataRoot),directory=resolve(root,'languages');
  let entries;
  try{entries=await readdir(directory,{withFileTypes:true});}
  catch(error){
    if(error.code==='ENOENT')throw packageError('LANGUAGE_PACKAGE_FILE_MISSING',
      'Missing data/languages manifest directory.');
    throw error;
  }
  const files=entries.filter(entry=>entry.isFile() && entry.name.endsWith('.json'))
    .map(entry=>entry.name.slice(0,-5)).sort();
  const packages=await Promise.all(files.map(code=>loadLanguagePackage(code,{dataRoot:root})));
  const byCode=new Map(packages.map(item=>[item.manifest.language,item]));
  for(const {manifest} of packages)for(const direction of manifest.capabilities.directions) {
    const [from,to]=direction.split('->'),source=byCode.get(from),target=byCode.get(to);
    if(!source || !target || !source.manifest.capabilities.parsing ||
        !target.manifest.capabilities.realization) {
      throw packageError('LANGUAGE_PACKAGE_DIRECTION_INVALID',
        `Language package ${manifest.language} declares unsupported direction ${direction}.`);
    }
  }
  return packages;
}
