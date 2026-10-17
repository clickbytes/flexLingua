import {PluginError} from './errors.js';
import {validateCapability, validateLanguagePlugin} from './contract.js';

const LANGUAGE_CODE = /^[a-z]{2,8}$/u;
const PLUGIN_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

function fail(code, message) {
  throw new PluginError(code, message);
}

function capabilityKey(item) {
  return `${item.channel}\u0000${item.operation}\u0000${item.construction}`;
}

function canonicalCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) fail('PLUGIN_INVALID', 'Plugin capabilities must be an array.');
  const normalized = Array.from(capabilities, validateCapability).map(item => ({
    ...item,
    evidence: [...item.evidence].sort((a, b) =>
      a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }));
  const seen = new Set();
  for (const item of normalized) {
    const key = capabilityKey(item);
    if (seen.has(key)) fail('PLUGIN_INVALID', 'Duplicate plugin capability declaration.');
    seen.add(key);
  }
  return normalized.sort((a, b) => {
    const left = capabilityKey(a), right = capabilityKey(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function hasSameCapabilities(left, right) {
  return JSON.stringify(canonicalCapabilities(left)) ===
    JSON.stringify(canonicalCapabilities(right));
}

/** Exact-code registry. It never chooses a fallback language. */
export class PluginRegistry {
  #byCode = new Map();
  #byId = new Map();

  list() {
    return [...this.#byCode.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  }

  get(code) {
    if (typeof code !== 'string' || !LANGUAGE_CODE.test(code) || !this.#byCode.has(code)) {
      fail('PLUGIN_NOT_FOUND',
        `Language plugin not found: ${typeof code === 'string' ? code : '<invalid code>'}.`);
    }
    return this.#byCode.get(code).plugin;
  }

  register(plugin, options = {}) {
    if (!isRecord(options) || Object.keys(options).some(key => !['id', 'capabilities'].includes(key))) {
      fail('PLUGIN_INVALID', 'Plugin registration options must contain only id and capabilities.');
    }
    const {id = plugin?.code, capabilities} = options;
    const description = validateLanguagePlugin(plugin);
    if (typeof id !== 'string' || !PLUGIN_ID.test(id)) {
      fail('PLUGIN_INVALID', 'Plugin registration requires a valid stable ID.');
    }
    if (this.#byCode.has(plugin.code) || this.#byId.has(id)) {
      fail('PLUGIN_DUPLICATE', `Duplicate plugin ID or language code: ${id}/${plugin.code}.`);
    }

    const runtimeCapabilities = canonicalCapabilities(plugin.capabilities());
    if (capabilities !== undefined &&
        !hasSameCapabilities(runtimeCapabilities, capabilities)) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Plugin ${plugin.code} capabilities do not match its manifest.`);
    }
    for (const channel of ['lexicon', 'signal']) {
      const rows = runtimeCapabilities.filter(item => item.channel === channel);
      const provided = Object.hasOwn(plugin, channel);
      if (rows.some(item => item.status === 'implemented') && !provided) {
        fail('PLUGIN_CAPABILITY_UNAVAILABLE',
          `Plugin ${plugin.code} declares ${channel} support without a provider.`);
      }
      if (provided && !rows.length) {
        fail('PLUGIN_CAPABILITY_UNAVAILABLE',
          `Plugin ${plugin.code} provides ${channel} without a capability declaration.`);
      }
    }

    this.#byCode.set(plugin.code, {id, code: plugin.code, plugin, description});
    this.#byId.set(id, plugin.code);
    return plugin;
  }
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
