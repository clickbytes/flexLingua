/**
 * flexLingua Studio — presentation only.
 * Uses public Engine lexicon/morphology/INTER APIs; never changes language rules.
 * DOM data is written via textContent, not HTML interpolation.
 */
import { executeOperations } from '../core/morphology/operations.js';

const $ = id => document.getElementById(id);
const LABELS = Object.freeze({
  number: 'Liczba', case: 'Przypadek', tense: 'Czas', person: 'Osoba',
  gender: 'Rodzaj', pluralClass: 'Klasa liczby mnogiej', aspect: 'Aspekt',
  mood: 'Tryb', voice: 'Strona', animacy: 'Żywotność',
  subject_person: 'Osoba podmiotu', subject_number: 'Liczba podmiotu',
  object_person: 'Osoba dopełnienia', object_number: 'Liczba dopełnienia'
});
const VALUES = Object.freeze({
  singular: 'pojedyncza', plural: 'mnoga', dual: 'podwójna',
  nom: 'mianownik', gen: 'dopełniacz', dat: 'celownik', acc: 'biernik',
  inst: 'narzędnik', loc: 'miejscownik', voc: 'wołacz', abl: 'ablatyw',
  past: 'przeszły', present: 'teraźniejszy', future: 'przyszły',
  first: 'pierwsza', second: 'druga', third: 'trzecia',
  masculine: 'męski', feminine: 'żeński', neuter: 'nijaki',
  virile: 'męskoosobowy', nonvirile: 'niemęskoosobowy',
  perfective: 'dokonany', imperfective: 'niedokonany',
  indicative: 'oznajmujący', imperative: 'rozkazujący', subjunctive: 'łączący',
  active: 'czynna', passive: 'bierna', animate: 'żywotny', inanimate: 'nieżywotny'
});
const CATEGORIES = Object.freeze({
  nouns: 'Rzeczownik', verbs: 'Czasownik', adjectives: 'Przymiotnik',
  degrees: 'Modyfikator stopnia', attitudes: 'Predykat',
  quantifiers: 'Kwantyfikator', functionWords: 'Wyraz funkcyjny'
});
const ROLES = Object.freeze({
  agent: 'Wykonawca / agent', theme: 'Obiekt / theme',
  recipient: 'Odbiorca', experiencer: 'Doświadczający',
  possessor: 'Posiadacz', patient: 'Obiekt działania'
});
const PARADIGM_NAMES = Object.freeze({
  'pl.noun.masc_animate': 'Rzeczownik · męski żywotny',
  'pl.noun.masc_inanimate': 'Rzeczownik · męski nieżywotny',
  'pl.noun.masc_inanimate_hard': 'Rzeczownik · męski twardotematowy',
  'pl.noun.feminine_a': 'Rzeczownik · żeński (-a)',
  'pl.noun.feminine_sz': 'Rzeczownik · żeński (-sz)',
  'pl.noun.neuter_o': 'Rzeczownik · nijaki (-o)',
  'pl.noun.neuter_o_plain': 'Rzeczownik · nijaki, regularny',
  'pl.verb.third_person': 'Czasownik · ograniczony do 3. osoby',
  'pl.adj.regular': 'Przymiotnik · regularny',
  'en.noun.regular': 'Noun · regular plural (-s)',
  'en.noun.sibilant': 'Noun · sibilant plural (-es)',
  'en.noun.consonant_y': 'Noun · consonant + y (-ies)',
  'en.verb.regular': 'Verb · limited regular forms',
  'en.adj.invariant': 'Adjective · invariant'
});
const POS_CATEGORIES = Object.freeze({ NOUN:'nouns', VERB:'verbs', ADJ:'adjectives' });
const STEM_NAMES = Object.freeze({
  pastSingular: 'Temat czasu przeszłego (liczba pojedyncza)',
  pastVirile: 'Temat czasu przeszłego (męskoosobowy)',
  presentSingular: 'Temat czasu teraźniejszego (liczba pojedyncza)',
  presentPlural: 'Temat czasu teraźniejszego (liczba mnoga)',
  virile: 'Temat rodzaju męskoosobowego'
});
const translateValue = value => VALUES[String(value)] || String(value);
const make = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const textRow = (container, tag, className, text) => {
  const item = make(tag, className, text);
  container.appendChild(item);
  return item;
};

