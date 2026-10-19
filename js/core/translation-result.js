import {isResourceLimitError} from './errors.js';
import {snapshotBoundedJsonGraph} from './bounded-json.js';

const domainStatuses = new Set(['unsupported', 'invalid', 'ambiguous', 'resource_limit']);
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const meaningKey = value => {
  const {value: safeValue} = snapshotBoundedJsonGraph(value);
  return JSON.stringify(stable(safeValue));
};
const keyOf = meaningKey;
const uniqueValues = values => [...new Map(values.map(value => [keyOf(value), value]))]
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);

function surfaceEvidence(reading) {
  const existing = reading.surface?.variants ?? reading.analysis?.surface?.variants;
  return Array.isArray(existing) ? existing : [];
}

function representativeOrder(left, right) {
  const score = (right.score ?? right.analysis?.score ?? 0) -
    (left.score ?? left.analysis?.score ?? 0);
  if (score) return score;
  const preference = (right.lexicalPreference ?? 0) - (left.lexicalPreference ?? 0);
  if (preference) return preference;
  const leftKey = representativeKey(left), rightKey = representativeKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function representativeKey(reading) {
  const normalized = {...reading};
  delete normalized.surface;
  if (normalized.analysis) {
    normalized.analysis = {...normalized.analysis};
    delete normalized.analysis.surface;
  }
  normalized.surface = [...surfaceEvidence(reading)].sort((left,right) => {
    const leftKey = meaningKey(left), rightKey = meaningKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return meaningKey(normalized);
}

function attachSurface(reading, variants) {
  const ordered = [...variants.entries()].sort(([left],[right]) =>
    left < right ? -1 : left > right ? 1 : 0).map(([,variant]) => variant);
  if (reading.analysis) {
    const analysis = {...reading.analysis};
    return {...reading,analysis:{...analysis,surface:{variants:ordered}}};
  }
  return {...reading,surface:{variants:ordered}};
}

/** Group surface analyses by their complete MeaningGraph without losing parse traces. */
export function distinctReadings(readings) {
  const groups = new Map();
  for (const reading of readings) {
    const meaning = reading.interlingua ?? reading.meaning;
    const key = meaningKey(meaning);
    const former = groups.get(key);
    const traces = surfaceEvidence(reading);
    if (!former) {
      groups.set(key, {reading, traces: new Map(traces.map(trace => [meaningKey(trace), trace]))});
      continue;
    }
    for (const trace of traces) former.traces.set(meaningKey(trace), trace);
    if (representativeOrder(reading, former.reading) < 0) former.reading = reading;
  }
  return [...groups.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, group]) => {
      const hasSurface = Array.isArray(group.reading.surface?.variants) ||
        Array.isArray(group.reading.analysis?.surface?.variants);
      if (group.traces.size < 2 && !hasSurface) return group.reading;
      const representative = stable(group.reading);
      return attachSurface(representative,group.traces);
    });
}

/** Describe uncertainty without changing any source feature or choosing a reading. */
export function describeUncertainties(document, meanings = []) {
  const entries = [];
  const add = (kind, path, options, reason) => entries.push({kind, path, options, reason});
  const leaves = meanings.map(meaning => {
    const found = new Map();
    function visit(value, path) {
      if (value && typeof value === 'object') {
        if (value.kind === 'anaphoric' && value.resolution === 'unresolved') {
          add('missing_information', path, [], 'unresolved-reference');
        }
        for (const name of Object.keys(value).sort()) {
          if (name === 'version') continue;
          visit(value[name], `${path}/${name.replace(/~/gu, '~0').replace(/\//gu, '~1')}`);
        }
      } else {
        found.set(path, value);
        if (value === 'unknown') add('missing_information', path, [], 'source-unspecified');
      }
    }
    visit(meaning, '#');
    return found;
  });
  if (meanings.length > 1) {
    const paths = new Set(leaves.flatMap(leaf => [...leaf.keys()]));
    for (const path of [...paths].sort()) {
      const options = uniqueValues(leaves.map(leaf => leaf.has(path) ? leaf.get(path) : null));
      if (options.length > 1) add('semantic_ambiguity', path, options, 'distinct-source-readings');
    }
  }
  const texts = uniqueValues([document.text, ...(document.alternatives ?? [])]
    .filter(value => typeof value === 'string'));
  const assumptions = (document.informationLoss ?? []).filter(loss => loss.status === 'ambiguous');
  for (const loss of assumptions) {
    add('additional_assumption', loss.path ?? '#', texts, loss.cause);
  }
  if (document.status === 'ok' && texts.length > 1 && assumptions.length === 0) {
    add('equivalent_expression', '#', texts, 'equivalent-target-expression');
  }
  if (document.status === 'unsupported' || document.status === 'resource_limit') {
    add(document.status === 'resource_limit' ? 'search_limit' : 'unsupported', '#', [],
      document.diagnostics?.[0]?.code ?? document.status);
  }
  if (document.diagnostics?.some(item => item.code === 'CONTEXT_CONFLICT')) {
    add('context_conflict', '#', [], 'CONTEXT_CONFLICT');
  }
  return uniqueValues(entries).map((entry, index) => ({id: `u${index + 1}`, ...entry}));
}

export function withUncertainties(document, meanings = document.meaning ? [document.meaning] : []) {
  return {...document, uncertainties: describeUncertainties(document, meanings)};
}

export function translationRefusal(status, code, message, extra = {}) {
  const {diagnostics, ...details} = extra;
  return withUncertainties({...details, status, text: null, meaning: null, interlingua: null,
    interpretations: details.interpretations ?? [], previewId: details.previewId ?? null,
    preview:details.preview??null,
    alternatives: details.alternatives ?? [], informationLoss: details.informationLoss ?? [],
    warnings: details.warnings ?? [],
    diagnostics: diagnostics?.length ? diagnostics : [{code, message}]},
  (details.alternatives ?? []).flatMap(item => item?.meaning ? [item.meaning] : []));
}

export function ambiguousTranslation(readings) {
  return translationRefusal('ambiguous', 'AMBIGUOUS_MEANING',
    `Source has ${readings.length} distinct semantic readings.`,
    {alternatives: readings.map(item => ({meaning: item.interlingua,
      lexicalSenses: item.lexicalSenses, score: item.score,
      ...(item.surface ? {surface:item.surface} : {})}))});
}

/** Unclassified exceptions are infrastructure errors, never controlled refusals. */
export function translationErrorStatus(error) {
  if (domainStatuses.has(error?.status)) return error.status;
  if (isResourceLimitError(error)) return 'resource_limit';
  if (['PLUGIN_NOT_FOUND', 'PLUGIN_CAPABILITY_UNAVAILABLE'].includes(error?.code)) return 'unsupported';
  if (error?.code === 'INVALID_INPUT') return 'invalid';
  return null;
}

export function translationFailure(error) {
  const status = translationErrorStatus(error);
  if (!status) throw error;
  const message = {unsupported: 'The requested translation is unsupported.',
    invalid: 'The request is invalid.', ambiguous: 'The source has multiple possible meanings.',
    resource_limit: 'The request exceeds supported resource limits.'}[status];
  return translationRefusal(status, error.code ?? 'INVALID_INPUT', message,
    error.contextReport ? {contextReport:error.contextReport} : {});
}
