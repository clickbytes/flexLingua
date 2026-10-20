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
const MAX_READING_EVIDENCE = 32;

function surfaceEvidence(reading) {
  const existing = reading.surfaceVariants ?? reading.surface?.variants ??
    reading.analysis?.surface?.variants;
  return Array.isArray(existing) ? existing : [];
}

function readingEvidence(reading) {
  const existing = reading.evidence ?? reading.analysis?.evidence;
  if (Array.isArray(existing)) return existing;
  const variants = surfaceEvidence(reading);
  const values = variants.length ? variants : [null];
  return values.map(surfaceVariant => ({
    lexicalSenses:reading.lexicalSenses ?? reading.analysis?.lexicalSenses ?? {},
    score:reading.score ?? reading.analysis?.score ?? 0,
    transferSourceId:reading.transferSourceId ?? reading.analysis?.transfer?.construction ?? null,
    sourceSegments:reading.sourceSegments ?? reading.analysis?.sourceSegments ?? [],
    ...(surfaceVariant ? {surfaceVariant} : {})
  }));
}

function mergeEvidence(target, evidence) {
  for (const item of evidence) {
    target.set(meaningKey(item),stable(item));
    if (target.size > MAX_READING_EVIDENCE) {
      throw Object.assign(new Error('Distinct reading evidence exceeds its limit.'),
        {code:'READING_EVIDENCE_LIMIT',status:'resource_limit'});
    }
  }
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

function attachEvidence(reading, evidence) {
  if (evidence.size < 2) return reading;
  const ordered = [...evidence.entries()].sort(([left],[right]) =>
    left < right ? -1 : left > right ? 1 : 0).map(([,item]) => item);
  if (reading.analysis) return {...reading,analysis:{...reading.analysis,evidence:ordered}};
  return {...reading,evidence:ordered};
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
      const evidence=new Map();
      mergeEvidence(evidence,readingEvidence(reading));
      groups.set(key, {reading, traces: new Map(traces.map(trace => [meaningKey(trace), trace])),
        evidence});
      continue;
    }
    for (const trace of traces) former.traces.set(meaningKey(trace), trace);
    mergeEvidence(former.evidence,readingEvidence(reading));
    if (representativeOrder(reading, former.reading) < 0) former.reading = reading;
  }
  return [...groups.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, group]) => {
      const hasSurface = Array.isArray(group.reading.surface?.variants) ||
        Array.isArray(group.reading.analysis?.surface?.variants);
      if (group.traces.size < 2 && !hasSurface) return attachEvidence(group.reading,group.evidence);
      const representative = stable(group.reading);
      return attachEvidence(attachSurface(representative,group.traces),group.evidence);
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
  const explicit=document.assumptions??document.realizations?.find(row=>
    row.text===document.text)?.assumptions??[];
  const assumptionMap=new Map();
  const include=(path,feature,reason)=>assumptionMap.set(JSON.stringify([path,feature,reason]),
    {path,feature,reason});
  for (const loss of document.informationLoss ?? []) {
    if(loss.status==='ambiguous')include(loss.path,loss.feature,loss.cause);
  }
  for (const item of explicit)include(item.path,item.feature,item.reason);
  const assumptions=[...assumptionMap.values()];
  for (const assumption of assumptions) {
    add('additional_assumption', assumption.path ?? '#', texts, assumption.reason);
  }
  if (document.status === 'ok' && texts.length > 1 && assumptions.length === 0) {
    add('equivalent_expression', '#', texts, 'equivalent-target-expression');
  }
  if (document.status === 'unsupported' || document.status === 'resource_limit') {
    add(document.status === 'resource_limit' ? 'search_limit' : 'unsupported', '#', [],
      document.diagnostics?.[0]?.code ?? document.status);
  }
  if (document.diagnostics?.some(item=>item.code==='SOURCE_ANALYSIS_INCOMPLETE')) {
    add('unsupported','#',[],'SOURCE_ANALYSIS_INCOMPLETE');
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
      ...(item.evidence?.length > 1 ? {evidence:item.evidence} : {}),
      ...(item.surface ? {surface:item.surface} : {})}))});
}

/** A reading set is not complete when the plugin reported unsupported alternatives. */
export function hasIncompleteAnalysis(readings) {
  return readings.some(item => item.incompleteDiagnostics?.length > 0);
}

/** A supported preview may coexist with an unsupported source reading. */
export function incompleteTranslation(readings) {
  const evidence=[...new Map(readings.flatMap(item=>item.incompleteDiagnostics||[])
    .map(item=>[`${item.code}:${item.message}`,item])).values()].slice(0,63);
  return translationRefusal('ambiguous','SOURCE_ANALYSIS_INCOMPLETE',
    'Source analysis is incomplete; a supported reading is available as a preview.',
    {diagnostics:[{code:'SOURCE_ANALYSIS_INCOMPLETE',
      message:'Source analysis is incomplete; an unsupported alternative reading remains.'},
    ...evidence],alternatives:readings.map(item=>({meaning:item.interlingua,
      lexicalSenses:item.lexicalSenses,score:item.score,
      ...(item.evidence?.length > 1 ? {evidence:item.evidence} : {}),
      ...(item.surface?{surface:item.surface}:{})}))});
}

/** Unclassified exceptions are infrastructure errors, never controlled refusals. */
export function translationErrorStatus(error) {
  if (domainStatuses.has(error?.status)) return error.status;
  return null;
}

export function translationFailure(error) {
  const status = translationErrorStatus(error);
  if (!status) throw error;
  const message = {unsupported: 'The requested translation is unsupported.',
    invalid: 'The request is invalid.', ambiguous: 'The source has multiple possible meanings.',
    resource_limit: 'The request exceeds supported resource limits.'}[status];
  return translationRefusal(status, error.code ?? 'INVALID_INPUT', message,
    {...(error.contextReport ? {contextReport:error.contextReport} : {}),
      ...(failureDiagnostics(error) ? {diagnostics:failureDiagnostics(error)} : {})});
}

/** Keep validated domain diagnostics across the failure boundary: stable
 * {code,message} pairs in source order, bounded, with no stack or cause data. */
const FAILURE_DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const MAX_FAILURE_DIAGNOSTICS = 64;
function failureDiagnostics(error) {
  const value = error?.diagnostics;
  if (!Array.isArray(value)) return undefined;
  const diagnostics = value.slice(0, MAX_FAILURE_DIAGNOSTICS)
    .filter(item => item && typeof item === 'object' && !Array.isArray(item) &&
        typeof item.code === 'string' && FAILURE_DIAGNOSTIC_CODE.test(item.code) &&
        typeof item.message === 'string' && item.message.trim() && item.message.length <= 1024)
    .map(item => ({code: item.code, message: item.message}));
  return diagnostics.length ? diagnostics : undefined;
}