/** Lookup both lemmas and inflected surfaces without assuming a source language. */
export function dictionaryLookup(engine, language, word) {
  const unique = new Map();
  for (const lexeme of engine.lookupLexemes({ language, lemma: word })) {
    unique.set(lexeme.id, lexeme);
  }
  const analyses = engine.analyzeForm({ language, text: word });
  for (const reading of analyses) {
    for (const lexeme of engine.lookupLexemes({ language, lemma: reading.lemma })) {
      if (lexeme.id === reading.lexemeId) unique.set(lexeme.id, lexeme);
    }
  }
  return { lexemes: [...unique.values()], analyses };
}
function featuresView(container, features) {
  for (const [key, value] of Object.entries(features || {})) {
    textRow(container, 'span', 'tag tag-secondary',
      (LABELS[key] || key) + ': ' + translateValue(value));
  }
}
function groupTitle(form, category) {
  const features = form.features || {};
  if (['nouns', 'adjectives'].includes(category) && features.number) {
    return 'Liczba ' + translateValue(features.number);
  }
  if (category === 'verbs') {
    if (features.tense) return 'Czas ' + translateValue(features.tense);
    if (features.mood) return 'Tryb ' + translateValue(features.mood);
    return 'Pozostałe formy';
  }
  return 'Dostępne formy';
}
function renderParadigm(target, forms, category) {
  const groups = new Map();
  for (const form of forms) {
    const group = groupTitle(form, category);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(form);
  }
  for (const [name, entries] of groups) {
    const section = make('section', 'paradigm-section');
    textRow(section, 'h3', 'paradigm-title', name + ' · ' + entries.length + ' form');
    const scroll = make('div', 'table-scroll');
    const table = make('table');
    const thead = make('thead');
    const header = make('tr');
    for (const col of ['Forma', 'Cechy gramatyczne', 'Pochodzenie']) {
      textRow(header, 'th', '', col);
    }
    thead.appendChild(header);
    table.appendChild(thead);
    const tbody = make('tbody');
    for (const form of entries) {
      const row = make('tr');
      textRow(row, 'td', '', form.text);
      const traits = make('td');
      featuresView(traits, form.features);
      row.appendChild(traits);
      textRow(row, 'td', 'muted', form.source === 'hypothesis' ? 'Hipoteza' : form.source === 'exception' ? 'Wyjątek' : 'Reguła');
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    section.appendChild(scroll);
    target.appendChild(section);
  }
}
function renderLexeme(engine, language, lexeme) {
  const card = make('article', 'dictionary-card');
  const header = make('div', 'dictionary-card-head');
  const titleWrap = make('div');
  textRow(titleWrap, 'h2', 'entry-title', lexeme.lemma);
  textRow(titleWrap, 'p', 'entry-meta',
    (CATEGORIES[lexeme.category] || lexeme.category) + ' · ' + lexeme.id);
  const coreLine = (lexeme.senses || []).map(sense =>
    sense.coreRef.kind + ': ' + sense.coreRef.id).join(' · ');
  if (coreLine) textRow(titleWrap, 'p', 'entry-ref', 'INTER/CORE — ' + coreLine);
  header.appendChild(titleWrap);
  const morphology = engine.morphology(language);
  if (!morphology.has(lexeme.id)) {
    textRow(header, 'span', 'tag tag-secondary', 'Brak paradygmatu');
    card.appendChild(header);
    const info = make('div', 'paradigm-section');
    textRow(info, 'p', 'hint',
      'Hasło istnieje w słowniku, ale nie ma zadeklarowanego paradygmatu odmian w bieżącej wersji.');
    card.appendChild(info);
    return card;
  }
  const forms = engine.inspectParadigm({ language, lexemeId: lexeme.id });
  textRow(header, 'span', 'tag', forms.length + ' dostępnych form');
  card.appendChild(header);
  if (forms.length) renderParadigm(card, forms, lexeme.category);
  else {
    const info = make('div', 'paradigm-section');
    textRow(info, 'p', 'hint', 'Wszystkie komórki tego paradygmatu są niedostępne.');
    card.appendChild(info);
  }
  return card;
}
function showNotFound(container, word, language) {
  const info = make('div', 'empty-state');
  textRow(info, 'strong', '', 'Not found in dictionary');
  textRow(info, 'p', '',
    'Nie znaleziono słowa „' + word + '” w słowniku ' +
      (language === 'pl' ? 'polskim' : 'angielskim') + '.');
  textRow(info, 'p', 'hint',
    'Słownik ma ograniczony zakres. Nie dopisujemy automatycznie nieznanych haseł.');
  container.appendChild(info);
}

/**
 * Produce only an EXPERIMENTAL rule preview. It does not register a lexeme,
 * add a CORE sense, infer POS/paradigm or generate lexical exceptions.
 * All suffix/morphophonological operations come from the existing engine.
 */
export function previewUnknownForms(engine, { language, lemma, paradigmId, stem, additionalStems = {} }) {
  if (!['pl', 'en'].includes(language)) throw new Error('Nieobsługiwany język odmiany.');
  const morphology = engine.morphology(language);
  const paradigm = morphology.paradigms.get(paradigmId);
  if (!paradigm) throw new Error('Wybierz dostępny paradygmat.');
  const word = String(lemma || '').trim().normalize('NFC');
  const base = String(stem || '').trim().normalize('NFC');
  if (!word || word.length > 120 || /\s/u.test(word) || !base || base.length > 120 || /\s/u.test(base)) {
    throw new Error('Podaj jedno słowo i jego poprawny temat fleksyjny.');
  }
  const stems = { base, lemma: word };
  for (const [name, value] of Object.entries(additionalStems)) {
    if (name === 'base' || name === 'lemma' || !/^[A-Za-z][A-Za-z0-9_]*$/u.test(name)) continue;
    const trimmed = String(value || '').trim().normalize('NFC');
    if (trimmed && trimmed.length <= 120 && !/\s/u.test(trimmed)) stems[name] = trimmed;
  }
  const forms = [];
  const unavailable = [];
  for (const slot of paradigm.slots.values()) {
    try {
      const generated = executeOperations({ stem: base, stems, steps: slot.steps });
      forms.push({ text: generated.text, features: structuredClone(slot.features), source: 'hypothesis' });
    } catch (error) {
      // Without a required alternate stem the cell is unknown, not guessed.
      unavailable.push({ features: structuredClone(slot.features), reason: error.message });
    }
  }
  return { forms, unavailable, totalCells: paradigm.slots.size, pos: paradigm.pos };
}


/** Descriptive samples come from the real, bound lexicon — no word-class inference. */
export function paradigmExamples(engine, language) {
  const morphology = engine.morphology(language);
  const examples = new Map();
  for (const lexeme of morphology.lexicon.entries) {
    if (!morphology.has(lexeme.id)) continue;
    const forms = engine.inspectParadigm({ language, lexemeId: lexeme.id });
    const paradigmId = forms[0]?.paradigmId;
    if (!paradigmId) continue;
    if (!examples.has(paradigmId)) examples.set(paradigmId, []);
    const group = examples.get(paradigmId);
    if (!group.some(entry => entry.lemma === lexeme.lemma) && group.length < 4) {
      group.push({ lemma: lexeme.lemma, lexemeId: lexeme.id });
    }
  }
  return examples;
}

/** Check only whether the hypothetical nominative/base form matches the entered lemma. */
function previewLemmaComparison(preview, lemma) {
  if (preview.pos !== 'NOUN') return null;
  const form = preview.forms.find(item =>
    item.features.number === 'singular' &&
    (item.features.case === undefined || item.features.case === 'nom'));
  if (!form) return null;
  return { expected: lemma, actual: form.text, matches: form.text.toLocaleLowerCase() === lemma.toLocaleLowerCase() };
}


/** Compare exactly matching grammatical cells; shared spelling is not proof of correctness. */
export function compareUnknownParadigms(engine, request) {
  const { language, lemma, stem, additionalStems = {}, primaryId, secondaryId } = request;
  const morphology = engine.morphology(language);
  const leftPattern = morphology.paradigms.get(primaryId);
  const rightPattern = morphology.paradigms.get(secondaryId);
  if (!leftPattern || !rightPattern || primaryId === secondaryId ||
      leftPattern.pos !== rightPattern.pos) {
    throw new Error('Porównanie wymaga dwóch różnych paradygmatów tej samej części mowy.');
  }
  const primary = previewUnknownForms(engine, {
    language, lemma, stem, additionalStems, paradigmId: primaryId
  });
  const secondary = previewUnknownForms(engine, {
    language, lemma, stem, additionalStems, paradigmId: secondaryId
  });
  const key = features => JSON.stringify(Object.entries(features).sort(([a], [b]) => a.localeCompare(b)));
  const left = new Map(primary.forms.map(form => [key(form.features), form]));
  const right = new Map(secondary.forms.map(form => [key(form.features), form]));
  const missingLeft = new Map(primary.unavailable.map(form => [key(form.features), form]));
  const missingRight = new Map(secondary.unavailable.map(form => [key(form.features), form]));
  const allKeys = new Set([...left.keys(), ...right.keys(), ...missingLeft.keys(), ...missingRight.keys()]);
  const rows = [];
  let same = 0, different = 0, unavailable = 0;
  for (const cell of allKeys) {
    const a = left.get(cell), b = right.get(cell);
    const traits = (a || b || missingLeft.get(cell) || missingRight.get(cell)).features;
    const status = a && b ? (a.text === b.text ? 'same' : 'different') : 'unavailable';
    if (status === 'same') same++;
    else if (status === 'different') different++;
    else unavailable++;
    rows.push({ features: structuredClone(traits), primaryText: a?.text || null,
      secondaryText: b?.text || null, status });
  }
  return { primaryId, secondaryId, primary, secondary, rows, same, different, unavailable };
}

/** Structural package inventory, not a measure of linguistic correctness or CEFR. */
export function morphologyOverview(engine, language) {
  const morph = engine.morphology(language);
  const totals = morph.describe();
  const lexemes = morph.lexicon.entries;
  const examples = paradigmExamples(engine, language);
  const boundByPattern = new Map();
  for (const entry of lexemes) {
    if (!morph.has(entry.id)) continue;
    const forms = engine.inspectParadigm({ language, lexemeId: entry.id });
    const id = forms[0]?.paradigmId;
    if (id) boundByPattern.set(id, (boundByPattern.get(id) || 0) + 1);
  }
  return { language, dictionaryEntries: lexemes.length, boundLexemes: totals.lexemes,
    formEntries: totals.forms, totalParadigms: morph.paradigms.size,
    paradigms: [...morph.paradigms].map(([id, pattern]) => ({
      id, pos: pattern.pos, cells: pattern.slots.size, exampleCount: boundByPattern.get(id) || 0,
      examples: (examples.get(id) || []).map(item => item.lemma)
    })) };
}

function previewHelp(container, title, explanation) {
  const block = make('div', 'empty-state');
  textRow(block, 'strong', '', title);
  textRow(block, 'p', '', explanation);
  container.appendChild(block);
}

function renderPatternComparison(engine, params, target) {
  const secondaryId = $('dictionary-compare-paradigm')?.value;
  if (!secondaryId) {
    previewHelp(target, 'Wybierz drugi schemat', 'Włączono porównywanie. Wybierz drugi paradygmat tej samej części mowy, a następnie ponownie wyświetl odmiany.');
    return;
  }
  const outcome = compareUnknownParadigms(engine, { ...params, secondaryId });
  const block = make('section', 'comparison-summary');
  textRow(block, 'strong', '', 'Porównanie dwóch hipotez');
  textRow(block, 'p', '', (PARADIGM_NAMES[outcome.primaryId] || outcome.primaryId) +
    ' ↔ ' + (PARADIGM_NAMES[outcome.secondaryId] || outcome.secondaryId));
  textRow(block, 'p', '', 'Identyczne formy we wspólnych komórkach: ' + outcome.same +
    ' · różne: ' + outcome.different +
    ' · nieporównywalne/pominięte: ' + outcome.unavailable);
  textRow(block, 'p', '', 'To porównanie powierzchniowych wyników tych samych cech gramatycznych. Nie jest oceną poprawności odmiany.');
  const secondLemma = previewLemmaComparison(outcome.secondary, params.lemma);
  if (secondLemma && !secondLemma.matches) {
    textRow(block, 'p', 'compare-different',
      'Drugi wzorzec ma inną formę podstawową: „' + secondLemma.actual +
      '” zamiast „' + params.lemma + '”. Sprawdź, czy podany temat pasuje do obu wzorców.');
  }
  const scroll = make('div', 'table-scroll');
  const table = make('table', 'comparison-table');
  const head = make('thead');
  const header = make('tr');
  for (const name of ['Cechy', 'Pierwszy wzorzec', 'Drugi wzorzec', 'Porównanie']) {
    textRow(header, 'th', '', name);
  }
  head.appendChild(header);
  table.appendChild(head);
  const body = make('tbody');
  for (const row of outcome.rows) {
    const line = make('tr');
    const featureCell = make('td');
    featuresView(featureCell, row.features);
    line.appendChild(featureCell);
    textRow(line, 'td', '', row.primaryText ?? '—');
    textRow(line, 'td', '', row.secondaryText ?? '—');
    textRow(line, 'td', row.status === 'same' ? 'compare-same' :
      row.status === 'different' ? 'compare-different' : 'muted',
      row.status === 'same' ? 'Takie same' :
      row.status === 'different' ? 'Różne' : 'Brak wspólnej formy');
    body.appendChild(line);
  }
  table.appendChild(body);
  scroll.appendChild(table);
  block.appendChild(scroll);
  target.appendChild(block);
}

function showExperimentalPreview(engine, language, query, target, status, additionalInputs) {
  const paradigmId = $('dictionary-paradigm').value;
  if (!paradigmId) {
    status.textContent = 'Słowo spoza słownika · wybierz schemat odmiany.';
    previewHelp(target, 'Wybierz paradygmat', 'Włączono próbę odmiany. Wybierz rodzaj schematu z dostępnych reguł, następnie podaj temat fleksyjny.');
    return;
  }
  const stem = $('dictionary-stem').value.trim();
  if (!stem) {
    status.textContent = 'Słowo spoza słownika · podaj temat fleksyjny.';
    previewHelp(target, 'Podaj temat (rdzeń)', 'Temat fleksyjny może się różnić od hasła: np. lampa → lamp. Nie wyznaczamy go automatycznie.');
    return;
  }
  const additionalStems = Object.fromEntries([...additionalInputs].map(([key, input]) => [key, input.value]));
  const preview = previewUnknownForms(engine, {
    language, lemma: query, paradigmId, stem, additionalStems
  });
  status.textContent = 'Tryb eksperymentalny · ' + preview.forms.length + ' z ' +
    preview.totalCells + ' komórek wygenerowano z istniejących reguł. Żadna forma nie została zweryfikowana w słowniku.';
  const card = make('article', 'dictionary-card');
  const header = make('div', 'dictionary-card-head');
  const titleWrap = make('div');
  textRow(titleWrap, 'h2', 'entry-title', query);
  textRow(titleWrap, 'p', 'entry-meta', 'Spoza słownika · ' +
    (PARADIGM_NAMES[paradigmId] || paradigmId));
  textRow(titleWrap, 'p', 'entry-ref', 'Temat: ' + stem + ' · brak referencji CORE, brak wyjątków leksykalnych');
  header.appendChild(titleWrap);
  const indicators = make('div', 'preview-controls');
  textRow(indicators, 'span', 'tag tag-experimental', 'HIPOTEZA · NIEZWERYFIKOWANE');
  const copy = make('button', 'button button-small button-quiet', 'Kopiuj odmiany');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const data = ['HIPOTEZA · NIEZWERYFIKOWANE', query + ' · ' + paradigmId,
      ...preview.forms.map(form =>
        form.text + '\t' + Object.entries(form.features).map(([key, value]) =>
          (LABELS[key] || key) + ': ' + translateValue(value)).join(', '))
    ].join('\n');
    try {
      await navigator.clipboard.writeText(data);
      copy.textContent = 'Skopiowano';
    } catch {
      copy.textContent = 'Nie udało się skopiować';
    }
  });
  indicators.appendChild(copy);
  header.appendChild(indicators);
  card.appendChild(header);
  const warning = make('div', 'experimental-warning');
  textRow(warning, 'strong', '', 'Przewidywane formy, nie wynik słownikowy');
  textRow(warning, 'p', '', 'Wybrany schemat może nie pasować do słowa. Polskie odmiany i wyjątki często wymagają danych leksykalnych; wyników nie używa się do tłumaczeń.');
  card.appendChild(warning);
  const lemmaCheck = previewLemmaComparison(preview, query);
  if (lemmaCheck && !lemmaCheck.matches) {
    const notice = make('div', 'experimental-mismatch');
    textRow(notice, 'strong', '', 'Uwaga: schemat nie odtwarza wpisanego hasła');
    textRow(notice, 'p', '', 'Wpisano „' + lemmaCheck.expected + '”, a forma podstawowa z reguły to „' +
      lemmaCheck.actual + '”. Sprawdź temat fleksyjny albo wybór paradygmatu. To nie przesądza o poprawności innych form.');
    card.appendChild(notice);
  }
  if (preview.forms.length) {
    renderParadigm(card, preview.forms, POS_CATEGORIES[preview.pos]);
  } else {
    const inner = make('div', 'paradigm-section');
    textRow(inner, 'p', 'hint', 'Brak form do pokazania. Sprawdź temat oraz wymagane tematy dodatkowe.');
    card.appendChild(inner);
  }
  if (preview.unavailable.length) {
    const missing = make('div', 'paradigm-section');
    textRow(missing, 'h3', 'paradigm-title', 'Niedostępne komórki: ' + preview.unavailable.length);
    textRow(missing, 'p', 'hint', 'Nie podano wymaganych tematów albo istniejąca reguła nie pasuje do podanego rdzenia. Pominięte komórki nie są zgadywane.');
    const scroll = make('div', 'table-scroll');
    const table = make('table');
    const header = make('tr');
    textRow(header, 'th', '', 'Cechy komórki');
    textRow(header, 'th', '', 'Powód pominięcia');
    const head = make('thead');
    head.appendChild(header);
    table.appendChild(head);
    const body = make('tbody');
    for (const item of preview.unavailable) {
      const row = make('tr');
      const traits = make('td');
      featuresView(traits, item.features);
      row.appendChild(traits);
      textRow(row, 'td', 'muted', item.reason);
      body.appendChild(row);
    }
    table.appendChild(body);
    scroll.appendChild(table);
    missing.appendChild(scroll);
    card.appendChild(missing);
  }
  target.appendChild(card);
  if ($('dictionary-compare')?.checked) {
    renderPatternComparison(engine, { language, lemma: query, stem, additionalStems,
      primaryId: paradigmId }, target);
  }
}
function requiredStems(paradigm) {
  if (!paradigm) return [];
  const found = new Set();
  for (const slot of paradigm.slots.values()) {
    for (const step of slot.steps) {
      if (step.op === 'selectStem' && step.key !== 'base' && step.key !== 'lemma') found.add(step.key);
    }
  }
  return [...found];
}
function setupUnknownControls(engine) {
  const toggle = $('dictionary-experimental');
  const settings = $('dictionary-experimental-settings');
  const dropdown = $('dictionary-paradigm');
  const compare = $('dictionary-compare');
  const compareSettings = $('dictionary-compare-settings');
  const compareDropdown = $('dictionary-compare-paradigm');
  const pos = $('dictionary-part-of-speech');
  const guide = $('dictionary-paradigm-guide');
  const stem = $('dictionary-stem');
  const query = $('dictionary-query');
  const language = $('dictionary-language');
  const extraTarget = $('dictionary-additional-stems');
  if (!toggle || !settings || !dropdown || !compare || !compareSettings || !compareDropdown ||
      !pos || !guide || !stem || !query || !language || !extraTarget) {
    return { additionalInputs: new Map(), refreshParadigms() {}, syncStemFromQuery() {} };
  }
  const additionalInputs = new Map();
  const catalogs = new Map();
  const samplesForLanguage = () => {
    if (!catalogs.has(language.value)) catalogs.set(language.value, paradigmExamples(engine, language.value));
    return catalogs.get(language.value);
  };
  let previousQuery = query.value.trim();
  const syncStemFromQuery = () => {
    const currentQuery = query.value.trim();
    if (!stem.value.trim() || stem.value.trim() === previousQuery) stem.value = currentQuery;
    previousQuery = currentQuery;
  };

  const updateCompareOptions = () => {
    const current = compareDropdown.value;
    compareDropdown.replaceChildren();
    const empty = make('option', '', 'Wybierz drugi schemat…');
    empty.value = '';
    compareDropdown.appendChild(empty);
    const primary = engine.morphology(language.value).paradigms.get(dropdown.value);
    let options = 0;
    if (primary) {
      for (const [id, pattern] of engine.morphology(language.value).paradigms) {
        if (id === dropdown.value || pattern.pos !== primary.pos) continue;
        const candidate = make('option', '', PARADIGM_NAMES[id] || id);
        candidate.value = id;
        compareDropdown.appendChild(candidate);
        options++;
      }
    }
    compareDropdown.disabled = options === 0;
    compareDropdown.value = [...compareDropdown.children].some(item => item.value === current) ? current : '';
  };
  const updateStems = () => {
    updateCompareOptions();
    additionalInputs.clear();
    extraTarget.replaceChildren();
    const paradigm = engine.morphology(language.value).paradigms.get(dropdown.value);
    const samples = samplesForLanguage().get(dropdown.value) || [];
    if (!paradigm) {
      guide.textContent = 'Wybierz część mowy oraz schemat. Przykłady pochodzą z faktycznego słownika.';
    } else {
      guide.textContent = 'W słowniku ten schemat mają np.: ' +
        (samples.length ? samples.map(entry => entry.lemma).join(', ') : 'brak haseł referencyjnych') +
        '. Dostępnych komórek: ' + paradigm.slots.size +
        '. Przykłady nie dowodzą, że nieznane słowo odmienia się tak samo.';
    }
    for (const key of requiredStems(paradigm)) {
      const label = make('label', 'field');
      const span = make('span', '', STEM_NAMES[key] || ('Temat dodatkowy: ' + key));
      const input = make('input');
      input.type = 'text';
      input.id = 'dictionary-stem-' + key;
      input.maxLength = 120;
      input.placeholder = 'Wpisz temat lub pozostaw puste (pomija odpowiednie formy)';
      label.appendChild(span);
      label.appendChild(input);
      extraTarget.appendChild(label);
      additionalInputs.set(key, input);
    }
  };
  const updateParadigms = () => {
    dropdown.replaceChildren();
    const option = make('option', '', 'Wybierz schemat odmiany…');
    option.value = '';
    dropdown.appendChild(option);
    for (const [id, paradigm] of engine.morphology(language.value).paradigms) {
      if (pos.value && paradigm.pos !== pos.value) continue;
      const label = PARADIGM_NAMES[id] ||
        (({ NOUN:'Rzeczownik', VERB:'Czasownik', ADJ:'Przymiotnik' })[paradigm.pos] || paradigm.pos);
      const item = make('option', '', label + ' · ' + id);
      item.value = id;
      dropdown.appendChild(item);
    }
    dropdown.value = '';
    updateStems();
  };
  toggle.addEventListener('change', () => {
    settings.hidden = !toggle.checked;
    if (!toggle.checked) compareSettings.hidden = true;
    else compareSettings.hidden = !compare.checked;
    if (toggle.checked) syncStemFromQuery();
    if (toggle.checked && !dropdown.children.length) updateParadigms();
  });
  compare.addEventListener('change', () => {
    compareSettings.hidden = !compare.checked || !toggle.checked;
    if (compare.checked) updateCompareOptions();
  });
  dropdown.addEventListener('change', updateStems);
  pos.addEventListener('change', updateParadigms);
  language.addEventListener('change', updateParadigms);
  query.addEventListener('input', () => {
    // Keep the default stem in sync without overwriting a manually edited one.
    if (toggle.checked) syncStemFromQuery();
    else previousQuery = query.value.trim();
  });
  updateParadigms();
  const preselect = (languageCode, patternId) => {
    const morph = engine.morphology(languageCode);
    const pattern = morph.paradigms.get(patternId);
    if (!pattern) throw new Error('Nieznany paradygmat.');
    const previousLanguage = language.value;
    language.value = languageCode;
    toggle.checked = true;
    settings.hidden = false;
    compare.checked = false;
    compareSettings.hidden = true;
    pos.value = pattern.pos;
    updateParadigms();
    dropdown.value = patternId;
    updateStems();
    if (previousLanguage !== languageCode) {
      query.value = '';
      stem.value = '';
      previousQuery = '';
    } else {
      syncStemFromQuery();
    }
    query.focus?.();
  };
  return { additionalInputs, refreshParadigms: updateParadigms, syncStemFromQuery, preselect };
}

