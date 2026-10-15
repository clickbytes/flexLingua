import { record, hasOwn, safeName } from './features.js';

export const LEXICON_MODEL_VERSION = '1.01';
const ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/u;
const CATEGORIES = Object.freeze({
  nouns: 'entity', verbs: 'event', adjectives: 'property',
  degrees: 'degree', attitudes: 'event', quantifiers: 'operator',
  functionWords: 'function', modals: 'operator'
});
const MAX_LEXEMES = 100000;
const MAX_SENSES = 16;
const RESERVED_SEGMENTS = new Set(['__proto__','constructor','prototype']);
const validLexemeId = id => typeof id === 'string' && id.length <= 128 && ID.test(id) &&
  !id.split('.').some(part => RESERVED_SEGMENTS.has(part));

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

const keyOf = ref => `${ref.kind}:${ref.id}:${JSON.stringify(ref.parameters || {})}`;
function quantifierCore(meaning) {
  if (meaning?.kind === 'universal' && Object.keys(meaning).length === 1) {
    return {kind:'operator',id:'quantifier.universal'};
  }
  if (meaning?.kind === 'exact' && Number.isSafeInteger(meaning.value) &&
      meaning.value >= 0 && meaning.value <= 20 && Object.keys(meaning).length === 2) {
    return {kind:'operator',id:'quantifier.exact',parameters:{value:meaning.value}};
  }
  throw new Error('Invalid lexical quantifier meaning.');
}

function normalizeSense(sense, category, lexeme, strict) {
  if (!record(sense) || !validLexemeId(sense.id) ||
      !Number.isInteger(sense.priority ?? 0) || Math.abs(sense.priority ?? 0) > 100 ||
      (strict && Object.keys(sense).some(key => !['id','coreRef','priority'].includes(key)))) {
    throw new Error(`Invalid or duplicate lexical sense: ${sense?.id}`);
  }
  if (strict && (hasOwn(sense,'concept') || !hasOwn(sense,'coreRef'))) {
    throw new Error(`LexicalSense must declare only coreRef: ${sense.id}`);
  }
  const legacy = hasOwn(sense, 'concept') ? {kind:'concept', id:sense.concept} : null;
  const ref = sense.coreRef || legacy;
  if (!record(ref) || !['concept','operator','grammaticalFunction'].includes(ref.kind) || !validLexemeId(ref.id) ||
      (legacy && sense.coreRef && keyOf(legacy) !== keyOf(sense.coreRef))) {
    throw new Error(`Invalid CORE mapping for lexical sense: ${sense.id}`);
  }
  if (category === 'quantifiers') {
    if (ref.kind !== 'operator' || keyOf(ref) !== keyOf(quantifierCore(lexeme.meaning))) {
      throw new Error(`Incompatible quantifier CORE mapping: ${sense.id}`);
    }
  } else if (category === 'modals') {
    if (ref.kind !== 'operator' || !['modality.ability','modality.obligation','modality.intention'].includes(ref.id)) {
      throw new Error(`Invalid modality CORE mapping: ${sense.id}`);
    }
  } else if (category === 'functionWords') {
    if (!['operator','grammaticalFunction'].includes(ref.kind)) {
      throw new Error(`Invalid grammatical-function CORE mapping: ${sense.id}`);
    }
  } else if (category === 'verbs' && ref.kind === 'grammaticalFunction') {
    if (!['grammar.state_copula','grammar.state_possession','grammar.state_location'].includes(ref.id)) {
      throw new Error(`Invalid state-verb CORE mapping: ${sense.id}`);
    }
  } else if (ref.kind !== 'concept') {
    throw new Error(`Expected concept CORE mapping for ${sense.id}`);
  }
  return {
    ...sense, coreRef: structuredClone(ref),
    ...(ref.kind === 'concept' ? {concept: ref.id} : {}),
    priority: sense.priority ?? (lexeme.priority || 0)
  };
}

/**
 * Parses canonical 1.01 lexicons while accepting 1.0 concept/meaning fields at
 * the adapter boundary. Old input is normalized into the SAME CoreReference model.
 * Strict mode is used for shipped dictionaries and future importer validation.
 */
