/** Canonical sentence assertions and checks of the production public entry points. */

const STATUS_KIND = Object.freeze({
  ok: 'translation',
  unsupported: 'refusal',
  invalid: 'refusal',
  resource_limit: 'refusal',
  ambiguous: 'ambiguity'
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nfc(value) {
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

function deepScalarEqual(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.normalize('NFC') === b.normalize('NFC');
  return a === b;
}

/** Resolve a `#/a/b/0/c` pointer (repo convention: RFC 6901 segments with a leading `#`). Fails closed. */
export function resolvePointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return {missing: true, at: pointer};
  const segments = pointer.slice(2).split('/').map(segment =>
    segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return {missing: true, at: segment};
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return {missing: true, at: segment};
      }
      current = current[index];
    } else if (isRecord(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return {missing: true, at: segment};
      current = current[segment];
    } else {
      return {missing: true, at: segment};
    }
  }
  return {missing: false, value: current};
}

const PRESENTATION_MEANING_KEYS = new Set(['surface', 'surfaceTrace', 'presentation']);
const ORACLE_MEANING_KEYS = new Set([
  'roleSet', 'roleFeaturesExact', 'modifiersExact', 'featuresAllowExtra', 'assert'
]);

function materialMeaning(value, {oracle = false} = {}) {
  if (Array.isArray(value)) return value.map(item => materialMeaning(item, {oracle}));
  if (!isRecord(value)) return nfc(value);
  const keys = Object.keys(value).filter(key => !PRESENTATION_MEANING_KEYS.has(key) &&
    (!oracle || !ORACLE_MEANING_KEYS.has(key))).sort();
  return Object.fromEntries(keys.map(key => [key, materialMeaning(value[key], {oracle})]));
}

function meaningValue(value) {
  if (value === undefined) return '(missing)';
  const text = JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

/** Compare material MeaningGraph content, ignoring presentation and surface metadata. */
export function compareSemanticMeanings(left, right, options = {}) {
  const expected = materialMeaning(left, options);
  const observed = materialMeaning(right, options);
  const differences = [];
  const add = (path, want, got) => {
    if (differences.length < 24) {
      differences.push({path, expected: meaningValue(want), observed: meaningValue(got)});
    }
  };
  const walk = (want, got, path) => {
    if (Array.isArray(want) || Array.isArray(got)) {
      if (!Array.isArray(want) || !Array.isArray(got)) {
        add(path, want, got);
        return;
      }
      const length = Math.max(want.length, got.length);
      for (let index = 0; index < length && differences.length < 24; index++) {
        walk(want[index], got[index], `${path}/${index}`);
      }
      return;
    }
    if (isRecord(want) || isRecord(got)) {
      if (!isRecord(want) || !isRecord(got)) {
        add(path, want, got);
        return;
      }
      const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort();
      for (const key of keys) {
        const escaped = key.replace(/~/gu, '~0').replace(/\//gu, '~1');
        const child = path === '#' ? `#/${escaped}` : `${path}/${escaped}`;
        if (!Object.hasOwn(want, key) || !Object.hasOwn(got, key)) {
          add(child, want[key], got[key]);
        } else {
          walk(want[key], got[key], child);
        }
        if (differences.length >= 24) break;
      }
      return;
    }
    if (!deepScalarEqual(want, got)) add(path, want, got);
  };
  walk(expected, observed, '#');
  return {equal: differences.length === 0, differences};
}

const ORACLE_TYPES = new Set([
  'event', 'state', 'discourse', 'dialogue_act', 'comparison', 'coordination',
  'scope', 'complement', 'modality', 'conditional', 'question'
]);

function pointerSegment(value) {
  return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function oraclePath(parent, segment) {
  return `${parent}/${pointerSegment(segment)}`;
}

function addOracleFact(facts, path, value, problems) {
  if (facts.has(path) && !oracleValueEqual(facts.get(path), value)) {
    problems.push({path, expected: meaningValue(facts.get(path)), observed: meaningValue(value)});
    return;
  }
  facts.set(path, value);
}

function oracleValueEqual(left, right) {
  if (typeof left === 'string' && typeof right === 'string') return left.normalize('NFC') === right.normalize('NFC');
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => oracleValueEqual(value, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
      key === rightKeys[index] && oracleValueEqual(left[key], right[key]));
  }
  return left === right;
}

function flattenOracleValue(value, path, facts, problems) {
  if (Array.isArray(value)) {
    if (!value.length) addOracleFact(facts, path, [], problems);
    value.forEach((entry, index) => flattenOracleValue(entry, oraclePath(path, index), facts, problems));
    return;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value).sort()) {
      flattenOracleValue(value[key], oraclePath(path, key), facts, problems);
    }
    return;
  }
  addOracleFact(facts, path, nfc(value), problems);
}

function projectOracleParticipant(participant, path, unresolved) {
  if (!isRecord(participant)) {
    unresolved.push({path, reason: 'Expected a participant object.'});
    return null;
  }
  const projected = {};
  if (typeof participant.concept === 'string') projected.concept = nfc(participant.concept);
  if (isRecord(participant.target)) projected.target = materialMeaning(participant.target);
  if (isRecord(participant.agreement)) projected.agreement = materialMeaning(participant.agreement);
  if (isRecord(participant.features)) projected.features = materialMeaning(participant.features);
  if (Array.isArray(participant.modifiers)) {
    projected.modifiers = materialMeaning(participant.modifiers).sort((left, right) => {
      const leftConcept = String(left?.concept ?? ''), rightConcept = String(right?.concept ?? '');
      return leftConcept < rightConcept ? -1 : leftConcept > rightConcept ? 1 : 0;
    });
  }
  if (isRecord(participant.quantity)) projected.quantity = materialMeaning(participant.quantity);
  const known = new Set(['concept', 'target', 'agreement', 'features', 'modifiers', 'quantity']);
  for (const key of Object.keys(participant)) {
    if (!known.has(key)) unresolved.push({path: oraclePath(path, key), reason: 'Unsupported participant field.'});
  }
  if (Object.hasOwn(participant, 'concept') === Object.hasOwn(participant, 'target')) {
    unresolved.push({path, reason: 'Participant must declare exactly one of concept or target.'});
  } else {
    projected.participantKind = Object.hasOwn(participant, 'concept') ? 'concept' : 'target';
  }
  return projected;
}

function projectOracleMeaning(meaning, path, unresolved) {
  if (!isRecord(meaning) || !ORACLE_TYPES.has(meaning.type)) {
    unresolved.push({path, reason: 'Meaning type is not supported by the semantic oracle.'});
    return null;
  }
  const projected = {type: meaning.type};
  if (meaning.type === 'question') {
    if (typeof meaning.questionType === 'string') projected.questionType = meaning.questionType;
    projected.proposition = projectOracleMeaning(meaning.proposition, oraclePath(path, 'proposition'), unresolved);
    const known = new Set(['type', 'questionType', 'proposition', 'assert']);
    for (const key of Object.keys(meaning)) {
      if (!known.has(key) && !PRESENTATION_MEANING_KEYS.has(key) && key !== 'version') {
        unresolved.push({path: oraclePath(path, key), reason: 'Unsupported question field.'});
      }
    }
    return projected;
  }
  if (meaning.concept !== undefined) projected.concept = nfc(meaning.concept);
  if (meaning.kind !== undefined) projected.kind = nfc(meaning.kind);
  if (isRecord(meaning.roles)) {
    const roles = {};
    for (const role of Object.keys(meaning.roles).sort()) {
      roles[role] = projectOracleParticipant(meaning.roles[role], oraclePath(oraclePath(path, 'roles'), role), unresolved);
    }
    projected.roles = roles;
  }
  if (isRecord(meaning.features)) projected.features = materialMeaning(meaning.features);
  if (typeof meaning.timeReference === 'string') projected.timeReference = nfc(meaning.timeReference);
  if (isRecord(meaning.clockTime)) projected.clockTime = materialMeaning(meaning.clockTime);
  if (isRecord(meaning.calendarDate)) projected.calendarDate = materialMeaning(meaning.calendarDate);
  const known = new Set([
    'type', 'concept', 'kind', 'roleSet', 'roles', 'roleFeaturesExact',
    'modifiersExact', 'features', 'featuresAllowExtra', 'timeReference',
    'clockTime', 'calendarDate', 'assert'
  ]);
  for (const key of Object.keys(meaning)) {
    if (!known.has(key) && !PRESENTATION_MEANING_KEYS.has(key) && key !== 'version') {
      unresolved.push({path: oraclePath(path, key), reason: 'Unsupported meaning field.'});
    }
  }
  return projected;
}

function decodeOraclePointer(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return null;
  const raw = pointer.slice(2).split('/');
  if (raw.some(segment => /~(?![01])/u.test(segment))) return null;
  return raw.map(segment => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'));
}

function normalizeOracleAssertionSegments(meaning, segments) {
  const normalized = [...segments];
  if (normalized[0] === 'proposition' && meaning?.type === 'question') {
    return ['proposition', ...normalizeOracleAssertionSegments(meaning.proposition, normalized.slice(1))];
  }
  if (normalized[0] === 'roles' && normalized[2] === 'referent' &&
      isRecord(meaning?.roles?.[normalized[1]]) && Object.hasOwn(meaning.roles[normalized[1]], 'target')) {
    normalized[2] = 'target';
  }
  return normalized;
}

function oraclePointer(segments) {
  return `#/${segments.map(pointerSegment).join('/')}`;
}

function knownOracleAssertionPath(meaning, segments) {
  if (!segments.length || !isRecord(meaning)) return false;
  const [head, ...tail] = segments;
  if (head === 'version') return true;
  if (head === 'proposition') {
    return meaning.type === 'question' && knownOracleAssertionPath(meaning.proposition, tail);
  }
  if (head === 'type') return tail.length === 0;
  if (meaning.type === 'question') return head === 'questionType' && tail.length === 0;
  if ((head === 'concept' || head === 'kind') && tail.length === 0) return true;
  if (head === 'features') return tail.length === 1;
  if (head === 'timeReference') return tail.length === 0 && Object.hasOwn(meaning, head);
  if (head === 'clockTime') return tail.length === 1 && ['hour', 'minute'].includes(tail[0]) &&
    isRecord(meaning.clockTime);
  if (head === 'calendarDate') return tail.length === 1 && ['year', 'month', 'day'].includes(tail[0]) &&
    isRecord(meaning.calendarDate);
  if (head !== 'roles' || tail.length < 2) return false;
  const [role, field, ...rest] = tail;
  const participant = meaning.roles?.[role];
  if (!isRecord(participant)) return false;
  if (field === 'concept') return rest.length === 0 && !Object.hasOwn(participant, 'target');
  if (field === 'target') return rest.length === 1 && ['kind', 'anchor', 'resolution'].includes(rest[0]) &&
    (isRecord(participant.target) || !Object.hasOwn(participant, 'concept'));
  if (field === 'features') return rest.length === 1;
  if (field === 'agreement') return rest.length === 1 && ['person', 'number'].includes(rest[0]);
  if (field === 'quantity') return rest.length === 1 && ['kind', 'value'].includes(rest[0]);
  if (field === 'modifiers') return rest.length === 2 && /^\d+$/u.test(rest[0]) && rest[1] === 'concept';
  return false;
}

function incompatibleOracleAssertionPath(meaning, segments) {
  if (isRecord(meaning) && segments[0] === 'proposition' && meaning.type === 'question') {
    return incompatibleOracleAssertionPath(meaning.proposition, segments.slice(1));
  }
  if (!isRecord(meaning) || segments.length < 3 || segments[0] !== 'roles') return false;
  const participant = meaning.roles?.[segments[1]];
  if (!isRecord(participant)) return true;
  if (segments[2] === 'concept' && Object.hasOwn(participant, 'target')) return true;
  if (segments[2] === 'target' && Object.hasOwn(participant, 'concept')) return true;
  if (segments[2] === 'referent' && Object.hasOwn(participant, 'concept')) return true;
  return false;
}

function assertionEntries(meaning, prefix = '#') {
  if (!isRecord(meaning)) return [];
  const entries = Object.entries(isRecord(meaning.assert) ? meaning.assert : {})
    .map(([pointer, value]) => ({pointer, value, prefix}));
  if (meaning.type === 'question') {
    entries.push(...assertionEntries(meaning.proposition, oraclePath(prefix, 'proposition')));
  }
  return entries;
}

function modifierMembershipAssertion(meaning, segments, value, prefix) {
  if (!Array.isArray(segments) || segments.length !== 5 || segments[0] !== 'roles' ||
      segments[2] !== 'modifiers' || !/^\d+$/u.test(segments[3]) || segments[4] !== 'concept' ||
      typeof value !== 'string') return null;
  const participant = meaning?.roles?.[segments[1]];
  if (!isRecord(participant)) return null;
  const modifiers = participant.modifiers;
  if (Array.isArray(modifiers) && !modifiers.some(entry => entry?.concept === value)) {
    return {conflict: true, path: `${prefix}/roles/${pointerSegment(segments[1])}/modifiers`,
      expected: meaningValue(modifiers.map(entry => entry?.concept).filter(Boolean).sort()),
      observed: meaningValue(value)};
  }
  return {path: `${prefix}/roles/${pointerSegment(segments[1])}/modifiers/$contains/${pointerSegment(value)}`};
}

/** Build semantic facts from the typed expected shape and check its scalar assertions. */
export function inspectSemanticOracle(meaning) {
  const unresolved = [];
  const problems = [];
  const projection = projectOracleMeaning(meaning, '#', unresolved);
  const facts = new Map();
  if (projection) {
    flattenOracleValue(projection, '#', facts, problems);
    if (isRecord(projection.roles)) {
      addOracleFact(facts, '#/roles/$members', Object.keys(projection.roles).sort(), problems);
      for (const [role, participant] of Object.entries(projection.roles)) {
        for (const modifier of participant?.modifiers ?? []) {
          if (typeof modifier?.concept === 'string') {
            addOracleFact(facts, `#/roles/${pointerSegment(role)}/modifiers/$contains/${pointerSegment(modifier.concept)}`,
              true, problems);
          }
        }
      }
    }
  }

  for (const entry of assertionEntries(meaning)) {
    const segments = decodeOraclePointer(entry.pointer);
    if (!segments) {
      unresolved.push({path: entry.pointer, reason: 'Assertion pointer cannot be projected.'});
      continue;
    }
    if (segments.length === 1 && segments[0] === 'version') continue;
    const assertionMeaning = entry.prefix === '#' ? meaning : meaning?.proposition;
    const normalizedSegments = normalizeOracleAssertionSegments(assertionMeaning, segments);
    const normalizedPointer = oraclePointer(normalizedSegments);
    const canonicalPath = `${entry.prefix}${normalizedPointer.slice(1)}`;
    const known = knownOracleAssertionPath(assertionMeaning, normalizedSegments);
    const resolved = resolvePointer(assertionMeaning, normalizedPointer);
    if (!known) {
      if (incompatibleOracleAssertionPath(assertionMeaning, segments)) {
        problems.push({path: canonicalPath,
          expected: 'a compatible semantic field', observed: meaningValue(entry.value)});
        continue;
      }
      if (!resolved.missing && (isRecord(resolved.value) || Array.isArray(resolved.value))) {
        problems.push({path: canonicalPath, expected: 'a scalar semantic field', observed: meaningValue(resolved.value)});
        continue;
      }
      unresolved.push({path: canonicalPath,
        reason: 'Assertion path is outside the typed semantic oracle.'});
      continue;
    }
    const modifierAssertion = modifierMembershipAssertion(assertionMeaning, normalizedSegments, entry.value, entry.prefix);
    if (modifierAssertion?.conflict) {
      problems.push({path: modifierAssertion.path, expected: modifierAssertion.expected,
        observed: modifierAssertion.observed});
      continue;
    }
    if (modifierAssertion) {
      addOracleFact(facts, modifierAssertion.path, true, problems);
      continue;
    }
    if (!resolved.missing && (isRecord(resolved.value) || Array.isArray(resolved.value))) {
      problems.push({path: canonicalPath, expected: 'a scalar semantic field', observed: meaningValue(resolved.value)});
      continue;
    }
    if (!resolved.missing && !deepScalarEqual(resolved.value, entry.value)) {
      problems.push({path: canonicalPath, expected: meaningValue(resolved.value), observed: meaningValue(entry.value)});
      continue;
    }
    addOracleFact(facts, canonicalPath, entry.value, problems);
  }
  return {facts, problems, unresolved};
}

function compareOraclePair(left, right) {
  let different = false;
  let incomplete = false;
  const differences = [];
  const paths = [...new Set([...left.facts.keys(), ...right.facts.keys()])].sort();
  for (const path of paths) {
    const hasLeft = left.facts.has(path), hasRight = right.facts.has(path);
    if (!hasLeft || !hasRight) {
      if (path === '#/roles/$members') {
        different = true;
        differences.push({path, expected: meaningValue(left.facts.get(path)), observed: meaningValue(right.facts.get(path))});
      } else if (roleMembershipDifferenceExplains(path, left, right)) {
        continue;
      } else {
        incomplete = true;
        differences.push({path, expected: meaningValue(left.facts.get(path)), observed: meaningValue(right.facts.get(path)), unresolved: true});
      }
      continue;
    }
    if (!oracleValueEqual(left.facts.get(path), right.facts.get(path))) {
      different = true;
      differences.push({path, expected: meaningValue(left.facts.get(path)), observed: meaningValue(right.facts.get(path))});
    }
  }
  return {different, incomplete, differences};
}

function roleMembershipDifferenceExplains(path, left, right) {
  const segments = decodeOraclePointer(path);
  if (!segments) return false;
  for (let index = 0; index < segments.length - 2; index++) {
    if (segments[index] !== 'roles' || segments[index + 1] === '$members') continue;
    const membershipPath = oraclePointer([...segments.slice(0, index + 1), '$members']);
    const leftRoles = left.facts.get(membershipPath);
    const rightRoles = right.facts.get(membershipPath);
    return Array.isArray(leftRoles) && Array.isArray(rightRoles) &&
      leftRoles.includes(segments[index + 1]) !== rightRoles.includes(segments[index + 1]);
  }
  return false;
}

function compareSemanticOracles(relation, entries) {
  const inspected = entries.map(entry => ({id: entry.id, ...inspectSemanticOracle(entry.meaning)}));
  const problems = inspected.flatMap(entry => entry.problems.map(problem => ({caseIds: [entry.id], ...problem})));
  if (problems.length) return {pass: false, status: 'FAIL', differences: problems.slice(0, 64)};
  const unresolved = inspected.flatMap(entry => entry.unresolved.map(item => ({caseIds: [entry.id],
    path: item.path, expected: 'typed semantic assertion', observed: item.reason, unresolved: true})));
  if (unresolved.length) return {pass: false, status: 'NOT RUN', differences: unresolved.slice(0, 64)};

  const differences = [];
  let failed = false;
  let notRun = false;
  for (let leftIndex = 0; leftIndex < inspected.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < inspected.length; rightIndex++) {
      const left = inspected[leftIndex], right = inspected[rightIndex];
      const comparison = compareOraclePair(left, right);
      if (relation === 'same-core') {
        if (comparison.different) failed = true;
        if (comparison.incomplete) notRun = true;
        if (comparison.different || comparison.incomplete) {
          for (const item of comparison.differences) differences.push({caseIds: [left.id, right.id], ...item});
        }
      } else if (comparison.incomplete) {
        notRun = true;
        differences.push({caseIds: [left.id, right.id], path: '#/meaning',
          expected: 'complete semantic facts with an explicit difference',
          observed: 'incomplete semantic facts', unresolved: true});
      } else if (!comparison.different) {
        failed = true;
        differences.push({caseIds: [left.id, right.id], path: '#/meaning',
          expected: 'a distinct explicit semantic fact', observed: 'same semantic facts'});
      }
    }
  }
  const status = failed ? 'FAIL' : notRun ? 'NOT RUN' : 'PASS';
  return {pass: status === 'PASS', status, differences: differences.slice(0, 64)};
}

/** Check a declared relation over runtime meanings or typed expected semantic oracles. */
export function compareSemanticRelation(relation, entries, options = {}) {
  const differences = [];
  if (!Array.isArray(entries) || entries.length < 2 ||
      !['same-core', 'different-core'].includes(relation)) {
    return {pass: false, status: 'FAIL', differences: [{caseIds: [], path: '#/meaning',
      expected: 'at least two meanings and a supported relation', observed: 'invalid relation input'}]};
  }
  if (options.oracle === true) return compareSemanticOracles(relation, entries);
  if (relation === 'same-core') {
    const [first, ...rest] = entries;
    for (const entry of rest) {
      const comparison = compareSemanticMeanings(first.meaning, entry.meaning, options);
      for (const item of comparison.differences) {
        differences.push({caseIds: [first.id, entry.id], ...item});
      }
    }
  } else {
    for (let left = 0; left < entries.length; left++) {
      for (let right = left + 1; right < entries.length; right++) {
        const first = entries[left], second = entries[right];
        if (!compareSemanticMeanings(first.meaning, second.meaning, options).equal) continue;
        differences.push({caseIds: [first.id, second.id], path: '#/meaning',
          expected: 'distinct material meanings', observed: 'same material meaning'});
      }
    }
  }
  return {pass: differences.length === 0, status: differences.length ? 'FAIL' : 'PASS',
    differences: differences.slice(0, 64)};
}

/** Evaluate matrix groups without conflating semantic failures with sentence failures. */
export function evaluateSemanticRelations(groups, outcomes, options = {}) {
  const declared = Array.isArray(groups) ? groups : [];
  if (!declared.length) {
    return {status: 'NOT RUN', declared: 0, passed: 0, failed: 0, notRun: 0,
      reason: 'No semantic relation groups are declared; no relation PASS is claimed.',
      groups: [], required: requiredRelationStatus([], options.requiredIds)};
  }
  const byId = new Map((Array.isArray(outcomes) ? outcomes : []).map(entry => [entry.item?.id, entry]));
  const results = declared.map(group => {
    const rows = group.caseIds.map(id => byId.get(id));
    const unavailable = rows.findIndex(row => !row || row.outcome?.kind === 'infra' ||
      row.document?.status !== 'ok' || !isRecord(row.document?.meaning));
    if (unavailable !== -1) {
      return {id: group.id, direction: group.direction, relation: group.relation,
        caseIds: [...group.caseIds], status: 'NOT RUN', differences: [],
        reason: `Case ${group.caseIds[unavailable]} did not produce a usable successful MeaningGraph.`};
    }
    const checked = compareSemanticRelation(group.relation, rows.map(row => ({
      id: row.item.id, meaning: row.document.meaning
    })));
    return {id: group.id, direction: group.direction, relation: group.relation,
      caseIds: [...group.caseIds], status: checked.status ?? (checked.pass ? 'PASS' : 'FAIL'),
      differences: checked.differences, reason: null};
  });
  const passed = results.filter(group => group.status === 'PASS').length;
  const failed = results.filter(group => group.status === 'FAIL').length;
  const notRun = results.filter(group => group.status === 'NOT RUN').length;
  return {status: failed ? 'FAIL' : notRun ? 'NOT RUN' : 'PASS', declared: results.length,
    passed, failed, notRun, reason: null, groups: results,
    required: requiredRelationStatus(results, options.requiredIds)};
}

/** Protected relation ids must each resolve to a declared, executed, passing group. */
function requiredRelationStatus(results, requiredIds) {
  const ids = Array.isArray(requiredIds) ? requiredIds : [];
  const byId = new Map(results.map(entry => {
    return [entry.id, entry];
  }));
  const declaredRows = ids.map(id => byId.get(id)).filter(entry => entry !== undefined);
  const missingIds = ids.filter(id => !byId.has(id));
  const status = ids.length === 0 ? 'NOT RUN' :
    missingIds.length || declaredRows.some(entry => entry.status !== 'PASS') ? 'RED' : 'GREEN';
  return {status, declared: ids.length,
    passed: declaredRows.filter(entry => entry.status === 'PASS').length,
    failed: declaredRows.filter(entry => entry.status === 'FAIL').length,
    notRun: declaredRows.filter(entry => entry.status === 'NOT RUN').length,
    missingIds};
}

function featureMismatch(wanted, got) {
  if (typeof wanted === 'string') {
    return typeof got !== 'string' || got.normalize('NFC') !== wanted.normalize('NFC');
  }
  return !deepScalarEqual(got, wanted);
}

function compareFeatures(want, actual, path, fail, {extraAllowed, exact}) {
  for (const [key, value] of Object.entries(want)) {
    if (featureMismatch(value, actual?.[key])) {
      fail(`${path}/${key}`, value, actual?.[key] ?? 'none');
    }
  }
  const wantedKeys = Object.keys(want);
  const gotKeys = Object.keys(actual ?? {});
  if (exact) {
    if (wantedKeys.length !== gotKeys.length) {
      fail(`${path} (exact feature keys)`, wantedKeys.sort().join(','), gotKeys.sort().join(','));
    }
  } else if (!extraAllowed) {
    const unexpected = gotKeys.filter(key => !(key in want));
    if (unexpected.length) {
      fail(`${path} (no unexpected features)`, `only ${wantedKeys.sort().join(',')}`,
        unexpected.sort().join(','));
    }
  }
}

function compareModifiers(wantModifiers, actual, path, fail, {exact}) {
  const gotList = Array.isArray(actual?.modifiers) ? actual.modifiers : [];
  compareModifierTrees(wantModifiers, gotList, path, fail, MODIFIER_COMPARE_DEPTH);
  if (exact && gotList.length !== wantModifiers.length) {
    fail(`${path}/modifiers (exact)`, wantModifiers.length, gotList.length);
  }
}

/** Published modifier nodes are depth-bounded trees ({concept, modifiers}); a
 * node's nested scopes carry meaning, so compare every level as an
 * order-insensitive multiset keyed by concept, stopping at the same depth
 * limit the MeaningGraph validator enforces. */
const MODIFIER_COMPARE_DEPTH = 4;
function compareModifierTrees(wantList, gotList, path, fail, depth) {
  const wanted = Array.isArray(wantList) ? wantList : [];
  const remaining = (Array.isArray(gotList) ? gotList : []).map(entry => entry ?? null);
  for (const wantEntry of wanted) {
    const wantConcept = nfc(wantEntry?.concept);
    const match = remaining.findIndex(entry => entry !== null && nfc(entry?.concept) === wantConcept);
    if (match === -1) {
      fail(`${path}/modifier`, wantConcept, 'absent');
      continue;
    }
    if (depth > 1) {
      compareModifierTrees(wantEntry?.modifiers, gotList[match]?.modifiers,
        `${path}/modifier:${wantConcept}`, fail, depth - 1);
    }
    remaining[match] = null;
  }
  for (const entry of remaining) {
    if (entry !== null) fail(`${path}/modifier`, 'absent', nfc(entry?.concept));
  }
}

function compareParticipant(want, actual, path, fail, meaning) {
  if (want.concept !== undefined) {
    if (nfc(actual?.concept) !== nfc(want.concept)) {
      fail(`${path}/concept`, want.concept, actual?.concept ?? 'none');
    }
  } else if (want.target !== undefined) {
    compareFeatures(want.target, actual?.referent ?? {}, `${path}/referent`, fail,
      {extraAllowed: false, exact: true});
    compareFeatures(want.agreement, actual?.agreement ?? {}, `${path}/agreement`, fail,
      {extraAllowed: false, exact: true});
  }
  if (want.features && (Object.keys(want.features).length || meaning.roleFeaturesExact === true)) {
    compareFeatures(want.features, actual?.features ?? {}, `${path}/features`, fail, {
      extraAllowed: true,
      exact: meaning.roleFeaturesExact === true
    });
  }
  if (Array.isArray(want.modifiers)) {
    compareModifiers(want.modifiers, actual, path, fail, {exact: meaning.modifiersExact === true});
  } else if (meaning.modifiersExact === true) {
    if (Array.isArray(actual?.modifiers) && actual.modifiers.length) {
      fail(`${path}/modifiers (exact)`, 'no modifiers declared', 'present');
    }
  }
  if (want.quantity !== undefined) {
    if (actual?.quantity?.kind !== want.quantity.kind || actual?.quantity?.value !== want.quantity.value) {
      fail(`${path}/quantity`, want.quantity, actual?.quantity ?? 'none');
    }
  }
}

/**
 * Compare an expected meaning against an actual MeaningGraph. `partial` (used for
 * alternative semantic readings) keeps subset semantics: unconstrained features
 * and feature extras are treated the same as when `featuresAllowExtra` is set.
 */
function compareMeaning(want, actual, fail, {partial = false} = {}) {
  if (!isRecord(actual)) {
    fail('#/meaning', 'a MeaningGraph object', 'none');
    return;
  }
  if (want.type !== undefined && actual.type !== want.type) {
    fail('#/type', want.type, actual.type ?? 'none');
  }
  if (want.type === 'question') {
    if (actual.type !== 'question') return;
    if (want.questionType !== undefined && actual.questionType !== want.questionType) {
      fail('#/questionType', want.questionType, actual.questionType ?? 'none');
    }
    const allowedFields = new Set(['version', 'type', 'questionType', 'proposition']);
    for (const key of Object.keys(actual)) {
      if (!allowedFields.has(key)) {
        fail(`#/unexpected/${key}`, 'no additional question field', actual[key]);
      }
    }
    const nestedFail = (path, expected, observed) => {
      if (path.startsWith('assert #/')) {
        fail(`assert #/proposition/${path.slice('assert #/'.length)}`, expected, observed);
      } else if (path.startsWith('#/')) {
        fail(`#/proposition${path.slice(1)}`, expected, observed);
      } else {
        fail(`#/proposition/${path}`, expected, observed);
      }
    };
    if (!isRecord(want.proposition)) {
      fail('#/proposition', 'an expected event proposition', 'none');
    } else {
      compareMeaning(want.proposition, actual.proposition, nestedFail, {partial});
    }
    if (!partial) {
      for (const [pointer, value] of Object.entries(want.assert ?? {})) {
        const resolved = resolvePointer(actual, pointer);
        if (resolved.missing) fail(`assert ${pointer}`, value, `missing at ${resolved.at}`);
        else if (!deepScalarEqual(resolved.value, value)) fail(`assert ${pointer}`, value, resolved.value);
      }
    }
    return;
  }
  if (want.concept !== undefined && nfc(actual.concept) !== nfc(want.concept)) {
    fail('#/concept', want.concept, actual.concept ?? 'none');
  }
  if (want.kind !== undefined && nfc(actual.kind) !== nfc(want.kind)) {
    fail('#/kind', want.kind, actual.kind ?? 'none');
  }
  const roleKeys = Object.keys(actual.roles ?? {});
  const declared = (want.roleSet ?? []).slice();
  if (partial) {
    const absent = declared.filter(name => !roleKeys.includes(name));
    if (absent.length) fail('#/roleSet', declared.join(','), `missing ${absent.join(',')}`);
  } else if (roleKeys.slice().sort().join('\u0000') !== declared.slice().sort().join('\u0000')) {
    fail('#/roleSet', declared.join(','), roleKeys.slice().sort().join(','));
  }
  for (const [name, participant] of Object.entries(want.roles ?? {})) {
    if (partial && !(name in (actual.roles ?? {}))) continue;
    compareParticipant(participant, actual.roles?.[name], `#/roles/${name}`, fail,
      {...want, roleFeaturesExact: partial ? false : want.roleFeaturesExact === true});
  }
  if (want.features) {
    compareFeatures(want.features, actual.features ?? {}, '#/features', fail, {
      extraAllowed: partial || want.featuresAllowExtra === true,
      exact: false
    });
  }
  if (!partial) {
    for (const [pointer, value] of Object.entries(want.assert ?? {})) {
      const resolved = resolvePointer(actual, pointer);
      if (resolved.missing) {
        fail(`assert ${pointer}`, value, `missing at ${resolved.at}`);
      } else if (!deepScalarEqual(resolved.value, value)) {
        fail(`assert ${pointer}`, value, resolved.value);
      }
    }
  }
}

/** Multiset matching for diagnostics / information-loss lists; items match fieldwise exactly. */
function compareMultiset(requiredItems, observedItems, match, fail, basePath, {allowUnexpected}) {
  const unused = [...observedItems];
  requiredItems.forEach((required, position) => {
    const hit = unused.findIndex(entry => match(required, entry));
    if (hit === -1) {
      fail(`${basePath}/required[${position}]`, required, 'no matching entry');
    } else {
      unused.splice(hit, 1);
    }
  });
  if (!allowUnexpected) {
    for (const entry of unused) {
      fail(`${basePath} (unexpected)`, 'no extra entries', entry);
    }
  }
}

function sameDiagnosticsCode(required, observed) {
  return typeof observed?.code === 'string' &&
    observed.code.normalize('NFC') === required.code.normalize('NFC');
}

function sameInformationLossItem(required, observed) {
  if (!isRecord(observed)) return false;
  return Object.entries(required).every(([key, value]) => nfc(observed[key]) === nfc(value));
}

/**
 * Compare one approved case expectation against the returned service document.
 * Returns {pass, kind, failures[], observed} — the runner decides gating and printing.
 */
function graphAssertionKey(assertion) {
  return JSON.stringify([assertion.fromPath, assertion.relation, assertion.toConcept]);
}

function meaningValueAtPath(meaning, path) {
  if (typeof path !== 'string' || !path.startsWith('#/')) return undefined;
  let value = meaning;
  for (const rawSegment of path.slice(2).split('/')) {
    if (/~(?![01])/u.test(rawSegment)) return undefined;
    const segment = rawSegment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (!isRecord(value) && !Array.isArray(value)) return undefined;
    if (!Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

function resolvesMeaningPath(meaning, path) {
  return meaningValueAtPath(meaning, path) !== undefined;
}

function effectOwnerPath(path) {
  const modifier = path.match(/^(.*)\/modifiers\/[0-9]+$/u);
  if (modifier) return modifier[1];
  return path.endsWith('/predicate') ? `${path.slice(0, -'/predicate'.length)}/roles/subject` : null;
}

function compareTypedGraph(policy, document, engine, fail, observed) {
  if (!engine || typeof engine.projectMeaningGraph !== 'function') {
    fail('/graph/projection', 'production Engine.projectMeaningGraph', 'unavailable');
    return 'infra';
  }
  // An expected success that receives a controlled refusal already fails its
  // status/text/meaning assertions. Do not relabel that translation failure as
  // infrastructure just because there is no successful MeaningGraph to project.
  if (document?.status !== 'ok') return null;

  let graph;
  try {
    graph = engine.projectMeaningGraph(document?.meaning);
  } catch (error) {
    fail('/graph/projection', 'a valid typed graph projection',
      `${error?.code ?? error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
    return 'infra';
  }
  if (!isRecord(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) ||
      !isRecord(graph.sourcePaths) || !isRecord(graph.sourcePaths.edges) ||
      !Array.isArray(graph.unresolved)) {
    fail('/graph/projection', 'bounded graph with nodes, edges, sourcePaths and unresolved', graph);
    return 'infra';
  }

  observed.typedGraph = graph;
  const nodes = new Map();
  let malformedGraph = false;
  for (const node of graph.nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id ||
        typeof node.conceptId !== 'string' || !node.conceptId || nodes.has(node.id)) {
      fail('/graph/nodes', 'unique nodes with string id and conceptId', node);
      malformedGraph = true;
      continue;
    }
    nodes.set(node.id, node);
  }
  const actual = new Set();
  let malformedSourcePaths = false;
  for (const edge of graph.edges) {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.relation !== 'string' ||
        typeof edge.target !== 'string' || !nodes.has(edge.from)) {
      fail('/graph/edges', 'typed edges with known source and target nodes', edge);
      malformedGraph = true;
      continue;
    }
    const target = nodes.get(edge.target);
    const key = JSON.stringify([edge?.from, edge?.relation, edge?.target]);
    const paths = graph.sourcePaths.edges[key];
    if (!target) {
      fail('/graph/edges', 'typed edges with known source and target nodes', edge);
      malformedGraph = true;
      continue;
    }
    if (!Array.isArray(paths) || paths.length === 0 ||
        paths.some(path => !resolvesMeaningPath(document.meaning, path))) {
      fail('/graph/sourcePaths', 'at least one valid MeaningGraph path for every projected edge',
        {edge, paths});
      malformedSourcePaths = true;
      continue;
    }
    for (const fromPath of paths) {
      const ownerPath = effectOwnerPath(fromPath);
      const property = meaningValueAtPath(document.meaning, fromPath);
      const effect = engine.ontology?.get?.(property?.concept)?.semanticEffect;
      if (ownerPath && effect?.operation === 'add_relation' &&
          effect.relation === edge.relation && effect.target === target.conceptId &&
          edge.from !== ownerPath) {
        fail('/graph/scope', ownerPath, edge.from);
      }
      actual.add(JSON.stringify([fromPath, edge.relation, target.conceptId]));
    }
  }

  const required = new Set(policy.requiredEdges.map(graphAssertionKey));
  policy.requiredEdges.forEach((assertion, index) => {
    if (!actual.has(graphAssertionKey(assertion))) {
      fail(`/graph/requiredEdges/${index}`, assertion, 'edge not projected at this source path');
    }
  });
  policy.forbiddenEdges.forEach((assertion, index) => {
    if (actual.has(graphAssertionKey(assertion))) {
      fail(`/graph/forbiddenEdges/${index}`, 'edge absent', assertion);
    }
  });
  if (graph.unresolved.length) {
    fail('/graph/unresolved', 'no unresolved semantic graph paths', graph.unresolved);
  }
  if (!policy.allowUnexpected) {
    for (const assertion of actual) {
      if (!required.has(assertion)) {
        fail('/graph (unexpected)', 'only the declared required edges', assertion);
      }
    }
  }
  return malformedGraph || malformedSourcePaths ? 'infra' : null;
}

export function compareCase(item, document, {engine, analysisOnly = false} = {}) {
  const failures = [];
  const format = value => isRecord(value) || Array.isArray(value)
    ? JSON.stringify(value) : value === undefined ? 'none' : String(value);
  const fail = (path, expected, actual) => {
    if (failures.length < 24) {
      failures.push({path,
        expected: isRecord(expected) || Array.isArray(expected) ? JSON.stringify(expected) : String(expected),
        actual: actual === undefined || typeof actual === 'symbol'
          ? String(actual) : isRecord(actual) || Array.isArray(actual) ? JSON.stringify(actual) : String(actual)});
    }
  };
  const expected = item.expected;
  const observed = {
    status: document?.status ?? null,
    text: document?.text ?? null,
    previewId:document?.previewId??null,
    previewText:document?.preview?.text??null,
    alternativeCount: Array.isArray(document?.alternatives) ? document.alternatives.length : 0,
    diagnosticCodes: (Array.isArray(document?.diagnostics) ? document.diagnostics : [])
      .map(entry => entry?.code).filter(code => typeof code === 'string').sort(),
    informationLossCount: Array.isArray(document?.informationLoss) ? document.informationLoss.length : 0
  };

  if (!Array.isArray(document?.uncertainties)) {
    fail('/uncertainties', 'an uncertainty array', document?.uncertainties);
  } else if (expected.uncertainties) {
    compareMultiset(expected.uncertainties.required, document.uncertainties,
      (wanted, got) => isRecord(got) && Object.entries(wanted)
        .every(([key, value]) => sameJson(value, got[key])),
      fail, '/uncertainties', {allowUnexpected: expected.uncertainties.allowUnexpected});
  }
  if (!analysisOnly) compareInterpretations(expected.interpretations, document, fail);
  if (!analysisOnly && expected.context) compareContext(expected.context, document.contextReport, fail);
  if(!analysisOnly&&expected.segments)compareSegments(expected.segments,document,fail);

  if (nfc(document?.status) !== nfc(expected.status)) {
    fail('status', expected.status, document?.status ?? 'none');
    return {pass: false,
      kind: document?.status === 'error' ? 'infra' : (STATUS_KIND[expected.status] ?? 'unknown'),
      failures, observed};
  }

  if (expected.status === 'ok') {
    const actualText = nfc(document.text);
    if (typeof actualText !== 'string' ||
        !expected.text.accepted.map(value => value.normalize('NFC')).includes(actualText)) {
      fail('text', `one of ${JSON.stringify(expected.text.accepted)}`,
        typeof actualText === 'string' ? actualText : 'none');
    }
    compareMeaning(expected.meaning, document.meaning, fail);
    const pool = (document.alternatives ?? []).map(value =>
      typeof value === 'string' ? value.normalize('NFC') : JSON.stringify(value));
    const requiredTexts = expected.alternatives.required
      .filter(entry => typeof entry === 'string').map(value => value.normalize('NFC'));
    const consumed = [...pool];
    requiredTexts.forEach((text, position) => {
      const index = consumed.indexOf(text);
      if (index === -1) fail(`alternatives/required[${position}]`, text, 'not returned');
      else consumed.splice(index, 1);
    });
    if (!expected.alternatives.allowUnexpected && consumed.length) {
      fail('alternatives (unexpected)', 'no extra surface alternatives',
        `${consumed.length} extra: ${consumed.slice(0, 2).join(' | ')}`);
    }
    compareMultiset(expected.informationLoss.required, document.informationLoss ?? [],
      sameInformationLossItem, fail, '/informationLoss',
      {allowUnexpected: expected.informationLoss.allowUnexpected});
    compareMultiset(expected.diagnostics.required, document.diagnostics ?? [],
      sameDiagnosticsCode, fail, '/diagnostics',
      {allowUnexpected: expected.diagnostics.allowUnexpected});
  } else {
    if (document.text !== null) fail('text', null, document.text);
    if (document.meaning !== null) fail('meaning', null, document.meaning);
    if (expected.status !== 'ambiguous' && (document.alternatives ?? []).length) {
      fail('alternatives', '[]', document.alternatives);
    }
    if (expected.status === 'ambiguous') {
      const bindings = [...(document.alternatives ?? [])];
      const requiredMeanings = expected.alternatives.required.filter(isRecord);
      requiredMeanings.forEach((required, position) => {
        const index = bindings.findIndex(candidate => {
          let strict = true;
          compareMeaning(required.meaning, candidate?.meaning, () => { strict = false; }, {partial: true});
          return strict;
        });
        if (index === -1) {
          fail(`alternatives/required[${position}]`, 'matching semantic reading',
            format(required.meaning));
        } else {
          bindings.splice(index, 1);
        }
      });
      if (!expected.alternatives.allowUnexpected && bindings.length) {
        fail('alternatives (unexpected)', requiredMeanings.length,
          `${(document.alternatives ?? []).length} readings returned`);
      }
    }
    compareMultiset(expected.diagnostics.required, document.diagnostics ?? [],
      sameDiagnosticsCode, fail, '/diagnostics',
      {allowUnexpected: expected.diagnostics.allowUnexpected});
    compareMultiset(expected.informationLoss.required, document.informationLoss ?? [],
      sameInformationLossItem, fail, '/informationLoss',
      {allowUnexpected: expected.informationLoss.allowUnexpected});
  }
  let graphKind = null;
  if (expected.graph) graphKind = compareTypedGraph(expected.graph, document, engine, fail, observed);
  return {pass: failures.length === 0,
    kind: graphKind ?? (document?.status === 'error' ? 'infra' : (STATUS_KIND[expected.status] ?? 'unknown')),
    failures, observed};
}

/** Exercise actual public APIs with the same independently authored sentence oracle. */
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
function canonical(value) {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key])]));
  return value;
}

function compareInterpretations(policy, document, fail) {
  const interpretations = document?.interpretations;
  if (!Array.isArray(interpretations)) {
    fail('/interpretations', 'an array of complete readings', interpretations);
    return;
  }
  const ids = new Set();
  const realizations = interpretations.flatMap(item => item.realizations ?? []);
  for (const item of [...interpretations, ...realizations]) {
    if (typeof item.id !== 'string' || ids.has(item.id)) fail('/interpretations/id', 'unique stable ID', item.id);
    ids.add(item.id);
  }
  for (const interpretation of interpretations) {
    for (const realization of interpretation.realizations ?? []) {
      if (realization.interpretationId !== interpretation.id) {
        fail('/interpretations/link', interpretation.id, realization.interpretationId);
      }
    }
  }
  const preview = realizations.find(item => item.id === document.previewId);
  if (document.previewId !== null && !preview) fail('/previewId', 'an available whole-sentence realization or null', document.previewId);
  if (!policy) return;
  compareMultiset(policy.required, interpretations, (wanted, actual) => {
    const problems = [];
    compareMeaning(wanted.meaning, actual.meaning, (...args) => problems.push(args));
    return !problems.length && wanted.status === actual.status &&
      sameJson([...wanted.texts].map(nfc).sort(), actual.realizations.map(item => nfc(item.text)).sort()) &&
      (wanted.rank === undefined || wanted.rank === actual.rank) &&
      (wanted.assumptions === undefined || (actual.score.assumptions === wanted.assumptions &&
        actual.realizations.every(item => item.assumptions.length === wanted.assumptions &&
          item.kind === (wanted.assumptions ? 'additional_assumption' : 'equivalent_expression')))) &&
      (!wanted.realizations||(()=>{
        const remaining=[...actual.realizations];
        return wanted.realizations.every(required=>{
          const index=remaining.findIndex(item=>item.text.normalize('NFC')===required.text.normalize('NFC')&&
            item.kind===required.kind&&sameJson((item.assumptions||[]).map(({path,feature})=>({path,feature})),
              required.assumptions));
          if(index<0)return false;
          remaining.splice(index,1);
          return true;
        });
      })()) &&
      (wanted.ruleIds ?? []).every(id => actual.ruleIds.includes(id) && actual.reasons.some(reason => reason.ruleId === id)) &&
      (wanted.diagnosticCodes === undefined || sameJson(wanted.diagnosticCodes.slice().sort(), actual.diagnostics.map(item => item.code).sort()));
  }, fail, '/interpretations', {allowUnexpected:policy.allowUnexpected});
  if (policy.preview === null) {
    if (document.previewId !== null) fail('/previewId', null, document.previewId);
  } else if (!policy.preview.accepted.map(nfc).includes(nfc(preview?.text))) {
    fail('/preview/text', policy.preview.accepted, preview?.text);
  }
  const tied = interpretations.length > 1 && interpretations[0].rank === interpretations[1].rank;
  if (tied !== policy.tied) fail('/interpretations/tied', policy.tied, tied);
}

function compareSegments(policy,document,fail) {
  const segments=document?.preview?.segments;
  if(!Array.isArray(segments)){
    fail('/preview/segments','an on-demand segment array',segments);
    return;
  }
  if(policy.previewText&&!policy.previewText.map(nfc).includes(nfc(document?.preview?.text)))
    fail('/preview/text',policy.previewText,document?.preview?.text);
  compareMultiset(policy.required,segments,(wanted,actual)=>{
    if(!isRecord(actual)||nfc(actual.text)!==nfc(wanted.text)||
        !sameJson(actual.targetSpan,wanted.targetSpan)||
        !actual.meaningPaths?.includes(wanted.meaningPath))return false;
    const source=actual.sources?.find(item=>item.meaningPath===wanted.meaningPath);
    return sameJson(wanted.source,source&&wanted.source.status==='aligned'?
      {status:source.status,span:source.span}:
      source?{status:source.status,reason:source.reason}:null);
  },fail,'/preview/segments',{allowUnexpected:policy.allowUnexpected});
}

function compareContext(policy, report, fail) {
  if (!isRecord(report)) { fail('/contextReport','a context evidence report',report); return; }
  compareMultiset(policy.bindings, report.bindings ?? [],
    (wanted, actual) => Object.entries(wanted).every(([key,value]) => sameJson(value,actual[key])),
    fail,'/contextReport/bindings',{allowUnexpected:false});
  const decisions = report.decisions ?? [];
  const sortedIds = values => [...new Set(values)].sort();
  const observed = {
    appliedFactIds:sortedIds(decisions.filter(item => ['matched','bound'].includes(item.action)).map(item => item.factId)),
    ignoredFactIds:sortedIds(decisions.filter(item => item.action === 'ignored').map(item => item.factId)),
    conflictFactIds:sortedIds((report.conflicts ?? []).flatMap(item => item.factIds))
  };
  for (const key of Object.keys(observed)) {
    if (!sameJson(sortedIds(policy[key]),observed[key])) fail(`/contextReport/${key}`,policy[key],observed[key]);
  }
  for (const wanted of policy.sessionSources ?? []) {
    const decision = decisions.find(item => item.factId === wanted.factId);
    if (decision?.source?.id !== wanted.sourceId || decision?.source?.turnId !== wanted.turnId ||
        decision?.source?.kind !== wanted.kind || !decision.source.recordedAt || !decision.source.text) {
      fail('/contextReport/sessionSources',wanted,decision?.source);
    }
  }
}

export function comparePublicEntryPoints(item, document, engine) {
  const failures = [];
  const checks = {};
  let infra = false;
  const add = (api, path, expected, actual) => failures.push({path: `api/${api}/${path}`,
    expected: JSON.stringify(expected), actual: JSON.stringify(actual) ?? 'none'});
  for (const api of ['translate', 'tryTranslate', 'analyze']) {
    const before = failures.length;
    try {
      if (api === 'analyze') {
        let meaning;
        let error;
        try { meaning = engine.analyze(item.input); } catch (caught) { error = caught; }
        if (item.expected.status === 'ok') {
          if (error) throw error;
          compareMeaning(item.expected.meaning, meaning,
            (path, expected, actual) => add(api, path, expected, actual));
        } else if (item.expected.status === 'ambiguous') {
          if (error?.status !== 'ambiguous' || error?.code !== 'AMBIGUOUS_MEANING') {
            add(api, 'refusal', 'typed semantic ambiguity', error?.code ?? meaning);
          }
          for (const failure of compareCase(item, error?.result, {engine, analysisOnly:true}).failures) {
            add(api, failure.path, failure.expected, failure.actual);
          }
        } else if (!error || error.status !== item.expected.status ||
          !item.expected.diagnostics.required.some(entry => entry.code === error.code)) {
          if (error && !error.status) throw error;
          add(api, 'refusal', item.expected.status, error?.status ?? meaning);
        }
      } else {
        const response = engine[api](item.input);
        const value = api === 'tryTranslate' ? response.value : response;
        if (api === 'tryTranslate' && response.ok !== (item.expected.status === 'ok')) {
          add(api, 'ok', item.expected.status === 'ok', response.ok);
        }
        for (const failure of compareCase(item, value, {engine}).failures) {
          add(api, failure.path, failure.expected, failure.actual);
        }
        for (const field of ['status','text','meaning','alternatives','informationLoss','uncertainties','interpretations','previewId','preview','contextReport']) {
          if (!sameJson(value?.[field], document?.[field])) {
            add(api, field, document?.[field], value?.[field]);
          }
        }
        if (!sameJson(value?.interlingua, value?.meaning)) {
          add(api, 'interlingua', value?.meaning, value?.interlingua);
        }
      }
    } catch (error) {
      infra = true;
      add(api, 'exception', 'a domain result', error?.message ?? String(error));
    }
    checks[api] = failures.length === before ? 'PASS' : infra ? 'INFRA' : 'FAIL';
  }
  return {failures, checks, infra};
}