function runDictionarySearch(engine, additionalInputs = new Map()) {
  const query = $('dictionary-query').value.trim().normalize('NFC');
  const language = $('dictionary-language').value;
  const status = $('dictionary-status');
  const target = $('dictionary-results');
  target.replaceChildren();
  if (!query) {
    status.textContent = 'Wpisz słowo, aby rozpocząć wyszukiwanie.';
    return;
  }
  if (query.length > 127 || /\s/u.test(query)) {
    status.textContent = 'Podaj jedno słowo (maksymalnie 127 znaków).';
    return;
  }
  try {
    const found = dictionaryLookup(engine, language, query);
    if (!found.lexemes.length) {
      if ($('dictionary-experimental')?.checked) {
        showExperimentalPreview(engine, language, query, target, status, additionalInputs);
      } else {
        status.textContent = 'Brak dopasowań.';
        showNotFound(target, query, language);
      }
      return;
    }
    const recognized = found.analyses.some(item =>
      item.lemma.toLocaleLowerCase(language) !== query.toLocaleLowerCase(language));
    status.textContent = found.lexemes.length + ' ' +
      (found.lexemes.length === 1 ? 'hasło' : 'hasła') +
      ' w słowniku ' + language.toUpperCase() +
      (recognized ? ' · rozpoznano także odmienioną formę' : '') +
      '. Pokazano wszystkie zadeklarowane formy, nie formy hipotetyczne.';
    for (const lexeme of found.lexemes) target.appendChild(renderLexeme(engine, language, lexeme));
  } catch (error) {
    status.textContent = 'Nie można wyszukać słowa: ' + error.message;
  }
}
function renderNode(value, role = '', depth = 0) {
  const node = make('div', 'meaning-node');
  if (role) textRow(node, 'p', 'meaning-role', ROLES[role] || role);
  if (depth > 8) {
    textRow(node, 'p', 'meaning-node-meta', 'Dalsza struktura jest dostępna w JSON.');
    return node;
  }
  if (value === null || typeof value !== 'object') {
    textRow(node, 'p', 'meaning-node-title', String(value));
    return node;
  }
  const heading = value.concept || value.type || value.id ||
    (Array.isArray(value) ? 'Lista' : 'Struktura');
  textRow(node, 'p', 'meaning-node-title', heading);
  if (value.type && value.concept) {
    textRow(node, 'p', 'meaning-node-meta', 'Typ: ' + value.type);
  }
  if (value.type === 'question') {
    const description = value.questionType === 'yes_no'
      ? 'Pytanie zamknięte (tak/nie)'
      : 'Pytanie o rolę: ' + (ROLES[value.targetRole] || value.targetRole || 'nieokreśloną');
    textRow(node, 'p', 'meaning-node-meta', description);
  }
  const facts = [];
  for (const field of ['version', 'number', 'definiteness', 'quantifier', 'negated']) {
    if (value[field] !== undefined && typeof value[field] !== 'object') {
      facts.push(field + ': ' + translateValue(value[field]));
    }
  }
  if (facts.length) textRow(node, 'p', 'meaning-node-meta', facts.join(' · '));
  if (value.features && typeof value.features === 'object') {
    const tags = make('div');
    featuresView(tags, value.features);
    node.appendChild(tags);
  }
  const children = [];
  if (value.roles && typeof value.roles === 'object') {
    for (const [name, item] of Object.entries(value.roles)) children.push([name, item]);
  }
  if (value.events && Array.isArray(value.events)) {
    value.events.forEach((item, index) => children.push(['Zdarzenie ' + (index + 1), item]));
  }
  if (value.clauses && Array.isArray(value.clauses)) {
    value.clauses.forEach((item, index) => children.push(['Część ' + (index + 1), item]));
  }
  if (value.proposition) children.push(['Treść pytania', value.proposition]);
  if (value.content) children.push(['Treść', value.content]);
  if (value.operand) children.push(['Zasięg operatora', value.operand]);
  if (value.experiencer) children.push(['Doświadczający', value.experiencer]);
  if (value.properties && Array.isArray(value.properties)) {
    value.properties.forEach((item, index) => children.push(['Cecha ' + (index + 1), item]));
  }
  if (value.relatives && Array.isArray(value.relatives)) {
    value.relatives.forEach((item, index) => children.push(['Zdanie względne ' + (index + 1), item]));
  }
  if (value.event && typeof value.event === 'object') children.push(['Zdarzenie', value.event]);
  if (children.length) {
    const container = make('div', 'meaning-children');
    for (const [name, item] of children.slice(0, 80)) {
      container.appendChild(renderNode(item, name, depth + 1));
    }
    node.appendChild(container);
  }
  return node;
}
/** Presents the exact graph returned by Engine; no semantic interpretation changes. */
export function renderMeaning(graph) {
  const empty = $('meaning-empty');
  const summary = $('meaning-summary');
  const tree = $('meaning-tree');
  if (!empty || !summary || !tree) return;
  tree.replaceChildren();
  empty.hidden = Boolean(graph);
  summary.hidden = !graph;
  if (!graph) {
    summary.textContent = '';
    return;
  }
  summary.textContent = 'Rodzaj: ' + (graph.type || 'struktura') +
    (graph.concept ? ' · ' + graph.concept : '') +
    (graph.version ? ' · wersja ' + graph.version : '');
  tree.appendChild(renderNode(graph));
}

