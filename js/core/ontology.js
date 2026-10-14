import { record, safeName, hasOwn } from './features.js';

export const ONTOLOGY_VERSION = '0.5';
const CONCEPT_ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/u;
const KINDS = new Set(['category', 'entity', 'event', 'property', 'degree']);
const MAX_CONCEPTS = 10000;

function validConceptId(id) {
  return typeof id === 'string' && id.length <= 100 && CONCEPT_ID.test(id) &&
    !id.split('.').some(segment => !safeName(segment));
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) freezeDeep(inner);
    Object.freeze(value);
  }
  return value;
}

/** Validated, language-neutral semantic taxonomy and typed relations. */
export class Ontology {
  constructor(spec) {
    if (!record(spec) || !['0.1', '0.4', ONTOLOGY_VERSION, '1.0'].includes(spec.version) ||
        !record(spec.concepts) || !Object.keys(spec.concepts).length ||
        Object.keys(spec.concepts).length > MAX_CONCEPTS) {
      throw new Error('Invalid ontology schema or version.');
    }
    const source = JSON.parse(JSON.stringify(spec.concepts));
    for (const [id, concept] of Object.entries(source)) {
      if (!validConceptId(id) || !record(concept) || !KINDS.has(concept.type)) {
        throw new Error(`Invalid ontology concept: ${id}`);
      }
      if (['property', 'degree'].includes(concept.type)) {
        const targets = concept.appliesTo;
        if (!Array.isArray(targets) || !targets.length ||
            targets.some(t => !['entity', 'property', 'degree'].includes(t)) ||
            new Set(targets).size !== targets.length) {
          throw new Error(`Invalid modifier applicability in ${id}`);
        }
      } else if (concept.appliesTo !== undefined) {
        throw new Error(`Unexpected modifier applicability in ${id}`);
      }
      if (concept.parent !== undefined && !validConceptId(concept.parent)) {
        throw new Error(`Invalid ontology parent for ${id}`);
      }
      if (concept.roles !== undefined && (!Array.isArray(concept.roles) ||
          !concept.roles.every(safeName) || new Set(concept.roles).size !== concept.roles.length)) {
        throw new Error(`Invalid semantic roles for ${id}`);
      }
      if (concept.roleTypes !== undefined && (!record(concept.roleTypes) ||
          Object.entries(concept.roleTypes).some(([role, type]) => !safeName(role) || !validConceptId(type)))) {
        throw new Error(`Invalid semantic role types for ${id}`);
      }
      if (concept.relations !== undefined && !record(concept.relations)) {
        throw new Error(`Invalid semantic relations for ${id}`);
      }
    }
    const states = new Map();
    const normalized = Object.create(null);
    const resolve = id => {
      if (!hasOwn(source, id)) throw new Error(`Unknown ontology concept: ${id}`);
      if (states.get(id) === 1) throw new Error(`Ontology parent cycle at ${id}`);
      if (states.get(id) === 2) return normalized[id];
      states.set(id, 1);
      const current = source[id];
      const base = current.parent === undefined ? null : resolve(current.parent);
      if (base && ((current.type === 'category' && base.type !== 'category') ||
        (current.type === 'event' && base.type !== 'event') ||
        (current.type === 'entity' && !['entity', 'category'].includes(base.type)) ||
        (['property', 'degree'].includes(current.type) && base.type !== current.type))) {
        throw new Error(`Invalid ontology inheritance: ${id} → ${current.parent}`);
      }
      const roles = current.type === 'event' ? [...new Set([...(base?.roles || []), ...(current.roles || [])])] : undefined;
      if (current.type === 'event' && (!roles || roles.length === 0)) {
        throw new Error(`Event ${id} must declare or inherit semantic roles.`);
      }
      const roleTypes = current.type === 'event' ? { ...(base?.roleTypes || {}), ...(current.roleTypes || {}) } : undefined;
      if (current.type === 'event' && Object.keys(roleTypes).some(role => !roles.includes(role))) {
        throw new Error(`Unknown semantic role type in ${id}`);
      }
      normalized[id] = { ...current, ...(roles ? { roles, roleTypes } : {}) };
      states.set(id, 2);
      return normalized[id];
    };
    for (const id of Object.keys(source)) resolve(id);
    this.concepts = freezeDeep(normalized);

    this.relationTypes = freezeDeep(JSON.parse(JSON.stringify(spec.relationTypes || {})));
    for (const [relation, definition] of Object.entries(this.relationTypes)) {
      if (!safeName(relation) || !record(definition) ||
          !validConceptId(definition.subject) || !validConceptId(definition.object) ||
          typeof definition.symmetric !== 'boolean' ||
          !hasOwn(this.concepts, definition.subject) || !hasOwn(this.concepts, definition.object)) {
        throw new Error(`Invalid relation type: ${relation}`);
      }
    }
    for (const [id, concept] of Object.entries(this.concepts)) {
      const parent = concept.parent ? this.get(concept.parent) : undefined;
      if (concept.type === 'event' && parent?.type === 'event') {
        for (const [role, constraint] of Object.entries(parent.roleTypes || {})) {
          if (!this.isA(concept.roleTypes[role], constraint)) {
            throw new Error(`Inherited role type was broadened in ${id}: ${role}`);
          }
        }
      }
      for (const target of Object.values(concept.roleTypes || {})) {
        if (!hasOwn(this.concepts, target) || !['entity', 'category'].includes(this.concepts[target].type)) {
          throw new Error(`Unknown role type ${target} in ${id}`);
        }
      }
      for (const [relation, targets] of Object.entries(concept.relations || {})) {
        const definition = this.relationTypes[relation];
        if (!definition || !Array.isArray(targets) || !targets.length ||
            new Set(targets).size !== targets.length || !this.isA(id, definition.subject)) {
          throw new Error(`Invalid ontology relation ${relation} in ${id}`);
        }
        for (const target of targets) {
          if (!validConceptId(target) || !this.isA(target, definition.object)) {
            throw new Error(`Invalid relation target ${target} in ${id}`);
          }
        }
      }
    }
    Object.freeze(this);
  }

