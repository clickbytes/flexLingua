import {EngineError} from './errors.js';
import {record} from './features.js';

export const TYPED_GRAPH_MATCH_LIMITS = Object.freeze({
  candidates: 16,
  nodes: 128,
  edges: 256,
  depth: 8
});

const KEYS = Object.freeze({
  graph: ['root','nodes','edges'],
  node: ['id','type'],
  requiredEdge: ['from','relation','target','constraint'],
  typicalEdge: ['from','relation','target','constraint','weight']
});

function plainRecord(value) {
  if (!record(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key,index) => key === allowed[index]);
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, message, status = 'invalid') {
  throw new EngineError(code, message, {status, diagnostics: [{code,message}]});
}

function resourceLimit(message) {
  fail('TYPED_GRAPH_RESOURCE_LIMIT', message, 'resource_limit');
}

function requirePlainRecord(value, message) {
  if (!plainRecord(value)) fail('TYPED_GRAPH_INVALID', message);
}

function requireOntology(ontology) {
  if (!ontology || typeof ontology.get !== 'function' || typeof ontology.isA !== 'function' ||
      typeof ontology.projectConceptGraph !== 'function') {
    fail('TYPED_GRAPH_INVALID', 'Concept graph matching requires a validated Ontology.');
  }
}

/** Validate and canonically order an observed graph before it can affect a lexical reading. */
function normalizeObservedGraph(observed, ontology) {
  requirePlainRecord(observed, 'Observed concept graph must be a plain object.');
  if (!hasKeys(observed, KEYS.graph) || typeof observed.root !== 'string' ||
      !Array.isArray(observed.nodes) || !Array.isArray(observed.edges)) {
    fail('TYPED_GRAPH_INVALID', 'Observed concept graph must contain only root, nodes, and edges.');
  }
  if (observed.nodes.length > TYPED_GRAPH_MATCH_LIMITS.nodes ||
      observed.edges.length > TYPED_GRAPH_MATCH_LIMITS.edges) {
    resourceLimit('Observed concept graph exceeds its node or edge budget.');
  }
  if (!ontology.get(observed.root)) {
    fail('TYPED_GRAPH_INVALID', `Unknown observed graph root: ${observed.root}.`);
  }

  const nodes = new Map();
  for (const node of observed.nodes) {
    requirePlainRecord(node, 'Observed concept graph contains an invalid node.');
    if (!hasKeys(node, KEYS.node) || typeof node.id !== 'string' || typeof node.type !== 'string') {
      fail('TYPED_GRAPH_INVALID', 'Observed graph nodes require exactly id and type.');
    }
    const concept = ontology.get(node.id);
    if (!concept || concept.type !== node.type || nodes.has(node.id)) {
      fail('TYPED_GRAPH_INVALID', `Unknown, mismatched, or duplicate observed node: ${node.id}.`);
    }
    nodes.set(node.id, {id: node.id, type: node.type});
  }
  if (!nodes.has(observed.root)) {
    fail('TYPED_GRAPH_INVALID', 'Observed graph root must be present in nodes.');
  }

  const edges = [];
  const edgeKeys = new Set();
  const outgoing = new Map([...nodes.keys()].map(id => [id, []]));
  for (const edge of observed.edges) {
    requirePlainRecord(edge, 'Observed concept graph contains an invalid edge.');
    const validShape = plainRecord(edge) &&
      (hasKeys(edge, KEYS.requiredEdge) || hasKeys(edge, KEYS.typicalEdge));
    if (!validShape || typeof edge.from !== 'string' || typeof edge.target !== 'string' ||
        typeof edge.relation !== 'string' || !['required','typical'].includes(edge.constraint) ||
        (edge.constraint === 'required' && hasKeys(edge, KEYS.typicalEdge)) ||
        (edge.constraint === 'typical' && (!hasKeys(edge, KEYS.typicalEdge) ||
          !Number.isFinite(edge.weight) || edge.weight <= 0 || edge.weight > 1))) {
      fail('TYPED_GRAPH_INVALID', 'Observed graph edge has an invalid shape or constraint.');
    }
    if (!nodes.has(edge.from) || !nodes.has(edge.target)) {
      fail('TYPED_GRAPH_INVALID', 'Observed graph edge references a node outside the graph.');
    }
    if (edge.relation === 'is_a') {
      if (edge.constraint !== 'required' || !ontology.isA(edge.from, edge.target)) {
        fail('TYPED_GRAPH_INVALID', 'Observed is_a edges must be true required CORE ancestry.');
      }
    } else {
      const signature = ontology.relationTypes?.[edge.relation];
      if (!signature || !ontology.isA(edge.from, signature.subject) ||
          !ontology.isA(edge.target, signature.object)) {
        fail('TYPED_GRAPH_INVALID', `Observed ${edge.relation} edge violates its CORE type signature.`);
      }
    }
    const key = `${edge.from}\u0000${edge.relation}\u0000${edge.target}`;
    if (edgeKeys.has(key)) fail('TYPED_GRAPH_INVALID', 'Observed graph contains duplicate semantic edges.');
    edgeKeys.add(key);
    const normalized = {from: edge.from, relation: edge.relation, target: edge.target,
      constraint: edge.constraint, ...(edge.weight === undefined ? {} : {weight: edge.weight})};
    edges.push(normalized);
    outgoing.get(edge.from).push(edge.target);
  }

  const depths = new Map([[observed.root,0]]);
  const pending = [observed.root];
  for (let index = 0; index < pending.length; index++) {
    const from = pending[index];
    const depth = depths.get(from);
    for (const target of outgoing.get(from)) {
      const nextDepth = depth + 1;
      if (nextDepth > TYPED_GRAPH_MATCH_LIMITS.depth) {
        resourceLimit('Observed concept graph exceeds its expansion depth budget.');
      }
      if (!depths.has(target)) {
        depths.set(target,nextDepth);
        pending.push(target);
      }
    }
  }
  if (depths.size !== nodes.size) {
    fail('TYPED_GRAPH_INVALID', 'Every observed graph node must be reachable from root.');
  }

  const orderedNodes = [...nodes.values()].sort((left,right) => compare(left.id,right.id));
  const orderedEdges = edges.sort((left,right) => compare(left.from,right.from) ||
    compare(left.relation,right.relation) || compare(left.target,right.target) ||
    compare(left.constraint,right.constraint) || (left.weight ?? 0) - (right.weight ?? 0));
  return {root: observed.root, nodes: orderedNodes, edges: orderedEdges};
}

