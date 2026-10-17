import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Engine} from '../js/core/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {loadPluginRegistry} from '../js/plugins/loader.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = 'Usage: node tools/translate.mjs --languages [--json] | --from CODE --to CODE --text "sentence" [--json | --show-core]';
const CODE = /^[a-z]{2,8}$/u;
const DIRECTION = /^[a-z]{2,8}->[a-z]{2,8}$/u;
const OPTIONS = new Set(['--languages', '--from', '--to', '--text', '--json', '--show-core']);

function refusal(status, code, message, extra = {}) {
  return {status, ...extra, diagnostics: [{code, message}]};
}

function parseArgs(argv) {
  const parsed = {languages: false, json: false, showCore: false};
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!OPTIONS.has(flag) || seen.has(flag)) {
      throw new Error(`Unknown or repeated option: ${flag}.`);
    }
    seen.add(flag);
    if (flag === '--languages') parsed.languages = true;
    else if (flag === '--json') parsed.json = true;
    else if (flag === '--show-core') parsed.showCore = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      parsed[flag.slice(2)] = value;
    }
  }
  if (parsed.languages) {
    if (parsed.from !== undefined || parsed.to !== undefined || parsed.text !== undefined ||
        parsed.showCore) throw new Error('--languages cannot be combined with translation options.');
  } else if (!CODE.test(parsed.from ?? '') || !CODE.test(parsed.to ?? '') ||
      typeof parsed.text !== 'string' || !parsed.text.trim() ||
      (parsed.json && parsed.showCore)) {
    throw new Error('Translation requires --from CODE, --to CODE, and non-empty --text; choose one output format.');
  }
  return parsed;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function discoverLanguages() {
  const registry = await readJson(join(ROOT, 'languages', 'registry.json'));
  if (registry?.schemaVersion !== '1.0' || !registry.plugins ||
      Array.isArray(registry.plugins) || typeof registry.plugins !== 'object' ||
      Object.keys(registry.plugins).length === 0) {
    throw new Error('Invalid language registry.');
  }
  const languages = [];
  for (const [code, directory] of Object.entries(registry.plugins).sort(([a], [b]) => a.localeCompare(b))) {
    if (!CODE.test(code) || directory !== code) throw new Error(`Invalid registry entry for ${code}.`);
    try {
      const manifest = await readJson(join(ROOT, 'languages', directory, 'manifest.json'));
      if (manifest?.code !== code || !['controlled-subset', 'limited-demo', 'morphology-only']
        .includes(manifest.status) || !Array.isArray(manifest.capabilities) ||
        (manifest.directions !== undefined && (!Array.isArray(manifest.directions) ||
          manifest.directions.length > 512 || new Set(manifest.directions).size !== manifest.directions.length ||
          manifest.directions.some(direction => typeof direction !== 'string' || !DIRECTION.test(direction))))) {
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

function print(document, {json = false, showCore = false} = {}) {
  if (json) {
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return;
  }
  if (Array.isArray(document.languages)) {
    for (const language of document.languages) {
      process.stdout.write(`${language.code}\t${language.status}` +
        `${language.directions ? `\t${language.directions.join(',')}` : ''}\n`);
      for (const diagnostic of language.diagnostics) {
        process.stderr.write(`${language.code}: ${diagnostic.code}: ${diagnostic.message}\n`);
      }
    }
    return;
  }
  if (document.status === 'ok') {
    process.stdout.write(`${document.text}\n`);
    if (showCore) process.stderr.write(`CORE: ${JSON.stringify(document.meaning, null, 2)}\n`);
    return;
  }
  for (const diagnostic of document.diagnostics) {
    process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  }
}

function statusFor(error) {
  if (['unsupported', 'invalid', 'ambiguous', 'resource_limit'].includes(error?.status)) {
    return error.status;
  }
  if (error?.code === 'PLUGIN_NOT_FOUND' || error?.code === 'PLUGIN_CAPABILITY_UNAVAILABLE') {
    return 'unsupported';
  }
  if (error?.code === 'INVALID_INPUT') return 'invalid';
  return null;
}

async function translate(options, languages) {
  const base = {from: options.from, to: options.to, input: options.text,
    text: null, meaning: null, alternatives: []};
  const source = languages.find(item => item.code === options.from);
  const target = languages.find(item => item.code === options.to);
  if (!source || !target) {
    const code = !source ? options.from : options.to;
    return refusal('unsupported', 'PLUGIN_NOT_FOUND', `Language plugin not found: ${code}.`, base);
  }
  for (const language of [source, target]) {
    if (language.status === 'unavailable') {
      return refusal('unsupported', 'PLUGIN_PACKAGE_UNAVAILABLE',
        `Language package ${language.code} is unavailable.`, base);
    }
  }
  const direction = `${options.from}->${options.to}`;
  const rejectingConstraints = [source, target].filter(language => language.directions !== undefined &&
    !language.directions.includes(direction));
  if (rejectingConstraints.length) {
    return refusal('unsupported', 'PLUGIN_DIRECTION_UNAVAILABLE',
      `Translation direction ${options.from} → ${options.to} is not declared by ${rejectingConstraints.map(language => language.code).join(', ')}.`, base);
  }
  const implemented = (language, operation) => language.capabilities.some(item =>
    item.channel === 'sentence' && item.operation === operation && item.status === 'implemented');
  if (!implemented(source, 'analyze') || !implemented(target, 'realize')) {
    return refusal('unsupported', 'PLUGIN_CAPABILITY_UNAVAILABLE',
      `Sentence translation ${options.from} → ${options.to} is unsupported by declared capabilities.`, base);
  }

  const [ontology, features] = await Promise.all([
    readJson(join(ROOT, 'data', 'concepts.json')),
    readJson(join(ROOT, 'data', 'features.json'))
  ]);
  const registry = await loadPluginRegistry(ROOT, {core: createCoreLanguage(ontology),
    codes: [...new Set([options.from, options.to])]});
  const engine = new Engine(ontology, features, registry);
  try {
    const readings = engine.analyzeCandidates({text: options.text, from: options.from});
    if (readings.length !== 1) {
      return refusal('ambiguous', 'AMBIGUOUS_MEANING',
        `Source has ${readings.length} distinct semantic readings.`,
        {...base, alternatives: readings.map(item => ({meaning: item.interlingua,
          lexicalSenses: item.lexicalSenses, score: item.score}))});
    }
    const meaning = readings[0].interlingua;
    const result = engine.realize({interlingua: meaning, to: options.to});
    return {status: 'ok', ...base, text: result.text, meaning,
      alternatives: result.alternatives ?? [], diagnostics: result.diagnostics ?? [],
      warnings: result.warnings ?? [], informationLoss: result.informationLoss ?? []};
  } catch (error) {
    const status = statusFor(error);
    if (!status) throw error;
    return refusal(status, error.code ?? 'INVALID_INPUT', error.message, base);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const document = refusal('invalid', 'INVALID_ARGUMENTS', `${error.message}\n${USAGE}`,
      {from: null, to: null, input: null, text: null, meaning: null, alternatives: []});
    print(document, {json: process.argv.includes('--json')});
    process.exitCode = 2;
    return;
  }
  try {
    const languages = await discoverLanguages();
    const document = options.languages ? {status: 'ok', languages} :
      await translate(options, languages);
    print(document, options);
    process.exitCode = ['ok'].includes(document.status) ? 0 : 2;
  } catch (error) {
    const document = refusal('error', error.code ?? 'INFRASTRUCTURE_ERROR', error.message,
      {from: options.from ?? null, to: options.to ?? null, input: options.text ?? null,
        text: null, meaning: null, alternatives: []});
    print(document, options);
    process.exitCode = 1;
  }
}

await main();
