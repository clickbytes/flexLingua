/** Strict loading and validation of the canonical translation matrix. */

import {readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {ALLOWED_DIRECTIONS, discoverCases} from './discover.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const TESTS_ROOT = join(LIB_DIR, '..');

const GAPS_ID = /^GAP-[A-Z0-9-]{2,64}$/u;
const CASE_ID_SHAPE = /^A1-[A-Z]{2}-[A-Z]{2}-[A-Z]+-[0-9]{4}$/u;
const TARGET_ID_SHAPE = /^(?:concept|construction)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/u;
const SHA40 = /^[0-9a-f]{40}$/u;
const ISSUE_KIND = /^[a-z][a-zA-Z0-9_-]{0,63}$/u;

const CONCEPT_UNITS = new Set(['entity', 'property']);
const CONSTRUCTION_UNITS = new Set(['event', 'state']);
const REFUSAL_STATUSES = new Set(['unsupported', 'invalid', 'ambiguous', 'resource_limit']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonFile(path, label) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return {missing: true, error: `${label} not found at ${path}.`};
    if (error?.code === 'EISDIR') return {invalid: true, error: `${label} is a directory, not a JSON file.`};
    throw error;
  }
  try {
    return {value: JSON.parse(raw)};
  } catch (error) {
    return {invalid: true, error: `${label} is not valid JSON: ${error.message}`};
  }
}

/** Compile one JSON Schema 2020-12 validator; compile failures become issues. */
function makeValidator(schema) {
  const ajv = new Ajv2020({allErrors: true, allowUnionTypes: true});
  try {
    return {validate: ajv.compile(schema)};
  } catch (error) {
    return {broken: error};
  }
}

function summarizeAjvErrors(validate, file, issues, kind) {
  if (!validate.errors?.length) return true;
  for (const error of validate.errors.slice(0, 24)) {
    issues.push({kind, file, id: undefined, severity: 'error',
      message: `${error.instancePath || '/'} ${error.message ?? ''}`.trim()});
  }
  return false;
}

/** Cross-file and semantic rules the JSON schema cannot express per-case. */
function checkCaseRules(item, issues) {
  const id = item.id;
  const [source, target] = item.direction.split('-');
  const expectedPrefix = `A1-${source.toUpperCase()}-${target.toUpperCase()}-`;
  if (!id.startsWith(expectedPrefix)) {
    issues.push({kind: 'id', file: item.file, id, severity: 'error',
      message: `Case id '${id}' must start with '${expectedPrefix}' to match folder ${item.direction}.`});
  }
  if (item.mode !== 'single-sentence') {
    issues.push({kind: 'mode', file: item.file, id, severity: 'error',
      message: 'This matrix only accepts single-sentence cases.'});
  }
  const review = item.review;
  if (item.tier === 'required' && review.status !== 'approved') {
    issues.push({kind: 'review', file: item.file, id, severity: 'error',
      message: 'Required-tier case must carry review.status=approved.'});
  }
  if (review.status === 'approved') {
    if (!review.author || review.author.trim().length < 3) {
      issues.push({kind: 'review', file: item.file, id, severity: 'error',
        message: 'Approved case needs a named review author.'});
    }
    if (typeof review.source !== 'string' || review.source.trim().length < 10) {
      issues.push({kind: 'review', file: item.file, id, severity: 'error',
        message: 'Approved case needs review.source documenting the independently authored expectation.'});
    }
  }
  if (review.status === 'proposed' && item.tier !== 'exploratory') {
    issues.push({kind: 'review', file: item.file, id, severity: 'error',
      message: 'review.status=proposed is only allowed for tier=exploratory cases.'});
  }
  const expected = item.expected;
  if (expected.status === 'ok') {
    if (expected.text === null || expected.meaning === null) {
      issues.push({kind: 'expected', file: item.file, id, severity: 'error',
        message: 'status ok requires accepted text and a meaning.'});
      return;
    }
    const meaning = expected.meaning;
    const accepted = new Set((expected.text?.accepted ?? []).map(value => value.normalize('NFC')));
    if (accepted.size !== (expected.text?.accepted ?? []).length) {
      issues.push({kind: 'text', file: item.file, id, severity: 'error',
        message: 'text.accepted entries must be unique (compared after NFC).'});
    }
    if (meaning.type === 'event' && !meaning.concept) {
      issues.push({kind: 'meaning', file: item.file, id, severity: 'error',
        message: 'Meaning type event requires an explicit concept.'});
    }
    if (meaning.type === 'question' && !meaning.concept) {
      issues.push({kind: 'meaning', file: item.file, id, severity: 'error',
        message: 'Meaning type question requires an explicit concept.'});
    }
    if (meaning.type === 'state' && !meaning.kind) {
      issues.push({kind: 'meaning', file: item.file, id, severity: 'error',
        message: 'Meaning type state requires an explicit kind (e.g. classification).'});
    }
    const roleKeys = Object.keys(meaning.roles ?? {}).sort().join(',');
    const declared = (meaning.roleSet ?? []).slice().sort().join(',');
    if (roleKeys !== declared) {
      issues.push({kind: 'meaning', file: item.file, id, severity: 'error',
        message: `roleSet (${declared}) does not match role keys (${roleKeys}).`});
    }
  } else if (REFUSAL_STATUSES.has(expected.status)) {
    if (expected.text !== null || expected.meaning !== null) {
      issues.push({kind: 'expected', file: item.file, id, severity: 'error',
        message: `status ${expected.status} requires text:null and meaning:null (refusals never invent meaning).`});
    }
    if (expected.status === 'ambiguous') {
      const semantic = (expected.alternatives?.required ?? []).filter(entry => isRecord(entry));
      if (semantic.length < 2) {
        issues.push({kind: 'expected', file: item.file, id, severity: 'error',
          message: 'ambiguous cases must declare at least two distinct expected meanings.'});
      }
    }
  }
}

