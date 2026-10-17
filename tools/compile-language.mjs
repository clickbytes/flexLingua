import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createMorphology} from '../js/core/morphology/engine.js';
import {compileMorphology,morphologyCoverage} from '../js/core/morphology/compiler.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {DEFAULT_DATA_ROOT,loadLanguagePackage} from './language-packages.mjs';

export async function compileLanguage(language,{dataRoot=DEFAULT_DATA_ROOT,output}={}) {
  const {manifest,packages}=await loadLanguagePackage(language,{dataRoot});
  if(!manifest.capabilities.morphology) {
    const error=new Error(`Morphology is not declared for language ${language}.`);
    error.code='LANGUAGE_PACKAGE_MORPHOLOGY_UNAVAILABLE';
    throw error;
  }
  const core=createCoreLanguage(packages.core);
  const morphology=createMorphology(packages.morphology,packages.morphologyLexicon,
    packages.morphologyFeatures,{core});
  const compiled=compileMorphology(morphology);
  const coverage=morphologyCoverage(morphology);
  if(output!==undefined)await writeFile(output,JSON.stringify(compiled,null,2)+'\n','utf8');
  return {coverage,compiled};
}

async function main(args) {
  const language=args[0],outputIndex=args.indexOf('--output');
  if(!language || language==='--output' ||
      args.some((arg,index)=>index!==outputIndex && index!==outputIndex+1 && index>0) ||
      args.filter(arg=>arg==='--output').length>1) {
    throw new Error('Usage: node tools/compile-language.mjs [language] [--output destination.json]');
  }
  let output;
  if(outputIndex!==-1) {
    output=args[outputIndex+1];
    if(!output)throw new Error('Missing --output destination.');
  }
  const {coverage}=await compileLanguage(language,{output});
  console.log(JSON.stringify(coverage));
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
