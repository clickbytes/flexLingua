/**
 * Coverage accounting for the canonical sentence-translation matrix.
 * Declared tuples come from the live plugin manifests (passed in pre-extracted),
 * witnessed tuples come only from APPROVED PASSING cases through the production
 * service. Refusals and ambiguities are honest outcome categories, never concept
 * witnesses; known gaps are reported separately and never count as PASS.
 */

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const LEXICON_GROUPS = Object.freeze([
  'nouns', 'verbs', 'adjectives', 'degrees', 'quantifiers', 'attitudes', 'functionWords', 'modals'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLemma(value, language) {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().toLocaleLowerCase(language).normalize('NFC')
    : '';
}

function resolveLemma(entry, language) {
  if (typeof entry?.lemma === 'string' && entry.lemma.trim()) {
    return {lemma: entry.lemma.trim(), source: 'lemma'};
  }
  const forms = entry?.forms;
  if (isRecord(forms)) {
    for (const key of ['lemma', 'base']) {
      if (typeof forms[key] === 'string' && forms[key].trim()) {
        return {lemma: forms[key].trim(), source: `forms.${key}`};
      }
    }
  }
  if (Array.isArray(forms)) {
    const firstForm = forms[0]?.text;
    if (typeof firstForm === 'string' && firstForm.trim()) {
      return {lemma: firstForm.trim(), source: 'forms[0].text'};
    }
  }
  return {lemma: null, source: null};
}

function collectSurfaceForms(value, output = []) {
  if (typeof value === 'string') {
    if (value.trim()) output.push(value.trim());
  } else if (Array.isArray(value)) {
    for (const item of value) collectSurfaceForms(item, output);
  } else if (isRecord(value)) {
    if (typeof value.text === 'string') output.push(value.text.trim());
    else for (const item of Object.values(value)) collectSurfaceForms(item, output);
  }
  return output;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, stableJson(value[key])]));
  return value;
}

function addSurface(surfaceIndex, key, lemmaKey) {
  if (!key) return;
  if (!surfaceIndex.has(key)) surfaceIndex.set(key, new Set());
  surfaceIndex.get(key).add(lemmaKey);
}

function addSentenceLemmas(stats, text, language) {
  if (typeof text !== 'string' || !text) return;
  const tokens = text.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) ?? [];
  for (let start = 0; start < tokens.length; start++) {
    const maxEnd = Math.min(tokens.length, start + stats.maxSurfaceWords);
    for (let end = start + 1; end <= maxEnd; end++) {
      const surface = normalizeLemma(tokens.slice(start, end).join(' '), language);
      for (const lemma of stats.surfaceIndex.get(surface) ?? []) stats.sentenceLicensed.add(lemma);
    }
  }
}

function collectMeaningConcepts(meaning) {
  const found = [];
  const push = value => {
    if (typeof value === 'string' && !found.includes(value)) found.push(value);
  };
  const collectModifiers = modifiers => {
    for (const modifier of Array.isArray(modifiers) ? modifiers : []) {
      push(modifier?.concept);
      collectModifiers(modifier?.modifiers);
    }
  };
  if (meaning?.type === 'question') {
    // A question can witness its wrapper construction and proposition concepts,
    // but must not be counted as a separate event-construction case.
    return collectMeaningConcepts(meaning.proposition);
  }
  if (meaning?.type === 'event') {
    for (const participant of Object.values(meaning.roles ?? {})) {
      push(participant?.concept);
      collectModifiers(participant?.modifiers);
    }
  } else if (meaning?.type === 'state') {
    const category = meaning.roles?.category;
    push(category?.concept);
    for (const modifier of Array.isArray(category?.modifiers) ? category.modifiers : []) {
      push(modifier?.concept);
    }
  }
  return found;
}

/**
 * Count the compiled CORE/lexicon inventory and successful sentence witnesses.
 * Lemmas use NFC plus locale case folding; morphology-ready requires actual
 * forms from the compiled provider; sentence-licensed requires a lemma surface
 * in a passing, approved required input or output.
 */
