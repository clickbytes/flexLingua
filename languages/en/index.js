import {readFile} from 'node:fs/promises';
import {defineDeclarativeLanguagePlugin} from '../../js/plugins/declarative.js';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

/** This entrypoint owns only English data; parsing and inflection stay in shared JS. */
export default async function createEnglishPlugin({core, manifest, graph, provenance}) {
  const [lexicon, grammar, morphology, features, signal, bridge] = await Promise.all([
    './lexicon.json', './grammar.json', './morphology.json',
    './features.json', './signal.json', './bridge.json'
  ].map(load));
  return defineDeclarativeLanguagePlugin({
    core, manifest, graph,
    modules: {identity: manifest, lexicon, grammar, morphology, features,
      signal, bridge, evidence: provenance}
  });
}
