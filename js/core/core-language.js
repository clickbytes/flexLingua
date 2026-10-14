import { createOntology } from './ontology.js';
import { record, hasOwn, safeName } from './features.js';

export const CORE_LANGUAGE_VERSION = '1.01';
export const CORE_REFERENCE_KINDS = Object.freeze(['concept', 'operator', 'grammaticalFunction']);
const CORE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/u;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function validId(id) {
  return typeof id === 'string' && id.length <= 100 && CORE_ID.test(id) &&
    id.split('.').every(segment => safeName(segment) && !FORBIDDEN.has(segment));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function readInventory(spec, name) {
  const input = spec[name] || {};
  if (!record(input) || Object.keys(input).length > 5000) throw new Error(`Invalid CORE ${name} registry.`);
  const result = Object.create(null);
  for (const [id, entry] of Object.entries(input)) {
    if (!validId(id) || !record(entry) || typeof entry.label !== 'string' ||
        !entry.label.trim() || entry.label.length > 256 ||
        (entry.arity !== undefined && (!Number.isSafeInteger(entry.arity) || entry.arity < 0 || entry.arity > 8)) || Object.keys(entry).some(key => !safeName(key))) {
      throw new Error(`Invalid CORE ${name} entry: ${id}`);
    }
    if (entry.parameters !== undefined) {
      if (!record(entry.parameters) || name !== 'operators') throw new Error(`Invalid CORE parameters: ${id}`);
      for (const [key, constraint] of Object.entries(entry.parameters)) {
        if (!safeName(key) || !record(constraint) || constraint.type !== 'integer' ||
            !Number.isSafeInteger(constraint.min) || !Number.isSafeInteger(constraint.max) ||
            constraint.min > constraint.max) throw new Error(`Invalid CORE parameter definition: ${id}.${key}`);
      }
    }
    result[id] = JSON.parse(JSON.stringify(entry));
  }
  return deepFreeze(result);
}

/** A machine-readable CORE language: concepts, semantic operators and grammatical functions. */
export function createCoreLanguage(spec) {
  const ontology = createOntology(spec);
  const operators = readInventory(spec, 'operators');
  const grammaticalFunctions = readInventory(spec, 'grammaticalFunctions');
  const registries = { operator: operators, grammaticalFunction: grammaticalFunctions };

  function resolve(ref) {
    if (!record(ref) || !CORE_REFERENCE_KINDS.includes(ref.kind) || !validId(ref.id) ||
        Object.keys(ref).some(key => !['kind','id','parameters'].includes(key))) {
      throw new Error('Invalid CORE reference.');
    }
    const value = ref.kind === 'concept' ? ontology.get(ref.id) : registries[ref.kind][ref.id];
    if (!value) throw new Error(`Unknown CORE reference: ${ref.kind}:${ref.id}`);
    const definitions = ref.kind === 'operator' ? value.parameters || {} : {};
    const values = ref.parameters || {};
    if (!record(values) || Object.keys(values).length !== Object.keys(definitions).length ||
        Object.keys(values).some(key => !hasOwn(definitions,key)) ||
        Object.entries(definitions).some(([key, definition]) =>
          !Number.isSafeInteger(values[key]) || values[key] < definition.min || values[key] > definition.max)) {
      throw new Error(`Invalid CORE reference parameters: ${ref.kind}:${ref.id}`);
    }
    return value;
  }

  /** Stable, machine-readable CORE references, not translations of labels. */
  function reference(kind, id, parameters) {
    const ref = parameters === undefined ? { kind, id } : { kind, id, parameters };
    resolve(ref);
    return deepFreeze(structuredClone(ref));
  }

  return Object.freeze({
    code: 'core', version: CORE_LANGUAGE_VERSION, ontology,
    operators, grammaticalFunctions, resolve, reference,
    list: kind => kind === 'concept' ? Object.keys(ontology.concepts) :
      kind === 'operator' ? Object.keys(operators) :
      kind === 'grammaticalFunction' ? Object.keys(grammaticalFunctions) :
      (() => { throw new Error(`Unsupported CORE kind: ${kind}`); })()
  });
}
