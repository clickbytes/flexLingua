/** DOM smoke test for the static UI, without adding a DOM library dependency. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class ElementStub {
  constructor() {
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
  }
  replaceChildren() { this.children = []; }
  appendChild(node) { this.children.push(node); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  trigger(type) { this.listeners.get(type)?.({ preventDefault() {} }); }
}
const allText = element => [element.textContent, ...element.children.map(allText)].join(' ');

test('Static UI loads both JSON grammars, translates and updates inspector', async () => {
  const ids = ['result', 'warnings', 'alternatives', 'inspector', 'copy', 'source-text',
    'source-lang', 'target-lang', 'status', 'translate', 'translate-form', 'swap', 'sample', 'sample-core', 'sample-question', 'sample-plural', 'sample-new-nouns', 'sample-qualified',
    'semantic-alternatives', 'meaning-empty', 'meaning-summary', 'meaning-tree',
    'meaning-alternatives-panel', 'meaning-alternatives', 'context-topic',
    'sample-ambiguous', 'sample-discourse', 'sample-relative', 'sample-coordination', 'sample-scope', 'sample-complement', 'sample-turkish',
    'morph-generate','morph-analyze','morph-language','morph-lexeme','morph-number','morph-case','morph-surface','morph-output'];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const el = id => elements.get(id);
  el('translate').disabled = true;
  el('source-lang').value = 'en';
  el('target-lang').value = 'pl';
  el('source-text').value = 'The girl gave the boy a book.';
  el('morph-language').value = 'pl'; el('morph-lexeme').value = 'pl.kot.1';
  el('morph-number').value = 'singular'; el('morph-case').value = 'dat'; el('morph-surface').value = 'koty';
  el('context-topic').value = '';
  globalThis.document = {
    getElementById: el,
    createElement: () => new ElementStub()
  };
  globalThis.fetch = async (path) => {
    const file = new URL(`../${path.replace(/^\.\//u, '')}`, import.meta.url);
    return { ok: true, json: async () => JSON.parse(await readFile(file, 'utf8')) };
  };

  await import('../js/main.js');
  for (let i = 0; i < 100 && el('translate').disabled; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(el('translate').disabled, false);
  el('morph-generate').trigger('click');
  assert.match(el('morph-output').textContent, /kotu/);
  el('morph-analyze').trigger('click');
  assert.match(el('morph-output').textContent, /pl.kot.1/);
  assert.match(el('status').textContent, /reguły JSON/);
  assert.equal(el('result').textContent, 'Dziewczynka dała chłopcu książkę.');
  assert.match(el('inspector').textContent, /event\.transfer_possession/);
  assert.equal(el('copy').disabled, false);
  assert.ok(el('alternatives').children.length > 0, 'Aspect alternatives are shown.');

  el('target-lang').value = 'it';
  el('sample').trigger('click');
  assert.equal(el('source-text').value, 'The girl sees the dog.');
  assert.equal(el('result').textContent, 'La ragazza vede il cane.');
  el('source-lang').value = 'it';
  el('target-lang').value = 'en';
  el('sample').trigger('click');
  assert.equal(el('source-text').value, 'La ragazza vede il cane.');
  assert.equal(el('result').textContent, 'The girl sees the dog.');
  el('source-lang').value = 'en';
  el('target-lang').value = 'pl';
  el('source-text').value = 'The girl gave the boy a book.';
  el('translate-form').trigger('submit');

  el('swap').trigger('click');
  el('translate').trigger('click'); // UI translation happens on the form, not on this button.
  el('translate-form').trigger('submit');
  assert.equal(el('source-lang').value, 'pl');
  assert.equal(el('result').textContent, 'A girl gave a boy a book.');
  assert.ok(el('warnings').children.length > 0, 'Definiteness warnings are shown.');

  el('source-text').value = 'Dziewczynka nie widziała książki.';
  el('translate-form').trigger('submit');
  assert.equal(el('result').textContent, 'A girl did not see a book.');

  el('sample-plural').trigger('click');
  assert.equal(el('result').textContent, 'Girls saw boys.');
  assert.match(el('inspector').textContent, /"plural"/);

  el('source-lang').value = 'en';
  el('target-lang').value = 'pl';
  el('sample-new-nouns').trigger('click');
  assert.equal(el('result').textContent, 'Dziewczynka widziała ogród.');
  el('sample-ambiguous').trigger('click');
  assert.equal(el('result').textContent, 'Dziewczynka widziała bank.');
  assert.match(el('semantic-alternatives').children[0].textContent, /brzeg/);
  assert.equal(el('meaning-alternatives-panel').hidden, false);
  assert.match(allText(el('meaning-alternatives')), /place\.riverbank/);
  el('context-topic').value = 'place.river';
  el('context-topic').trigger('change');
  assert.equal(el('result').textContent, 'Dziewczynka widziała brzeg.');
  el('context-topic').value = '';
  el('sample-qualified').trigger('click');
  assert.equal(el('result').textContent, 'Wszyscy bardzo duzi chłopcy widzieli dwie małe książki.');
  assert.match(el('inspector').textContent, /"quantifier"/);
  assert.match(el('inspector').textContent, /degree\.very/);
  el('sample-discourse').trigger('click');
  assert.match(el('result').textContent, /Dziewczynka widziała psa\. Chłopiec dał/);
  assert.match(el('inspector').textContent, /"type": "discourse"/);
  assert.match(allText(el('meaning-tree')), /animal\.dog/);
  el('sample-relative').trigger('click');
  assert.equal(el('result').textContent,'Dziewczynka, która widziała psa, dała chłopcu książkę.');
  assert.match(el('inspector').textContent, /\"relatives\"/);
  el('sample-coordination').trigger('click');
  assert.equal(el('result').textContent,'Dziewczynka widziała psa i chłopiec nie widział kota.');
  assert.match(el('inspector').textContent, /\"coordination\"/);
  el('sample-scope', 'sample-complement', 'sample-turkish').trigger('click');
  assert.equal(el('result').textContent,'Nie jest prawdą, że dziewczynka widziała psa i chłopiec widział kota.');
  assert.match(el('inspector').textContent, /\"scope\"/);
  el('source-text').value = 'I went home.';
  el('translate-form').trigger('submit');
  assert.equal(el('result').textContent, '—');
  assert.match(el('warnings').children[0].textContent, /Nieobsługiwana konstrukcja/);
  el('sample-core').trigger('click');
  assert.equal(el('source-lang').value, 'core');
  assert.equal(el('target-lang').value, 'pl');
  assert.equal(JSON.parse(el('source-text').value).roles.theme.concept,'animal.dog');
  assert.equal(el('result').textContent,'Dziewczynka widziała psa.');
  el('source-text').value = '{';
  el('translate-form').trigger('submit');
  assert.match(el('warnings').children[0].textContent,/CORE_JSON_INVALID/);
  el('source-lang').value = 'en';
  el('target-lang').value = 'core';
  el('source-text').value = 'The girl saw the dog.';
  el('translate-form').trigger('submit');
  assert.equal(JSON.parse(el('result').textContent).roles.theme.concept,'animal.dog');
  el('sample-question').trigger('click');
  assert.equal(el('result').textContent,'Czy dziewczynka widziała psa?');
  assert.match(el('inspector').textContent, /"type": "question"/);
});
