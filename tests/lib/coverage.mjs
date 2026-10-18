/**
 * Coverage accounting for the canonical sentence-translation matrix.
 * Declared tuples come from the live plugin manifests (passed in pre-extracted),
 * witnessed tuples come only from APPROVED PASSING cases through the production
 * service. Refusals and ambiguities are honest outcome categories, never concept
 * witnesses; known gaps are reported separately and never count as PASS.
 */

function collectMeaningConcepts(meaning) {
  const found = [];
  const push = value => {
    if (typeof value === 'string' && !found.includes(value)) found.push(value);
  };
  if (meaning?.type === 'question') {
    // A question can witness its wrapper construction and proposition concepts,
    // but must not be counted as a separate event-construction case.
    return collectMeaningConcepts(meaning.proposition);
  }
  if (meaning?.type === 'event') {
    for (const participant of Object.values(meaning.roles ?? {})) {
      push(participant?.concept);
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
  gapsCount = 0} = {}) {
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
