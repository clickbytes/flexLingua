import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {initDialoguePanel} from '../js/ui/dialogue.js';
import {initStudio} from '../js/ui/studio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const load = async path => JSON.parse(await readFile(new URL('../data/' + path, import.meta.url), 'utf8'));
const [ontology, features, en, pl, enGrammar, plGrammar] = await Promise.all([
  'concepts.json', 'features.json', 'en.json', 'pl.json', 'grammar/en.json', 'grammar/pl.json'
].map(load));
const engine = new Engine(ontology, features)
  .registerLanguage(createRuleAdapter(en, enGrammar))
  .registerLanguage(createRuleAdapter(pl, plGrammar));

class ElementStub {
  constructor() {
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.focused = false;
    this.className = '';
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    };
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
  focus() { this.focused = true; }
  trigger(name, event = {}) {
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const callback of this.listeners.get(name) || []) callback(event);
  }
}

function textOf(node) {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join(' ');
}

function mount() {
  const ids = [
    'panel-dialogue', 'dialogue-form', 'dialogue-text', 'dialogue-from', 'dialogue-to',
    'dialogue-speaker', 'dialogue-addressee', 'dialogue-pronouns', 'dialogue-variant',
    'dialogue-ui-language', 'dialogue-reply', 'dialogue-reset', 'dialogue-history',
    'dialogue-feedback', 'dialogue-state', 'dialogue-count', 'dialogue-empty',
    'dialogue-eyebrow', 'dialogue-heading', 'dialogue-intro', 'dialogue-controls-heading',
    'dialogue-profile-help', 'dialogue-label-ui-language', 'dialogue-label-pronouns',
    'dialogue-label-variant', 'dialogue-compose-heading', 'dialogue-label-speaker',
    'dialogue-label-addressee', 'dialogue-label-from', 'dialogue-label-to', 'dialogue-label-text',
    'dialogue-send', 'dialogue-history-heading', 'dialogue-empty-text'
  ];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => new ElementStub()
  };
  const el = id => elements.get(id);
  el('dialogue-ui-language').value = 'pl';
  el('dialogue-pronouns').value = 'repeat';
  el('dialogue-variant').value = 'preferred';
  el('dialogue-from').value = 'en';
  el('dialogue-to').value = 'pl';
  el('dialogue-speaker').value = 'you';
  el('dialogue-addressee').value = 'assistant';
  initDialoguePanel(engine);
  return {
    el,
    restore() {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [join(root, 'tools/serve.mjs')], {
      env: {...process.env, PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let errors = '';
    server.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) resolve({server, url: match[0]});
    });
    server.stderr.on('data', chunk => { errors += chunk.toString(); });
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`Server exited (${code}): ${errors}`)));
    setTimeout(() => reject(new Error('Local HTTP server did not start')), 4000).unref();
  });
}

test('Dialogue UI renders turns, participants, rejected input and an explicit reset state', () => {
  const ui = mount();
  try {
    const {el} = ui;
    assert.equal(el('dialogue-state').textContent, 'Tury: 0 / 32');
    assert.equal(el('dialogue-empty').hidden, false);

    el('dialogue-text').value = 'The girl sees the dog.';
    el('dialogue-form').trigger('submit');
    assert.equal(el('dialogue-feedback').textContent, 'Dodano turę.');
    assert.equal(el('dialogue-history').children.length, 1);
    assert.match(textOf(el('dialogue-history')), /Mówca: Ty → Adresat: Asystent/);
    assert.match(textOf(el('dialogue-history')), /Dziewczynka widzi psa\./);
    assert.equal(el('dialogue-reply').disabled, true);
    assert.equal(el('dialogue-text').focused, true);

    el('dialogue-text').value = 'The girl saw a bank.';
    el('dialogue-form').trigger('submit');
    assert.match(el('dialogue-feedback').textContent, /Nie dodano tury/);
    assert.equal(el('dialogue-history').children.length, 1, 'failed input must not commit a turn');
    assert.equal(el('dialogue-feedback').getAttribute('role'), 'alert');

    el('dialogue-ui-language').value = 'en';
    el('dialogue-ui-language').trigger('change');
    assert.equal(el('panel-dialogue').lang, 'en');
    assert.equal(el('dialogue-send').textContent, 'Add turn');
    assert.match(el('dialogue-state').textContent, /Turns: 1 \/ 32/);

    el('dialogue-reset').trigger('click');
    assert.equal(el('dialogue-history').children.length, 0);
    assert.equal(el('dialogue-empty').hidden, false);
    assert.equal(el('dialogue-feedback').textContent, 'Conversation reset.');
    assert.equal(el('dialogue-text').focused, true);
  } finally {
    ui.restore();
  }
});

test('Dialogue UI labels a structured refusal and exposes the pending-question reply action', () => {
  const ui = mount();
  try {
    const {el} = ui;
    el('dialogue-text').value = 'Did the girl see the dog?';
    el('dialogue-form').trigger('submit');
    assert.equal(el('dialogue-reply').disabled, false);
    assert.match(el('dialogue-state').textContent, /Oczekuje odpowiedź/);
    assert.match(textOf(el('dialogue-history')), /Pytanie/);

    el('dialogue-reply').trigger('click');
    assert.equal(el('dialogue-history').children.length, 2);
    assert.match(textOf(el('dialogue-history')), /Odmowa/);
    assert.match(textOf(el('dialogue-history')), /Mówca: Asystent → Adresat: Ty/);
    assert.match(el('dialogue-count').textContent, /2 \/ 32/);
  } finally {
    ui.restore();
  }
});

test('Dialogue tab participates in accessible arrow-key navigation and focus management', () => {
  const ids = ['tab-translate', 'tab-dictionary', 'tab-inter', 'tab-coverage', 'tab-dialogue',
    'panel-translate', 'panel-dictionary', 'panel-inter', 'panel-coverage', 'panel-dialogue'];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const previousDocument = globalThis.document;
  globalThis.document = {getElementById: id => elements.get(id)};
  const el = id => elements.get(id);
  try {
    initStudio(engine);
    el('tab-coverage').trigger('keydown', {key: 'ArrowRight'});
    assert.equal(el('panel-dialogue').hidden, false);
    assert.equal(el('tab-dialogue').focused, true);
    assert.equal(el('tab-dialogue').getAttribute('aria-selected'), 'true');
    assert.equal(el('tab-dialogue').tabIndex, 0);
    el('tab-dialogue').trigger('keydown', {key: 'Home'});
    assert.equal(el('panel-translate').hidden, false);
    assert.equal(el('tab-translate').focused, true);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Dialogue tab and module load from the local HTTP server', async () => {
  const {server, url} = await startServer();
  try {
    const htmlResponse = await fetch(url);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /id="tab-dialogue"[^>]*role="tab"/);
    assert.match(html, /id="panel-dialogue"[^>]*role="tabpanel"/);
    assert.match(html, /id="dialogue-ui-language"/);
    assert.match(html, /id="dialogue-history"[^>]*aria-live="polite"/);
    assert.match(html, /id="dialogue-pronouns"[^>]*>[\s\S]*value="safe"/);
    assert.match(html, /value="first_alternative"/);

    const main = await fetch(url + 'js/main.js');
    assert.equal(main.status, 200);
    assert.match(await main.text(), /\.\/ui\/dialogue\.js/);

    const module = await fetch(url + 'js/ui/dialogue.js');
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /text\/javascript/);
    assert.match(await module.text(), /export function initDialoguePanel/);
  } finally {
    server.kill();
    await once(server, 'exit').catch(() => {});
  }
});