  get(id) { return hasOwn(this.concepts, id) ? this.concepts[id] : undefined; }

  /** Identical concepts and transitively inherited subtypes both satisfy isA. */
  isA(id, ancestor) {
    if (!this.get(id) || !this.get(ancestor)) return false;
    const seen = new Set();
    for (let at = id; at && !seen.has(at); at = this.get(at)?.parent) {
      if (at === ancestor) return true;
      seen.add(at);
    }
    return false;
  }

  ancestors(id) {
    if (!this.get(id)) throw new Error(`Unknown ontology concept: ${id}`);
    const out = [];
    for (let at = this.get(id).parent; at; at = this.get(at)?.parent) out.push(at);
    return out;
  }

  frameRoles(id) {
    const concept = this.get(id);
    if (concept?.type !== 'event') throw new Error(`Unknown event concept: ${id}`);
    return [...concept.roles];
  }

  /** Relations can be inherited; symmetric relations can also be traversed backwards. */
  relationTargets(id, relation, { inherit = true } = {}) {
    if (!this.get(id)) throw new Error(`Unknown ontology concept: ${id}`);
    if (!hasOwn(this.relationTypes, relation)) throw new Error(`Unknown relation type: ${relation}`);
    const sources = inherit ? [id, ...this.ancestors(id)] : [id];
    const results = new Set(sources.flatMap(source => this.get(source).relations?.[relation] || []));
    if (this.relationTypes[relation].symmetric) {
      for (const [candidate, record] of Object.entries(this.concepts)) {
        if ((record.relations?.[relation] || []).some(value => sources.includes(value))) results.add(candidate);
      }
    }
    return [...results];
  }

  /** Explicit semantic links are contextual *hints*, not a claim of statistical WSD. */
  relatedToTopic(id, topic) {
    if (!this.get(id) || !this.get(topic)) return false;
    if (this.isA(id, topic) || this.isA(topic, id)) return true;
    return Object.keys(this.relationTypes).some(relation =>
      this.relationTargets(id, relation).some(target => this.isA(topic, target) || this.isA(target, topic)));
  }
}

export function createOntology(spec) { return new Ontology(spec); }