export async function buildInventoryCoverage({runtime, outcomes, requiredCaseIds = [], cases = []} = {}) {
  if (!runtime?.engine || !isRecord(runtime.ontology?.concepts)) {
    throw new Error('Compiled runtime and CORE concept inventory are required for inventory counts.');
  }
  const concepts = Object.entries(runtime.ontology.concepts);
  const typeCounts = {};
  let typedEdgeCount = 0;
  let semanticEffectCount = 0;
  for (const [, concept] of concepts) {
    const type = typeof concept?.type === 'string' ? concept.type : 'unknown';
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    if (typeof concept?.parent === 'string') typedEdgeCount += 1;
    if (Array.isArray(concept?.definitionGraph?.edges)) {
      typedEdgeCount += concept.definitionGraph.edges.length;
    }
    if (concept?.semanticEffect) semanticEffectCount += 1;
  }

  const languages = {};
  for (const language of ['pl', 'en']) {
    const dictionary = JSON.parse(await readFile(join(runtime.root, 'languages', language,
      'lexicon.json'), 'utf8'));
    const plugin = runtime.engine.plugin(language);
    const lexicon = plugin.lexicon;
    const morphology = plugin.morphology;
    const lemmas = new Set();
    const senses = new Set();
    const conceptsByLemma = new Map();
    const entryCounts = new Map();
    const morphologyReady = new Set();
    const surfaceIndex = new Map();
    const missingLemmaIds = [];
    let entryCount = 0;
    let resolvedFromForms = 0;
    let maxSurfaceWords = 1;

    for (const group of LEXICON_GROUPS) {
      const entries = Array.isArray(dictionary[group]) ? dictionary[group] : [];
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        entryCount += 1;
        const compiled = lexicon?.get?.(entry.id);
        if (!compiled) throw new Error(`Compiled ${language} lexicon is missing ${entry.id}.`);
        const resolved = resolveLemma(entry, language);
        if (!resolved.lemma) {
          missingLemmaIds.push(entry.id ?? `${group}[${index}]`);
          continue;
        }
        if (compiled.lemma && normalizeLemma(compiled.lemma, language) !==
            normalizeLemma(resolved.lemma, language)) {
          throw new Error(`Inventory lemma differs from compiled lexicon for ${entry.id}.`);
        }
        if (resolved.source !== 'lemma') resolvedFromForms += 1;
        const lemmaKey = normalizeLemma(resolved.lemma, language);
        lemmas.add(lemmaKey);
        entryCounts.set(lemmaKey, (entryCounts.get(lemmaKey) ?? 0) + 1);
        const senseList = Array.isArray(compiled.senses) ? compiled.senses : [];
        const coreRefs = new Set();
        for (const sense of senseList) {
          if (typeof sense?.id === 'string') senses.add(sense.id);
          if (sense?.coreRef?.kind === 'concept' && typeof sense.coreRef.id === 'string') {
            coreRefs.add(sense.coreRef.id);
          }
        }
        if (!conceptsByLemma.has(lemmaKey)) conceptsByLemma.set(lemmaKey, new Set());
        for (const concept of coreRefs) conceptsByLemma.get(lemmaKey).add(concept);

        const surfaces = [resolved.lemma, ...collectSurfaceForms(entry.forms)];
        const availability = morphology?.availability?.({lexemeId: entry.id, features: {}, exact: false});
        if (availability?.supported === true) {
          const generated = morphology.paradigm({lexemeId: entry.id});
          if (generated.length) morphologyReady.add(lemmaKey);
          surfaces.push(...generated.map(form => form.text));
        }
        for (const surface of new Set(surfaces)) {
          const surfaceKey = normalizeLemma(surface, language);
          addSurface(surfaceIndex, surfaceKey, lemmaKey);
          maxSurfaceWords = Math.max(maxSurfaceWords,
            surfaceKey.split(/\s+/u).length);
        }
      }
    }

    languages[language] = {
      entries: entryCount,
      dataOnly: lemmas.size,
      lexicalSenses: senses.size,
      polysemousLemmas: [...conceptsByLemma.values()].filter(refs => refs.size > 1).length,
      morphologyReady: morphologyReady.size,
      sentenceLicensed: new Set(),
      duplicateLemmaEntries: [...entryCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      resolvedFromForms,
      excludedMissingLemma: missingLemmaIds.length,
      missingLemmaIds,
      surfaceIndex,
      maxSurfaceWords
    };
  }

  const required = new Set(requiredCaseIds);
  const pairDirections = new Set(['en-pl', 'pl-en']);
  const directions = new Map();
  const requiredByDirection = new Map();
  const pairRequired = new Set();
  const pairFrames = new Set();
  for (const item of cases) {
    if (required.has(item.id) && item.tier === 'required') {
      requiredByDirection.set(item.direction, (requiredByDirection.get(item.direction) ?? 0) + 1);
      if (pairDirections.has(item.direction)) pairRequired.add(item.id);
    }
  }
  const seenRequired = new Set();
  const pairSeenRequired = new Set();
  const approvedOutcomes = [];
  for (const {item, outcome, document} of outcomes ?? []) {
    if (!required.has(item.id) || item.tier !== 'required' || item.review?.status !== 'approved') continue;
    seenRequired.add(item.id);
    if (!directions.has(item.direction)) directions.set(item.direction, {
      total: 0, successfulTranslations: 0, refusals: 0, ambiguities: 0,
      failed: 0, infra: 0, distinctInputs: new Set(), distinctFrames: new Set()
    });
    const current = directions.get(item.direction);
    current.total += 1;
    if (pairDirections.has(item.direction)) pairSeenRequired.add(item.id);
    current.distinctInputs.add(JSON.stringify([item.input.from, item.input.to,
      normalizeLemma(item.input.text, item.input.from).replace(/\s+/gu, ' ')]));
    const frameKey = JSON.stringify(stableJson(item.expected?.meaning ?? null));
    current.distinctFrames.add(frameKey);
    if (pairDirections.has(item.direction)) pairFrames.add(frameKey);
    if (outcome?.kind === 'infra') current.infra += 1;
    else if (!outcome?.pass) current.failed += 1;
    else if (outcome.kind === 'translation') {
      current.successfulTranslations += 1;
      if (pairDirections.has(item.direction)) approvedOutcomes.push({item, document});
    } else if (outcome.kind === 'refusal') current.refusals += 1;
    else if (outcome.kind === 'ambiguity') current.ambiguities += 1;
  }

  for (const {item, document} of approvedOutcomes) {
    for (const [language, text] of [[item.input.from, item.input.text],
      [item.input.to, document?.text]]) {
      const stats = languages[language];
      if (stats) addSentenceLemmas(stats, text, language);
    }
  }

  const summarizedLanguages = {};
  for (const language of ['pl', 'en']) {
    const stats = languages[language];
    summarizedLanguages[language] = {
      entries: stats.entries,
      dataOnly: stats.dataOnly,
      lexicalSenses: stats.lexicalSenses,
      polysemousLemmas: stats.polysemousLemmas,
      morphologyReady: stats.morphologyReady,
      sentenceLicensed: stats.sentenceLicensed.size,
      duplicateLemmaEntries: stats.duplicateLemmaEntries,
      resolvedFromForms: stats.resolvedFromForms,
      excludedMissingLemma: stats.excludedMissingLemma,
      missingLemmaIds: stats.missingLemmaIds
    };
  }

  const summarizedDirections = Object.fromEntries([...directions].sort(([a], [b]) => a.localeCompare(b))
    .map(([direction, value]) => [direction, {
      total: value.total,
      successfulTranslations: value.successfulTranslations,
      refusals: value.refusals,
      ambiguities: value.ambiguities,
      failed: value.failed,
      infra: value.infra,
      notRun: Math.max(0, (requiredByDirection.get(direction) ?? 0) - value.total),
      distinctInputs: value.distinctInputs.size,
      distinctFrames: value.distinctFrames.size
    }]));
  for (const direction of ['en-pl', 'pl-en']) {
    if (!summarizedDirections[direction]) summarizedDirections[direction] = {
      total: 0, successfulTranslations: 0, refusals: 0, ambiguities: 0,
      failed: 0, infra: 0, notRun: requiredByDirection.get(direction) ?? 0,
      distinctInputs: 0, distinctFrames: 0
    };
  }
  for (const [direction, total] of requiredByDirection) {
    if (!summarizedDirections[direction]) summarizedDirections[direction] = {
      total: 0, successfulTranslations: 0, refusals: 0, ambiguities: 0,
      failed: 0, infra: 0, notRun: total, distinctInputs: 0, distinctFrames: 0
    };
  }
  const pairByDirection = Object.fromEntries(['en-pl', 'pl-en']
    .map(direction => [direction, summarizedDirections[direction]]));
  const otherByDirection = Object.fromEntries(Object.entries(summarizedDirections)
    .filter(([direction]) => !pairDirections.has(direction)));
  const summarizeDirectionRows = rows => Object.values(rows).reduce((sum, entry) => ({
    total: sum.total + entry.total,
    successfulTranslations: sum.successfulTranslations + entry.successfulTranslations,
    refusals: sum.refusals + entry.refusals,
    ambiguities: sum.ambiguities + entry.ambiguities,
    failed: sum.failed + entry.failed,
    infra: sum.infra + entry.infra,
    notRun: sum.notRun + entry.notRun,
    distinctInputs: sum.distinctInputs + entry.distinctInputs,
    distinctFrames: sum.distinctFrames + entry.distinctFrames
  }), {total:0,successfulTranslations:0,refusals:0,ambiguities:0,failed:0,infra:0,
    notRun:0,distinctInputs:0,distinctFrames:0});
  const pairTotals = summarizeDirectionRows(pairByDirection);
  const otherTotals = summarizeDirectionRows(otherByDirection);

  return {
    intended: {
      concepts: 1000,
      lemmas: {pl: 1000, en: 1000},
      approvedRequiredCases: 500,
      byDirection: {'en-pl': 250, 'pl-en': 250},
      successfulTranslationsMinimum: 400
    },
    actual: {
      concepts: {total: concepts.length, byType: typeCounts, typedEdges: typedEdgeCount,
        semanticEffects: semanticEffectCount},
      lemmas: summarizedLanguages,
      approvedRequiredCases: {
        total: pairSeenRequired.size,
        notRun: Math.max(0, pairRequired.size - pairSeenRequired.size),
        byDirection: pairByDirection,
        successfulTranslations: pairTotals.successfulTranslations,
        distinctInputs: pairTotals.distinctInputs,
        distinctFrames: pairFrames.size
      },
      otherRequiredCases: {
        total: Math.max(0, seenRequired.size - pairSeenRequired.size),
        notRun: otherTotals.notRun,
        byDirection: otherByDirection,
        successfulTranslations: otherTotals.successfulTranslations,
        refusals: otherTotals.refusals,
        ambiguities: otherTotals.ambiguities,
        failed: otherTotals.failed,
        infra: otherTotals.infra
      }
    }
  };
}