function checkCatalogRules(catalog, issues) {
  const byId = new Map();
  for (const target of catalog.targets) {
    if (byId.has(target.targetId)) {
      issues.push({kind: 'catalog', file: 'tests/catalog/a1-single.json', id: target.targetId,
        severity: 'error', message: `Duplicate target id '${target.targetId}'.`});
      continue;
    }
    byId.set(target.targetId, target);
    if (target.unitType === 'concept' && !CONCEPT_UNITS.has(target.kind)) {
      issues.push({kind: 'catalog', file: 'tests/catalog/a1-single.json', id: target.targetId,
        severity: 'error', message: `Concept target '${target.targetId}' must be kind entity|property.`});
    }
    if (target.unitType === 'construction' && !CONSTRUCTION_UNITS.has(target.kind)) {
      issues.push({kind: 'catalog', file: 'tests/catalog/a1-single.json', id: target.targetId,
        severity: 'error', message: `Construction target '${target.targetId}' must be kind event|state.`});
    }
    if (target.revision === 'historical-planning-baseline' && !target.historicalId) {
      issues.push({kind: 'catalog', file: 'tests/catalog/a1-single.json', id: target.targetId,
        severity: 'error', message: 'Historical target must record its historicalId.'});
    }
  }
  return byId;
}

function checkRequiredIds(requiredIds, catalogById, caseIndex, issues) {
  const targets = requiredIds.requiredTargetIds;
  const cases = requiredIds.requiredCaseIds;
  if (!Array.isArray(targets) || !Array.isArray(cases)) {
    issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id: undefined,
      severity: 'error', message: 'required-ids.json must hold the arrays requiredTargetIds and requiredCaseIds.'});
    return;
  }
  if (targets.length === 0 || cases.length === 0) {
    issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id: undefined,
      severity: 'error', message: 'Required target and case lists must both be non-empty.'});
  }
  if (new Set(targets).size !== targets.length || new Set(cases).size !== cases.length) {
    issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id: undefined,
      severity: 'error', message: 'Required target and case ids must be unique.'});
  }
  const targetShapeOk = targets.every(id => typeof id === 'string' && TARGET_ID_SHAPE.test(id));
  const caseShapeOk = cases.every(id => typeof id === 'string' && CASE_ID_SHAPE.test(id));
  if (!targetShapeOk || !caseShapeOk) {
    issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id: undefined,
      severity: 'error', message: 'Every required-ids entry must be a stable concept.* / construction.* target id or an A1-* case id.'});
    return;
  }
  const declaredTargets = new Set(targets);
  for (const id of targets) {
    const target = catalogById.get(id);
    if (!target) {
      issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id,
        severity: 'error', message: `Required target '${id}' is not present in the a1-single catalog.`});
      continue;
    }
    if (target.tier !== 'required') {
      issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id,
        severity: 'error', message: `Target '${id}' is listed as required but the catalog marks it planned.`});
    }
  }
  for (const id of catalogById.keys()) {
    if (catalogById.get(id).tier === 'required' && !declaredTargets.has(id)) {
      issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id,
        severity: 'error', message: `Catalog target '${id}' is tier=required but missing from required-ids.`});
    }
  }
  const declaredCases = new Set(cases);
  for (const id of cases) {
    const item = caseIndex.get(id);
    if (!item) {
      issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id,
        severity: 'error', message: `Required case id '${id}' does not match any discovered case.`});
      continue;
    }
    if (item.tier !== 'required' || item.review?.status !== 'approved') {
      issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id,
        severity: 'error', message: `Required case id '${id}' must reference an approved required-tier case.`});
    }
  }
  for (const [id, item] of caseIndex) {
    if (item.tier === 'required' && !declaredCases.has(id)) {
      issues.push({kind: 'required-ids', file: item.file, id,
        severity: 'error', message: 'Approved required-tier case is missing from required-ids.requiredCaseIds.'});
    }
  }
}

