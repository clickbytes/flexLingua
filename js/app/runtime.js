import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Engine} from '../core/engine.js';
import {createCoreLanguage} from '../core/core-language.js';
import {DEFAULT_PROJECT_ROOT, loadPluginRegistry} from '../plugins/loader.js';

const CODE = /^[a-z]{2,8}$/u;
const DIRECTION = /^[a-z]{2,8}->[a-z]{2,8}$/u;
const LANGUAGE_STATUSES = ['controlled-subset', 'limited-demo', 'morphology-only'];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Read the declared language inventory, retaining package-level failures for CLI listing. */
export async function listLanguages(root = DEFAULT_PROJECT_ROOT) {
  const registry = await readJson(join(root, 'languages', 'registry.json'));
  if (registry?.schemaVersion !== '1.0' || !registry.plugins ||
      Array.isArray(registry.plugins) || typeof registry.plugins !== 'object' ||
      Object.keys(registry.plugins).length === 0) {
    throw new Error('Invalid language registry.');
  }
  const languages = [];
  for (const [code, directory] of Object.entries(registry.plugins).sort(([a], [b]) =>
    a.localeCompare(b))) {
    if (!CODE.test(code) || directory !== code) throw new Error(`Invalid registry entry for ${code}.`);
    try {
      const manifest = await readJson(join(root, 'languages', directory, 'manifest.json'));
      if (manifest?.code !== code || !LANGUAGE_STATUSES.includes(manifest.status) ||
          !Array.isArray(manifest.capabilities) ||
          (manifest.directions !== undefined && (!Array.isArray(manifest.directions) ||
            manifest.directions.length > 512 || new Set(manifest.directions).size !== manifest.directions.length ||
            manifest.directions.some(direction => typeof direction !== 'string' ||
              !DIRECTION.test(direction))))) {
        throw new Error('Invalid manifest identity, status, capabilities, or directions.');
      }
      languages.push({code, status: manifest.status, capabilities: manifest.capabilities,
        ...(manifest.directions === undefined ? {} : {directions: manifest.directions}),
        diagnostics: []});
    } catch (error) {
      languages.push({code, status: 'unavailable', capabilities: [],
        diagnostics: [{code: 'PLUGIN_PACKAGE_UNAVAILABLE',
          message: `Cannot inspect ${code} package: ${error.message}`}]});
    }
  }
  return languages;
}

/** Build one shared CORE, PluginRegistry, and Engine for application services. */
export async function createAppRuntime({root = DEFAULT_PROJECT_ROOT} = {}) {
  const [ontology, features, languages] = await Promise.all([
    readJson(join(root, 'data', 'core', 'concepts.json')),
    readJson(join(root, 'data', 'core', 'features.json')),
    listLanguages(root)
  ]);
  const core = createCoreLanguage(ontology);
  const plugins = await loadPluginRegistry(root, {core});
  const engine = new Engine(ontology, features, plugins);
  return Object.freeze({root, ontology, features, plugins, engine, languages,
    capabilities: engine.capabilities()});
}
