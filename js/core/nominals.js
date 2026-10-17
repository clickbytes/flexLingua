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
      meaning.value >= 0 && meaning.value <= 20 && Object.keys(meaning).length === 2) {
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
    if(kind==='adjective' && entry.comparativeForms!==undefined) {
      if(!record(entry.comparativeForms) || !Object.keys(entry.comparativeForms).length ||
          Object.keys(entry.comparativeForms).some(relation=>!['greater','less'].includes(relation)) ||
          Object.values(entry.comparativeForms).some(forms=>!Array.isArray(forms) ||
            !forms.length || forms.length>64 || forms.some(form=>!record(form) ||
              !WORDS.test(form.text||'') || (form.when!==undefined && (!record(form.when) ||
                Object.entries(form.when).some(([key,value])=>!AGREEMENT_KEYS.has(key)||!safeName(value))))))) {
        throw new Error(`Invalid comparative adjective forms: ${entry.id}`);
      }
    }
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
  const demonstratives = nounPhrase.demonstratives || [];
  if (!Array.isArray(demonstratives) || demonstratives.length > 4 || demonstratives.some(entry =>
    !record(entry) || Object.keys(entry).some(key => !['distance','forms'].includes(key)) ||
    entry.distance !== 'proximal' || !Array.isArray(entry.forms) || !entry.forms.length ||
    entry.forms.length > 16 || entry.forms.some(form => !record(form) ||
      Object.keys(form).some(key => !['text','when'].includes(key)) ||
      !/^[\p{L}]+$/u.test(form.text || '') ||
      (form.when !== undefined && (!record(form.when) || Object.entries(form.when).some(([key,value]) =>
        !AGREEMENT_KEYS.has(key) || typeof value !== 'string')))))) {
    throw new Error('Invalid demonstrative noun-phrase inventory.');
  }
  const layouts = qualified.layouts || [qualified.layout || DEFAULT_LAYOUT];
  const layoutByQuantifier = qualified.layoutByQuantifier || {};
  const adjectives = verifySurfaceInventory(dictionary.adjectives || [], 'adjective');
  const degrees = verifySurfaceInventory(dictionary.degrees || [], 'degree');
  const quantifiers = verifySurfaceInventory(dictionary.quantifiers || [], 'quantifier');
  const agreementFeatures = qualified.adjectiveAgreementFeatures || [...AGREEMENT_KEYS];
  const adjectivePlacement=qualified.adjectivePlacement ?? qualified.adjectiveOrder ?? 'layout';
  const degreePlacement=qualified.degreePlacement ?? qualified.degreeOrder ?? 'before';
  if (!Array.isArray(agreementFeatures) || new Set(agreementFeatures).size !== agreementFeatures.length ||
      agreementFeatures.some(feature => !AGREEMENT_KEYS.has(feature))) {
    throw new Error('Invalid adjective agreement features.');
  }
  for (const adjective of adjectives) for (const form of adjective.forms) {
    const unsupported = Object.keys(form.when || {}).find(feature => !agreementFeatures.includes(feature));
    if (unsupported) {
      throw new Error(`Unsupported adjective agreement feature ${unsupported} in ${adjective.id}.`);
    }
  }
  const propertyIndex = new Map();
  const degreeIndex = new Map();
  const quantifierIndex = new Map();
  const quantifierFormIndex = new Map();
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
  for(const lexeme of quantifiers)for(const form of lexeme.forms) {
    const first=form.text.toLocaleLowerCase(dictionary.language).split(/\s+/u)[0];
    if(!quantifierFormIndex.has(first))quantifierFormIndex.set(first,[]);
    quantifierFormIndex.get(first).push({lexeme,form});
  }
  if (!Array.isArray(layouts) || !layouts.length || layouts.length > 3 ||
      layouts.some(layout => !Array.isArray(layout) || layout.length < 3 || layout.length > 4 ||
        new Set(layout).size !== layout.length || layout.filter(slot=>slot==='noun').length!==1 ||
        !layout.includes('modifiers') || !layout.includes('quantifier') ||
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
      qualified.adjectiveAgreementFeatures !== undefined &&
        (!Array.isArray(qualified.adjectiveAgreementFeatures) ||
          new Set(qualified.adjectiveAgreementFeatures).size !== qualified.adjectiveAgreementFeatures.length ||
          qualified.adjectiveAgreementFeatures.some(feature => !AGREEMENT_KEYS.has(feature))) ||
      !['before','after','layout'].includes(adjectivePlacement) ||
      (qualified.adjectivePlacement!==undefined && qualified.adjectiveOrder!==undefined &&
        qualified.adjectivePlacement!==qualified.adjectiveOrder) ||
      (adjectivePlacement!=='layout' && layouts.some(layout=>
        (layout.indexOf('modifiers')<layout.indexOf('noun')?'before':'after')!==adjectivePlacement)) ||
      !['before','after'].includes(degreePlacement) ||
      (qualified.degreePlacement!==undefined && qualified.degreeOrder!==undefined &&
        qualified.degreePlacement!==qualified.degreeOrder) ||
      (qualified.articleFromFirstModifier !== undefined && typeof qualified.articleFromFirstModifier !== 'boolean')) {
    throw new Error('Invalid qualified noun-phrase layout or complexity limits.');
  }
  if(new Set(layouts.map(layout=>layout.join('\u0000'))).size!==layouts.length) {
    throw new Error('Duplicate qualified noun-phrase layout.');
  }
  const maxAdjectives = qualified.maxAdjectives || MAX_ENTITY_MODIFIERS;
  const maxDegreeDepth = qualified.maxDegreeDepth || MAX_MODIFIER_DEPTH - 1;

  function featuresFor(noun, number, grammaticalCase) {
    return { number, case: grammaticalCase, gender: noun.gender,
      pluralClass: noun.pluralClass, animacy: noun.animacy };
  }

  function parseProperties(tokens, at, context, limit) {
    const results = [{ next: at, modifiers: [], lexemes: [] }];
    function degreeChains(start) {
      const chains=[{next:start,degrees:[]}];
      function walk(position,chain) {
        if(chain.length>=maxDegreeDepth)return;
        for(const lex of degrees)for(const form of matchingForms(lex,context)) {
          const length=matchesTokens(tokens,position,form.text);
          if(!length)continue;
          const next={next:position+length,degrees:[...chain,lex]};
          chains.push(next);
          if(chains.length>128)throw new Error('Qualified noun phrase exceeded parsing limit.');
          walk(next.next,next.degrees);
        }
      }
      walk(start,[]);
      return chains;
    }
    function nodeWithDegrees(adjective,chain) {
      let nested=[];
      for(let i=chain.length-1;i>=0;i--)
        nested=[modifier(chain[i].concept,nested)];
      return modifier(adjective.concept,nested);
    }
    function walk(index, nodes, lexical) {
      if (nodes.length >= limit) return;
      const append=(lex,next,chain)=>{
        const combined=[...nodes,nodeWithDegrees(lex,chain)];
        const lexemes=[...lexical,lex];
        results.push({next,modifiers:combined,lexemes});
        walk(next,combined,lexemes);
        if(results.length>128)throw new Error('Qualified noun phrase exceeded parsing limit.');
      };
      if(degreePlacement==='before') {
        for(const prefix of degreeChains(index))for(const lex of adjectives)
          for(const form of matchingForms(lex,context)) {
            const length=matchesTokens(tokens,prefix.next,form.text);
            if(length)append(lex,prefix.next+length,prefix.degrees);
          }
      } else {
        for(const lex of adjectives)for(const form of matchingForms(lex,context)) {
          const length=matchesTokens(tokens,index,form.text);
          if(!length)continue;
          for(const suffix of degreeChains(index+length))append(lex,suffix.next,suffix.degrees);
        }
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

  function readComparative(tokens,at,context) {
    const found=[];
    for(const lexeme of adjectives)for(const relation of Object.keys(lexeme.comparativeForms||{})) {
      for(const form of lexeme.comparativeForms[relation]) {
        if(!Object.entries(form.when||{}).every(([key,value])=>context[key]===value))continue;
        const length=matchesTokens(tokens,at,form.text);
        if(length)found.push({value:lexeme.concept,relation,senseId:lexeme.senseId||lexeme.id,
          priority:lexeme.priority||0,next:at+length});
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

  function realizeComparative(concept,relation,context) {
    for(const lexeme of propertyIndex.get(concept)||[]) {
      const forms=lexeme.comparativeForms?.[relation]||[];
      const text=forms.find(form=>Object.entries(form.when||{})
        .every(([key,value])=>context[key]===value))?.text;
      if(text)return text;
    }
    throw new Error(`Missing ${dictionary.language} comparative form for ${concept} (${relation}).`);
  }

  function read(tokens, index, grammaticalCase, { allowBare = false } = {}) {
    const found = [];
    let visited = 0;
    for (const { noun, forms } of nounForms) for (const form of forms) for (const [layoutIndex, layout] of layouts.entries()) {
      const genitiveCountCase=dictionary.language==='pl' &&
        ['nom','acc'].includes(grammaticalCase) && quantifiers.some(q=>
          q.meaning.kind==='exact' && (q.meaning.value===0 || q.meaning.value>=5));
      if (form.bindings.case !== undefined && form.bindings.case !== grammaticalCase &&
          !(genitiveCountCase && form.bindings.case==='gen')) continue;
      const number = form.bindings.number;
      if (!number) continue;
      const context = featuresFor(noun, number, grammaticalCase);
      function search(slotIndex, at, state) {
        if (++visited > MAX_NP_STATES) throw new Error('Qualified noun phrase exceeded parsing limit.');
        if (slotIndex === layout.length) {
          const countability=noun.countability || 'count';
          if (countability==='mass' && (number!=='singular' ||
              state.quantifier || state.definiteness==='indefinite')) return;
          if(state.quantifier?.meaning.kind==='exact') {
            const value=state.quantifier.meaning.value;
            if(number!==(value===1?'singular':'plural'))return;
            const genitiveCount=dictionary.language==='pl' &&
              (value===0 || value>=5) && ['nom','acc'].includes(grammaticalCase);
            if(form.bindings.case!==undefined && form.bindings.case!==
                (genitiveCount?'gen':grammaticalCase))return;
          } else if(form.bindings.case!==undefined && form.bindings.case!==grammaticalCase) return;
          const firstAdj = state.lexemes[0];
          if (state.quantifier && layoutByQuantifier[state.quantifier.meaning.kind] !== undefined &&
              layoutByQuantifier[state.quantifier.meaning.kind] !== layoutIndex) return;
          if (!state.determinerChosen && !state.demonstrative && !nounPhrase.allowBare &&
              !allowBare && !['mass','both'].includes(countability) && !state.quantifier) return;
          if (qualified.articleFromFirstModifier && state.marker &&
              state.definiteness === 'indefinite' &&
              state.marker !== (firstAdj?.indefiniteArticle || noun.indefiniteArticle)) return;
          const options = {};
          if (state.modifiers.length) options.modifiers = state.modifiers;
          if (state.quantifier) options.quantifier = state.quantifier.meaning;
          if(state.demonstrative)options.demonstrative=state.demonstrative;
          found.push({ value: participant(noun.concept, state.demonstrative?'definite':state.definiteness, number, options),
            noun, senseId: noun.senseId, next: at,
            bare: !state.determinerChosen && !state.demonstrative && !state.quantifier,
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
          for (const {lexeme:quantifier,form} of quantifierFormIndex.get(tokens[at])||[]) {
            if(!Object.entries(form.when||{}).every(([key,value])=>context[key]===value))continue;
            const len = matchesTokens(tokens, at, form.text);
            if (len) advance(at + len, { quantifier });
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
          const lexicalBare=['mass','both'].includes(noun.countability);
          if (nounPhrase.allowBare || allowBare || lexicalBare || state.quantifier ||
              layout.slice(slotIndex + 1).includes('quantifier')) {
            advance(at, { definiteness: 'unknown', marker: null, determinerChosen: false });
          }
        } else if (step === 'modifiers') {
          for (const parsed of parseProperties(tokens, at, context, maxAdjectives)) {
            advance(parsed.next, { modifiers: parsed.modifiers, lexemes: parsed.lexemes });
          }
        }
      }
      const starts=[{next:index,demonstrative:null}];
      for(const entry of demonstratives)for(const form of entry.forms) {
        if(!Object.entries(form.when||{}).every(([key,value])=>context[key]===value))continue;
        const length=matchesTokens(tokens,index,form.text);
        if(length)starts.push({next:index+length,demonstrative:entry.distance});
      }
      for(const start of starts)search(0,start.next,{ definiteness:'unknown',marker:null,modifiers:[],lexemes:[],quantifier:null,demonstrative:start.demonstrative });
    }
    return found;
  }

  function render(ref, noun, nounText, grammaticalCase, fallback,
    { allowBare = false, quantifierCase = grammaticalCase } = {}) {
    const lexicalBare=['mass','both'].includes(noun.countability);
    if(noun.countability==='mass' &&
       (ref.features.number!=='singular' || ref.quantifier ||
        ref.features.definiteness==='indefinite')) {
      throw new Error(`Unsupported countability for ${noun.lemma}.`);
    }
    const context = featuresFor(noun, ref.features.number, grammaticalCase);
    const def = ref.features.definiteness === 'unknown' ? fallback : ref.features.definiteness;
    const mapping = nounPhrase.determiners[ref.features.number]?.[def];
    let marker = ref.demonstrative || ref.possessor ||
      ((allowBare || lexicalBare) && ref.features.definiteness === 'unknown')
      ? null : markerFor(noun, mapping);
    const modifierWords = [];
    let firstAdjective = null;
    function renderNode(node, depth) {
      if (depth > MAX_MODIFIER_DEPTH) throw new Error('Modifier depth exceeded.');
      const index = depth === 1 ? propertyIndex : degreeIndex;
      const lex = index.get(node.concept)?.[0];
      if (!lex) throw new Error(`Missing ${dictionary.language} modifier lexeme for ${node.concept}.`);
      const text = formFor(lex, context);
      if (!text) throw new Error(`Missing ${dictionary.language} modifier form for ${node.concept}.`);
      const nested=(node.modifiers || []).flatMap(child => renderNode(child, depth + 1));
      return degreePlacement==='before'?[...nested,text]:[text,...nested];
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
      quantifier = formFor(lexical, featuresFor(noun,ref.features.number,quantifierCase));
      if (!quantifier) throw new Error(`Missing ${dictionary.language} quantifier form for ${meaningKey(ref.quantifier)}.`);
      if (def !== 'definite') marker = null;
    }
    if (!nounPhrase.allowBare && !allowBare && marker === undefined && !ref.quantifier) {
      throw new Error(`Missing ${def} determiner for ${noun.lemma}.`);
    }
    let demonstrative='';
    if(ref.demonstrative) {
      const entry=demonstratives.find(item=>item.distance===ref.demonstrative);
      demonstrative=entry?.forms.find(form=>Object.entries(form.when||{})
        .every(([key,value])=>context[key]===value))?.text;
      if(!demonstrative)throw new Error(`Missing ${dictionary.language} ${ref.demonstrative} demonstrative form for ${noun.lemma}.`);
    }
    const slots = { quantifier, determiner: marker || '', modifiers: modifierWords.join(' '), noun: nounText };
    const layout = layouts[layoutByQuantifier[ref.quantifier?.kind] ?? 0];
    return [demonstrative,...layout.map(slot => slots[slot] || '')].filter(Boolean).join(' ');
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
    for(const entry of nounPhrase.possessives || [])for(const form of entry.forms) {
      for(const [name,value] of Object.entries(form.when || {})) {
        const domain=name==='number'?registry.domains.participant.number:
          name==='case'?registry.domains.syntactic.case:registry.domains.lexical[name];
        if(!domain?.includes(value))
          throw new Error(`Unsupported possessive agreement ${name}=${value} in ${entry.person} person.`);
      }
    }
    if (adjectives.length && layouts.some(layout => !layout.includes('modifiers'))) throw new Error('Missing adjective grammar slot.');
    if (quantifiers.length && layouts.some(layout => !layout.includes('quantifier'))) throw new Error('Missing quantifier grammar slot.');
  }

  return { read, readProperty, readComparative, realizeProperty, realizeComparative, render, validateOntology,
    describe: () => ({ adjectives: adjectives.length, degrees: degrees.length, quantifiers: quantifiers.length }) };
}
