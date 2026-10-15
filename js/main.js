import { Engine } from './core/engine.js';
import { createEnglishAdapter } from './languages/en.js';
import { createPolishAdapter } from './languages/pl.js';
import { createTurkishAdapter } from './languages/tr.js';
import { createItalianAdapter } from './languages/it.js';
import { createMorphology } from './core/morphology/engine.js';
import { createCoreLanguage } from './core/core-language.js';
import { initStudio, renderMeaning } from './ui/studio.js';
import { initDialoguePanel } from './ui/dialogue.js';

const element = id => document.getElementById(id);
let engine;
let lastMeaning;

async function loadJSON(path) {
  // A generated offline HTML build embeds the same JSON dictionaries in-page.
  // For normal HTTP-hosted development, fetch the JSON files as before.
  const embedded = globalThis.__flexLinguaEmbeddedData;
  if (embedded) {
    if (!Object.hasOwn(embedded, path)) throw new Error(`Missing embedded dictionary: ${path}`);
    return structuredClone(embedded[path]);
  }
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot load ${path}: HTTP ${response.status}`);
  return response.json();
}

function clearOutput() {
  element('result').textContent = '—';
  element('warnings').replaceChildren();
  element('alternatives').replaceChildren();
  element('semantic-alternatives').replaceChildren();
  element('inspector').textContent = '{}';
  element('copy').disabled = true;
  lastMeaning = null;
  renderMeaning(null);
}

function showMessages(target, messages, className, prefix) {
  for (const message of messages) {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = `${prefix}${message}`;
    target.appendChild(p);
  }
}

function translate() {
  clearOutput();
  try {
    const result = engine.translate({
      text: element('source-text').value,
      from: element('source-lang').value,
      to: element('target-lang').value,
      context: element('source-lang').value !== 'core' && element('context-topic').value ?
        { topics: [element('context-topic').value] } : {}
    });
    element('result').textContent = result.text;
    element('inspector').textContent = JSON.stringify(result.interlingua, null, 2);
    renderMeaning(result.interlingua, result.semanticAlternatives);
    showMessages(element('warnings'), result.warnings, 'warning', 'Uwaga: ');
    showMessages(element('alternatives'), result.alternatives, 'alternative', 'Wariant gramatyczny: ');
    showMessages(element('semantic-alternatives'), result.semanticAlternatives.map(item =>
      `${item.text} [${item.interlingua.type === 'event' ? item.interlingua.roles.theme?.concept || item.interlingua.concept : 'odmienna interpretacja'}]`),
    'alternative', 'Inne znaczenie: ');
    lastMeaning = result.interlingua;
    element('copy').disabled = false;
  } catch (error) {
    const diagnostic = error.code ? `${error.code}: ${error.message}` : error.message;
    showMessages(element('warnings'), [diagnostic], 'warning error', 'Nieobsługiwana konstrukcja: ');
  }
}

function otherLanguage(code) { return code === 'pl' ? 'en' : 'pl'; }
function synchronize(changed) {
  if (element('source-lang').value !== element('target-lang').value) return;
  if (changed === 'source') element('target-lang').value = otherLanguage(element('source-lang').value);
  else element('source-lang').value = otherLanguage(element('target-lang').value);
}


async function init() {
  try {
    const [ontology, features, en, pl, tr, it, enGrammar, plGrammar, trGrammar, itGrammar, morphFeatures, enMorphSpec, plMorphSpec] = await Promise.all([
      loadJSON('./data/concepts.json'), loadJSON('./data/features.json'), loadJSON('./data/en.json'), loadJSON('./data/pl.json'), loadJSON('./data/tr.json'), loadJSON('./data/it.json'),
      loadJSON('./data/grammar/en.json'), loadJSON('./data/grammar/pl.json'), loadJSON('./data/grammar/tr.json'), loadJSON('./data/grammar/it.json'),
      loadJSON('./data/morphology/features.json'), loadJSON('./data/morphology/en.json'), loadJSON('./data/morphology/pl.json')
    ]);
    const core=createCoreLanguage(ontology);
    const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
    const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
    engine = new Engine(ontology, features)
      .registerMorphology(enMorph).registerMorphology(plMorph)
      .registerLanguage(createEnglishAdapter(en, enGrammar, {morphology:enMorph}))
      .registerLanguage(createPolishAdapter(pl, plGrammar, {morphology:plMorph}))
      .registerLanguage(createTurkishAdapter(tr, trGrammar))
      .registerLanguage(createItalianAdapter(it, itGrammar));
    element('status').textContent = 'CORE v1.12 + morfologia PL/EN, reguły JSON; IT ograniczony czas teraźniejszy, TR demonstracja';
    element('translate').disabled = false;
    initStudio(engine);
    initDialoguePanel(engine);
  } catch (error) {
    element('status').textContent = `Błąd ładowania: ${error.message}`;
    return;
  }

  element('translate-form').addEventListener('submit', event => {
    event.preventDefault();
    translate();
  });
  element('source-lang').addEventListener('change', () => synchronize('source'));
  element('target-lang').addEventListener('change', () => synchronize('target'));
  element('swap').addEventListener('click', () => {
    const source = element('source-lang').value;
    element('source-lang').value = element('target-lang').value;
    element('target-lang').value = source;
    if (element('result').textContent !== '—' && lastMeaning) {
      element('source-text').value = element('result').textContent;
    }
    clearOutput();
  });
  element('sample-question').addEventListener('click', () => {
    const fromPolish = element('source-lang').value === 'pl';
    element('source-lang').value = fromPolish ? 'pl' : 'en';
    element('target-lang').value = fromPolish ? 'en' : 'pl';
    element('context-topic').value = '';
    element('source-text').value = fromPolish ?
      'Czy dziewczynka widziała psa?' : 'Did the girl see the dog?';
    translate();
  });
  element('sample-core').addEventListener('click', () => {
    element('source-lang').value = 'core';
    element('target-lang').value = 'pl';
    element('context-topic').value = '';
    element('source-text').value = JSON.stringify(engine.analyze({
      text:'The girl saw the dog.',from:'en'
    }),null,2);
    translate();
  });
  element('sample').addEventListener('click', () => {
    const italianTarget = element('target-lang').value === 'it';
    element('source-text').value = element('source-lang').value === 'core' ?
      JSON.stringify(engine.analyze({text:italianTarget ? 'The girl sees the dog.' : 'The girl saw the dog.',from:'en'}),null,2) :
      element('source-lang').value === 'tr' ? 'Kız köpeği gördü.' :
      element('source-lang').value === 'it' ? 'La ragazza vede il cane.' :
      element('source-lang').value === 'pl' ?
        (italianTarget ? 'Dziewczynka widzi psa.' : 'Dziewczynka nie widziała książki.') :
      italianTarget ? 'The girl sees the dog.' : 'The girl gave the boy a book.';
    translate();
  });
  element('context-topic').addEventListener('change', translate);
  element('sample-ambiguous').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'en'
      ? 'The girl saw a bank.' : 'Dziewczynka widziała brzeg.';
    translate();
  });
  element('sample-discourse').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'en'
      ? 'The girl saw the dog. The boy gave the girl an apple.'
      : 'Dziewczynka widziała psa. Chłopiec dał dziewczynce jabłko.';
    translate();
  });
  element('sample-qualified').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'pl'
      ? 'Bardzo duzi chłopcy widzieli dwie małe książki.'
      : 'All the very big boys saw two small books.';
    translate();
  });
  element('sample-relative').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'en'
      ? 'The girl that saw the dog gave the boy a book.'
      : 'Dziewczynka, która widziała psa, dała chłopcu książkę.';
    translate();
  });
  element('sample-coordination').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'en'
      ? 'The girl saw the dog and the boy did not see a cat.'
      : 'Dziewczynka widziała psa i chłopiec nie widział kota.';
    translate();
  });
  element('sample-scope').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'en'
      ? 'It is not true that the girl saw the dog and the boy saw the cat.'
      : 'Nie jest prawdą, że dziewczynka widziała psa i chłopiec widział kota.';
    translate();
  });
  element('sample-complement').addEventListener('click', () => {
    element('source-lang').value = 'en';
    element('target-lang').value = 'pl';
    element('source-text').value = 'The girl believes that the boy saw the dog.';
    translate();
  });
  element('sample-turkish').addEventListener('click', () => {
    element('source-lang').value = 'tr';
    element('target-lang').value = 'en';
    element('source-text').value = 'Kız köpeği gördü.';
    translate();
  });
  element('sample-plural').addEventListener('click', () => {
    element('source-text').value = element('source-lang').value === 'pl'
      ? 'Dziewczynki widziały chłopców.'
      : 'The boys did not see the dogs.';
    translate();
  });
  element('sample-new-nouns').addEventListener('click', () => {
    element('source-lang').value = 'en';
    element('target-lang').value = 'pl';
    element('context-topic').value = '';
    element('source-text').value = 'The girl saw the garden.';
    translate();
  });
  element('copy').addEventListener('click', async () => {
    if (!lastMeaning) return;
    try { await navigator.clipboard.writeText(JSON.stringify(lastMeaning, null, 2)); }
    catch { element('status').textContent = 'Nie udało się skopiować JSON.'; }
  });
  element('morph-generate').addEventListener('click',()=>{
    const language=element('morph-language').value;
    const lexemeId=element('morph-lexeme').value.trim();
    const features=language==='pl' ? {number:element('morph-number').value,case:element('morph-case').value} :
      {number:element('morph-number').value};
    try {
      const forms=engine.inflect({language,lexemeId,features});
      element('morph-output').textContent=JSON.stringify(forms,null,2);
    } catch(error){element('morph-output').textContent=error.message;}
  });
  element('morph-analyze').addEventListener('click',()=>{
    try {
      const answers=engine.resolveWord({language:element('morph-language').value,text:element('morph-surface').value.trim()});
      element('morph-output').textContent=JSON.stringify(answers,null,2);
    } catch(error){element('morph-output').textContent=error.message;}
  });
  element('morph-language').addEventListener('change',()=>{
    element('morph-lexeme').value=element('morph-language').value==='pl'?'pl.kot.1':'en.cat.1';
  });
  translate();
}

init();
