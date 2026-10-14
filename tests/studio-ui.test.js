/** Browser-independent integration tests for Studio GUI with real morphology data. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createMorphology } from '../js/core/morphology/engine.js';
import { createEnglishAdapter } from '../js/languages/en.js';
import { createPolishAdapter } from '../js/languages/pl.js';
import { dictionaryLookup, initStudio, renderMeaning, previewUnknownForms,
  paradigmExamples, morphologyOverview, compareUnknownParadigms } from '../js/ui/studio.js';

const load = async path => JSON.parse(await readFile(new URL('../data/' + path, import.meta.url), 'utf8'));
const [ontology, features, morphFeatures, pl, en, plSpec, enSpec, plGrammar, enGrammar] = await Promise.all([
  'concepts.json', 'features.json', 'morphology/features.json', 'pl.json', 'en.json',
  'morphology/pl.json', 'morphology/en.json', 'grammar/pl.json', 'grammar/en.json'
].map(load));
const engine = new Engine(ontology, features);
const plMorph = createMorphology(plSpec, pl, morphFeatures, { core: engine.core });
const enMorph = createMorphology(enSpec, en, morphFeatures, { core: engine.core });
engine.registerMorphology(plMorph).registerMorphology(enMorph)
  .registerLanguage(createPolishAdapter(pl, plGrammar, { morphology: plMorph }))
  .registerLanguage(createEnglishAdapter(en, enGrammar, { morphology: enMorph }));

test('Dictionary lookup accepts lemmas, known surface forms and both explicit languages', () => {
  assert.ok(dictionaryLookup(engine, 'pl', 'kot').lexemes.some(item => item.id === 'pl.kot.1'));
  const plural = dictionaryLookup(engine, 'pl', 'koty');
  assert.ok(plural.lexemes.some(item => item.id === 'pl.kot.1'));
  assert.ok(plural.analyses.length > 0);
  assert.ok(dictionaryLookup(engine, 'en', 'children').lexemes.some(item => item.id === 'en.child.1'));
  assert.equal(dictionaryLookup(engine, 'pl', 'unknown_unlisted_word').lexemes.length, 0);
});

class ElementStub {
  constructor() {
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
  }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  focus() { this.focused = true; }
  trigger(name, options = {}) {
    this.listeners.get(name)?.({ preventDefault() {}, ...options });
  }
}
const allText = element => [element.textContent, ...element.children.map(allText)].join(' ');

test('Tabs, all-form tables, missing lemmas and INTER visualizer work without changing Engine', () => {
  const ids = [
    'tab-translate', 'tab-dictionary', 'tab-inter', 'tab-coverage',
    'panel-translate', 'panel-dictionary', 'panel-inter', 'panel-coverage',
    'dictionary-form', 'dictionary-query', 'dictionary-language',
    'dictionary-status', 'dictionary-results', 'dictionary-example-pl',
    'dictionary-example-inflected', 'dictionary-example-en',
    'meaning-empty', 'meaning-summary', 'meaning-tree', 'coverage-overview'
  ];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const el = id => elements.get(id);
  globalThis.document = {
    getElementById: el,
    createElement: () => new ElementStub()
  };
  initStudio(engine);
  assert.equal(el('tab-translate').attributes.get('aria-selected'), 'true');
  el('tab-dictionary').trigger('click');
  assert.equal(el('panel-translate').hidden, true);
  assert.equal(el('panel-dictionary').hidden, false);
  el('dictionary-language').value = 'pl';
  el('dictionary-query').value = 'koty';
  el('dictionary-form').trigger('submit');
  assert.match(el('dictionary-status').textContent, /rozpoznano także odmienioną formę/);
  const result = allText(el('dictionary-results'));
  assert.match(result, /kot/);
  assert.match(result, /kocie/);
  assert.match(result, /mianownik/);
  assert.match(result, /dopełniacz/);
  el('dictionary-query').value = 'unknown_unlisted_word';
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /Not found in dictionary/);
  el('dictionary-example-en').trigger('click');
  assert.equal(el('dictionary-language').value, 'en');
  assert.match(allText(el('dictionary-results')), /children/);
  el('tab-dictionary').trigger('keydown', { key: 'ArrowRight' });
  assert.equal(el('panel-inter').hidden, false);
  assert.equal(el('tab-inter').focused, true);
  const semantic = engine.analyze({ text: 'The girl saw the dog.', from: 'en' });
  renderMeaning(semantic);
  assert.equal(el('meaning-empty').hidden, true);
  assert.match(allText(el('meaning-tree')), /event.visual_perception/);
  assert.match(allText(el('meaning-tree')), /animal.dog/);
  const question = engine.analyze({ text: 'Did the girl see the dog?', from: 'en' });
  renderMeaning(question);
  assert.match(allText(el('meaning-tree')), /Pytanie zamknięte/);
  assert.match(allText(el('meaning-tree')), /Treść pytania/);
  assert.match(allText(el('meaning-tree')), /animal.dog/);
  renderMeaning(null);
  assert.equal(el('meaning-empty').hidden, false);
});

test('HTML keeps existing UI hook IDs and new tab panels', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['translate-form', 'result', 'warnings', 'alternatives',
    'semantic-alternatives', 'source-lang', 'target-lang', 'source-text',
    'context-topic', 'morph-generate', 'morph-analyze', 'morph-output',
    'inspector', 'copy', 'status', 'sample-question', 'studio-tabs', 'dictionary-form',
    'dictionary-query', 'dictionary-results', 'meaning-tree',
    'tab-coverage', 'panel-coverage', 'coverage-overview',
    'dictionary-experimental', 'dictionary-compare', 'dictionary-compare-paradigm',
    'dictionary-part-of-speech', 'dictionary-paradigm-guide',
    'dictionary-paradigm', 'dictionary-stem']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  const formStart = html.indexOf('<form id="dictionary-form"');
  const formEnd = html.indexOf('</form>', formStart);
  assert.ok(formStart >= 0 && formEnd > formStart);
  assert.ok(html.indexOf('id="dictionary-stem"', formStart) < formEnd,
    'Experimental stem input must belong to the search form for Enter key support');
});


test('Experimental OOV generation applies existing paradigms, not imaginary dictionary entries', () => {
  assert.equal(dictionaryLookup(engine, 'en', 'widget').lexemes.length, 0);
  const enPrediction = previewUnknownForms(engine, {
    language: 'en', lemma: 'widget', paradigmId: 'en.noun.regular', stem: 'widget'
  });
  assert.equal(enPrediction.forms.find(item => item.features.number === 'plural').text, 'widgets');
  assert.ok(enPrediction.forms.every(item => item.source === 'hypothesis'));
  const plPrediction = previewUnknownForms(engine, {
    language: 'pl', lemma: 'fotokot', paradigmId: 'pl.noun.masc_animate', stem: 'fotokot'
  });
  assert.ok(plPrediction.forms.some(item => item.text === 'fotokota' &&
    item.features.case === 'gen' && item.features.number === 'singular'));
  const feminine = previewUnknownForms(engine, {
    language: 'pl', lemma: 'lampa', paradigmId: 'pl.noun.feminine_a', stem: 'lamp'
  });
  assert.ok(feminine.forms.some(item => item.text === 'lampa' && item.features.case === 'nom'));
  assert.ok(feminine.forms.some(item => item.text === 'lampy' && item.features.case === 'gen'));
  const incomplete = previewUnknownForms(engine, {
    language: 'pl', lemma: 'robić', paradigmId: 'pl.verb.third_person', stem: 'robić'
  });
  assert.ok(incomplete.unavailable.length > 0, 'Missing alternate stems must not be invented');
  assert.throws(() => previewUnknownForms(engine, {
    language: 'pl', lemma: 'nowe', paradigmId: 'en.noun.regular', stem: 'nowe'
  }), /Wybierz dostępny paradygmat/);
  assert.equal(dictionaryLookup(engine, 'pl', 'fotokot').lexemes.length, 0,
    'Generating hypothetical forms must not alter the dictionary');
});

test('Checkbox gates experimental unknown-word previews and keeps ordinary lookup unchanged', () => {
  const ids = [
    'tab-translate', 'tab-dictionary', 'tab-inter', 'tab-coverage',
    'panel-translate', 'panel-dictionary', 'panel-inter', 'panel-coverage',
    'dictionary-form', 'dictionary-query', 'dictionary-language',
    'dictionary-status', 'dictionary-results', 'dictionary-example-pl',
    'dictionary-example-inflected', 'dictionary-example-en',
    'dictionary-experimental', 'dictionary-experimental-settings',
    'dictionary-compare', 'dictionary-compare-settings', 'dictionary-compare-paradigm',
    'dictionary-part-of-speech', 'dictionary-paradigm-guide',
    'dictionary-paradigm', 'dictionary-stem', 'dictionary-additional-stems',
    'meaning-empty', 'meaning-summary', 'meaning-tree', 'coverage-overview'
  ];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const el = id => elements.get(id);
  globalThis.document = {
    getElementById: el,
    createElement: () => new ElementStub()
  };
  el('dictionary-language').value = 'pl';
  initStudio(engine);
  el('dictionary-query').value = 'fotokot';
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /Not found in dictionary/);
  el('dictionary-experimental').checked = true;
  el('dictionary-experimental').trigger('change');
  assert.equal(el('dictionary-experimental-settings').hidden, false);
  el('dictionary-part-of-speech').value = 'NOUN';
  el('dictionary-part-of-speech').trigger('change');
  assert.equal(el('dictionary-paradigm').children.length,
    morphologyOverview(engine, 'pl').paradigms.filter(pattern => pattern.pos === 'NOUN').length + 1,
    'Polish noun filter must show every noun paradigm and the placeholder');
  el('dictionary-paradigm').value = 'pl.noun.masc_animate';
  el('dictionary-paradigm').trigger('change');
  assert.match(el('dictionary-paradigm-guide').textContent, /kot|lis|chłopiec/,
    'Paradigm guide must show actual bound lexemes');
  el('dictionary-stem').value = 'fotokot';
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /fotokota/);
  assert.match(allText(el('dictionary-results')), /HIPOTEZA/);
  assert.match(el('dictionary-status').textContent, /Tryb eksperymentalny/);
  el('dictionary-example-en').trigger('click');
  assert.equal(el('dictionary-language').value, 'en');
  assert.equal(el('dictionary-paradigm').children.length,
    morphologyOverview(engine, 'en').paradigms.filter(pattern => pattern.pos === 'NOUN').length + 1,
    'NOUN filter must still be active after changing language');
  el('dictionary-part-of-speech').value = '';
  el('dictionary-part-of-speech').trigger('change');
  assert.equal(el('dictionary-paradigm').children.length,
    morphologyOverview(engine, 'en').paradigms.length + 1,
    'Clearing the filter must expose all English patterns and the placeholder');
  el('dictionary-query').value = 'widget';
  el('dictionary-stem').value = 'widget';
  el('dictionary-paradigm').value = 'en.noun.regular';
  el('dictionary-paradigm').trigger('change');
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /widgets/);
  el('dictionary-language').value = 'pl';
  el('dictionary-language').trigger('change');
  el('dictionary-query').value = 'kot';
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /pl.kot.1/);
  assert.doesNotMatch(allText(el('dictionary-results')), /HIPOTEZA/);
  el('dictionary-query').value = 'fotokot';
  el('dictionary-experimental').checked = false;
  el('dictionary-experimental').trigger('change');
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /Not found in dictionary/);
  assert.equal(el('dictionary-experimental-settings').hidden, true);
});


test('Pattern guide sources its examples only from lexemes already bound in the real morphology package', () => {
  const plExamples = paradigmExamples(engine, 'pl');
  const cat = plExamples.get('pl.noun.masc_animate');
  assert.ok(cat.some(entry => entry.lemma === 'kot' || entry.lemma === 'lis'));
  const enExamples = paradigmExamples(engine, 'en');
  assert.ok(enExamples.get('en.noun.regular').some(entry => entry.lemma === 'girl' || entry.lemma === 'dog'));
  for (const entries of [...plExamples.values(), ...enExamples.values()]) {
    assert.ok(entries.length <= 4);
  }
});

test('Hypothetical lemma mismatch and missing-cell details are surfaced by the user interface', () => {
  const ids = ['tab-translate','tab-dictionary','tab-inter','tab-coverage',
    'panel-translate','panel-dictionary','panel-inter','panel-coverage',
    'dictionary-form','dictionary-query','dictionary-language','dictionary-status','dictionary-results',
    'dictionary-example-pl','dictionary-example-inflected','dictionary-example-en',
    'dictionary-experimental','dictionary-experimental-settings',
    'dictionary-compare','dictionary-compare-settings','dictionary-compare-paradigm',
    'dictionary-part-of-speech',
    'dictionary-paradigm-guide','dictionary-paradigm','dictionary-stem','dictionary-additional-stems'];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const el = id => elements.get(id);
  globalThis.document = { getElementById: el, createElement: () => new ElementStub() };
  el('dictionary-language').value = 'en';
  initStudio(engine);
  el('dictionary-experimental').checked = true;
  el('dictionary-experimental').trigger('change');
  el('dictionary-part-of-speech').value = 'NOUN';
  el('dictionary-part-of-speech').trigger('change');
  el('dictionary-paradigm').value = 'en.noun.regular';
  el('dictionary-paradigm').trigger('change');
  el('dictionary-query').value = 'widget';
  el('dictionary-stem').value = 'wrongstem';
  el('dictionary-form').trigger('submit');
  assert.match(allText(el('dictionary-results')), /schemat nie odtwarza wpisanego hasła/);
  el('dictionary-stem').value = 'widget';
  el('dictionary-form').trigger('submit');
  assert.doesNotMatch(allText(el('dictionary-results')), /schemat nie odtwarza wpisanego hasła/);

  el('dictionary-language').value = 'pl';
  el('dictionary-language').trigger('change');
  el('dictionary-part-of-speech').value = 'VERB';
  el('dictionary-part-of-speech').trigger('change');
  el('dictionary-paradigm').value = 'pl.verb.third_person';
  el('dictionary-paradigm').trigger('change');
  el('dictionary-query').value = 'zrobić';
  el('dictionary-stem').value = 'zrobić';
  el('dictionary-form').trigger('submit');
  const result = allText(el('dictionary-results'));
  assert.match(result, /Niedostępne komórki/);
  assert.match(result, /Unknown lexical stem/, 'The missing stem should appear as a concrete reason');
  assert.match(result, /Czas: przeszły/, 'Missing cells must expose their grammatical features');
});


test('Comparison examines matching feature bundles, not just cells in the same order', () => {
  const prediction = compareUnknownParadigms(engine, {
    language: 'en', lemma: 'widget', stem: 'widget',
    primaryId: 'en.noun.regular', secondaryId: 'en.noun.sibilant'
  });
  assert.equal(prediction.same, 1);
  assert.equal(prediction.different, 1);
  assert.equal(prediction.unavailable, 0);
  assert.ok(prediction.rows.some(row => row.primaryText === 'widgets' &&
    row.secondaryText === 'widgetes' && row.status === 'different'));
  assert.ok(prediction.primary.forms.every(row => row.source === 'hypothesis'));
  const pl = compareUnknownParadigms(engine, {
    language: 'pl', lemma: 'fotokot', stem: 'fotokot',
    primaryId: 'pl.noun.masc_animate', secondaryId: 'pl.noun.masc_inanimate'
  });
  assert.ok(pl.different > 0);
  assert.throws(() => compareUnknownParadigms(engine, {
    language: 'pl', lemma: 'fotokot', stem: 'fotokot',
    primaryId: 'pl.noun.masc_animate', secondaryId: 'pl.verb.third_person'
  }), /tej samej części mowy/);
  assert.equal(dictionaryLookup(engine, 'en', 'widget').lexemes.length, 0);
});

test('Structural coverage reports the currently loaded language packages only', () => {
  const pl = morphologyOverview(engine, 'pl');
  const en = morphologyOverview(engine, 'en');
  assert.equal(pl.totalParadigms, engine.morphology('pl').paradigms.size);
  assert.equal(en.totalParadigms, engine.morphology('en').paradigms.size);
  assert.equal(pl.boundLexemes, engine.morphology('pl').describe().lexemes);
  assert.equal(en.formEntries, engine.morphology('en').describe().forms);
  assert.ok(pl.paradigms.some(row => row.id === 'pl.noun.masc_animate' && row.cells === 14));
  assert.ok(en.paradigms.some(row => row.id === 'en.noun.regular' && row.cells === 2));
  assert.ok(pl.dictionaryEntries >= pl.boundLexemes);
  assert.ok(en.dictionaryEntries >= en.boundLexemes);
});

test('Coverage navigation selects a pattern, while comparison keeps every result hypothetical', () => {
  const ids = [
    'tab-translate','tab-dictionary','tab-inter','tab-coverage',
    'panel-translate','panel-dictionary','panel-inter','panel-coverage',
    'dictionary-form','dictionary-query','dictionary-language','dictionary-status','dictionary-results',
    'dictionary-example-pl','dictionary-example-inflected','dictionary-example-en',
    'dictionary-experimental','dictionary-experimental-settings','dictionary-part-of-speech',
    'dictionary-paradigm-guide','dictionary-paradigm','dictionary-stem','dictionary-additional-stems',
    'dictionary-compare','dictionary-compare-settings','dictionary-compare-paradigm',
    'coverage-overview'
  ];
  const elements = new Map(ids.map(id => [id, new ElementStub()]));
  const el = id => elements.get(id);
  globalThis.document = { getElementById: el, createElement: () => new ElementStub() };
  el('dictionary-language').value = 'pl';
  initStudio(engine);
  assert.match(allText(el('coverage-overview')), /Rzeczywiście załadowane paradygmaty/);
  assert.match(allText(el('coverage-overview')), /pl.noun.masc_animate/);
  const traverse = node => [node, ...node.children.flatMap(traverse)];
  const firstTry = traverse(el('coverage-overview')).find(node =>
    node.textContent === 'Przetestuj wzorzec');
  assert.ok(firstTry, 'Coverage dashboard must provide an action for each pattern');
  firstTry.trigger('click');
  assert.equal(el('panel-dictionary').hidden, false);
  assert.equal(el('dictionary-experimental').checked, true);
  assert.equal(el('dictionary-paradigm').value, 'pl.noun.masc_animate');
  assert.equal(el('dictionary-part-of-speech').value, 'NOUN');

  el('dictionary-query').value = 'fotokot';
  el('dictionary-stem').value = 'fotokot';
  el('dictionary-compare').checked = true;
  el('dictionary-compare').trigger('change');
  assert.equal(el('dictionary-compare-settings').hidden, false);
  assert.equal(el('dictionary-compare-paradigm').children.length, 7,
    'Six alternative Polish noun patterns plus the placeholder');
  el('dictionary-compare-paradigm').value = 'pl.noun.masc_inanimate';
  el('dictionary-form').trigger('submit');
  const surface = allText(el('dictionary-results'));
  assert.match(surface, /Porównanie dwóch hipotez/);
  assert.match(surface, /fotokota/);
  assert.match(surface, /fotokotu/);
  assert.match(surface, /Różne/);
  assert.match(surface, /HIPOTEZA/);

  el('dictionary-compare').checked = false;
  el('dictionary-compare').trigger('change');
  assert.equal(el('dictionary-compare-settings').hidden, true);
  el('dictionary-form').trigger('submit');
  assert.doesNotMatch(allText(el('dictionary-results')), /Porównanie dwóch hipotez/);
});
