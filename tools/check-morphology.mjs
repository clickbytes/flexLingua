import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {materializeInflections} from '../js/core/morphology/engine.js';
import {morphologyCoverage} from '../js/core/morphology/compiler.js';
import {loadProjectPlugins,PROJECT_ROOT} from './project-plugins.mjs';

export async function runMorphologyAudit({projectRoot=PROJECT_ROOT}={}) {
  const {registry}=await loadProjectPlugins({projectRoot});
  const coverage=[],skipped=[];
  for(const code of registry.list()) {
    const plugin=registry.get(code);
    const declared=plugin.capabilities().some(item=>item.channel==='morphology' &&
      item.status==='implemented');
    const provider=plugin.morphology;
    if(!declared || !provider) {
      skipped.push({language:code,reason:'Morphology is unavailable.'});
      continue;
    }
    if(typeof provider.inventory!=='function' || typeof provider.describe!=='function') {
      skipped.push({language:code,reason:'Morphology inventory metadata is unavailable.'});
      continue;
    }
    const description=provider.describe(),entries=provider.inventory();
    if(!Array.isArray(entries) || description?.language!==code ||
        !Number.isInteger(description.forms)) {
      throw new Error(`Invalid morphology inventory from ${code}.`);
    }
    const morphology={language:code,lexicon:{entries},
      has:lexemeId=>provider.availability({lexemeId,exact:false}).supported===true,
      paradigm:input=>provider.paradigm(input),describe:()=>description};
    coverage.push(morphologyCoverage(morphology));
    if(plugin.lexicon?.dictionary) {
      materializeInflections(plugin.lexicon.dictionary,morphology,{assertLegacy:true});
    }
  }
  return {morphologyVersion:'1.11',coverage,skipped};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runMorphologyAudit().then(output=>console.log(JSON.stringify(output,null,2))).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
