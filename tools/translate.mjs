import {createAppRuntime, listLanguages} from '../js/app/runtime.js';
import {createTranslationService} from '../js/app/translation-service.js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {translationRefusal as refusal} from '../js/core/translation-result.js';

const USAGE = 'Usage: node tools/translate.mjs --languages [--json] | --from CODE --to CODE --text "sentence" [--context-json JSON] [--search-json JSON] [--segments] [--preview ID] [--json | --show-core]';
const CODE = /^[a-z]{2,8}$/u;
const OPTIONS = new Set(['--languages','--from','--to','--text','--context-json','--search-json',
  '--preview','--segments','--json','--show-core']);

function meaningSummary(meaning) {
  if(!meaning||typeof meaning!=='object')return '';
  const participants=Object.entries(meaning.roles||{}).map(([role,value])=>
    `${role}=${value?.concept??value?.referent?.anchor??'unknown'}`).join(', ');
  return `MeaningGraph: ${meaning.concept??meaning.kind??meaning.type??'meaning'}`+
    `${participants?` · ${participants}`:''}`;
}

function printRealizations(document) {
  const rows=(document.interpretations||[]).flatMap(interpretation=>
    (interpretation.realizations||[]).map(realization=>({...realization,
      meaning:interpretation.meaning})));
  if(rows.length<2)return;
  process.stdout.write('Complete-sentence variants:\n');
  for(const row of rows){
    const label=row.kind==='additional_assumption'?'additional assumption':'equivalent wording';
    const assumptions=(row.assumptions||[]).map(item=>`${item.feature}: ${item.reason}`).join('; ');
    process.stdout.write(`  ${row.id}${row.id===document.previewId?' · preview':''} · ${label}`+
      `${assumptions?` (${assumptions})`:''} · ${row.text} · ${meaningSummary(row.meaning)}\n`);
  }
}

function printSegments(segments) {
  for(const segment of segments||[]){
    const target=segment.targetSpan?`${segment.targetSpan.start}:${segment.targetSpan.end}`:'unavailable';
    const sources=(segment.sources||[]).map(item=>item.status==='aligned'?
      `${item.meaningPath}@${item.span.start}:${item.span.end}`:
      `${item.meaningPath} unavailable: ${item.reason}`).join(', ')||'no source link';
    const paths=(segment.meaningPaths||[]).join(', ')||'phrase';
    process.stdout.write(`  ${segment.text} · target ${target} · ${paths} · ${sources}\n`);
  }
}

function parseArgs(argv) {
  const parsed = {languages:false,json:false,showCore:false,segments:false};
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
    else if(flag==='--segments')parsed.segments=true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      parsed[flag.slice(2)] = value;
    }
  }
  for(const [key,label] of [['context-json','context'],['search-json','search']]){
    if(parsed[key]===undefined)continue;
    try{parsed[label]=JSON.parse(parsed[key]);}
    catch{throw new Error(`Invalid JSON for --${key}.`);}
  }
  if (parsed.languages) {
    if (parsed.from !== undefined || parsed.to !== undefined || parsed.text !== undefined ||
        parsed.context!==undefined||parsed.search!==undefined||parsed.preview!==undefined||
        parsed.segments||parsed.showCore) throw new Error('--languages cannot be combined with translation options.');
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
    process.stdout.write(`${document.preview?.text??document.text}\n`);
    printRealizations(document);
    printSegments(document.preview?.segments);
    if (showCore) process.stderr.write(`CORE: ${JSON.stringify(document.meaning, null, 2)}\n`);
    return;
  }
  if(document.preview?.text){
    process.stdout.write(`Preview ${document.preview.id} (meaning unresolved): ${document.preview.text}\n`);
    printRealizations(document);
    printSegments(document.preview.segments);
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
        text:options.text,context:options.context,search:options.search,includeSegments:options.segments,
        previewId:options.preview});
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