export function createLexicon(input, {strict = false} = {}) {
  if (!record(input) || !safeName(input.language) ||
      !['1.0', '1.01'].includes(input.version) ||
      (strict && input.lexicalModel !== LEXICON_MODEL_VERSION)) {
    throw new Error('Invalid lexicon language or lexical model version.');
  }
  const source = structuredClone(input);
  const entries = [];
  const ids = new Set(), senseIds = new Set();
  const byId = new Map(), byLemma = new Map(), byCore = new Map();
  const dictionary = { ...source };
  const categories = Object.keys(CATEGORIES);
  for (const category of categories) {
    const raw = source[category] || [];
    if (!Array.isArray(raw)) throw new Error(`Invalid ${category} lexicon inventory.`);
    const normalized = [];
    for (const item of raw) {
      if (!record(item) || !validLexemeId(item.id) || ids.has(item.id) ||
          (!['quantifiers','functionWords'].includes(category) &&
            (typeof item.lemma !== 'string' || !item.lemma.trim()))) {
        throw new Error(`Invalid or duplicate ${category.slice(0,-1)} lexeme: ${item?.id}`);
      }
      if(item.register!==undefined &&
          (category!=='nouns' || !['formal','plain'].includes(item.register)))
        throw new Error(`Invalid lexical register: ${item.id}`);
      if (entries.length >= MAX_LEXEMES) throw new Error('Lexicon is too large.');
      ids.add(item.id);
      const lemma = item.lemma || item.forms?.[0]?.text;
      if (typeof lemma !== 'string' || !lemma.trim() || lemma.length > 256) {
        throw new Error(`Missing or invalid lemma: ${item.id}`);
      }
      if (category === 'functionWords' && (!Array.isArray(item.forms) || !item.forms.length ||
          item.forms.some(form => !record(form) || typeof form.text !== 'string' ||
            !form.text.trim() || form.text.length > 128))) {
        throw new Error(`Invalid function-word form for ${item.id}`);
      }
      if (strict && (!Array.isArray(item.senses) || hasOwn(item,'concept') ||
        !hasOwn(item,'lemma'))) {
        throw new Error(`Canonical CORE sense mapping required: ${item.id}`);
      }
      if (hasOwn(item,'concept') && hasOwn(item,'senses')) {
        throw new Error(`Invalid sense inventory for ${item.id}: concept and senses conflict.`);
      }
      const originalSenses = item.senses || (category === 'quantifiers' ?
        [{id:item.id,coreRef:quantifierCore(item.meaning)}] :
        [{id:item.id,concept:item.concept}]);
      if (!Array.isArray(originalSenses) || !originalSenses.length ||
          originalSenses.length > MAX_SENSES) throw new Error(`Invalid sense inventory for ${item.id}`);
      const senses = originalSenses.map(sense => normalizeSense(sense,category,item,strict));
      for (const sense of senses) {
        if (senseIds.has(sense.id)) throw new Error(`Invalid or duplicate lexical sense: ${sense.id}`);
        senseIds.add(sense.id);
      }
      const { concept: legacyConcept, ...itemFields } = item;
      if (['adjectives','degrees','attitudes'].includes(category)) {
        // The current nominal/matrix parsers expect concept-bearing surface entries.
        // Expand polysemous items into separate adapter views, retaining ONE
        // canonical lexeme and multiple CORE-linked senses in the source/index.
        for (const [i, sense] of senses.entries()) {
          normalized.push({ ...itemFields, lemma, id: i ? sense.id : item.id,
            senses: [sense], concept: sense.concept, senseId:sense.id,
            priority:sense.priority });
        }
      } else {
        normalized.push({ ...itemFields, lemma, senses });
      }
      const summary = freezeDeep({
        id:item.id, lemma, language:source.language, category, pos: category === 'functionWords' ?
          item.pos || 'PART' : category.slice(0,-1),
        senses:senses.map(({id,coreRef,priority}) => ({id,coreRef,priority}))
      });
      entries.push(summary);
      byId.set(item.id,summary);
      const key = lemma.toLocaleLowerCase(source.language);
      if (!byLemma.has(key)) byLemma.set(key,[]);
      byLemma.get(key).push(summary);
      for (const sense of summary.senses) {
        const coreKey = keyOf(sense.coreRef);
        if (!byCore.has(coreKey)) byCore.set(coreKey,[]);
        byCore.get(coreKey).push(freezeDeep({lexemeId:item.id,lemma,language:source.language,
          category,senseId:sense.id,coreRef:sense.coreRef,priority:sense.priority}));
      }
    }
    dictionary[category] = normalized;
  }
  freezeDeep(dictionary);
  freezeDeep(entries);
  for (const index of [byLemma,byCore]) for (const values of index.values()) Object.freeze(values);

  function validateCore(core) {
    if (!core?.resolve) throw new Error('Missing CORE language registry.');
    for (const entry of entries) for (const sense of entry.senses) {
      const info = core.resolve(sense.coreRef);
      const category = CATEGORIES[entry.category];
      if (sense.coreRef.kind === 'concept' && info.type !== category) {
        throw new Error(`Invalid CORE concept type for ${sense.id}: expected ${category}.`);
      }
      if (entry.category === 'attitudes' && info.complement !== true) {
        throw new Error(`Missing complement semantic frame: ${sense.coreRef.id}`);
      }
    }
    return true;
  }
  return Object.freeze({
    language:source.language, lexicalModel:source.lexicalModel || '1.0',
    dictionary, entries, validateCore,
    get: id => byId.get(id),
    lookup: lemma => byLemma.get(String(lemma).toLocaleLowerCase(source.language)) || [],
    forCore: ref => byCore.get(keyOf(ref)) || [],
    count: () => entries.length,
    senseCount: () => senseIds.size
  });
}

/** Offline migration helper; never silently edits the caller's JSON. */
export function migrateLexicon(input) {
  const original = structuredClone(input);
  const view = createLexicon(original);
  const result = { ...original, lexicalModel:LEXICON_MODEL_VERSION };
  for (const category of Object.keys(CATEGORIES)) {
    if (!hasOwn(original,category)) continue;
    result[category] = original[category].map(entry => {
      const { concept:obsoleteConcept, ...rest } = entry;
      const normalized = view.get(entry.id);
      const senses = normalized.senses.map(sense => ({
        id:sense.id, coreRef:structuredClone(sense.coreRef),
        ...(sense.priority ? {priority:sense.priority} : {})
      }));
      return { ...rest, ...(category === 'quantifiers' && !rest.lemma ? {lemma:normalized.lemma} : {}), senses };
    });
  }
  createLexicon(result,{strict:true});
  return result;
}
