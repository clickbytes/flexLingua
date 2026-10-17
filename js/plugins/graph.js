import {PluginError} from './errors.js';
import {validateCapability} from './contract.js';

export const LANGUAGE_GRAPH_SCHEMA_VERSION = '1.0';

const LANGUAGE_CODE = /^[a-z]{2,8}$/u;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const FORBIDDEN_IDENTIFIERS = new Set(['constructor', 'prototype', '__proto__']);
const NODE_TYPES = new Set([
  'identity', 'signal', 'lexicon', 'morphology', 'syntax', 'bridge', 'pragmatics', 'evidence'
]);
const CAPABILITY_NODE_TYPE = Object.freeze({
  sentence: 'syntax', morphology: 'morphology', lexicon: 'lexicon', signal: 'signal'
});
const RELATION_PAIRS = Object.freeze({
  'maps-to': new Set(['bridge>syntax']),
  licenses: new Set(['syntax>lexicon', 'syntax>morphology']),
  realizes: new Set(['morphology>signal', 'morphology>syntax']),
  evidences: new Set([
    'evidence>identity', 'evidence>signal', 'evidence>lexicon', 'evidence>morphology',
    'evidence>syntax', 'evidence>bridge', 'evidence>pragmatics'
  ])
});
const GRAPH_RELATIONS = new Set(['depends-on', ...Object.keys(RELATION_PAIRS)]);
const MAX_NODES = 10000;
const MAX_EDGES = 50000;

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, required, optional = []) => isRecord(value) &&
  required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const safeIdentifier = value => typeof value === 'string' && value.length <= 128 &&
  IDENTIFIER.test(value) && !value.split(/[._-]/u).some(part => FORBIDDEN_IDENTIFIERS.has(part));

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function validateManifestCapabilities(manifest) {
  if (!isRecord(manifest) || typeof manifest.code !== 'string' ||
      !LANGUAGE_CODE.test(manifest.code) || !Array.isArray(manifest.capabilities) ||
      !manifest.capabilities.length || manifest.capabilities.length > 512) {
    fail('PLUGIN_GRAPH_INVALID', 'Graph manifest requires a language code and capabilities.');
  }
  let capabilities;
  try {
    capabilities = Array.from(manifest.capabilities, validateCapability);
  } catch (error) {
    if (error instanceof PluginError) fail('PLUGIN_GRAPH_INVALID', 'Invalid manifest capability.', error);
    throw error;
  }
  const seen = new Set();
  for (const capability of capabilities) {
    const key = `${capability.channel}\u0000${capability.operation}\u0000${capability.construction}`;
    if (seen.has(key)) fail('PLUGIN_GRAPH_INVALID', 'Duplicate manifest capability.');
    seen.add(key);
  }
  return capabilities;
}

function validateNode(node, index) {
  if (!hasExactKeys(node, ['id', 'type', 'module'], ['path', 'capability']) ||
      !safeIdentifier(node.id) || !NODE_TYPES.has(node.type) ||
      !safeIdentifier(node.module) ||
      (Object.hasOwn(node, 'path') && !safeRelativeJsonPath(node.path)) ||
      (Object.hasOwn(node, 'capability') && !safeIdentifier(node.capability))) {
    fail('PLUGIN_GRAPH_INVALID', `Invalid language graph node at index ${index}.`);
  }
  return {
    id: node.id,
    type: node.type,
    module: node.module,
    ...(Object.hasOwn(node, 'path') ? {path: node.path} : {}),
    ...(Object.hasOwn(node, 'capability') ? {capability: node.capability} : {})
  };
}

function safeRelativeJsonPath(value) {
  return typeof value === 'string' && value.length <= 160 &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/u.test(value) &&
    !value.split('/').some(part => !part || part === '.' || part === '..');
}

function reachesCycle(nodes, edges) {
  const dependencies = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    if (edge.relation === 'depends-on') dependencies.get(edge.from).push(edge.to);
  }
  const visiting = new Set(), visited = new Set();
  const visit = id => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id)) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some(node => visit(node.id));
}

