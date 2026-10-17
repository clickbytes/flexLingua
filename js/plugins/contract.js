import {PluginError} from './errors.js';

export const LANGUAGE_PLUGIN_CONTRACT_VERSION = '1.0';
export const PLUGIN_RESULT_STATUSES = Object.freeze([
  'ok', 'ambiguous', 'unsupported', 'invalid', 'resource_limit'
]);

const LANGUAGE_CODE = /^[a-z]{2,8}$/u;
const VERSION = /^\d+(?:\.\d+){0,2}$/u;
const SYMBOL = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const CHANNEL_OPERATIONS = Object.freeze({
  sentence: new Set(['analyze', 'realize']),
  morphology: new Set(['generate', 'analyze', 'paradigm', 'availability']),
  lexicon: new Set(['lookup']),
  signal: new Set(['decode', 'encode'])
});
const PLUGIN_KEYS = [
  'contractVersion', 'code', 'describe', 'capabilities', 'analyze', 'realize',
  'morphology', 'lexicon', 'signal'
];
const REQUIRED_PLUGIN_KEYS = ['contractVersion', 'code', 'describe', 'capabilities'];
const MORPHOLOGY_METHODS = ['generate', 'analyze', 'paradigm', 'availability'];
const MAX_CAPABILITIES = 512;
const MAX_EVIDENCE = 32;
const MAX_DIAGNOSTICS = 64;
const MAX_READINGS = 32;
const MAX_ALTERNATIVES = 32;

const isRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const owns = (value, key) => Object.hasOwn(value, key);
const hasExactKeys = (value, required, optional = []) => isRecord(value) &&
  required.every(key => owns(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function invalid(message, cause) {
  fail('PLUGIN_INVALID', message, cause);
}

function invalidResult(message) {
  fail('PLUGIN_RESULT_INVALID', message);
}

function syncCall(fn, name) {
  let result;
  try {
    result = fn();
  } catch (error) {
    invalid(`Plugin ${name}() failed validation.`, error);
  }
  if (result && (typeof result === 'object' || typeof result === 'function') &&
      typeof result.then === 'function') {
    invalid(`Plugin ${name}() must be synchronous.`);
  }
  return result;
}

/** Validate the serializable identity returned by LanguagePlugin.describe(). */
export function validatePluginDescription(description, expectedLanguage) {
  if (!hasExactKeys(description, ['language', 'version']) ||
      typeof description.language !== 'string' || !LANGUAGE_CODE.test(description.language) ||
      typeof description.version !== 'string' || !VERSION.test(description.version)) {
    invalid('Plugin description must contain a valid language and version.');
  }
  if (expectedLanguage !== undefined && description.language !== expectedLanguage) {
    invalid('Plugin description language does not match its code.');
  }
  return {language: description.language, version: description.version};
}

/** Validate one construction-level capability declaration and its review evidence. */
export function validateCapability(capability) {
  if (!hasExactKeys(capability,
      ['operation', 'channel', 'construction', 'status', 'evidence']) ||
      typeof capability.channel !== 'string' ||
      !owns(CHANNEL_OPERATIONS, capability.channel) ||
      typeof capability.operation !== 'string' ||
      !CHANNEL_OPERATIONS[capability.channel].has(capability.operation) ||
      typeof capability.construction !== 'string' ||
      !SYMBOL.test(capability.construction) || capability.construction === 'all' ||
      !['implemented', 'unsupported'].includes(capability.status) ||
      !Array.isArray(capability.evidence) || capability.evidence.length < 1 ||
      capability.evidence.length > MAX_EVIDENCE) {
    invalid('Invalid plugin capability declaration.');
  }

  const evidence = [];
  const seenEvidence = new Set();
  for (const item of Array.from(capability.evidence)) {
    if (!hasExactKeys(item, ['kind', 'id']) ||
        !['manual-sentence', 'manual-refusal'].includes(item.kind) ||
        typeof item.id !== 'string' || !SYMBOL.test(item.id)) {
      invalid('Plugin capability evidence must have a valid kind and stable ID.');
    }
    const key = `${item.kind}\u0000${item.id}`;
    if (seenEvidence.has(key)) invalid('Duplicate plugin capability evidence ID.');
    seenEvidence.add(key);
    evidence.push({kind: item.kind, id: item.id});
  }
  const expectedEvidenceKind = capability.status === 'implemented'
    ? 'manual-sentence' : 'manual-refusal';
  if (!evidence.some(item => item.kind === expectedEvidenceKind)) {
    invalid(`Capability status ${capability.status} requires ${expectedEvidenceKind} evidence.`);
  }
  return {
    operation: capability.operation,
    channel: capability.channel,
    construction: capability.construction,
    status: capability.status,
    evidence
  };
}

/** Validate a LanguagePlugin before registration; returns its checked description. */
export function validateLanguagePlugin(plugin) {
  if (!hasExactKeys(plugin, REQUIRED_PLUGIN_KEYS,
      PLUGIN_KEYS.filter(key => !REQUIRED_PLUGIN_KEYS.includes(key)))) {
    invalid('Invalid LanguagePlugin object or unknown plugin field.');
  }
  if (plugin.contractVersion !== LANGUAGE_PLUGIN_CONTRACT_VERSION) {
    fail('PLUGIN_VERSION_UNSUPPORTED', 'Unsupported LanguagePlugin contract version.');
  }
  if (typeof plugin.code !== 'string' || !LANGUAGE_CODE.test(plugin.code) ||
      typeof plugin.describe !== 'function' || typeof plugin.capabilities !== 'function') {
    invalid('LanguagePlugin requires a valid code, describe(), and capabilities().');
  }

  for (const name of ['analyze', 'realize']) {
    if (owns(plugin, name) && typeof plugin[name] !== 'function') {
      invalid(`LanguagePlugin ${name} must be a function when provided.`);
    }
  }
  for (const name of ['lexicon', 'signal']) {
    if (owns(plugin, name) && (!isRecord(plugin[name]) || !Object.keys(plugin[name]).length)) {
      invalid(`LanguagePlugin ${name} provider must be a non-empty object.`);
    }
  }

  const description = validatePluginDescription(
    syncCall(() => plugin.describe(), 'describe'), plugin.code);
  const rawCapabilities = syncCall(() => plugin.capabilities(), 'capabilities');
  if (!Array.isArray(rawCapabilities) || rawCapabilities.length < 1 ||
      rawCapabilities.length > MAX_CAPABILITIES) {
    invalid(`Plugin capabilities() must return 1 to ${MAX_CAPABILITIES} declarations.`);
  }
  const capabilities = Array.from(rawCapabilities, validateCapability);
  const seen = new Set();
  for (const capability of capabilities) {
    const key = `${capability.channel}\u0000${capability.operation}\u0000${capability.construction}`;
    if (seen.has(key)) invalid('Duplicate plugin capability declaration.');
    seen.add(key);
  }

  for (const operation of ['analyze', 'realize']) {
    const rows = capabilities.filter(item => item.channel === 'sentence' &&
      item.operation === operation);
    const implemented = rows.some(item => item.status === 'implemented');
    if (implemented && typeof plugin[operation] !== 'function') {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Plugin declares implemented sentence ${operation} without a provider.`);
    }
    if (!rows.length && typeof plugin[operation] === 'function') {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Plugin provides sentence ${operation} without a capability declaration.`);
    }
  }

  const morphologyRows = capabilities.filter(item => item.channel === 'morphology');
  const morphologyImplemented = morphologyRows.some(item => item.status === 'implemented');
  if (morphologyImplemented && !owns(plugin, 'morphology')) {
    fail('PLUGIN_CAPABILITY_UNAVAILABLE',
      'Plugin declares implemented morphology without a morphology provider.');
  }
  if (owns(plugin, 'morphology')) {
    const provider = plugin.morphology;
    if (!isRecord(provider) || !hasExactKeys(provider, MORPHOLOGY_METHODS) ||
        MORPHOLOGY_METHODS.some(method => typeof provider[method] !== 'function')) {
      invalid('Morphology provider requires generate(), analyze(), paradigm(), and availability().');
    }
    if (!morphologyRows.length) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        'Plugin provides morphology without a morphology capability declaration.');
    }
  }

  return description;
}

function validateDiagnosticList(diagnostics, resultName) {
  if (!Array.isArray(diagnostics) || diagnostics.length > MAX_DIAGNOSTICS) {
    invalidResult(`${resultName} diagnostics must be an array of at most ${MAX_DIAGNOSTICS} items.`);
  }
  return Array.from(diagnostics, item => {
    if (!hasExactKeys(item, ['code', 'message']) ||
        typeof item.code !== 'string' || !DIAGNOSTIC_CODE.test(item.code) ||
        typeof item.message !== 'string' || !item.message.trim() || item.message.length > 1024) {
      invalidResult(`${resultName} diagnostic requires a stable code and message.`);
    }
    return {code: item.code, message: item.message};
  });
}

