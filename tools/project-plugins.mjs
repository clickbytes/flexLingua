import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCoreLanguage} from '../js/core/core-language.js';
import {loadPluginRegistry} from '../js/plugins/loader.js';

export const PROJECT_ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));

/** Load shared CORE and only the language packages named by the plugin registry. */
export async function loadProjectPlugins({projectRoot=PROJECT_ROOT,codes}={}) {
  const coreDocument=JSON.parse(await readFile(
    resolve(projectRoot,'data','core','concepts.json'),'utf8'));
  const core=createCoreLanguage(coreDocument);
  const registry=await loadPluginRegistry(projectRoot,{
    core,...(codes===undefined?{}:{codes})
  });
  return {core,registry};
}