/** Validate graph structure, manifest capability links, directions, and dependency cycles. */
export function validateLanguageGraph(graph, manifest) {
  const capabilities = validateManifestCapabilities(manifest);
  if (!hasExactKeys(graph, ['schemaVersion', 'language', 'nodes', 'edges']) ||
      graph.schemaVersion !== LANGUAGE_GRAPH_SCHEMA_VERSION || graph.language !== manifest.code ||
      !Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > MAX_NODES ||
      !Array.isArray(graph.edges) || graph.edges.length > MAX_EDGES) {
    fail('PLUGIN_GRAPH_INVALID', 'Invalid or mismatched LanguageGraph document.');
  }

  const nodes = Array.from(graph.nodes, validateNode);
  const byId = new Map();
  const capabilityNodes = new Set();
  for (const node of nodes) {
    if (byId.has(node.id)) fail('PLUGIN_GRAPH_INVALID', `Duplicate graph node ID: ${node.id}.`);
    byId.set(node.id, node);
    if (node.capability !== undefined) {
      const matches = capabilities.filter(item => item.construction === node.capability &&
        CAPABILITY_NODE_TYPE[item.channel] === node.type);
      if (!matches.length) {
        fail('PLUGIN_GRAPH_INVALID', `Graph node ${node.id} references an undeclared capability.`);
      }
      const key = `${node.type}\u0000${node.capability}`;
      if (capabilityNodes.has(key)) {
        fail('PLUGIN_GRAPH_INVALID', `Capability has multiple graph providers: ${node.capability}.`);
      }
      capabilityNodes.add(key);
    }
  }

  const edges = Array.from(graph.edges, (edge, index) => {
    if (!hasExactKeys(edge, ['from', 'to', 'relation']) ||
        !safeIdentifier(edge.from) || !safeIdentifier(edge.to) ||
        !GRAPH_RELATIONS.has(edge.relation)) {
      fail('PLUGIN_GRAPH_INVALID', `Invalid language graph edge at index ${index}.`);
    }
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) fail('PLUGIN_GRAPH_INVALID', `Dangling graph edge at index ${index}.`);
    if (edge.relation !== 'depends-on' &&
        !RELATION_PAIRS[edge.relation].has(`${from.type}>${to.type}`)) {
      fail('PLUGIN_GRAPH_INVALID', `Invalid ${edge.relation} edge direction at index ${index}.`);
    }
    return {from: edge.from, to: edge.to, relation: edge.relation};
  });
  const edgeKeys = new Set();
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.relation}`;
    if (edgeKeys.has(key)) fail('PLUGIN_GRAPH_INVALID', 'Duplicate language graph edge.');
    edgeKeys.add(key);
  }
  if (reachesCycle(nodes, edges)) fail('PLUGIN_GRAPH_CYCLE', 'LanguageGraph has a dependency cycle.');

  for (const capability of capabilities.filter(item => item.status === 'implemented')) {
    const type = CAPABILITY_NODE_TYPE[capability.channel];
    const node = nodes.find(item => item.type === type &&
      item.capability === capability.construction);
    if (!node) {
      fail('PLUGIN_GRAPH_INVALID',
        `Implemented ${capability.channel} capability has no graph provider: ${capability.construction}.`);
    }
    if (capability.channel === 'sentence') {
      const connected = edges.some(edge => edge.relation === 'maps-to' && edge.to === node.id &&
        byId.get(edge.from).type === 'bridge');
      if (!connected) {
        fail('PLUGIN_GRAPH_INVALID',
          `Sentence capability has no semantic bridge path: ${capability.construction}.`);
      }
    }
  }

  return {
    schemaVersion: graph.schemaVersion,
    language: graph.language,
    nodes: nodes.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    edges: edges.sort((a, b) => {
      const left = `${a.from}\u0000${a.relation}\u0000${a.to}`;
      const right = `${b.from}\u0000${b.relation}\u0000${b.to}`;
      return left < right ? -1 : left > right ? 1 : 0;
    })
  };
}
