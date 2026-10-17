import {lstat,mkdir,realpath,writeFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compileMorphology,morphologyCoverage} from '../js/core/morphology/compiler.js';
import {loadProjectPlugins,PROJECT_ROOT} from './project-plugins.mjs';

const JSON_FILENAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}\.json$/u;

function fail(code,message) {
  const error=new Error(message);
  error.code=code;
  throw error;
}

function isWithin(root,target) {
  const rel=relative(root,target);
  return rel==='' || (rel!=='..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function morphologyView(plugin) {
  const provider=plugin?.morphology;
  if(!provider)fail('PLUGIN_CAPABILITY_UNAVAILABLE',
    `Morphology is not available for language ${plugin?.code||'unknown'}.`);
  if(typeof provider.inventory!=='function' || typeof provider.describe!=='function') {
    fail('PLUGIN_CAPABILITY_UNAVAILABLE',
      `Morphology compiler metadata is not provided for language ${plugin.code}.`);
  }
  const entries=provider.inventory(),description=provider.describe();
  if(!Array.isArray(entries) || !description || description.language!==plugin.code ||
      !Number.isInteger(description.forms)) {
    fail('PLUGIN_RESULT_INVALID',`Invalid morphology inventory from ${plugin.code}.`);
  }
  return {
    language:plugin.code,
    lexicon:{entries},
    has:lexemeId=>provider.availability({lexemeId,exact:false}).supported===true,
    paradigm:input=>provider.paradigm(input),
    describe:()=>description
  };
}

async function safeOutputPath(projectRoot,language,fileName) {
  if(typeof fileName!=='string' || !JSON_FILENAME.test(fileName)) {
    fail('COMPILE_OUTPUT_PATH_INVALID','--output must be a JSON filename without a directory path.');
  }
  const projectReal=await realpath(projectRoot);
  const languagesRoot=await realpath(resolve(projectReal,'languages'));
  if(!isWithin(projectReal,languagesRoot) || languagesRoot===projectReal) {
    fail('COMPILE_OUTPUT_PATH_INVALID','Language packages must remain inside the project root.');
  }
  const packageRoot=resolve(languagesRoot,language);
  const packageStat=await lstat(packageRoot);
  if(!packageStat.isDirectory() || packageStat.isSymbolicLink()) {
    fail('COMPILE_OUTPUT_PATH_INVALID','Language output directory must be a real package directory.');
  }
  const packageReal=await realpath(packageRoot);
  const outputDirectory=resolve(packageReal,'compiled');
  try {
    const entry=await lstat(outputDirectory);
    if(!entry.isDirectory() || entry.isSymbolicLink()) {
      fail('COMPILE_OUTPUT_PATH_INVALID','Compiled output directory must be a real directory.');
    }
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    await mkdir(outputDirectory);
  }
  const outputReal=await realpath(outputDirectory);
  if(!isWithin(packageReal,outputReal)) {
    fail('COMPILE_OUTPUT_PATH_INVALID','Compiled output resolves outside the language package.');
  }
  const output=resolve(outputReal,fileName);
  try {
    await lstat(output);
    fail('COMPILE_OUTPUT_EXISTS','Refusing to overwrite an existing compiled table.');
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
  }
  return output;
}

export async function compileLanguage(language,{projectRoot=PROJECT_ROOT,output}={}) {
  const {registry}=await loadProjectPlugins({projectRoot,codes:[language]});
  const plugin=registry.get(language);
  const morphology=morphologyView(plugin);
  const compiled=compileMorphology(morphology);
  const coverage=morphologyCoverage(morphology);
  if(output!==undefined) {
    const path=await safeOutputPath(projectRoot,language,output);
    await writeFile(path,JSON.stringify(compiled,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  }
  return {coverage,compiled};
}

async function main(args) {
  const [language,option,fileName,...extra]=args;
  const hasOutput=option==='--output';
  if(!language || language==='--output' || extra.length ||
      (hasOutput ? !fileName : option!==undefined) ||
      args.filter(arg=>arg==='--output').length>1) {
    throw new Error('Usage: node tools/compile-language.mjs LANGUAGE [--output filename.json]');
  }
  const {coverage}=await compileLanguage(language,{...(hasOutput?{output:fileName}:{})});
  console.log(JSON.stringify(coverage));
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error=>{
    console.error([error.code,error.message].filter(Boolean).join(': '));
    process.exitCode=1;
  });
}
