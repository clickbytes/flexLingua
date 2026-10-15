import { participant, modifier, MAX_ENTITY_MODIFIERS, MAX_MODIFIER_DEPTH } from './interlingua.js';
import { record, safeName, hasOwn } from './features.js';
import { matchesTokens } from './text.js';

const WORDS = /^[\p{L}]+(?:\s+[\p{L}]+)*$/u;
const LEXEME = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/u;
const AGREEMENT_KEYS = new Set(['number', 'case', 'gender', 'pluralClass', 'animacy']);
const MAX_NP_STATES = 10000;
const DEFAULT_LAYOUT = ['determiner', 'noun'];

function markerFor(noun, mapping) {
  if (!mapping) return undefined;
  if (mapping.omit) return null;
  if (mapping.literal) return mapping.literal;
  if (mapping.lexemeProperty) return noun[mapping.lexemeProperty];
  return undefined;
}

function meaningKey(meaning) {
  if (meaning?.kind === 'universal' && Object.keys(meaning).length === 1) return 'universal';
  if (meaning?.kind === 'exact' && Number.isInteger(meaning.value) &&
      meaning.value >= 2 && meaning.value <= 20 && Object.keys(meaning).length === 2) {
    return `exact:${meaning.value}`;
  }
  throw new Error('Invalid lexical quantifier meaning.');
}

function verifySurfaceInventory(entries, kind) {
  if (!Array.isArray(entries) || entries.length > 2000) throw new Error(`Invalid ${kind} inventory.`);
  const ids = new Set();
  return entries.map(entry => {
    if (!record(entry) || !LEXEME.test(entry.id || '') || ids.has(entry.id) ||
        !Array.isArray(entry.forms) || !entry.forms.length || entry.forms.length > 100 ||
        (kind === 'quantifier' ? !record(entry.meaning) :
          !LEXEME.test(entry.concept || '') || !WORDS.test(entry.lemma || ''))) {
      throw new Error(`Invalid ${kind} lexeme: ${entry?.id}`);
    }
    ids.add(entry.id);
    if (kind === 'quantifier') meaningKey(entry.meaning);
    for (const form of entry.forms) {
      if (!record(form) || !WORDS.test(form.text || '') ||
          (form.when !== undefined && (!record(form.when) ||
            Object.entries(form.when).some(([key, value]) => !AGREEMENT_KEYS.has(key) || !safeName(value))))) {
        throw new Error(`Invalid ${kind} inflected form: ${entry.id}`);
      }
    }
    return { ...entry };
  });
}

function matchingForms(lexeme, features) {
  return lexeme.forms.filter(form => Object.entries(form.when || {}).every(([key, value]) => features[key] === value));
}

function formFor(lexeme, features) {
  return matchingForms(lexeme, features)[0]?.text;
}

/**
 * Shared, bounded noun-phrase interpreter. JSON provides agreement-specific surface
 * forms and slot order; no adapter implements adjective/quantifier morphology.
 */
