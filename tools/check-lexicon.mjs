import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createLexicon} from '../js/core/lexicon.js';
import {DEFAULT_DATA_ROOT,loadLanguagePackages} from './language-packages.mjs';

export async function runLexiconAudit({dataRoot=DEFAULT_DATA_ROOT}={}) {
  const output={coreVersion:null,languages:{},skipped:[]};
  for(const {manifest,packages} of await loadLanguagePackages({dataRoot})) {
    if(!manifest.audits.strictLexicon.enabled) {
      output.skipped.push({language:manifest.language,reason:manifest.audits.strictLexicon.reason});
      continue;
    }
    const core=createCoreLanguage(packages.core);
    output.coreVersion??=core.version;
    const lexicon=createLexicon(packages.lexicon,{strict:true});
    lexicon.validateCore(core);
    output.languages[manifest.language]={lexemes:lexicon.count(),senses:lexicon.senseCount(),
      coreLinked:true,legacyOnly:0};
  }
  return output;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runLexiconAudit().then(output=>console.log(JSON.stringify(output,null,2))).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
