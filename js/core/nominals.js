import { participant, modifier, MAX_ENTITY_MODIFIERS, MAX_MODIFIER_DEPTH } from './meaning-graph.js';
import { EngineError } from './errors.js';
import { record, safeName, hasOwn } from './features.js';
import { createTextProfile, firstToken, matchesTokens, validateTextProfile } from './text.js';
import { getMorphologyRuntimeView } from './morphology/engine.js';

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

function matchingForms(lexeme, features, forms=lexeme.forms) {
  return forms.filter(form => Object.entries(form.when || form.features || {})
    .every(([key, value]) => features[key] === value));
}

function addSurfaceEntry(index, text, entry, profile) {
  const head=firstToken(text,profile);
  if(!index.has(head))index.set(head,[]);
  index.get(head).push(entry);
}

function matchesConditions(conditions, features) {
  return conditions.every(([key,value])=>features[key]===value);
}

function formFor(lexeme, features, forms=lexeme.forms) {
  return matchingForms(lexeme, features, forms)[0]?.text;
}

/**
 * Shared, bounded noun-phrase interpreter. JSON provides agreement-specific surface
 * forms and slot order; no adapter implements adjective/quantifier morphology.
 */
export function createNominalInterpreter({ dictionary, nounPhrase, nounForms, featureProfile, morphology, textProfile }) {
  textProfile=textProfile===undefined?createTextProfile(dictionary.language):validateTextProfile(textProfile);
  const nounFormsByFirstToken=new Map();
  const nounSurfaceCandidateCache=new WeakMap();
  let nounFormOrder=0;
  for(const {noun,forms} of nounForms)for(const form of forms) {
    addSurfaceEntry(nounFormsByFirstToken,form.text,
      {noun,form,order:nounFormOrder++},textProfile);
  }
  function nounCandidatesAt(tokens,index) {
    let cache=nounSurfaceCandidateCache.get(tokens);
    if(!cache) {
      cache={matches:new Map(),scannedFrom:tokens.length,byIndex:new Map()};
      nounSurfaceCandidateCache.set(tokens,cache);
    }
    for(let at=cache.scannedFrom-1;at>=index;at--) {
      for(const candidate of nounFormsByFirstToken.get(tokens[at])||[]) {
        if(!cache.matches.has(candidate.order)&&matchesTokens(tokens,at,candidate.form.text)) {
          cache.matches.set(candidate.order,{candidate,start:at});
        }
      }
    }
    cache.scannedFrom=Math.min(cache.scannedFrom,index);
    if(!cache.byIndex.has(index)) {
      cache.byIndex.set(index,[...cache.matches.values()]
        .filter(match=>match.start>=index)
        .map(match=>match.candidate)
        .sort((left,right)=>left.order-right.order));
    }
    return cache.byIndex.get(index);
  }
  const qualified = nounPhrase.qualified || {};
  const quantityModel=nounPhrase.quantity;
  const quantityClassifiers=quantityModel?.classifiers||[];
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
  const layoutByModifier = qualified.layoutByModifier === undefined ? {} : qualified.layoutByModifier;
  const adjectiveMorphologyIds=new Map();
  const adjectiveParadigms=new Map();
  const morphologyLexemeBySense=new Map(morphology?.lexicon?.entries?.flatMap(entry=>
    entry.senses.map(sense=>[sense.id,entry.id])) ?? []);
  function morphologyIdForAdjective(lexeme) {
    if(!morphology)return null;
    if(morphology.has(lexeme.id))return lexeme.id;
    const senseId=lexeme.senseId||lexeme.senses?.[0]?.id;
    const canonicalId=morphologyLexemeBySense.get(senseId);
    return canonicalId&&morphology.has(canonicalId)?canonicalId:null;
  }
  const adjectiveEntries=[];
  for(const entry of dictionary.adjectives||[]) {
    if(!record(entry))throw new Error(`Invalid adjective lexeme: ${entry?.id}`);
    const hasStoredForms=entry.forms!==undefined;
    if(!hasStoredForms) {
      const lexemeId=morphologyIdForAdjective(entry);
      if(!lexemeId)continue;
      const availability=morphology.availability({lexemeId,features:{},exact:false});
      if(availability?.supported!==true)continue;
      const forms=morphology.paradigm({lexemeId});
      if(!Array.isArray(forms)||!forms.length)continue;
      adjectiveMorphologyIds.set(entry.id,lexemeId);
      adjectiveParadigms.set(entry.id,forms);
      adjectiveEntries.push({...entry,forms});
      continue;
    }
    const lexemeId=morphologyIdForAdjective(entry);
    if(lexemeId)adjectiveMorphologyIds.set(entry.id,lexemeId);
    adjectiveEntries.push(entry);
  }
  const adjectives = verifySurfaceInventory(adjectiveEntries, 'adjective');
  function adjectiveForms(lexeme) {
    const lexemeId=adjectiveMorphologyIds.get(lexeme.id)||
      (morphology?.has(lexeme.id)?lexeme.id:null);
    if(!lexemeId)return lexeme.forms;
    if(!adjectiveParadigms.has(lexeme.id)) {
      const runtimeView=getMorphologyRuntimeView(morphology,lexemeId);
      adjectiveParadigms.set(lexeme.id,runtimeView?.forms??morphology.paradigm({lexemeId}));
    }
    return adjectiveParadigms.get(lexeme.id);
  }
  const degrees = verifySurfaceInventory(dictionary.degrees || [], 'degree');
  const quantifiers = verifySurfaceInventory(dictionary.quantifiers || [], 'quantifier');
  const adjectiveFormsByFirstToken=new Map();
  const degreeFormsByFirstToken=new Map();
  const comparativeFormsByFirstToken=new Map();
  for(const lexeme of adjectives)for(const form of adjectiveForms(lexeme)) {
    addSurfaceEntry(adjectiveFormsByFirstToken,form.text,
      {lexeme,form,conditions:Object.entries(form.when||form.features||{})},textProfile);
  }
  for(const lexeme of degrees)for(const form of lexeme.forms) {
    addSurfaceEntry(degreeFormsByFirstToken,form.text,
      {lexeme,form,conditions:Object.entries(form.when||form.features||{})},textProfile);
  }
  for(const lexeme of adjectives)for(const relation of Object.keys(lexeme.comparativeForms||{}))
    for(const form of lexeme.comparativeForms[relation]) {
      addSurfaceEntry(comparativeFormsByFirstToken,form.text,
        {lexeme,relation,form,conditions:Object.entries(form.when||{})},textProfile);
    }
  const agreementFeatures = qualified.adjectiveAgreementFeatures || [...AGREEMENT_KEYS];
  const adjectivePlacement=qualified.adjectivePlacement ?? qualified.adjectiveOrder ?? 'layout';
  const degreePlacement=qualified.degreePlacement ?? qualified.degreeOrder ?? 'before';
  if(featureProfile && !Object.hasOwn(featureProfile.syntactic,'case') &&
      nounForms.some(entry=>entry.forms.some(form=>form.bindings.case!==undefined))) {
    throw new Error('Caseless language cannot declare noun case forms.');
  }
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
      layouts.some(layout => !Array.isArray(layout) || layout.length < 3 || layout.length > 5 ||
        new Set(layout).size !== layout.length || layout.filter(slot=>slot==='noun').length!==1 ||
        !layout.includes('modifiers') || !layout.includes('quantifier') ||
        (quantityClassifiers.length>0&&!layout.includes('classifier')) ||
        (quantityClassifiers.length===0&&layout.includes('classifier')) ||
        (Object.keys(nounPhrase.determiners).length > 0 && !layout.includes('determiner')) ||
        layout.some(slot => !['quantifier', 'classifier', 'determiner', 'modifiers', 'noun'].includes(slot))) ||
      !record(layoutByQuantifier) ||
      Object.entries(layoutByQuantifier).some(([kind, index]) =>
        !['exact', 'universal'].includes(kind) || !Number.isInteger(index) ||
        index < 0 || index >= layouts.length) ||
      !record(layoutByModifier) || Object.entries(layoutByModifier).some(([concept, index]) =>
        !LEXEME.test(concept) || !Number.isInteger(index) || index < 0 || index >= layouts.length) ||
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
    return { number, ...(grammaticalCase == null ? {} : {case: grammaticalCase}), gender: noun.gender,
      pluralClass: noun.pluralClass, animacy: noun.animacy };
  }

  function numberForQuantity(value) {
    if(!quantityModel)throw new Error('Exact quantity requires a language quantity profile.');
    return quantityModel.exactNumber[String(value)]||quantityModel.defaultNumber;
  }

  function surfaceCaseForQuantity(value, grammaticalCase) {
    const rule=quantityModel?.caseOverrides?.find(item=>
      item.values.includes(value) && item.from.includes(grammaticalCase));
    return rule?.to ?? grammaticalCase;
  }

  function agreementNumberForQuantity(value, grammaticalNumber) {
    const rule=quantityModel?.agreementOverrides?.find(item=>item.values.includes(value));
    return rule?.number ?? grammaticalNumber;
  }

  function classifierRule(noun, context, quantity) {
    if(!quantity || quantity.kind!=='exact')return null;
    return quantityClassifiers.find(rule=>rule.concepts.includes(noun.concept) &&
      Object.entries(rule.when||{}).every(([key,value])=>context[key]===value))||null;
  }

  function parseProperties(tokens, at, context, limit) {
    const results = [{ next: at, modifiers: [], lexemes: [] }];
    function degreeChains(start) {
      const chains=[{next:start,degrees:[]}];
      function walk(position,chain) {
        if(chain.length>=maxDegreeDepth)return;
        for(const {lexeme:lex,form,conditions} of degreeFormsByFirstToken.get(tokens[position])||[]) {
          if(!matchesConditions(conditions,context))continue;
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
        for(const prefix of degreeChains(index))
          for(const {lexeme:lex,form,conditions} of adjectiveFormsByFirstToken.get(tokens[prefix.next])||[]) {
            if(!matchesConditions(conditions,context))continue;
            const length=matchesTokens(tokens,prefix.next,form.text);
            if(length)append(lex,prefix.next+length,prefix.degrees);
          }
      } else {
        for(const {lexeme:lex,form,conditions} of adjectiveFormsByFirstToken.get(tokens[index])||[]) {
          if(!matchesConditions(conditions,context))continue;
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
    for(const {lexeme,form,conditions} of adjectiveFormsByFirstToken.get(tokens[at])||[]) {
      if(!matchesConditions(conditions,context))continue;
      const length=matchesTokens(tokens,at,form.text);
      if(length)found.push({value:lexeme.concept,senseId:lexeme.senseId||lexeme.id,
        priority:lexeme.priority||0,next:at+length});
    }
    return found;
  }

  function readComparative(tokens,at,context) {
    const found=[];
    for(const {lexeme,relation,form,conditions} of comparativeFormsByFirstToken.get(tokens[at])||[]) {
      if(!matchesConditions(conditions,context))continue;
      const length=matchesTokens(tokens,at,form.text);
      if(length)found.push({value:lexeme.concept,relation,senseId:lexeme.senseId||lexeme.id,
        priority:lexeme.priority||0,next:at+length});
    }
    return found;
  }

  function realizeProperty(concept, context) {
    for (const lexeme of propertyIndex.get(concept) || []) {
      const form = formFor(lexeme, context, adjectiveForms(lexeme));
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
    // Modifier parsing depends on position and agreement, not noun identity.
    // Keep results within this read so neither tokens nor returned graphs can
    // leak into another request. Noun/layout traversal still counts every state.
    const modifierParses = new Map();
    const possibleCases=new Set([grammaticalCase,
      ...(quantityModel?.caseOverrides||[]).filter(rule=>rule.from.includes(grammaticalCase))
        .map(rule=>rule.to)]);
    const nounCandidates=nounCandidatesAt(tokens,index);
    for (const {noun,form} of nounCandidates) for (const [layoutIndex, layout] of layouts.entries()) {
      if (form.bindings.case !== undefined && !possibleCases.has(form.bindings.case)) continue;
      const number = form.bindings.number;
      if (!number) continue;
      const context = featuresFor(noun, number, grammaticalCase);
      const contextKey = JSON.stringify(context);
      function search(slotIndex, at, state) {
        if (++visited > MAX_NP_STATES) throw new Error('Qualified noun phrase exceeded parsing limit.');
        if (slotIndex === layout.length) {
          const countability=noun.countability || 'count';
          if (countability==='mass' && (number!=='singular' ||
              state.quantifier || state.definiteness==='indefinite')) return;
          if(state.quantifier?.meaning.kind==='exact') {
            const value=state.quantifier.meaning.value;
            if(!quantityModel || number!==numberForQuantity(value))return;
            if(form.bindings.case!==undefined && form.bindings.case!==
                surfaceCaseForQuantity(value,grammaticalCase))return;
          } else if(form.bindings.case!==undefined && form.bindings.case!==grammaticalCase) return;
          const firstAdj = state.lexemes[0];
          const exact=state.quantifier?.meaning.kind==='exact'?
            {kind:'exact',value:state.quantifier.meaning.value}:null;
          const requiredClassifier=classifierRule(noun,context,exact);
          if(requiredClassifier?.required && state.classifier!==requiredClassifier.id)return;
          if (state.quantifier && layoutByQuantifier[state.quantifier.meaning.kind] !== undefined &&
              layoutByQuantifier[state.quantifier.meaning.kind] !== layoutIndex) return;
          if (!state.determinerChosen && !state.demonstrative && !nounPhrase.allowBare &&
              !allowBare && !['mass','both'].includes(countability) && !state.quantifier) return;
          if (qualified.articleFromFirstModifier && state.marker &&
              state.definiteness === 'indefinite' &&
              state.marker !== (firstAdj?.indefiniteArticle || noun.indefiniteArticle)) return;
          const options = {};
          // Each candidate owns its graph even when its parse was memoized.
          if (state.modifiers.length) options.modifiers = structuredClone(state.modifiers);
          if(exact&&quantityModel)options.quantity=exact;
          else if (state.quantifier) options.quantifier = state.quantifier.meaning;
          if(state.demonstrative)options.demonstrative=state.demonstrative;
          found.push({ value: participant(noun.concept, state.demonstrative?'definite':state.definiteness, number, options),
            noun, grammaticalNumber:number, senseId: noun.senseId, next: at,
            bare: !state.determinerChosen && !state.demonstrative && !state.quantifier,
            modifierSenses: state.lexemes.map(lex => lex.senseId || lex.id),
            quantifierSense: state.quantifier?.senses?.[0]?.id });
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
        } else if(step==='classifier') {
          const exact=state.quantifier?.meaning.kind==='exact'?
            {kind:'exact',value:state.quantifier.meaning.value}:null;
          const required=classifierRule(noun,context,exact);
          if(!required?.required)advance(at,{classifier:null});
          if(required)for(const form of required.forms) {
            if(!Object.entries(form.when||{}).every(([key,value])=>context[key]===value))continue;
            const len=matchesTokens(tokens,at,form.text);
            if(len)advance(at+len,{classifier:required.id});
          }
        } else if (step === 'determiner') {
          const maps = nounPhrase.determiners[number] || {};
          // A mapping whose marker is null (indefiniteness expressed by marker
          // omission, e.g. unmarked English plurals) already licenses a
          // determiner-marked reading of the unmarked surface string. The
          // separate unknown-definiteness bare advance would realize the same
          // string, so it is suppressed for such nouns.
          const zeroWidthMarker = Object.values(maps).some(mapping =>
            markerFor(noun, mapping) === null);
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
          if ((nounPhrase.allowBare || allowBare || lexicalBare || state.quantifier ||
              layout.slice(slotIndex + 1).includes('quantifier')) && !zeroWidthMarker) {
            advance(at, { definiteness: 'unknown', marker: null, determinerChosen: false });
          }
        } else if (step === 'modifiers') {
          let positions = modifierParses.get(contextKey);
          if (!positions) {
            positions = new Map();
            modifierParses.set(contextKey, positions);
          }
          if (!positions.has(at)) positions.set(at, parseProperties(tokens, at, context, maxAdjectives));
          for (const parsed of positions.get(at)) {
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
      for(const start of starts)search(0,start.next,{ definiteness:'unknown',marker:null,modifiers:[],lexemes:[],quantifier:null,classifier:null,demonstrative:start.demonstrative });
    }
    return found;
  }

  function render(ref, noun, nounText, grammaticalCase, fallback,
    { allowBare = false, quantifierCase = grammaticalCase, grammaticalNumber=ref.features.number } = {}) {
    const lexicalBare=['mass','both'].includes(noun.countability);
    if(noun.countability==='mass' &&
       (grammaticalNumber!=='singular' || ref.quantity || ref.quantifier ||
        ref.features.definiteness==='indefinite')) {
      throw new Error(`Unsupported countability for ${noun.lemma}.`);
    }
    const context = featuresFor(noun, grammaticalNumber, grammaticalCase);
    const def = ref.features.definiteness === 'unknown' ? fallback : ref.features.definiteness;
    const mapping = nounPhrase.determiners[grammaticalNumber]?.[def];
    let marker = ref.demonstrative || ref.possessor ||
      ((allowBare || lexicalBare || ref.quantity) && ref.features.definiteness === 'unknown')
      ? null : markerFor(noun, mapping);
    const modifierWords = [];
    let firstAdjective = null;
    function renderNode(node, depth) {
      if (depth > MAX_MODIFIER_DEPTH) throw new Error('Modifier depth exceeded.');
      const index = depth === 1 ? propertyIndex : degreeIndex;
      const lex = index.get(node.concept)?.[0];
      if (!lex) throw new EngineError('LANGUAGE_CONSTRUCTION_UNSUPPORTED',
        `No ${dictionary.language} adjective realizes ${node.concept}.`, {status:'unsupported'});
      const text = formFor(lex, context, depth === 1 ? adjectiveForms(lex) : undefined);
      if (!text) throw new EngineError('LANGUAGE_CONSTRUCTION_UNSUPPORTED',
        `No ${dictionary.language} adjective form realizes ${node.concept} with these features.`,
        {status:'unsupported'});
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
    const quantity=ref.quantity||ref.quantifier;
    if (quantity) {
      if(quantity.kind==='exact' && !quantityModel)
        throw new Error('Exact quantity requires a language quantity profile.');
      const lexical = quantityModel&&quantity.kind==='exact' ?
        quantifierIndex.get(meaningKey({kind:'exact',value:quantity.value}))?.[0] :
        quantifierIndex.get(meaningKey(quantity))?.[0];
      if (!lexical) throw new Error(`Missing ${dictionary.language} quantifier for ${meaningKey(quantity)}.`);
      quantifier = formFor(lexical, featuresFor(noun,grammaticalNumber,quantifierCase));
      if (!quantifier) throw new Error(`Missing ${dictionary.language} quantifier form for ${meaningKey(quantity)}.`);
      if (def !== 'definite') marker = null;
    }
    if (!nounPhrase.allowBare && !allowBare && marker === undefined && !ref.quantifier && !ref.quantity) {
      throw new Error(`Missing ${def} determiner for ${noun.lemma}.`);
    }
    let demonstrative='';
    if(ref.demonstrative) {
      const entry=demonstratives.find(item=>item.distance===ref.demonstrative);
      demonstrative=entry?.forms.find(form=>Object.entries(form.when||{})
        .every(([key,value])=>context[key]===value))?.text;
      if(!demonstrative)throw new Error(`Missing ${dictionary.language} ${ref.demonstrative} demonstrative form for ${noun.lemma}.`);
    }
    const classifier=classifierRule(noun,context,quantity);
    let classifierText='';
    if(classifier) {
      classifierText=classifier.forms.find(form=>Object.entries(form.when||{})
        .every(([key,value])=>context[key]===value))?.text;
      if(!classifierText)throw new Error(`Missing classifier form for ${noun.lemma}.`);
    }
    const slots = { quantifier, classifier:classifierText||'', determiner: marker || '', modifiers: modifierWords.join(' '), noun: nounText };
    // Explicit modifier layouts take precedence over quantity defaults.
    const modifierLayouts = new Set((ref.modifiers || []).flatMap(node =>
      layoutByModifier[node.concept] === undefined ? [] : [layoutByModifier[node.concept]]));
    if (modifierLayouts.size > 1) {
      throw new EngineError('LANGUAGE_CONSTRUCTION_UNSUPPORTED',
        'Configured modifiers require incompatible noun-phrase layouts.', {status:'unsupported'});
    }
    const modifierLayout = modifierLayouts.values().next().value;
    const layout = layouts[modifierLayout ?? layoutByQuantifier[quantity?.kind] ?? 0];
    return [demonstrative,...layout.map(slot => slots[slot] || '')].filter(Boolean).join(' ');
  }

  function validateOntology(ontology, registry) {
    for (const concept of Object.keys(layoutByModifier)) {
      if (ontology.get(concept)?.type !== 'property' || !propertyIndex.has(concept)) {
        throw new Error(`Unknown adjective-layout property for ${dictionary.language}: ${concept}`);
      }
    }
    for (const [entries, kind] of [[adjectives, 'property'], [degrees, 'degree']]) {
      for (const lex of entries) {
        if (ontology.get(lex.concept)?.type !== kind) {
          throw new Error(`Unknown ${kind} concept for ${lex.id}`);
        }
      }
    }
    const grammaticalNumbers=registry.featureProfile?.morphology?.number||registry.domains.participant.number;
    for (const entries of [adjectives, degrees, quantifiers]) for (const lex of entries) {
      for (const form of lex.forms) for (const [name, value] of Object.entries(form.when || {})) {
        const domain = name === 'number' ? grammaticalNumbers :
          name === 'case' ? (registry.featureProfile ? registry.featureProfile.syntactic.case :
            registry.domains.syntactic.case) : registry.domains.lexical[name];
        if (!domain?.includes(value)) throw new Error(`Unsupported inflection condition ${name}=${value} in ${lex.id}`);
      }
    }
    for(const entry of nounPhrase.possessives || [])for(const form of entry.forms) {
      for(const [name,value] of Object.entries(form.when || {})) {
        const domain=name==='number'?grammaticalNumbers:
          name==='case'?(registry.featureProfile ? registry.featureProfile.syntactic.case :
            registry.domains.syntactic.case):registry.domains.lexical[name];
        if(!domain?.includes(value))
          throw new Error(`Unsupported possessive agreement ${name}=${value} in ${entry.person} person.`);
      }
    }
    if (adjectives.length && layouts.some(layout => !layout.includes('modifiers'))) throw new Error('Missing adjective grammar slot.');
    if (quantifiers.length && layouts.some(layout => !layout.includes('quantifier'))) throw new Error('Missing quantifier grammar slot.');
  }

  return { read, readProperty, readComparative, realizeProperty, realizeComparative, render, validateOntology,
    numberForQuantity, surfaceCaseForQuantity, agreementNumberForQuantity,
    describe: () => ({ adjectives: adjectives.length, degrees: degrees.length, quantifiers: quantifiers.length }) };
}
