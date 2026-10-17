import {readFile, realpath, stat} from 'node:fs/promises';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {PluginError} from './errors.js';
import {validateCapability} from './contract.js';
import {PluginRegistry} from './registry.js';

export const DEFAULT_PROJECT_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const LANGUAGE_CODE = /^[a-z]{2,8}$/u;
const PLUGIN_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const LANGUAGE_DIRECTION = /^[a-z]{2,8}->[a-z]{2,8}$/u;
const LANGUAGE_PLUGIN_STATUSES = ['controlled-subset', 'limited-demo', 'morphology-only'];
const validDirections = value => Array.isArray(value) && value.length <= 512 &&
  new Set(value).size === value.length &&
  value.every(direction => typeof direction === 'string' && LANGUAGE_DIRECTION.test(direction));
const isRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasExactKeys = (value, keys) => isRecord(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function isWithin(root, target) {
  const path = relative(root, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function safeRelative(value, {json = false} = {}) {
  if (typeof value !== 'string' || !value || value.length > 160 || isAbsolute(value) ||
      value.includes('\\') || value.includes(':') || value.includes('?') || value.includes('#')) {
    return false;
  }
  const parts = value.split('/');
  if (parts.some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(part) ||
      part === '.' || part === '..')) return false;
  return !json || /^[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/u.test(value);
}

async function realDirectory(path, parent, label, code = 'PLUGIN_PATH_INVALID') {
  let actual;
  try {
    actual = await realpath(path);
  } catch (error) {
    fail(code, `Missing ${label}.`, error);
  }
  if (parent && !isWithin(parent, actual)) {
    fail('PLUGIN_PATH_INVALID', `${label} resolves outside its trusted directory.`);
  }
  try {
    if (!(await stat(actual)).isDirectory()) fail(code, `${label} is not a directory.`);
  } catch (error) {
    if (error instanceof PluginError) throw error;
    fail(code, `Cannot inspect ${label}.`, error);
  }
  return actual;
}

async function realFile(base, relativePath, label) {
  if (!safeRelative(relativePath, {json: relativePath?.endsWith('.json')})) {
    fail('PLUGIN_PATH_INVALID', `Invalid relative path for ${label}.`);
  }
  const candidate = resolve(base, ...relativePath.split('/'));
  if (!isWithin(base, candidate) || candidate === base) {
    fail('PLUGIN_PATH_INVALID', `${label} escapes its plugin directory.`);
  }
  let actual;
  try {
    actual = await realpath(candidate);
  } catch (error) {
    fail('PLUGIN_PACKAGE_INVALID', `Missing ${label}.`, error);
  }
  if (!isWithin(base, actual) || actual === base) {
    fail('PLUGIN_PATH_INVALID', `${label} resolves outside its plugin directory.`);
  }
  try {
    if (!(await stat(actual)).isFile()) fail('PLUGIN_PACKAGE_INVALID', `${label} is not a file.`);
  } catch (error) {
    if (error instanceof PluginError) throw error;
    fail('PLUGIN_PACKAGE_INVALID', `Cannot inspect ${label}.`, error);
  }
  return actual;
}

async function readJson(path, label, errorCode) {
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    fail(errorCode, `Cannot read ${label}.`, error);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(errorCode, `Invalid JSON in ${label}.`, error);
  }
}

function validateRegistryDocument(value) {
  if (!hasExactKeys(value, ['schemaVersion', 'plugins']) || value.schemaVersion !== '1.0' ||
      !isRecord(value.plugins) || Object.keys(value.plugins).length < 1 ||
      Object.keys(value.plugins).length > 128) {
    fail('PLUGIN_REGISTRY_INVALID', 'Invalid language registry document.');
  }
  const directories = new Set();
  const entries = [];
  for (const [code, directory] of Object.entries(value.plugins)) {
    if (!LANGUAGE_CODE.test(code) || !safeRelative(directory)) {
      fail('PLUGIN_REGISTRY_INVALID', `Invalid registry entry for language ${code}.`);
    }
    const normalizedPath = directory.toLowerCase();
    if (directories.has(normalizedPath)) {
      fail('PLUGIN_REGISTRY_INVALID', `Duplicate plugin directory: ${directory}.`);
    }
    directories.add(normalizedPath);
    entries.push({code, directory});
  }
  return entries.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

function validateManifest(value, code) {
  const fields = ['id', 'code', 'schemaVersion', 'graph', 'status', 'capabilities', 'provenance'];
  const hasDirections = isRecord(value) && Object.hasOwn(value, 'directions');
  const validShape = hasExactKeys(value, fields) || hasExactKeys(value, [...fields, 'directions']);
  if (!validShape || (hasDirections && !validDirections(value.directions)) ||
      typeof value.id !== 'string' ||
      !PLUGIN_ID.test(value.id) || value.code !== code || value.schemaVersion !== '1.0' ||
      !safeRelative(value.graph, {json: true}) ||
      !LANGUAGE_PLUGIN_STATUSES.includes(value.status) ||
      !Array.isArray(value.capabilities) || value.capabilities.length < 1 ||
      value.capabilities.length > 512 || !safeRelative(value.provenance, {json: true})) {
    fail('PLUGIN_PACKAGE_INVALID', `Invalid language plugin manifest for ${code}.`);
  }
  let capabilities;
  try {
    capabilities = Array.from(value.capabilities, validateCapability);
  } catch (error) {
    if (error instanceof PluginError) fail('PLUGIN_PACKAGE_INVALID',
      `Invalid capabilities in manifest for ${code}.`, error);
    throw error;
  }
  const hasSentenceSupport = capabilities.some(item => item.channel === 'sentence' &&
    item.status === 'implemented');
  const hasMorphologySupport = capabilities.some(item => item.channel === 'morphology' &&
    item.status === 'implemented');
  if ((value.status === 'morphology-only' && (hasSentenceSupport || !hasMorphologySupport)) ||
      (value.status !== 'morphology-only' && !hasSentenceSupport)) {
    fail('PLUGIN_PACKAGE_INVALID', `Manifest status conflicts with capabilities for ${code}.`);
  }
  return {...value, capabilities};
}

function validateGraph(value, code) {
  if (!isRecord(value) || value.language !== code || typeof value.schemaVersion !== 'string' ||
      !value.schemaVersion || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('PLUGIN_PACKAGE_INVALID', `Invalid LanguageGraph document for ${code}.`);
  }
  return value;
}

async function loadOne(languageRoot, entry, core, registry) {
  const candidate = resolve(languageRoot, ...entry.directory.split('/'));
  if (!isWithin(languageRoot, candidate) || candidate === languageRoot) {
    fail('PLUGIN_PATH_INVALID', `Plugin directory escapes languages/: ${entry.directory}.`);
  }
  const packageRoot = await realDirectory(candidate, languageRoot,
    `plugin directory for ${entry.code}`, 'PLUGIN_PACKAGE_INVALID');
  const manifestPath = await realFile(packageRoot, 'manifest.json', `${entry.code} manifest`);
  const rawManifest = await readJson(manifestPath, `${entry.code} manifest`, 'PLUGIN_PACKAGE_INVALID');
  const manifest = validateManifest(rawManifest, entry.code);
  const graphPath = await realFile(packageRoot, manifest.graph, `${entry.code} graph`);
  const graph = validateGraph(await readJson(graphPath, `${entry.code} graph`,
    'PLUGIN_PACKAGE_INVALID'), entry.code);
  const provenancePath = await realFile(packageRoot, manifest.provenance,
    `${entry.code} provenance`);
  const provenance = await readJson(provenancePath, `${entry.code} provenance`,
    'PLUGIN_PACKAGE_INVALID');
  if (!isRecord(provenance)) {
    fail('PLUGIN_PACKAGE_INVALID', `Invalid provenance document for ${entry.code}.`);
  }
  const indexPath = await realFile(packageRoot, 'index.js', `${entry.code} plugin entrypoint`);

  let module;
  try {
    module = await import(pathToFileURL(indexPath).href);
  } catch (error) {
    fail('PLUGIN_LOAD_FAILED', `Cannot load trusted plugin entrypoint for ${entry.code}.`, error);
  }
  let plugin = module.default;
  if (typeof plugin === 'function') {
    try {
      plugin = await plugin({core, manifest: structuredClone(manifest),
        graph: structuredClone(graph), provenance: structuredClone(provenance)});
    } catch (error) {
      fail('PLUGIN_LOAD_FAILED', `Plugin factory failed for ${entry.code}.`, error);
    }
  }
  if (!isRecord(plugin)) {
    fail('PLUGIN_PACKAGE_INVALID', `Plugin entrypoint for ${entry.code} must default-export a plugin.`);
  }
  registry.register(plugin, {id: manifest.id, capabilities: manifest.capabilities});
}

/** Load only packages named by the trusted local registry under <root>/languages/. */
export async function loadPluginRegistry(root = DEFAULT_PROJECT_ROOT, options = {}) {
  if (typeof root !== 'string' || !root.trim()) {
    fail('PLUGIN_PATH_INVALID', 'Project root must be a non-empty local path.');
  }
  if (!isRecord(options) || Object.keys(options).some(key => !['core', 'codes'].includes(key))) {
    fail('PLUGIN_INVALID', 'Loader options may contain only core and codes.');
  }
  const {core, codes} = options;
  if (codes !== undefined && (!Array.isArray(codes) || codes.length < 1 ||
      codes.length > 128 || codes.some(code => typeof code !== 'string' ||
        !LANGUAGE_CODE.test(code)) || new Set(codes).size !== codes.length)) {
    fail('PLUGIN_INVALID', 'Loader codes must be a non-empty list of distinct language codes.');
  }
  let projectRoot;
  try {
    projectRoot = await realDirectory(resolve(root), null, 'project root');
  } catch (error) {
    if (error instanceof PluginError) throw error;
    fail('PLUGIN_PATH_INVALID', 'Cannot resolve project root.', error);
  }
  const languageRoot = await realDirectory(resolve(projectRoot, 'languages'), projectRoot,
    'languages directory', 'PLUGIN_REGISTRY_INVALID');
  const registryPath = await realFile(languageRoot, 'registry.json', 'language registry');
  const registryDocument = await readJson(registryPath, 'language registry',
    'PLUGIN_REGISTRY_INVALID');
  const entries = validateRegistryDocument(registryDocument);
  if (codes?.some(code => !entries.some(entry => entry.code === code))) {
    fail('PLUGIN_NOT_FOUND', 'Requested language plugin is not in the registry.');
  }
  const registry = new PluginRegistry();
  for (const entry of entries) {
    if (codes === undefined || codes.includes(entry.code)) {
      await loadOne(languageRoot, entry, core, registry);
    }
  }
  return registry;
}
