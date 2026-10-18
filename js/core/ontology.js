import { record, safeName, hasOwn } from './features.js';

export const ONTOLOGY_VERSION = '0.5';
const CONCEPT_ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/u;
const KINDS = new Set(['category', 'entity', 'event', 'property', 'degree']);
const MAX_CONCEPTS = 10000;
const MAX_DEFINITION_EDGES = 16;
const MAX_PROJECTED_NODES = 128;
const MAX_PROJECTED_EDGES = 256;
const MAX_GRAPH_EXPANSION_DEPTH = 8;
const DEFINITION_RELATIONS = new Set([
  'domain', 'material', 'color', 'purpose', 'has_part', 'contains', 'located_in',
  'adjacent_to', 'associated_with'
]);
export const STATE_FRAME_VERSION = '1.3';
const STATE_FRAME_CONTRACTS = Object.freeze({
  identity: Object.freeze({
    roles: Object.freeze(['subject','complement']),
    roleTypes: Object.freeze({subject:'entity',complement:'entity'}),
    symmetric: true
  }),
  predication: Object.freeze({
    roles: Object.freeze(['subject']),
    roleTypes: Object.freeze({subject:'entity'}),
    symmetric: false,
    predicateType: 'property',
    predicateAppliesTo: 'entity'
  }),
  classification: Object.freeze({
    roles: Object.freeze(['subject','category']),
    roleTypes: Object.freeze({subject:'entity',category:'entity'}),
    symmetric: false
  }),
  possession: Object.freeze({
    roles: Object.freeze(['owner','owned']),
    roleTypes: Object.freeze({owner:'entity',owned:'entity'}),
    symmetric: false
  }),
  location: Object.freeze({
    roles: Object.freeze(['subject','location']),
    roleTypes: Object.freeze({subject:'entity',location:'entity'}),
    symmetric: false
  }),
  existence: Object.freeze({
    roles: Object.freeze(['entity','location']),
    roleTypes: Object.freeze({entity:'entity',location:'entity'}),
    symmetric: false
  })
});

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