/**
 * Build the coverage report.
 *
 * Inputs:
 * - declaredTuples: [{direction, construction}] pre-extracted from live manifests
 *   (source analyze ∩ target realize, both status implemented).
 * - outcomes: the runner's [{item, outcome}] records.
 * - requiredTargetIds: protected catalog targets (tests/catalog/required-ids.json).
 * - requiredDirections: the canonical demo pair directions that must witness each
 *   required target (fixed A1 pair documented in tests/README.md).
 * - catalogTargetIds/catalogTargetCount: the authored A1 subset denominator.
 * - gapsCount: registered known gaps count (reported, never a pass).
 */
export function buildCoverage({declaredTuples, outcomes, requiredTargetIds,
  requiredDirections = ['en-pl', 'pl-en'], catalogTargetIds = [], catalogTargetCount = 0,
  gapsCount = 0, inventory = null} = {}) {
  const inCatalog = new Set(catalogTargetIds);
  const witnessDirections = new Map(); // targetId -> Set(direction)
  const witnessedTuples = new Set();   // `${direction}×${construction}` with positive witness
  const warnings = [];
  let infraErrors = 0;
  const counts = {
    translation: {pass: 0, requiredPass: 0, required: 0},
    refusal: {pass: 0, requiredPass: 0, required: 0},
    ambiguity: {pass: 0, requiredPass: 0, required: 0}
  };

  for (const {item, outcome} of outcomes) {
    const bucket = outcome?.kind === 'translation' || outcome?.kind === 'refusal' ||
      outcome?.kind === 'ambiguity' ? outcome.kind : null;
    if (bucket && item.tier === 'required') counts[bucket].required += 1;
    if (outcome?.pass) {
      if (bucket) {
        counts[bucket].pass += 1;
        if (item.tier === 'required') counts[bucket].requiredPass += 1;
      }
      if (outcome.kind === 'translation' && item.review?.status === 'approved') {
        witnessedTuples.add(`${item.direction}×${item.construction}`);
        const constructionTarget = `construction.${item.construction}`;
        if (!witnessDirections.has(constructionTarget)) {
          witnessDirections.set(constructionTarget, new Set());
        }
        witnessDirections.get(constructionTarget).add(item.direction);
        for (const concept of collectMeaningConcepts(item.expected?.meaning)) {
          const targetId = `concept.${concept}`;
          if (!witnessDirections.has(targetId)) witnessDirections.set(targetId, new Set());
          witnessDirections.get(targetId).add(item.direction);
        }
      }
    }
    if (outcome?.kind === 'infra') infraErrors += 1;
  }

  const witnesses = [...witnessDirections.keys()].sort().map(targetId => {
    if (!inCatalog.has(targetId)) {
      warnings.push(`Witness target '${targetId}' is not present in the catalog ` +
        '(data drift; record it in the catalog or fix the case).');
    }
    return {targetId, directions: [...witnessDirections.get(targetId)].sort()};
  });

  const positiveTuples = declaredTuples.filter(tuple =>
    witnessedTuples.has(`${tuple.direction}×${tuple.construction}`));
  const declaredWithoutWitness = declaredTuples.filter(tuple =>
    !witnessedTuples.has(`${tuple.direction}×${tuple.construction}`));

  const verifiedTargets = witnesses.filter(entry => inCatalog.has(entry.targetId) &&
    requiredDirections.every(direction => entry.directions.includes(direction)));
  const failures = [];
  const targets = (requiredTargetIds ?? []).map(targetId => {
    const directions = witnessDirections.get(targetId) ?? new Set();
    const missing = requiredDirections.filter(direction => !directions.has(direction));
    if (missing.length) failures.push({targetId, missing});
    return {targetId, witnessed: [...directions].sort(), missing};
  });

  const categories = {
    translation_pass: counts.translation.requiredPass,
    required_translation: counts.translation.required,
    refusal_pass: counts.refusal.requiredPass,
    required_refusal: counts.refusal.required,
    ambiguity_pass: counts.ambiguity.requiredPass,
    required_ambiguity: counts.ambiguity.required,
    implemented_with_positive_witness: `${positiveTuples.length}/${declaredTuples.length}`,
    declared_implemented: declaredTuples.length,
    project_a1_verified: verifiedTargets.length,
    project_a1_targets: catalogTargetCount,
    known_gaps: gapsCount,
    infra_errors: infraErrors
  };

  return {
    categories,
    inventory,
    declared: declaredTuples.map(tuple => ({...tuple,
      positiveWitness: witnessedTuples.has(`${tuple.direction}×${tuple.construction}`)})),
    declaredWithoutWitness: declaredWithoutWitness.map(tuple =>
      `${tuple.direction}×${tuple.construction}`),
    witnesses,
    warnings,
    gate: {
      requiredDirections: [...requiredDirections],
      targets,
      failures,
      passed: failures.length === 0
    }
  };
}