function checkGaps(gaps, issues) {
  if (!isRecord(gaps) || !Array.isArray(gaps.gaps)) {
    issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: undefined,
      severity: 'error', message: 'known-gaps.json must hold a gaps array.'});
    return;
  }
  const seen = new Set();
  for (const gap of gaps.gaps) {
    if (!isRecord(gap) || typeof gap.id !== 'string' || !GAPS_ID.test(gap.id)) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: undefined,
        severity: 'error', message: 'Every gap needs a stable GAP-* string id.'});
      continue;
    }
    if (seen.has(gap.id)) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Duplicate gap id '${gap.id}'.`});
      continue;
    }
    seen.add(gap.id);
    if (!ALLOWED_DIRECTIONS.has(gap.direction)) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' has unknown direction '${gap.direction}'.`});
    }
    if (!isRecord(gap.input) || typeof gap.input.from !== 'string' ||
        typeof gap.input.to !== 'string' || typeof gap.input.text !== 'string') {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' needs a recorded input {from,to,text}.`});
    }
    if (!('expectedIndependent' in gap) || (gap.expectedIndependent !== null && !isRecord(gap.expectedIndependent))) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' must record its independently expected meaning (or explicit null).`});
    }
    if (typeof gap.observedStatus !== 'string') {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' must record the observed status string.`});
    }
    if (!Array.isArray(gap.observedDiagnosticsCodes) ||
        !gap.observedDiagnosticsCodes.every(code => typeof code === 'string')) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' must record observedDiagnosticsCodes as a string array.`});
    }
    if (typeof gap.observedAtSha !== 'string' || !SHA40.test(gap.observedAtSha)) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' must record the observedAtSha (40 hex).`});
    }
    if (typeof gap.owner !== 'string' || gap.owner.length < 2 ||
        typeof gap.issue !== 'string' || gap.issue.length < 2) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error', message: `Gap '${gap.id}' needs an owner and a linked issue for follow-up.`});
    }
    if (!['low', 'medium', 'high'].includes(gap.severity) ||
        !['open', 'revalidated', 'closed'].includes(gap.state) ||
        typeof gap.retestPolicy !== 'string' || gap.retestPolicy.length < 10) {
      issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: gap.id,
        severity: 'error',
        message: `Gap '${gap.id}' needs severity low|medium|high, state open|revalidated|closed, and a retest policy.`});
    }
  }
}

/**
 * Load and validate the whole matrix: discovery, envelope schemas, catalog schema,
 * required-ids, known gaps, and all cross-file rules. Returns the parsed matrix plus
 * human-readable issues ({kind,file,id,severity,message}); no engine execution here.
 */
