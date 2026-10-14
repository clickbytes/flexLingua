/** Checks every canonical PL/EN LexicalSense against the actual CORE ontology. */
import { readFile } from 'node:fs/promises';
import { createCoreLanguage } from '../js/core/core-language.js';
import { createLexicon } from '../js/core/lexicon.js';
const load = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const core = createCoreLanguage(await load('concepts.json'));
const output = {coreVersion:core.version, languages:{}};
for (const code of ['en','pl']) {
  const lexicon = createLexicon(await load(`${code}.json`), {strict:true});
  lexicon.validateCore(core);
  output.languages[code] = {lexemes:lexicon.count(),senses:lexicon.senseCount(),
    coreLinked:true, legacyOnly:0};
}
console.log(JSON.stringify(output,null,2));