export function createNominalInterpreter({ dictionary, nounPhrase, nounForms }) {
  const qualified = nounPhrase.qualified || {};
  const layouts = qualified.layouts || [qualified.layout || DEFAULT_LAYOUT];
  const layoutByQuantifier = qualified.layoutByQuantifier || {};
  const adjectives = verifySurfaceInventory(dictionary.adjectives || [], 'adjective');
  const degrees = verifySurfaceInventory(dictionary.degrees || [], 'degree');
  const quantifiers = verifySurfaceInventory(dictionary.quantifiers || [], 'quantifier');
  const propertyIndex = new Map();
  const degreeIndex = new Map();
  const quantifierIndex = new Map();
  for (const [lexemes, index, keyOf] of [
    [adjectives, propertyIndex, lex => lex.concept],
    [degrees, degreeIndex, lex => lex.concept],
    [quantifiers, quantifierIndex, lex => meaningKey(lex.meaning)]
  ]) {
    for (const lexeme of lexemes) {
      const key = keyOf(lexeme);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(lexeme);
    }
  }
  if (!Array.isArray(layouts) || !layouts.length || layouts.length > 3 ||
      layouts.some(layout => !Array.isArray(layout) || new Set(layout).size !== layout.length ||
        layout.at(-1) !== 'noun' || !layout.includes('modifiers') || !layout.includes('quantifier') ||
        (Object.keys(nounPhrase.determiners).length > 0 && !layout.includes('determiner')) ||
        layout.some(slot => !['quantifier', 'determiner', 'modifiers', 'noun'].includes(slot))) ||
      !record(layoutByQuantifier) ||
      Object.entries(layoutByQuantifier).some(([kind, index]) =>
        !['exact', 'universal'].includes(kind) || !Number.isInteger(index) ||
        index < 0 || index >= layouts.length) ||
      qualified.maxAdjectives !== undefined &&
        (!Number.isInteger(qualified.maxAdjectives) || qualified.maxAdjectives < 1 || qualified.maxAdjectives > MAX_ENTITY_MODIFIERS) ||
      qualified.maxDegreeDepth !== undefined &&
        (!Number.isInteger(qualified.maxDegreeDepth) || qualified.maxDegreeDepth < 1 || qualified.maxDegreeDepth > MAX_MODIFIER_DEPTH - 1) ||
      ['adjectiveOrder', 'degreeOrder'].some(key => qualified[key] !== undefined && qualified[key] !== 'before') ||
      (qualified.articleFromFirstModifier !== undefined && typeof qualified.articleFromFirstModifier !== 'boolean')) {
    throw new Error('Invalid qualified noun-phrase layout or complexity limits.');
  }
  const maxAdjectives = qualified.maxAdjectives || MAX_ENTITY_MODIFIERS;
  const maxDegreeDepth = qualified.maxDegreeDepth || MAX_MODIFIER_DEPTH - 1;

  function featuresFor(noun, number, grammaticalCase) {
    return { number, case: grammaticalCase, gender: noun.gender,
      pluralClass: noun.pluralClass, animacy: noun.animacy };
  }

  function parseProperties(tokens, at, context, limit) {
    const results = [{ next: at, modifiers: [], lexemes: [] }];
    function walk(index, nodes, lexical) {
      if (nodes.length >= limit) return;
      // Degree-prefix recursion is bounded independently of adjective count.
      const prefixes = [{ next: index, degrees: [] }];
      function prefix(pos, chain) {
        if (chain.length >= maxDegreeDepth) return;
        for (const lex of degrees) for (const form of matchingForms(lex, context)) {
          const len = matchesTokens(tokens, pos, form.text);
          if (!len) continue;
          const next = { next: pos + len, degrees: [...chain, lex] };
          prefixes.push(next);
          prefix(next.next, next.degrees);
        }
      }
      prefix(index, []);
      for (const pre of prefixes) for (const lex of adjectives) for (const form of matchingForms(lex, context)) {
        const len = matchesTokens(tokens, pre.next, form.text);
        if (!len) continue;
        let nested = [];
        for (let i = pre.degrees.length - 1; i >= 0; i--) {
          nested = [modifier(pre.degrees[i].concept, nested)];
        }
        const node = modifier(lex.concept, nested);
        const combined = [...nodes, node];
        const lexemes = [...lexical, lex];
        const next = pre.next + len;
        results.push({ next, modifiers: combined, lexemes });
        walk(next, combined, lexemes);
        if (results.length > 128) throw new Error('Qualified noun phrase exceeded parsing limit.');
      }
    }
    walk(at, [], []);
    return results;
  }

  function readProperty(tokens, at, context) {
    const found = [];
    for (const lexeme of adjectives) {
      for (const form of matchingForms(lexeme, context)) {
        const length = matchesTokens(tokens, at, form.text);
        if (length) found.push({value: lexeme.concept, senseId: lexeme.senseId || lexeme.id,
          priority: lexeme.priority || 0, next: at + length});
      }
    }
    return found;
  }

  function realizeProperty(concept, context) {
    for (const lexeme of propertyIndex.get(concept) || []) {
      const form = formFor(lexeme, context);
      if (form) return form;
    }
    throw new Error(`Missing ${dictionary.language} adjective form for ${concept}.`);
  }

  function read(tokens, index, grammaticalCase, { allowBare = false } = {}) {
    const found = [];
    let visited = 0;
    for (const { noun, forms } of nounForms) for (const form of forms) for (const [layoutIndex, layout] of layouts.entries()) {
      if (form.bindings.case !== undefined && form.bindings.case !== grammaticalCase) continue;
      const number = form.bindings.number;
      if (!number) continue;
      const context = featuresFor(noun, number, grammaticalCase);
      function search(slotIndex, at, state) {
        if (++visited > MAX_NP_STATES) throw new Error('Qualified noun phrase exceeded parsing limit.');
        if (slotIndex === layout.length) {
          const firstAdj = state.lexemes[0];
          if (state.quantifier && layoutByQuantifier[state.quantifier.meaning.kind] !== undefined &&
              layoutByQuantifier[state.quantifier.meaning.kind] !== layoutIndex) return;
          if (!state.determinerChosen && !nounPhrase.allowBare && !allowBare && !state.quantifier) return;
          if (qualified.articleFromFirstModifier && state.marker &&
              state.definiteness === 'indefinite' &&
              state.marker !== (firstAdj?.indefiniteArticle || noun.indefiniteArticle)) return;
          const options = {};
          if (state.modifiers.length) options.modifiers = state.modifiers;
          if (state.quantifier) options.quantifier = state.quantifier.meaning;
          found.push({ value: participant(noun.concept, state.definiteness, number, options),
            noun, senseId: noun.senseId, next: at,
            modifierSenses: state.lexemes.map(lex => lex.id),
            quantifierSense: state.quantifier?.id });
          return;
        }
        const step = layout[slotIndex];
        const advance = (next, patch) => search(slotIndex + 1, next, { ...state, ...patch });
        if (step === 'noun') {
          const len = matchesTokens(tokens, at, form.text);
          if (len) advance(at + len, {});
        } else if (step === 'quantifier') {
          advance(at, {});
          if (number === 'plural') for (const quantifier of quantifiers) {
            for (const surface of matchingForms(quantifier, context)) {
              const len = matchesTokens(tokens, at, surface.text);
              if (len) advance(at + len, { quantifier });
            }
          }
        } else if (step === 'determiner') {
          const maps = nounPhrase.determiners[number] || {};
          for (const [definiteness, mapping] of Object.entries(maps)) {
            const marker = markerFor(noun, mapping);
            if (marker === undefined) continue;
            let candidates = [marker];
            if (qualified.articleFromFirstModifier && definiteness === 'indefinite' && marker) {
              candidates = [...new Set([marker, ...adjectives.map(lex => lex.indefiniteArticle).filter(Boolean)])];
            }
            for (const item of candidates) {
              const len = item ? matchesTokens(tokens, at, item) : 0;
              if (!item || len) advance(at + len, { definiteness, marker: item, determinerChosen: true });
            }
          }
          if (nounPhrase.allowBare || allowBare || state.quantifier || layout.slice(slotIndex + 1).includes('quantifier')) {
            advance(at, { definiteness: 'unknown', marker: null, determinerChosen: false });
          }
        } else if (step === 'modifiers') {
          for (const parsed of parseProperties(tokens, at, context, maxAdjectives)) {
            advance(parsed.next, { modifiers: parsed.modifiers, lexemes: parsed.lexemes });
          }
        }
      }
      search(0, index, { definiteness: 'unknown', marker: null, modifiers: [], lexemes: [], quantifier: null });
    }
    return found;
  }

  function render(ref, noun, nounText, grammaticalCase, fallback, { allowBare = false } = {}) {
    const context = featuresFor(noun, ref.features.number, grammaticalCase);
    const def = ref.features.definiteness === 'unknown' ? fallback : ref.features.definiteness;
    const mapping = nounPhrase.determiners[ref.features.number]?.[def];
    let marker = allowBare && ref.features.definiteness === 'unknown' ? null : markerFor(noun, mapping);
    const modifierWords = [];
    let firstAdjective = null;
    function renderNode(node, depth) {
      if (depth > MAX_MODIFIER_DEPTH) throw new Error('Modifier depth exceeded.');
      const index = depth === 1 ? propertyIndex : degreeIndex;
      const lex = index.get(node.concept)?.[0];
      if (!lex) throw new Error(`Missing ${dictionary.language} modifier lexeme for ${node.concept}.`);
      const text = formFor(lex, context);
      if (!text) throw new Error(`Missing ${dictionary.language} modifier form for ${node.concept}.`);
      return [...(node.modifiers || []).flatMap(child => renderNode(child, depth + 1)), text];
    }
    for (const node of ref.modifiers || []) {
      firstAdjective ||= propertyIndex.get(node.concept)?.[0];
      modifierWords.push(...renderNode(node, 1));
    }
    if (qualified.articleFromFirstModifier && marker && def === 'indefinite' &&
        firstAdjective?.indefiniteArticle) marker = firstAdjective.indefiniteArticle;
    let quantifier = '';
    if (ref.quantifier) {
      const lexical = quantifierIndex.get(meaningKey(ref.quantifier))?.[0];
      if (!lexical) throw new Error(`Missing ${dictionary.language} quantifier for ${meaningKey(ref.quantifier)}.`);
      quantifier = formFor(lexical, context);
      if (!quantifier) throw new Error(`Missing ${dictionary.language} quantifier form for ${meaningKey(ref.quantifier)}.`);
      if (def !== 'definite') marker = null;
    }
    if (!nounPhrase.allowBare && !allowBare && marker === undefined && !ref.quantifier) {
      throw new Error(`Missing ${def} determiner for ${noun.lemma}.`);
    }
    const slots = { quantifier, determiner: marker || '', modifiers: modifierWords.join(' '), noun: nounText };
    const layout = layouts[layoutByQuantifier[ref.quantifier?.kind] ?? 0];
    return layout.map(slot => slots[slot] || '').filter(Boolean).join(' ');
  }

  function validateOntology(ontology, registry) {
    for (const [entries, kind] of [[adjectives, 'property'], [degrees, 'degree']]) {
      for (const lex of entries) {
        if (ontology.get(lex.concept)?.type !== kind) {
          throw new Error(`Unknown ${kind} concept for ${lex.id}`);
        }
      }
    }
    for (const entries of [adjectives, degrees, quantifiers]) for (const lex of entries) {
      for (const form of lex.forms) for (const [name, value] of Object.entries(form.when || {})) {
        const domain = name === 'number' ? registry.domains.participant.number :
          name === 'case' ? registry.domains.syntactic.case : registry.domains.lexical[name];
        if (!domain?.includes(value)) throw new Error(`Unsupported inflection condition ${name}=${value} in ${lex.id}`);
      }
    }
    if (adjectives.length && layouts.some(layout => !layout.includes('modifiers'))) throw new Error('Missing adjective grammar slot.');
    if (quantifiers.length && layouts.some(layout => !layout.includes('quantifier'))) throw new Error('Missing quantifier grammar slot.');
  }

  return { read, readProperty, realizeProperty, render, validateOntology,
    describe: () => ({ adjectives: adjectives.length, degrees: degrees.length, quantifiers: quantifiers.length }) };
}