export async function loadMatrix({testsRoot = TESTS_ROOT} = {}) {
  const issues = [];
  const discovery = await discoverCases({root: join(testsRoot, 'cases')});
  issues.push(...discovery.issues.map(message => ({...message, severity: 'error'})));

  const validators = new Map();
  for (const name of ['case.schema.json', 'catalog.schema.json']) {
    const schemaFile = await readJsonFile(join(testsRoot, 'schemas', name), name);
    if (!schemaFile.value) {
      issues.push({kind: 'schema', file: `tests/schemas/${name}`, id: undefined, severity: 'error',
        message: schemaFile.error ?? 'Unknown schema load failure.'});
      continue;
    }
    const built = makeValidator(schemaFile.value);
    if (built.broken) {
      issues.push({kind: 'schema', file: `tests/schemas/${name}`, id: undefined, severity: 'error',
        message: `Schema itself does not compile: ${built.broken.message}`});
    } else {
      validators.set(name, built.validate);
    }
  }

  const caseValidate = validators.get('case.schema.json');
  if (caseValidate) {
    for (const envelope of discovery.envelopes) {
      caseValidate(envelope.envelope);
      summarizeAjvErrors(caseValidate, envelope.file, issues, 'schema');
    }
    for (const item of discovery.cases) {
      checkCaseRules(item, issues);
    }
  }

  let catalog = null;
  let catalogById = new Map();
  const catalogFile = await readJsonFile(join(testsRoot, 'catalog', 'a1-single.json'), 'a1-single.json');
  if (!catalogFile.value) {
    issues.push({kind: 'catalog', file: 'tests/catalog/a1-single.json', id: undefined,
      severity: 'error', message: catalogFile.error ?? 'a1-single.json could not be loaded.'});
  } else {
    const catalogValidate = validators.get('catalog.schema.json');
    if (!catalogValidate) {
      issues.push({kind: 'catalog', file: 'tests/catalog/a1-single.json', id: undefined,
        severity: 'error', message: 'catalog.schema.json unavailable; catalog could not be validated.'});
    } else {
      catalogValidate(catalogFile.value);
      if (summarizeAjvErrors(catalogValidate, 'tests/catalog/a1-single.json', issues, 'catalog')) {
        catalog = catalogFile.value;
        catalogById = checkCatalogRules(catalog, issues);
      }
    }
  }

  let requiredIds = null;
  const requiredFile = await readJsonFile(join(testsRoot, 'catalog', 'required-ids.json'), 'required-ids.json');
  if (!requiredFile.value) {
    issues.push({kind: 'required-ids', file: 'tests/catalog/required-ids.json', id: undefined,
      severity: 'error', message: requiredFile.error ?? 'required-ids.json could not be loaded.'});
  } else {
    requiredIds = requiredFile.value;
    const caseIndex = new Map(discovery.cases.map(item => [item.id, item]));
    checkRequiredIds(requiredIds, catalogById, caseIndex, issues);
  }

  let gaps = null;
  const gapsFile = await readJsonFile(join(testsRoot, 'gaps', 'known-gaps.json'), 'known-gaps.json');
  if (gapsFile.missing) {
    issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: undefined, severity: 'warning',
      message: 'known-gaps.json is absent; no known gaps are registered yet.'});
  } else if (!gapsFile.value) {
    issues.push({kind: 'gaps', file: 'tests/gaps/known-gaps.json', id: undefined,
      severity: 'error', message: gapsFile.error ?? 'known-gaps.json could not be loaded.'});
  } else {
    gaps = gapsFile.value;
    checkGaps(gaps, issues);
  }

  for (const item of discovery.cases) {
    if (!catalogById.has(item.requirements?.coverageTargetId)) {
      issues.push({kind: 'coverage', file: item.file, id: item.id, severity: 'error',
        message: `coverageTargetId '${item.requirements?.coverageTargetId}' is not a catalog target.`});
    }
  }

  const malformed = issues.filter(issue => !isRecord(issue) || !ISSUE_KIND.test(issue.kind ?? '') ||
    (issue.severity !== 'error' && issue.severity !== 'warning'));
  if (malformed.length) {
    issues.push({kind: 'internal', file: '-', id: undefined, severity: 'error',
      message: `Validator produced malformed issue records: ${malformed.length}`});
  }

  return {
    cases: discovery.cases,
    envelopes: discovery.envelopes,
    catalog,
    requiredIds,
    gaps,
    issues
  };
}

/** Compile one schema for in-memory validation without touching matrix files. */
export function compileSchema(schema) {
  const built = makeValidator(schema);
  if (built.broken) return {broken: built.broken};
  return {validate: built.validate};
}

/** Run a compiled validator against an in-memory object and format ajv errors. */
export function validateObject(validate, value) {
  validate(value);
  const issues = (validate.errors ?? []).map(error => ({
    path: error.instancePath || '/',
    message: error.message ?? 'unknown schema error'
  }));
  return {ok: issues.length === 0, issues};
}
