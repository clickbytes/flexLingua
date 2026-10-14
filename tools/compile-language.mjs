import {readFile,writeFile} from 'node:fs/promises';
import {createMorphology} from '../js/core/morphology/engine.js';
import {compileMorphology,morphologyCoverage} from '../js/core/morphology/compiler.js';
import {createCoreLanguage} from '../js/core/core-language.js';
const language=process.argv[2];
if(!['pl','en','ar'].includes(language))throw new Error('Usage: node tools/compile-language.mjs [pl|en|ar] [--output destination.json]');
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}`,import.meta.url),'utf8'));
const [ontology,features,spec,dictionary]=await Promise.all([
  read('concepts.json'),read('morphology/features.json'),read(`morphology/${language}.json`),
  read(language==='ar'?'morphology/ar-lexicon.json':`${language}.json`)
]);
const morphology=createMorphology(spec,dictionary,features,{core:createCoreLanguage(ontology)});
const compiled=compileMorphology(morphology);
console.log(JSON.stringify(morphologyCoverage(morphology)));
if(process.argv.includes('--output')){
 const file=process.argv[process.argv.indexOf('--output')+1];
 if(!file)throw new Error('Missing --output destination.');
 await writeFile(file,JSON.stringify(compiled,null,2)+'\n','utf8');
}