function sameOrSubtype(ontology, actual, expected) {
  return ontology.isA(actual, expected);
}

function targetConflict(ontology, observedTarget, requiredTarget) {
  return !sameOrSubtype(ontology, observedTarget, requiredTarget) &&
    !sameOrSubtype(ontology, requiredTarget, observedTarget);
}

function candidateResult(conceptId, graph, observed, ontology) {
  const hardViolations = [];
  const matchedRelations = [];
  const unresolved = [];
  let score = 0;
  if (!ontology.isA(conceptId, observed.root)) {
    hardViolations.push({kind:'root_type', candidate:conceptId, observedType:observed.root});
  }

  const rootSources = new Set([conceptId, ...ontology.ancestors(conceptId)]);
  const projectedEdges = graph.edges.filter(edge => edge.relation !== 'is_a');
  for (const edge of projectedEdges) {
    const from = rootSources.has(edge.from) ? observed.root : edge.from;
    const possible = observed.edges.filter(item => item.from === from && item.relation === edge.relation);
    if (edge.constraint === 'required') {
      const asserted = possible.filter(item => item.constraint === 'required');
      const compatible = asserted.find(item => sameOrSubtype(ontology, item.target, edge.target));
      if (compatible) {
        matchedRelations.push({from: edge.from, relation: edge.relation, target: edge.target,
          observedTarget: compatible.target, constraint:'required'});
      } else {
        const conflict = asserted.find(item => targetConflict(ontology, item.target, edge.target));
        if (conflict) {
          hardViolations.push({kind:'relation_target', from:edge.from, relation:edge.relation,
            expected:edge.target, observed:conflict.target});
        } else {
          unresolved.push({from:edge.from, relation:edge.relation, target:edge.target});
        }
      }
      continue;
    }

    const hint = possible.find(item => sameOrSubtype(ontology, item.target, edge.target));
    if (hint) {
      score += edge.weight;
      matchedRelations.push({from:edge.from, relation:edge.relation, target:edge.target,
        observedTarget:hint.target, constraint:'typical', weight:edge.weight});
    }
  }

  return {conceptId, compatible:hardViolations.length === 0, hardViolations,
    matchedRelations, score, unresolved};
}

