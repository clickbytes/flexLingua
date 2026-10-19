import {EngineError} from './errors.js';
import {RESOURCE_LIMITS} from './resource-limits.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();

function invalid(message, cause) {
  throw new EngineError('JSON_GRAPH_INVALID', message, {cause, status: 'invalid'});
}

function limit(code, message) {
  throw new EngineError(code, message, {status: 'resource_limit'});
}

function chargeBytes(state, amount, maxBytes) {
  state.bytes += amount;
  if (state.bytes > maxBytes) {
    limit('JSON_GRAPH_SIZE_LIMIT', `JSON-like graph exceeds ${maxBytes} UTF-8 bytes.`);
  }
}

function encodedValueBytes(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

/** Return UTF-8 size without serializing an enclosing object graph. */
export function utf8ByteLength(value) {
  if (typeof value !== 'string') throw new TypeError('UTF-8 byte length requires a string.');
  return encoder.encode(value).byteLength;
}

/** Validate and snapshot a JSON-like graph before recursion, serialization, or semantic traversal. */
export function snapshotBoundedJsonGraph(root, {
  maxDepth = RESOURCE_LIMITS.interlinguaDepth,
  maxNodes = RESOURCE_LIMITS.interlinguaNodes,
  maxBytes = RESOURCE_LIMITS.jsonGraphBytes
} = {}) {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 ||
      !Number.isSafeInteger(maxNodes) || maxNodes < 1 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('JSON-like graph limits must be positive safe integers.');
  }

  const active = new WeakSet();
  const holder = {};
  const stack = [{value: root, depth: 0, exit: false, parent: holder, key: 'value'}];
  const state = {nodes: 0, bytes: 0};
  const assign = (parent, key, value) => Object.defineProperty(parent, key, {
    value, writable: true, enumerable: true, configurable: true
  });

  try {
    while (stack.length) {
      const item = stack.pop();
      if (item.exit) {
        active.delete(item.value);
        continue;
      }
      if (item.depth > maxDepth) {
        limit('JSON_GRAPH_DEPTH_LIMIT', `JSON-like graph exceeds depth ${maxDepth}.`);
      }
      if (++state.nodes > maxNodes) {
        limit('JSON_GRAPH_NODE_LIMIT', `JSON-like graph exceeds ${maxNodes} values.`);
      }

      const value = item.value;
      if (value === null) {
        chargeBytes(state, 4, maxBytes);
        assign(item.parent, item.key, value);
        continue;
      }
      if (typeof value === 'string') {
        chargeBytes(state, encodedValueBytes(value), maxBytes);
        assign(item.parent, item.key, value);
        continue;
      }
      if (typeof value === 'boolean') {
        chargeBytes(state, value ? 4 : 5, maxBytes);
        assign(item.parent, item.key, value);
        continue;
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) invalid('JSON-like graphs require finite numbers.');
        chargeBytes(state, encodedValueBytes(value), maxBytes);
        assign(item.parent, item.key, value);
        continue;
      }
      if (typeof value !== 'object') invalid('JSON-like graph contains a non-JSON value.');

      if (active.has(value)) {
        throw new EngineError('JSON_GRAPH_CYCLE', 'JSON-like graph must not contain cycles.', {status: 'invalid'});
      }
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype && prototype !== null)) {
        invalid('JSON-like graph values must be plain objects or arrays.');
      }

      if (array) {
        const length = value.length;
        if (length > maxNodes) {
          limit('JSON_GRAPH_NODE_LIMIT', `JSON-like graph exceeds ${maxNodes} values.`);
        }
        const ownKeys = Reflect.ownKeys(value);
        if (ownKeys.length !== length + 1 || !ownKeys.includes('length')) {
          invalid('JSON-like arrays must be dense and have no extra properties.');
        }
        chargeBytes(state, 2 + Math.max(0, length - 1), maxBytes);
        const copy = new Array(length);
        assign(item.parent, item.key, copy);
        active.add(value);
        stack.push({...item, exit: true});
        for (let index = length - 1; index >= 0; index--) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            invalid('JSON-like arrays must contain enumerable data values without holes.');
          }
          stack.push({value: descriptor.value, depth: item.depth + 1, exit: false,
            parent: copy, key: String(index)});
        }
        continue;
      }

      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some(key => typeof key !== 'string')) {
        invalid('JSON-like objects cannot contain symbol keys.');
      }
      const keys = Object.keys(value);
      if (keys.length !== ownKeys.length) {
        invalid('JSON-like objects cannot contain non-enumerable properties.');
      }
      if (keys.length > maxNodes) {
        limit('JSON_GRAPH_NODE_LIMIT', `JSON-like graph exceeds ${maxNodes} values.`);
      }
      chargeBytes(state, 2 + Math.max(0, keys.length - 1) + keys.length, maxBytes);
      const copy = Object.create(prototype === null ? null : Object.prototype);
      assign(item.parent, item.key, copy);
      active.add(value);
      stack.push({...item, exit: true});
      for (let index = keys.length - 1; index >= 0; index--) {
        const key = keys[index];
        if (FORBIDDEN_KEYS.has(key)) {
          throw new EngineError('JSON_GRAPH_UNSAFE_KEY', 'JSON-like graph contains an unsafe object key.',
            {status: 'invalid'});
        }
        chargeBytes(state, encodedValueBytes(key), maxBytes);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          invalid('JSON-like objects require enumerable data properties without accessors.');
        }
        stack.push({value: descriptor.value, depth: item.depth + 1, exit: false,
          parent: copy, key});
      }
    }
  } catch (error) {
    if (error instanceof EngineError) throw error;
    throw new EngineError('JSON_GRAPH_INVALID', 'JSON-like graph could not be inspected safely.',
      {cause: error, status: 'invalid'});
  }

  return {value: holder.value, ...state};
}
