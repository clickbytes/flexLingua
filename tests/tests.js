import { Engine } from '../js/core/engine.js';
import { createEnglishAdapter } from '../js/languages/en.js';
import { createPolishAdapter } from '../js/languages/pl.js';
import { createTurkishAdapter } from '../js/languages/tr.js';
import { contractTests } from './suite.js';

const output = document.getElementById('results');
try {
  const load = async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status} on ${path}`);
    return response.json();
  };
  const [ontology, features, en, pl, tr, enGrammar, plGrammar, trGrammar] = await Promise.all([
    load('../data/concepts.json'), load('../data/features.json'), load('../data/en.json'), load('../data/pl.json'), load('../data/tr.json'),
    load('../data/grammar/en.json'), load('../data/grammar/pl.json'), load('../data/grammar/tr.json')
  ]);
  const engine = new Engine(ontology, features)
    .registerLanguage(createEnglishAdapter(en, enGrammar))
    .registerLanguage(createPolishAdapter(pl, plGrammar))
    .registerLanguage(createTurkishAdapter(tr, trGrammar));
  let passed = 0;
  const tests = contractTests(engine, { ontology, features, en, pl, enGrammar, plGrammar });
  for (const [name, check] of tests) {
    const node = document.createElement('li');
    try {
      check();
      passed++;
      node.textContent = `PASS — ${name}`;
      node.className = 'pass';
    } catch (error) {
      node.textContent = `FAIL — ${name}: ${error.message}`;
      node.className = 'fail';
    }
    output.appendChild(node);
  }
  document.getElementById('count').textContent = `${passed}/${tests.length} testów zaliczonych`;
} catch (error) {
  document.getElementById('count').textContent = `Błąd uruchomienia testów: ${error.message}`;
}
