/** Regression tests for double-click / file:// distribution. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

class DOMElement {
  constructor() {
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
  }
  replaceChildren() { this.children = []; }
  appendChild(node) { this.children.push(node); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this.attributes ??= new Map(); this.attributes.set(name, value); }
  focus() { this.focused = true; }
  trigger(name) { this.listeners.get(name)?.({ preventDefault() {} }); }
}

test('The checked-in standalone HTML is derived from current JS/JSON sources', () => {
  const result = spawnSync(process.execPath, [join(root, 'tools/build-standalone.mjs'), '--check'], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('index.html redirects file:// use before attempting module imports', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.match(html, /location\.protocol\s*===\s*'file:'/);
  assert.match(html, /index-standalone\.html/);
  assert.doesNotMatch(html, /<script\s+type="module"\s+src=/);
});

test('A file:// standalone bundle executes and translates with fetch disabled', async () => {
  const html = await readFile(join(root, 'index-standalone.html'), 'utf8');
  const script = html.match(/<script id="flexlingua-standalone">\n([\s\S]*?)\n<\/script>/)?.[1];
  assert.ok(script, 'Standalone application code must be inline');
  assert.doesNotMatch(html, /<script\s+type="module"\s+src=/);

  const ids = ['result', 'warnings', 'alternatives', 'semantic-alternatives', 'inspector', 'copy',
    'source-text', 'source-lang', 'target-lang', 'status', 'translate', 'translate-form',
    'swap', 'sample', 'sample-core', 'sample-question', 'sample-plural', 'sample-new-nouns', 'sample-qualified', 'sample-ambiguous', 'sample-discourse', 'sample-relative', 'sample-coordination', 'sample-scope', 'sample-complement', 'sample-turkish', 'context-topic',
    'morph-generate','morph-analyze','morph-language','morph-lexeme','morph-number','morph-case','morph-surface','morph-output'];
  const elements = new Map(ids.map(id => [id, new DOMElement()]));
  const el = id => elements.get(id);
  el('translate').disabled = true;
  el('source-lang').value = 'en';
  el('target-lang').value = 'pl';
  el('source-text').value = 'The girl gave the boy a book.';
  el('context-topic').value = '';
  el('morph-language').value='pl';el('morph-lexeme').value='pl.kot.1';
  el('morph-number').value='plural';el('morph-case').value='acc';el('morph-surface').value='koty';
  let requests = 0;
  const sandbox = {
    document: {
      getElementById: el,
      createElement: () => new DOMElement()
    },
    structuredClone,
    fetch: () => { requests++; throw new Error('Network is forbidden in file:// mode'); },
    console,
    navigator: { clipboard: { writeText: async () => {} } }
  };
  runInNewContext(script, sandbox, { timeout: 5000 });
  for (let i = 0; i < 80 && el('translate').disabled; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(el('translate').disabled, false, el('status').textContent);
  el('morph-generate').trigger('click');
  assert.match(el('morph-output').textContent, /koty/);
  el('morph-analyze').trigger('click');
  assert.match(el('morph-output').textContent, /pl.kot.1/);
  assert.equal(requests, 0, 'Offline mode must never request local scripts or dictionaries');
  assert.equal(el('result').textContent, 'Dziewczynka dała chłopcu książkę.');
  assert.match(el('inspector').textContent, /event\.transfer_possession/);
  el('sample-new-nouns').trigger('click');
  assert.equal(el('result').textContent, 'Dziewczynka widziała ogród.');
  el('sample-ambiguous').trigger('click');
  assert.equal(el('result').textContent, 'Dziewczynka widziała bank.');
  assert.match(el('semantic-alternatives').children[0].textContent, /brzeg/);
  el('context-topic').value = 'place.river';
  el('context-topic').trigger('change');
  assert.equal(el('result').textContent, 'Dziewczynka widziała brzeg.');
  el('sample-qualified').trigger('click');
  assert.equal(el('result').textContent, 'Wszyscy bardzo duzi chłopcy widzieli dwie małe książki.');
  assert.match(el('inspector').textContent, /"quantifier"/);
  el('sample-discourse').trigger('click');
  assert.match(el('result').textContent, /Dziewczynka widziała psa\. Chłopiec dał/);
  assert.match(el('inspector').textContent, /"type": "discourse"/);
  el('sample-relative').trigger('click');
  assert.equal(el('result').textContent, 'Dziewczynka, która widziała psa, dała chłopcu książkę.');
  el('sample-coordination').trigger('click');
  assert.equal(el('result').textContent, 'Dziewczynka widziała psa i chłopiec nie widział kota.');
  el('sample-scope', 'sample-complement', 'sample-turkish').trigger('click');
  assert.equal(el('result').textContent, 'Nie jest prawdą, że dziewczynka widziała psa i chłopiec widział kota.');
  el('source-lang').value = 'pl';
  el('target-lang').value = 'en';
  el('source-text').value = 'Dziewczynka nie widziała książki.';
  el('translate-form').trigger('submit');
  assert.equal(el('result').textContent, 'A girl did not see a book.');
  el('sample-core').trigger('click');
  assert.equal(el('source-lang').value,'core');
  assert.equal(el('result').textContent,'Dziewczynka widziała psa.');
  assert.equal(JSON.parse(el('source-text').value).concept,'event.visual_perception');
  el('sample-question').trigger('click');
  assert.equal(el('result').textContent,'Czy dziewczynka widziała psa?');
  assert.match(el('inspector').textContent, /"type": "question"/);
  assert.equal(requests,0);
});


test('Offline Studio displays real morphology coverage and compares two OOV paradigms', async () => {
  const html = await readFile(join(root, 'index-standalone.html'), 'utf8');
  const script = html.match(/<script id="flexlingua-standalone">\n([\s\S]*?)\n<\/script>/)?.[1];
  assert.ok(script, 'No generated offline application script');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, new DOMElement()]));
  const el = id => elements.get(id);
  for (const [id, value] of Object.entries({
    'source-lang': 'en', 'target-lang': 'pl',
    'source-text': 'The girl gave the boy a book.',
    'context-topic': '', 'dictionary-language': 'pl',
    'dictionary-query': '', 'dictionary-part-of-speech': '',
    'morph-language': 'pl', 'morph-lexeme': 'pl.kot.1',
    'morph-number': 'singular', 'morph-case': 'dat', 'morph-surface': 'koty'
  })) el(id).value = value;
  el('translate').disabled = true;
  let requests = 0;
  runInNewContext(script, {
    document: { getElementById: el, createElement: () => new DOMElement() },
    structuredClone,
    fetch: () => { requests++; throw new Error('No network in standalone'); },
    navigator: { clipboard: { writeText: async () => {} } },
    console
  }, { timeout: 5000 });
  for (let i = 0; i < 80 && el('translate').disabled; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(el('translate').disabled, false, el('status').textContent);
  const allText = node => [node.textContent, ...node.children.map(allText)].join(' ');
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  el('tab-coverage').trigger('click');
  assert.equal(el('panel-coverage').hidden, false);
  assert.match(allText(el('coverage-overview')), /pl\.noun\.masc_animate/);
  assert.match(allText(el('coverage-overview')), /en\.noun\.regular/);
  const firstPattern = descendants(el('coverage-overview')).find(node =>
    node.textContent === 'Przetestuj wzorzec');
  assert.ok(firstPattern);
  firstPattern.trigger('click');
  assert.equal(el('panel-dictionary').hidden, false);
  assert.equal(el('dictionary-paradigm').value, 'pl.noun.masc_animate');
  assert.equal(el('dictionary-experimental').checked, true);
  el('dictionary-query').value = 'fotokot';
  el('dictionary-stem').value = 'fotokot';
  el('dictionary-compare').checked = true;
  el('dictionary-compare').trigger('change');
  el('dictionary-compare-paradigm').value = 'pl.noun.masc_inanimate';
  el('dictionary-form').trigger('submit');
  const result = allText(el('dictionary-results'));
  assert.match(result, /Porównanie dwóch hipotez/);
  assert.match(result, /fotokota/);
  assert.match(result, /fotokotu/);
  assert.match(result, /Różne/);
  assert.match(result, /HIPOTEZA/);
  assert.equal(requests, 0, 'Coverage and comparison must work entirely offline');
});
