import {createAppRuntime, listLanguages} from '../js/app/runtime.js';
import {createTranslationService} from '../js/app/translation-service.js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {translationRefusal as refusal} from '../js/core/translation-result.js';

const USAGE = 'Usage: node tools/translate.mjs --languages [--json] | --from CODE --to CODE --text "sentence" [--json | --show-core]';
const CODE = /^[a-z]{2,8}$/u;
const OPTIONS = new Set(['--languages', '--from', '--to', '--text', '--json', '--show-core']);

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

export async function executeCli(argv, {runtime} = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch {
    const document = refusal('invalid', 'INVALID_ARGUMENTS', `Invalid command-line arguments.\n${USAGE}`,
      {from: null, to: null, input: null, text: null, meaning: null, alternatives: []});
    return {document, exitCode: 2, options: null};
  }
  try {
    let document;
    if (options.languages) {
      document = {status: 'ok', languages: await listLanguages()};
    } else {
      const selectedRuntime = runtime ?? await createAppRuntime({
        pluginCodes: [...new Set([options.from, options.to])]
      });
      document = createTranslationService(selectedRuntime).translate({from: options.from, to: options.to,
        text: options.text});
    }
    return {document, exitCode: document.status === 'ok' ? 0 : 2, options};
  } catch (error) {
    const document = refusal('error', 'INFRASTRUCTURE_ERROR', 'Translation infrastructure failed.',
      {from: options.from ?? null, to: options.to ?? null, input: options.text ?? null,
        text: null, meaning: null, alternatives: []});
    return {document, exitCode: 1, options};
  }
}

async function main() {
  const result = await executeCli(process.argv.slice(2));
  print(result.document, {
    json: result.options?.json ?? process.argv.includes('--json'),
    showCore: result.options?.showCore
  });
  process.exitCode = result.exitCode;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