/**
 * Compare bounded observed CORE context against candidate concept patterns.
 * A unique result requires hard evidence; typical weights only order alternatives.
 */
export function matchConceptGraphs(input = {}) {
  requirePlainRecord(input, 'Typed graph match request must be a plain object.');
  if (Object.keys(input).some(key => !['observed','candidates','ontology','maxCandidates'].includes(key))) {
    fail('TYPED_GRAPH_INVALID', 'Typed graph match request contains unsupported fields.');
  }
  const {observed, candidates, ontology, maxCandidates = TYPED_GRAPH_MATCH_LIMITS.candidates} = input;
  requireOntology(ontology);
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 ||
      maxCandidates > TYPED_GRAPH_MATCH_LIMITS.candidates) {
    fail('TYPED_GRAPH_INVALID', 'Invalid typed graph candidate limit.');
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    fail('TYPED_GRAPH_INVALID', 'At least one candidate concept ID is required.');
  }
  if (candidates.length > maxCandidates) {
    resourceLimit('Typed graph candidate set exceeds its declared limit.');
  }
  if (candidates.some(id => typeof id !== 'string' || !ontology.get(id)) ||
      new Set(candidates).size !== candidates.length) {
    fail('TYPED_GRAPH_INVALID', 'Candidate concepts must be unique, known CORE IDs.');
  }

  const normalized = normalizeObservedGraph(observed,ontology);
  const results = candidates.map(conceptId => {
    let graph;
    try {
      graph = ontology.projectConceptGraph(conceptId,{includeTypical:true});
    } catch (error) {
      if (error?.code === 'RESOURCE_LIMIT') {
        resourceLimit(error.message || 'Candidate concept graph exceeds its expansion budget.');
      }
      throw error;
    }
    return candidateResult(conceptId,graph,normalized,ontology);
  });

  const compareCandidates = (left,right) => Number(right.compatible) - Number(left.compatible) ||
    right.matchedRelations.filter(edge => edge.constraint === 'required').length -
      left.matchedRelations.filter(edge => edge.constraint === 'required').length ||
    right.score - left.score || compare(left.conceptId,right.conceptId);
  results.sort(compareCandidates);
  const compatible = results.filter(result => result.compatible);
  const status = compatible.length === 0 ? 'unsupported' : compatible.length === 1 ? 'matched' : 'ambiguous';
  const diagnostics = status === 'unsupported' ? [{code:'TYPED_GRAPH_NO_MATCH',
    message:'No candidate concept graph is compatible with the explicit observed context.'}] : [];
  return {
    status,
    selected: status === 'matched' ? compatible[0].conceptId : null,
    alternatives: compatible.map(result => result.conceptId),
    candidates: results,
    diagnostics
  };
}

/** Stable signature for a validated observed graph, independent of input order. */
export function conceptGraphSignature(graph, ontology) {
  requireOntology(ontology);
  return JSON.stringify(normalizeObservedGraph(graph,ontology));
}