function renderCoverageOverview(engine, onTestPattern) {
  const host = $('coverage-overview');
  if (!host) return;
  host.replaceChildren();
  for (const language of ['pl', 'en']) {
    const data = morphologyOverview(engine, language);
    const section = make('section', 'coverage-language');
    const head = make('div', 'coverage-language-head');
    textRow(head, 'h3', '', language === 'pl' ? 'Polski' : 'English');
    textRow(head, 'p', '', 'Rzeczywiście załadowane paradygmaty i powiązania ze słownikiem.');
    section.appendChild(head);
    const metrics = make('div', 'coverage-stats');
    for (const [value, label] of [
      [data.totalParadigms, 'Paradygmaty'],
      [data.boundLexemes, 'Leksemy z morfologią'],
      [data.formEntries, 'Wpisy wygenerowanych form'],
      [data.dictionaryEntries, 'Wszystkie leksemy pakietu']
    ]) {
      const metric = make('div', 'coverage-stat');
      textRow(metric, 'strong', '', value);
      textRow(metric, 'span', '', label);
      metrics.appendChild(metric);
    }
    section.appendChild(metrics);
    const scroller = make('div', 'table-scroll');
    const table = make('table', 'coverage-table');
    const thead = make('thead');
    const headers = make('tr');
    for (const h of ['Paradygmat', 'Komórki', 'Hasła z formami', 'Przykłady', '']) textRow(headers, 'th', '', h);
    thead.appendChild(headers);
    table.appendChild(thead);
    const tbody = make('tbody');
    for (const pattern of data.paradigms) {
      const tr = make('tr');
      const details = make('td');
      textRow(details, 'strong', '', PARADIGM_NAMES[pattern.id] || pattern.id);
      textRow(details, 'span', 'coverage-id', pattern.id);
      tr.appendChild(details);
      textRow(tr, 'td', '', pattern.cells);
      textRow(tr, 'td', '', pattern.exampleCount);
      textRow(tr, 'td', 'coverage-example', pattern.examples.length ? pattern.examples.join(', ') : '—');
      const action = make('td');
      const test = make('button', 'button button-small button-quiet', 'Przetestuj wzorzec');
      test.type = 'button';
      test.addEventListener('click', () => onTestPattern(language, pattern.id));
      action.appendChild(test);
      tr.appendChild(action);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroller.appendChild(table);
    section.appendChild(scroller);
    host.appendChild(section);
  }
}

/** Accessible tabs with arrow-key/Home/End navigation. */
export function initStudio(engine) {
  const names = ['translate', 'dictionary', 'inter', 'coverage'];
  const tabs = names.map(name => $('tab-' + name));
  const panels = names.map(name => $('panel-' + name));
  if (tabs.some(tab => !tab) || panels.some(panel => !panel)) return;
  const activate = (index, focus = false) => {
    tabs.forEach((tab, position) => {
      const active = position === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[position].hidden = !active;
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(index));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ?
        (index + 1) % tabs.length :
        event.key === 'ArrowLeft' || event.key === 'ArrowUp' ?
          (index + tabs.length - 1) % tabs.length :
          event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) {
        event.preventDefault();
        activate(next, true);
      }
    });
  });
  activate(0);
  const form = $('dictionary-form');
  if (!form || !engine) return;
  const unknown = setupUnknownControls(engine);
  renderCoverageOverview(engine, (language, patternId) => {
    activate(1);
    unknown.preselect(language, patternId);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    runDictionarySearch(engine, unknown.additionalInputs);
  });
  for (const [id, word, language] of [
    ['dictionary-example-pl', 'kot', 'pl'],
    ['dictionary-example-inflected', 'koty', 'pl'],
    ['dictionary-example-en', 'child', 'en']
  ]) {
    const button = $(id);
    if (!button) continue;
    button.addEventListener('click', () => {
      $('dictionary-query').value = word;
      $('dictionary-language').value = language;
      unknown.refreshParadigms();
      unknown.syncStemFromQuery();
      runDictionarySearch(engine, unknown.additionalInputs);
    });
  }
}