function graphError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function exactKeys(value, keys) {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key)) &&
    Object.keys(value).length === allowed.size;
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
      if (concept.optionalRoles !== undefined && (concept.type !== 'event' ||
          !Array.isArray(concept.optionalRoles) || !concept.optionalRoles.every(safeName) ||
          new Set(concept.optionalRoles).size !== concept.optionalRoles.length)) {
        throw new Error(`Invalid optional semantic roles for ${id}`);
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
      const optionalRoles = current.type === 'event'
        ? [...new Set([...(base?.optionalRoles || []), ...(current.optionalRoles || [])])] : undefined;
      if (current.type === 'event' && optionalRoles.some(role => !roles.includes(role))) {
        throw new Error(`Unknown optional semantic role in ${id}`);
      }
      const roleTypes = current.type === 'event' ? { ...(base?.roleTypes || {}), ...(current.roleTypes || {}) } : undefined;
      if (current.type === 'event' && Object.keys(roleTypes).some(role => !roles.includes(role))) {
        throw new Error(`Unknown semantic role type in ${id}`);
      }
      normalized[id] = { ...current, ...(roles ? { roles, optionalRoles, roleTypes } : {}) };
      states.set(id, 2);
      return normalized[id];
    };
    for (const id of Object.keys(source)) resolve(id);
    this.concepts = freezeDeep(normalized);

    const relationTypes = spec.relationTypes ?? {};
    if (!record(relationTypes)) throw graphError('INVALID_RELATION_TYPE', 'Invalid relation type registry.');
    this.relationTypes = freezeDeep(JSON.parse(JSON.stringify(relationTypes)));
    for (const [relation, definition] of Object.entries(this.relationTypes)) {
      if (!DEFINITION_RELATIONS.has(relation) || !safeName(relation) || relation.length > 64 ||
          !record(definition) || !exactKeys(definition, ['subject', 'object', 'symmetric']) ||
          !validConceptId(definition.subject) || !validConceptId(definition.object) ||
          typeof definition.symmetric !== 'boolean' ||
          !hasOwn(this.concepts, definition.subject) || !hasOwn(this.concepts, definition.object)) {
        throw graphError('INVALID_RELATION_TYPE', `Invalid relation type: ${relation}`);
      }
    }
    const hasStateContracts = hasOwn(spec,'stateFrames') || hasOwn(spec,'stateFrameVersion');
    if (hasStateContracts) {
      const frameNames = Object.keys(STATE_FRAME_CONTRACTS);
      if (spec.stateFrameVersion !== STATE_FRAME_VERSION || !record(spec.stateFrames) ||
          Object.keys(spec.stateFrames).length !== frameNames.length ||
          frameNames.some(name => !hasOwn(spec.stateFrames,name))) {
        throw new Error('Invalid or unsupported state frame registry version.');
      }
      this.stateFrameVersion = spec.stateFrameVersion;
      this.stateFrames = freezeDeep(JSON.parse(JSON.stringify(spec.stateFrames)));
      for (const [kind, expected] of Object.entries(STATE_FRAME_CONTRACTS)) {
        const frame = this.stateFrames[kind];
        const fields = ['roles','roleTypes','symmetric',
          ...(expected.predicateType ? ['predicateType','predicateAppliesTo'] : [])];
        if (!record(frame) || Object.keys(frame).length !== fields.length ||
            Object.keys(frame).some(key => !fields.includes(key)) ||
            !Array.isArray(frame.roles) || frame.roles.length !== expected.roles.length ||
            new Set(frame.roles).size !== frame.roles.length ||
            frame.roles.some(role => !expected.roles.includes(role)) ||
            expected.roles.some(role => !frame.roles.includes(role)) ||
            !record(frame.roleTypes) || Object.keys(frame.roleTypes).length !== Object.keys(expected.roleTypes).length ||
            Object.entries(expected.roleTypes).some(([role,type]) => frame.roleTypes[role] !== type) ||
            frame.symmetric !== expected.symmetric ||
            (expected.predicateType && (frame.predicateType !== expected.predicateType ||
              frame.predicateAppliesTo !== expected.predicateAppliesTo))) {
          throw new Error(`Invalid state frame contract: ${kind}`);
        }
        for (const type of [...Object.values(frame.roleTypes),
          ...(frame.predicateAppliesTo ? [frame.predicateAppliesTo] : [])]) {
          if (!validConceptId(type) || !this.get(type) ||
              !['entity','category'].includes(this.get(type).type)) {
            throw new Error(`Invalid state frame role type in ${kind}: ${type}`);
          }
        }
      }
    } else {
      this.stateFrameVersion = null;
      this.stateFrames = freezeDeep(Object.create(null));
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
      if (concept.definitionGraph !== undefined) {
        const graph = concept.definitionGraph;
        if (!record(graph) || !exactKeys(graph, ['edges']) || !Array.isArray(graph.edges) ||
            graph.edges.length < 1 || graph.edges.length > MAX_DEFINITION_EDGES) {
          throw graphError('INVALID_DEFINITION_GRAPH', `Invalid definition graph in ${id}.`);
        }
        const seenEdges = new Set();
        for (const edge of graph.edges) {
          if (!record(edge) || !['required', 'typical'].includes(edge.constraint)) {
            throw graphError('INVALID_DEFINITION_GRAPH', `Invalid definition edge in ${id}.`);
          }
          const expectedKeys = edge.constraint === 'required'
            ? ['relation', 'target', 'constraint']
            : ['relation', 'target', 'constraint', 'weight'];
          if (!exactKeys(edge, expectedKeys) || !DEFINITION_RELATIONS.has(edge.relation) ||
              !safeName(edge.relation) || edge.relation.length > 64 || !validConceptId(edge.target)) {
            throw graphError('INVALID_DEFINITION_GRAPH', `Invalid definition edge in ${id}.`);
          }
          if (edge.constraint === 'typical' &&
              (typeof edge.weight !== 'number' || !Number.isFinite(edge.weight) ||
               edge.weight <= 0 || edge.weight > 1)) {
            throw graphError('INVALID_DEFINITION_GRAPH', `Invalid typical weight in ${id}.${edge.relation}.`);
          }
          const signature = this.relationTypes[edge.relation];
          if (!signature) {
            throw graphError('INVALID_RELATION_TYPE', `Unknown definition relation ${edge.relation} in ${id}.`);
          }
          if (!this.isA(id, signature.subject)) {
            throw graphError('INVALID_RELATION_SUBJECT',
              `Concept ${id} is not valid as the subject of ${edge.relation}.`);
          }
          if (!this.get(edge.target) || !this.isA(edge.target, signature.object)) {
            throw graphError('INVALID_RELATION_TARGET',
              `Invalid target ${edge.target} for ${edge.relation} in ${id}.`);
          }
          const edgeKey = JSON.stringify([edge.relation, edge.target, edge.constraint]);
          if (seenEdges.has(edgeKey)) {
            throw graphError('INVALID_DEFINITION_GRAPH', `Duplicate definition edge in ${id}: ${edge.relation} → ${edge.target}.`);
          }
          seenEdges.add(edgeKey);
        }
      }
      if (concept.semanticEffect !== undefined) {
        const effect = concept.semanticEffect;
        if (concept.type !== 'property' || !record(effect) ||
            !exactKeys(effect, ['operation', 'relation', 'target']) || effect.operation !== 'add_relation' ||
            !DEFINITION_RELATIONS.has(effect.relation) || !safeName(effect.relation) ||
            effect.relation.length > 64 || !validConceptId(effect.target)) {
          throw graphError('INVALID_SEMANTIC_EFFECT', `Invalid semantic effect in ${id}.`);
        }
        const signature = this.relationTypes[effect.relation];
        if (!signature) {
          throw graphError('INVALID_RELATION_TYPE', `Unknown semantic effect relation ${effect.relation} in ${id}.`);
        }
        if (concept.appliesTo.some(type => !this.isA(type, signature.subject))) {
          throw graphError('INVALID_RELATION_SUBJECT',
            `Semantic effect ${id} is not valid for every declared appliesTo type.`);
        }
        if (!this.get(effect.target) || !this.isA(effect.target, signature.object)) {
          throw graphError('INVALID_RELATION_TARGET',
            `Invalid semantic effect target ${effect.target} for ${id}.${effect.relation}.`);
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

  /**
   * Project a bounded, immutable semantic graph for one concept. Parent edges
   * are synthesized as required is_a edges; legacy relations are not rewritten
   * or reweighted. Required relation targets and their definitions are expanded
   * once. Typical edges are included only when explicitly requested.
   */
  projectConceptGraph(conceptId, options = {}) {
    if (!this.get(conceptId)) throw new Error(`Unknown ontology concept: ${conceptId}`);
    if (!record(options) || Object.keys(options).some(key => !['includeTypical', 'maxEdges'].includes(key))) {
      throw graphError('INVALID_GRAPH_OPTIONS', 'Invalid concept graph projection options.');
    }
    const includeTypical = options.includeTypical === undefined ? false : options.includeTypical;
    const maxEdges = options.maxEdges === undefined ? MAX_PROJECTED_EDGES : options.maxEdges;
    if (typeof includeTypical !== 'boolean' || !Number.isSafeInteger(maxEdges) ||
        maxEdges < 0 || maxEdges > MAX_PROJECTED_EDGES) {
      throw graphError('INVALID_GRAPH_OPTIONS', 'Invalid concept graph projection options.');
    }

    const nodes = new Map();
    const edges = [];
    const visited = new Set();
    const pending = [{id: conceptId, depth: 0}];
    const addEdge = edge => {
      if (edges.length >= maxEdges || edges.length >= MAX_PROJECTED_EDGES) {
        throw graphError('RESOURCE_LIMIT', 'Concept graph edge limit exceeded.');
      }
      edges.push(edge);
    };

    while (pending.length) {
      const {id, depth} = pending.shift();
      if (visited.has(id)) continue;
      if (depth > MAX_GRAPH_EXPANSION_DEPTH) {
        throw graphError('RESOURCE_LIMIT', 'Concept graph expansion depth exceeded.');
      }
      visited.add(id);
      const concept = this.get(id);
      nodes.set(id, {id, type: concept.type});
      if (nodes.size > MAX_PROJECTED_NODES) {
        throw graphError('RESOURCE_LIMIT', 'Concept graph node limit exceeded.');
      }
      if (concept.parent) {
        addEdge({from: id, relation: 'is_a', target: concept.parent, constraint: 'required'});
        pending.push({id: concept.parent, depth: depth + 1});
      }
      for (const edge of concept.definitionGraph?.edges || []) {
        if (edge.constraint === 'typical' && !includeTypical) continue;
        addEdge({from: id, relation: edge.relation, target: edge.target,
          constraint: edge.constraint, ...(edge.weight === undefined ? {} : {weight: edge.weight})});
        pending.push({id: edge.target, depth: depth + 1});
      }
    }

    const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
    const orderedNodes = [...nodes.values()].sort((left, right) => compare(left.id, right.id));
    const orderedEdges = edges.sort((left, right) =>
      compare(left.from, right.from) || compare(left.relation, right.relation) ||
      compare(left.target, right.target) || compare(left.constraint, right.constraint) ||
      (left.weight ?? 0) - (right.weight ?? 0));
    return freezeDeep({root: conceptId, nodes: orderedNodes, edges: orderedEdges});
  }

  frameRoles(id) {
    const concept = this.get(id);
    if (concept?.type !== 'event') throw new Error(`Unknown event concept: ${id}`);
    return [...concept.roles];
  }

  requiredFrameRoles(id) {
    const concept = this.get(id);
    if (concept?.type !== 'event') throw new Error(`Unknown event concept: ${id}`);
    const optional = new Set(concept.optionalRoles || []);
    return concept.roles.filter(role => !optional.has(role));
  }

  optionalFrameRoles(id) {
    const concept = this.get(id);
    if (concept?.type !== 'event') throw new Error(`Unknown event concept: ${id}`);
    return [...(concept.optionalRoles || [])];
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
