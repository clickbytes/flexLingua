import { record, hasOwn, safeName, createLanguageFeatureProfile } from '../features.js';

/** Morphological features are flat in one paradigm slot, and may be nested in requests. */
export const MORPH_FEATURE_VERSION = '1.02';
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const VALID_VALUE = v => typeof v === 'string' && safeName(v) || Number.isSafeInteger(v);

function featureError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createMorphFeatureRegistry(data, featureProfile) {
  const profile = featureProfile === undefined ? undefined : createLanguageFeatureProfile(featureProfile);
  const sourceDimensions = profile ? profile.morphology : data?.dimensions;
  if (!record(data) || data.version !== MORPH_FEATURE_VERSION || !record(data.dimensions) ||
      !record(sourceDimensions) || (!profile && Object.keys(data.dimensions).length < 4)) {
    throw new Error('Invalid morphology feature registry.');
  }
  for (const [key, domain] of Object.entries(sourceDimensions)) {
    if (!safeName(key) || !Array.isArray(domain) || !domain.length ||
        new Set(domain.map(String)).size !== domain.length || !domain.every(VALID_VALUE)) {
      throw new Error(`Invalid morphology dimension ${key}.`);
    }
  }
  const dimensions = structuredClone(sourceDimensions);
  const supports = (features, {partial = false} = {}) => {
    if (!record(features)) throw new Error('Morphological features must be an object.');
    for (const [key, value] of Object.entries(features)) {
      if (!hasOwn(dimensions,key)) {
        throw featureError('absent_feature_category', `Unsupported morphology feature ${key}:${value}.`);
      }
      if (!VALID_VALUE(value)) {
        throw featureError('invalid_feature_value', `Unsupported morphology feature ${key}:${value}.`);
      }
      if (!dimensions[key].includes(value)) {
        throw featureError('unknown_feature_value', `Unsupported morphology feature ${key}:${value}.`);
      }
    }
    return true;
  };
  return Object.freeze({ version:MORPH_FEATURE_VERSION, dimensions, supports,
    ...(profile ? {featureProfile:profile} : {}),
    unify(left,right) {
      supports(left); supports(right);
      const result = {...left};
      for (const [key,value] of Object.entries(right)) {
        if (hasOwn(result,key) && result[key] !== value) return null;
        result[key] = value;
      }
      return result;
    }
  });
}

/** Flatten limited hierarchical subject/object/possessor agreement without discarding its controller. */
export function flattenMorphFeatures(input, registry) {
  if (!record(input)) throw new Error('Invalid morphology feature bundle.');
  const flat = {};
  const assign = (key, value) => {
    if (hasOwn(flat,key)) {
      if (flat[key] !== value) throw featureError('invalid_combination', `Conflicting morphology feature ${key}.`);
      return;
    }
    flat[key] = value;
  };
  for (const [key,value] of Object.entries(input)) {
    if (FORBIDDEN.has(key)) throw featureError('invalid_feature_value', 'Unsafe morphology feature path.');
    if (['subject','object','possessor'].includes(key) && record(value)) {
      for (const [dimension,answer] of Object.entries(value)) {
        if (!safeName(dimension)) throw featureError('invalid_feature_value', 'Unsafe agreement dimension.');
        assign(`${key}_${dimension}`,answer);
      }
    } else if (record(value)) throw featureError('invalid_feature_value', 'Unsupported nested morphology feature structure.');
    else assign(key,value);
  }
  registry.supports(flat);
  return flat;
}