function validateStringList(value, name, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    invalidResult(`${name} must be an array of at most ${maximum} strings.`);
  }
  const values = Array.from(value);
  if (values.some(item => typeof item !== 'string' || !item.trim() || item.length > 4096)) {
    invalidResult(`${name} contains an invalid string.`);
  }
  if (new Set(values).size !== values.length) invalidResult(`${name} contains duplicates.`);
  return values;
}

/** Validate and normalize the single public analysis result shape. */
export function normalizeAnalysisResult(result) {
  if (!hasExactKeys(result, ['status', 'readings', 'diagnostics']) ||
      !PLUGIN_RESULT_STATUSES.includes(result.status) || !Array.isArray(result.readings) ||
      result.readings.length > MAX_READINGS) {
    invalidResult('Invalid language analysis result shape or status.');
  }
  const diagnostics = validateDiagnosticList(result.diagnostics, 'Analysis');
  const readings = Array.from(result.readings, reading => {
    if (!hasExactKeys(reading, ['meaning'], ['analysis']) || !isRecord(reading.meaning) ||
        (owns(reading, 'analysis') && !isRecord(reading.analysis))) {
      invalidResult('Analysis readings require an object meaning and optional object analysis.');
    }
    const normalized = {meaning: reading.meaning};
    if (owns(reading, 'analysis')) normalized.analysis = reading.analysis;
    return normalized;
  });

  if (result.status === 'ok' && readings.length < 1) {
    invalidResult('Successful analysis must contain at least one reading.');
  }
  if (result.status === 'ambiguous' && readings.length < 2) {
    invalidResult('Ambiguous analysis must contain at least two readings.');
  }
  if (result.status !== 'ok' && (!diagnostics.length ||
      (result.status !== 'ambiguous' && readings.length !== 0))) {
    invalidResult('Analysis refusal must include diagnostics and no successful readings.');
  }
  if (result.status === 'ambiguous' && !diagnostics.length) {
    invalidResult('Ambiguous analysis must include diagnostics.');
  }
  return {status: result.status, readings, diagnostics};
}

function validateInformationLoss(value) {
  if (!Array.isArray(value) || value.length > MAX_DIAGNOSTICS) {
    invalidResult('informationLoss must be a bounded array.');
  }
  return Array.from(value, item => {
    if (!hasExactKeys(item, ['cause', 'feature', 'path', 'status']) ||
        typeof item.cause !== 'string' || !item.cause.trim() ||
        typeof item.feature !== 'string' || !item.feature.trim() ||
        typeof item.path !== 'string' || !item.path.startsWith('#/') ||
        !['unavoidable', 'unsupported', 'ambiguous'].includes(item.status)) {
      invalidResult('Invalid information-loss entry.');
    }
    return {cause: item.cause, feature: item.feature, path: item.path, status: item.status};
  });
}

/** Validate and normalize the single public realization result shape. */
export function normalizeRealizationResult(result) {
  if (!hasExactKeys(result, ['status', 'diagnostics'],
      ['text', 'alternatives', 'warnings', 'informationLoss']) ||
      !PLUGIN_RESULT_STATUSES.includes(result.status) ||
      (owns(result, 'text') && result.text !== null && typeof result.text !== 'string')) {
    invalidResult('Invalid language realization result shape or status.');
  }
  const diagnostics = validateDiagnosticList(result.diagnostics, 'Realization');
  const alternatives = validateStringList(
    owns(result, 'alternatives') ? result.alternatives : [], 'alternatives', MAX_ALTERNATIVES);
  const warnings = validateStringList(
    owns(result, 'warnings') ? result.warnings : [], 'warnings', MAX_DIAGNOSTICS);
  const informationLoss = validateInformationLoss(
    owns(result, 'informationLoss') ? result.informationLoss : []);
  let text = result.text ?? null;

  if (result.status === 'ok') {
    if (typeof text !== 'string' || !text.trim() || text.length > 4096) {
      invalidResult('Successful realization must contain non-empty text.');
    }
    if (alternatives.includes(text)) invalidResult('Primary realization is duplicated as an alternative.');
  } else {
    if (text !== null || !diagnostics.length) {
      invalidResult('Realization refusal must not contain text and must include diagnostics.');
    }
    if (result.status === 'ambiguous' && alternatives.length < 2) {
      invalidResult('Ambiguous realization must include at least two alternatives.');
    }
    if (result.status !== 'ambiguous' && alternatives.length) {
      invalidResult('Only ambiguous realization may include alternatives.');
    }
    if (warnings.length || informationLoss.length) {
      invalidResult('Refusal results cannot claim successful warnings or information transfer.');
    }
  }
  return {status: result.status, text, alternatives, warnings, informationLoss, diagnostics};
}
