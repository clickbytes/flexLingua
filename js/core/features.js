/**
 * Language-independent feature inventory and non-destructive feature unification.
 * Semantic dimensions are declared in data/features.json, not in a language adapter.
 */
export const FEATURE_VERSION = '0.3';
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

export function createFeatureRegistry(spec) {
  if (!record(spec) || spec.version !== FEATURE_VERSION || !record(spec.domains)) {
    throw new Error('Unsupported or missing feature registry version.');
  }
  for (const domain of ['event', 'participant', 'lexical', 'syntactic']) {
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
  // Copy on input: later edits to the caller's JSON cannot change a running engine.
  return JSON.parse(JSON.stringify(spec));
}

export function validateFeatureBundle(bundle, dimensions, context) {
  if (!record(bundle) || Object.keys(bundle).length !== Object.keys(dimensions).length) {
    throw new Error(`Invalid ${context} features.`);
  }
  for (const [name, allowed] of Object.entries(dimensions)) {
    if (!hasOwn(bundle, name) || !allowed.includes(bundle[name])) {
      throw new Error(`Invalid ${context} feature: ${name}`);
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

/** Safe, bounded feature dependencies such as subject.number or event.polarity. */
export function featureSource(source) {
  if (typeof source !== 'string') throw new Error('Invalid feature dependency.');
  const path = source.split('.');
  if (path.length !== 2 || !['subject', 'event'].includes(path[0]) || !safeName(path[1])) {
    throw new Error(`Invalid feature dependency: ${source}`);
  }
  return path;
}

export function valueAt(context, source) {
  const [root, key] = featureSource(source);
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
