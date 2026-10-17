import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createMorphology,materializeInflections} from '../js/core/morphology/engine.js';
import {morphologyCoverage} from '../js/core/morphology/compiler.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {DEFAULT_DATA_ROOT,loadLanguagePackages} from './language-packages.mjs';

export async function runMorphologyAudit({dataRoot=DEFAULT_DATA_ROOT}={}) {
  const coverage=[],skipped=[];
  for(const {manifest,packages} of await loadLanguagePackages({dataRoot})) {
    const audit=manifest.audits.morphology;
    if(!audit.enabled) {
      skipped.push({language:manifest.language,reason:audit.reason});
      continue;
    }
    const core=createCoreLanguage(packages.core);
    const morphology=createMorphology(packages.morphology,packages.morphologyLexicon,
      packages.morphologyFeatures,{core});
    if(audit.legacyInflections)
      materializeInflections(packages.morphologyLexicon,morphology,{assertLegacy:true});
    coverage.push(morphologyCoverage(morphology));
  }
  return {morphologyVersion:'1.11',coverage,skipped};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runMorphologyAudit().then(output=>console.log(JSON.stringify(output,null,2))).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
