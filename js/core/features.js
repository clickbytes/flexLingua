/**
 * Language-independent feature inventory and non-destructive feature unification.
 * CORE semantic dimensions and language-local syntax are separate inventories.
 */
export const FEATURE_VERSION = '0.4';
export const LANGUAGE_FEATURE_PROFILE_VERSION = '1.0';
export const GRAMMATICAL_PERSON = Object.freeze({
  first: 'first',
  second: 'second',
  third: 'third'
});
const NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/u;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasOwn(object, key) {
  return record(object) && Object.hasOwn(object, key);
}

export function safeName(value) {
  return typeof value === 'string' && NAME.test(value) && !FORBIDDEN.has(value);
}

function featureError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Validate the opt-in, language-local syntax and morphology inventory. */
export function createLanguageFeatureProfile(profile, {language} = {}) {
  if (!record(profile) || Object.keys(profile).sort().join(',') !==
      'language,morphology,syntactic,version' ||
      profile.version !== LANGUAGE_FEATURE_PROFILE_VERSION || !safeName(profile.language) ||
      (language !== undefined && profile.language !== language) ||
      !record(profile.syntactic) || !record(profile.morphology)) {
    throw new Error('Invalid or unsupported language feature profile.');
  }
  for (const [domain, dimensions] of Object.entries({
    syntactic: profile.syntactic,
    morphology: profile.morphology
  })) {
    if (Object.keys(dimensions).length > 32) throw new Error(`Too many ${domain} feature dimensions.`);
    for (const [name, values] of Object.entries(dimensions)) {
      if (!safeName(name) || !Array.isArray(values) || values.length === 0 || values.length > 64 ||
          values.some(value => !safeName(value)) || new Set(values).size !== values.length) {
        throw new Error(`Invalid ${domain} feature dimension: ${name}`);
      }
    }
  }
  return JSON.parse(JSON.stringify(profile));
}

export function createFeatureRegistry(spec, featureProfile) {
  if (!record(spec) || spec.version !== FEATURE_VERSION || !record(spec.domains)) {
    throw new Error('Unsupported or missing feature registry version.');
  }
  for (const domain of ['event', 'participant', 'lexical']) {
    const dimensions = spec.domains[domain];
    if (!record(dimensions) || !Object.keys(dimensions).length) {
      throw new Error(`Missing feature domain: ${domain}`);
    }
    for (const [name, values] of Object.entries(dimensions)) {
      if (!safeName(name) || !Array.isArray(values) || values.length === 0 ||
          values.some(value => !safeName(value)) || new Set(values).size !== values.length) {
        throw new Error(`Invalid feature dimension: ${domain}.${name}`);
      }
    }
  }
  // Older registries may still carry syntax; new CORE registries need not.
  if (hasOwn(spec.domains, 'syntactic')) {
    const dimensions = spec.domains.syntactic;
    if (!record(dimensions) || !Object.keys(dimensions).length ||
        Object.entries(dimensions).some(([name, values]) =>
      !safeName(name) || !Array.isArray(values) || !values.length ||
      values.some(value => !safeName(value)) || new Set(values).size !== values.length)) {
      throw new Error('Invalid syntactic feature inventory.');
    }
  }
  // Copy on input: later edits to caller JSON cannot change a running engine.
  const registry = JSON.parse(JSON.stringify(spec));
  if (featureProfile !== undefined) {
    const profile = createLanguageFeatureProfile(featureProfile);
    // Keep the CORE registry intact. Local syntax is read through featureProfile.
    registry.featureProfile = profile;
  }
  return registry;
}

export function validateFeatureBundle(bundle, dimensions, context) {
  if (!record(bundle) || !record(dimensions)) {
    throw featureError('invalid_feature_bundle', `Invalid ${context} features.`);
  }
  for (const name of Object.keys(bundle)) {
    if (!hasOwn(dimensions, name)) {
      throw featureError('absent_feature_category', `Invalid ${context} features: ${name}`);
    }
  }
  if (Object.keys(bundle).length !== Object.keys(dimensions).length) {
    throw featureError('missing_feature_value', `Invalid ${context} features.`);
  }
  for (const [name, allowed] of Object.entries(dimensions)) {
    if (!hasOwn(bundle, name)) {
      throw featureError('missing_feature_value', `Invalid ${context} feature: ${name}`);
    }
    if (!allowed.includes(bundle[name])) {
      throw featureError('unknown_feature_value', `Invalid ${context} feature: ${name}`);
    }
  }
  return bundle;
}

/** Returns a fresh unified object or null if a concrete value conflicts. */
export function unifyFeatures(left, right) {
  if (!record(left) || !record(right)) throw new Error('Feature structures must be objects.');
  const result = { ...left };
  for (const [name, value] of Object.entries(right)) {
    if (!safeName(name)) throw new Error(`Unsafe feature key: ${name}`);
    if (hasOwn(result, name) && result[name] !== value) return null;
    result[name] = value;
  }
  return result;
}

/** Safe feature dependencies; nonstandard roots are enabled by a construction's role inventory. */
export function featureSource(source, featureProfile, controllers = []) {
  if (typeof source !== 'string') throw new Error('Invalid feature dependency.');
  const path = source.split('.');
  if (path.length !== 2 || !safeName(path[0]) || !safeName(path[1]) ||
      (!['subject','event'].includes(path[0]) &&
        (!Array.isArray(controllers) || !controllers.includes(path[0])))) {
    throw new Error(`Invalid feature dependency: ${source}`);
  }
  if (featureProfile !== undefined && path[1] === 'case') {
    const profile = createLanguageFeatureProfile(featureProfile);
    if (!hasOwn(profile.syntactic, 'case')) {
      throw featureError('absent_feature_category', 'Language profile has no syntactic case category.');
    }
  }
  return path;
}

export function valueAt(context, source) {
  const [root, key] = featureSource(source,undefined,Object.keys(context||{}));
  return hasOwn(context[root], key) ? context[root][key] : undefined;
}

/** Conditions are exact; missing values never count as matches. */
export function matchesConditions(context, conditions = {}) {
  return Object.entries(conditions).every(([source, expected]) => valueAt(context, source) === expected);
}

/** Maps form placeholders to values from the subject/event feature context. */
export function matchesAgreement(bindings, dependencies, context) {
  const actual = {};
  const expected = {};
  for (const [name, value] of Object.entries(bindings)) {
    if (!hasOwn(dependencies, name)) return false;
    const target = valueAt(context, dependencies[name]);
    if (target === undefined) return false;
    actual[name] = value;
    expected[name] = target;
  }
  return unifyFeatures(actual, expected) !== null;
}
