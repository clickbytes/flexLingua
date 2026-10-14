import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createEnglishAdapter } from '../js/languages/en.js';
import { createPolishAdapter } from '../js/languages/pl.js';
import { createTurkishAdapter } from '../js/languages/tr.js';
import { contractTests } from './suite.js';

const load = async filename => JSON.parse(await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'));
const [ontology, features, en, pl, tr, enGrammar, plGrammar, trGrammar] = await Promise.all(['concepts.json','features.json','en.json','pl.json','tr.json','grammar/en.json','grammar/pl.json','grammar/tr.json'].map(load));
const engine = new Engine(ontology, features)
  .registerLanguage(createEnglishAdapter(en, enGrammar))
  .registerLanguage(createPolishAdapter(pl, plGrammar))
  .registerLanguage(createTurkishAdapter(tr, trGrammar));

for (const [name, run] of contractTests(engine, { ontology, features, en, pl, enGrammar, plGrammar })) test(name, run);
