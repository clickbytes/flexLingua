import {isResourceLimitError} from './errors.js';

const domainStatuses = new Set(['unsupported', 'invalid', 'ambiguous', 'resource_limit']);
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const keyOf = value => JSON.stringify(stable(value));
const uniqueValues = values => [...new Map(values.map(value => [keyOf(value), value]))]
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);

/** Lexical analyses of the same MeaningGraph are not different meanings. */
export function distinctReadings(readings) {
  const seen = new Set();
  return readings.filter(reading => {
    const key = keyOf(reading.interlingua);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
    interpretations: details.interpretations ?? [], previewId: null,
    alternatives: details.alternatives ?? [], informationLoss: details.informationLoss ?? [],
    warnings: details.warnings ?? [],
    diagnostics: diagnostics?.length ? diagnostics : [{code, message}]},
  (details.alternatives ?? []).flatMap(item => item?.meaning ? [item.meaning] : []));
}

export function ambiguousTranslation(readings) {
  return translationRefusal('ambiguous', 'AMBIGUOUS_MEANING',
    `Source has ${readings.length} distinct semantic readings.`,
    {alternatives: readings.map(item => ({meaning: item.interlingua,
      lexicalSenses: item.lexicalSenses, score: item.score}))});
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
