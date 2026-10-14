import {readFile} from 'node:fs/promises';
import {createMorphology,materializeInflections} from '../js/core/morphology/engine.js';
import {morphologyCoverage} from '../js/core/morphology/compiler.js';
import {createCoreLanguage} from '../js/core/core-language.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}`,import.meta.url),'utf8'));
const core=createCoreLanguage(await read('concepts.json'));
const features=await read('morphology/features.json');
const report=[];
for(const language of ['pl','en','ar']){
  const [dictionary,spec]=await Promise.all([read(language==='ar'?'morphology/ar-lexicon.json':`${language}.json`),
    read(`morphology/${language}.json`)]);
  const morph=createMorphology(spec,dictionary,features,{core});
  if(language!=='ar')materializeInflections(dictionary,morph,{assertLegacy:true});
  report.push(morphologyCoverage(morph));
}
console.log(JSON.stringify({morphologyVersion:'1.11',coverage:report},null,2));
