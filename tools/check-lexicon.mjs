import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadProjectPlugins,PROJECT_ROOT} from './project-plugins.mjs';

export async function runLexiconAudit({projectRoot=PROJECT_ROOT}={}) {
  const {core,registry}=await loadProjectPlugins({projectRoot});
  const output={coreVersion:core.version,languages:{},skipped:[]};
  for(const code of registry.list()) {
    const plugin=registry.get(code);
    const declared=plugin.capabilities().some(item=>item.channel==='lexicon' &&
      item.operation==='lookup' && item.status==='implemented');
    if(!declared || !plugin.lexicon) {
      output.skipped.push({language:code,reason:'Lexicon lookup is unavailable.'});
      continue;
    }
    if(plugin.lexicon.lexicalModel!=='1.01') {
      output.skipped.push({language:code,reason:'Strict lexical model 1.01 is unavailable.'});
      continue;
    }
    plugin.lexicon.validateCore(core);
    output.languages[code]={lexemes:plugin.lexicon.count(),
      senses:plugin.lexicon.senseCount(),coreLinked:true,legacyOnly:0};
  }
  return output;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runLexiconAudit().then(output=>console.log(JSON.stringify(output,null,2))).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
