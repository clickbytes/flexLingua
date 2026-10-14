/** Explicit one-file lexical migration (no implicit edits to project dictionaries). */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrateLexicon } from '../js/core/lexicon.js';
if (process.argv.length !== 4) {
  console.error('Usage: node tools/migrate-lexicon.mjs INPUT.json OUTPUT.json');
  process.exitCode = 2;
} else {
  const source = resolve(process.argv[2]);
  const target = resolve(process.argv[3]);
  if (source === target) throw new Error('Refusing to overwrite source lexicon.');
  const result = migrateLexicon(JSON.parse(await readFile(source,'utf8')));
  await writeFile(target,JSON.stringify(result,null,2)+'\n','utf8');
  console.log(`Migrated ${result.language} lexical model to ${target}`);
}
