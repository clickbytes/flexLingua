import {createRuleAdapter} from '../core/grammar.js';
import {createLexicon} from '../core/lexicon.js';
import {createMorphology} from '../core/morphology/engine.js';
import {PluginError} from './errors.js';
import {compileLanguageGraph} from './compiler.js';
import {createSemanticBridge} from './semantic-bridge.js';
import {createSignalProviders} from './signal.js';
import {normalizeAnalysisResult, normalizeRealizationResult} from './contract.js';
import {distinctReadings} from '../core/translation-result.js';

const isRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const INTERNAL_PLUGIN_FAILURE_CODES = new Set([
  'PLUGIN_RESULT_INVALID', 'PLUGIN_PACKAGE_INVALID', 'PLUGIN_GRAPH_INVALID',
  'PLUGIN_GRAPH_CYCLE', 'PLUGIN_MODULE_MISSING', 'PLUGIN_CORE_REFERENCE_INVALID'
]);

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function uniqueModuleForLayer(plan, layer, predicate = () => true, {required = false} = {}) {
  const names = [...new Set(plan.layers[layer].map(node => node.module))];
  const candidates = names.map(name => ({name, data: plan.modules[name]}))
    .filter(candidate => predicate(candidate.data));
  if (candidates.length > 1) {
    fail('PLUGIN_PACKAGE_INVALID', `LanguageGraph has multiple ${layer} modules for one runtime provider.`);
  }
  if (!candidates.length && required) {
    fail('PLUGIN_CAPABILITY_UNAVAILABLE', `LanguageGraph lacks a required ${layer} module.`);
  }
  return candidates[0] || null;
}

function findFeatureModule(plan) {
  const candidates = Object.entries(plan.modules).filter(([, data]) => isRecord(data.dimensions));
  if (!candidates.length) return null;
  const profiles = new Set(candidates.map(([, data]) => JSON.stringify(data.dimensions)));
  if (profiles.size > 1) {
    fail('PLUGIN_PACKAGE_INVALID', 'LanguageGraph contains conflicting morphology feature inventories.');
  }
  return candidates[0][1];
}

const CAPABILITY_INDEXES=new WeakMap();
function availableFor(capabilities, operation, construction) {
  let index=CAPABILITY_INDEXES.get(capabilities);
  if(!index) {
    index=new Map();
    for(const item of capabilities) {
      if(item.channel!=='sentence'||item.status!=='implemented')continue;
      if(!index.has(item.operation))index.set(item.operation,new Set());
      index.get(item.operation).add(item.construction);
    }
    CAPABILITY_INDEXES.set(capabilities,index);
  }
  return index.get(operation)?.has(construction)===true;
}

function availableForTransfer(capabilities, operation, transfer) {
  if (!availableFor(capabilities, operation, transfer.construction)) return false;
  return transfer.kind !== 'question' ||
    availableFor(capabilities, operation, transfer.propositionConstruction);
}

function normalizeUnsupportedQuestion(error, text, capabilities) {
  if (typeof text !== 'string' || !text.trim().endsWith('?') ||
      error?.status !== 'unsupported' || INTERNAL_PLUGIN_FAILURE_CODES.has(error?.code) ||
      !availableFor(capabilities, 'analyze', 'question.yes-no')) {
    return error;
  }
  return Object.assign(new Error(error.message || 'Unsupported question construction.'), {
    code: 'PLUGIN_CAPABILITY_UNAVAILABLE', status: 'unsupported'
  });
}

function validateInput(input, operation) {
  if (!isRecord(input) || Object.keys(input).some(key =>
      !['text', 'meaning', 'context','includeSegments','sourceSegments'].includes(key)) ||
      !isRecord(input.context ?? {})) {
    fail('PLUGIN_INVALID', `Invalid ${operation} request.`);
  }
  if(input.includeSegments!==undefined&&typeof input.includeSegments!=='boolean')
    fail('PLUGIN_INVALID','includeSegments must be boolean.');
  if(input.sourceSegments!==undefined&&(!Array.isArray(input.sourceSegments)||
      input.sourceSegments.length>64||input.sourceSegments.some(item=>{
        if(!isRecord(item)||typeof item.path!=='string'||!item.path.startsWith('#/'))return true;
        if(item.span!==undefined)return !isRecord(item.span)||
          Object.keys(item.span).length!==2||!Number.isSafeInteger(item.span.start)||
          !Number.isSafeInteger(item.span.end)||item.span.start<0||
          item.span.end<=item.span.start||item.span.end>4096||
          Object.keys(item).some(key=>!['path','span'].includes(key));
        return Object.keys(item).length!==3||item.status!=='unavailable'||
          typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>128||
          Object.keys(item).some(key=>!['path','status','reason'].includes(key));
      }))) fail('PLUGIN_INVALID','sourceSegments must be a bounded source-alignment trace.');
  if (operation === 'analyze' && (typeof input.text !== 'string' || !input.text.trim())) {
    fail('PLUGIN_INVALID', 'Analysis requires non-empty text.');
  }
  if (operation === 'realize' && !isRecord(input.meaning)) {
    fail('PLUGIN_INVALID', 'Realization requires a meaning object.');
  }
  const context = input.context ?? {};
  if (Object.keys(context).some(key =>
      !['construction','lexicalRegister','subjectPronoun','informationStructure',
        'omitDeicticSubject'].includes(key)) ||
      (context.omitDeicticSubject!==undefined&&typeof context.omitDeicticSubject!=='boolean')) {
    fail('PLUGIN_INVALID', `Unsupported ${operation} context field.`);
  }
  return context;
}

function errorResult(error, operation) {
  if (INTERNAL_PLUGIN_FAILURE_CODES.has(error?.code)) {
    throw new PluginError('PLUGIN_OPERATION_FAILED',
      `Language plugin ${operation} failed.`, {cause: error});
  }
  const code = typeof error?.code === 'string' && DIAGNOSTIC_CODE.test(error.code)
    ? error.code : 'PLUGIN_OPERATION_FAILED';
  let status = error?.status;
  if (!['ok', 'ambiguous', 'unsupported', 'invalid', 'resource_limit'].includes(status)) {
    if (typeof error?.code === 'string' && /_(?:LIMIT|TOO_COMPLEX)$/u.test(error.code)) {
      status = 'resource_limit';
    } else if (['SOURCE_CHARACTER_UNSUPPORTED', 'SOURCE_SEGMENTER_UNAVAILABLE']
      .includes(error?.code) || error?.status === 'unsupported') {
      status = 'unsupported';
    } else if (error?.code === 'SOURCE_TEXT_INVALID' || error?.status === 'invalid') {
      status = 'invalid';
    }
  }
  if (!['ambiguous', 'unsupported', 'invalid', 'resource_limit'].includes(status)) {
    throw new PluginError('PLUGIN_OPERATION_FAILED',
      `Language plugin ${operation} failed.`, {cause: error});
  }
  const message = {
    ambiguous: 'The input has multiple possible analyses.',
    unsupported: 'The requested language construction is unsupported.',
    invalid: 'The language plugin rejected the request.',
    resource_limit: 'The request exceeds supported resource limits.'
  }[status];
  const diagnostic = {code, message};
  return {status, diagnostics: [diagnostic]};
}

function refusalAnalysis(error, operation = 'analysis') {
  const result = errorResult(error, operation);
  const status = result.status === 'ambiguous' ? 'unsupported' : result.status;
  return normalizeAnalysisResult({status, readings: [], diagnostics: result.diagnostics});
}

function refusalRealization(error, operation = 'realization') {
  const result = errorResult(error, operation);
  const status = result.status === 'ambiguous' ? 'unsupported' : result.status;
  return normalizeRealizationResult({status, text: null, alternatives: [], warnings: [],
    informationLoss: [], diagnostics: result.diagnostics});
}

/** Build one ESM LanguagePlugin from a compiled language graph and its JSON modules. */
export function defineDeclarativeLanguagePlugin({manifest, graph, modules, core} = {}) {
  const plan = compileLanguageGraph({manifest, graph, modules, core});
  const runtimeVersion=manifest.schemaVersion;
  const capabilities = plan.capabilities;
  const sentenceCapabilities = capabilities.filter(item => item.channel === 'sentence');
  const hasSentenceImplementation = sentenceCapabilities.some(item => item.status === 'implemented');
  const lexiconModule = uniqueModuleForLayer(plan, 'lexicon', data =>
    data.language === manifest.code && ['nouns', 'verbs', 'adjectives', 'functionWords']
      .some(key => Array.isArray(data[key])), {required: hasSentenceImplementation});
  const syntaxModule = uniqueModuleForLayer(plan, 'syntax', data =>
    data.language === manifest.code && isRecord(data.frames), {required: hasSentenceImplementation});
  const dictionary = lexiconModule?.data;
  const grammar = syntaxModule?.data;
  const morphologyModule = uniqueModuleForLayer(plan, 'morphology', data =>
    data.language === manifest.code && data.version === '1.11' &&
    isRecord(data.paradigms) && Array.isArray(data.bindings));
  const morphologyCapabilities = capabilities.filter(item => item.channel === 'morphology');
  const lexiconCapabilities = capabilities.filter(item => item.channel === 'lexicon');
  const wantsLexicon = lexiconCapabilities.some(item => item.status === 'implemented');
  const needsLexicon = hasSentenceImplementation ||
    morphologyCapabilities.some(item => item.status === 'implemented') || wantsLexicon;
  let lexical = null;
  if (needsLexicon && dictionary) {
    try {
      lexical = createLexicon(dictionary, {strict: dictionary.lexicalModel === '1.01'});
      lexical.validateCore(core);
    } catch (error) {
      fail('PLUGIN_PACKAGE_INVALID', 'Cannot build the declared lexical provider.', error);
    }
  }
  let morphology;
  if (morphologyCapabilities.some(item => item.status === 'implemented')) {
    if (!morphologyModule || !dictionary) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Implemented morphology requires its spec and lexical module.');
    }
    const featureModule = findFeatureModule(plan);
    if (!featureModule) fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Morphology requires a local feature inventory.');
    const featureProfile = morphologyModule.data.featureProfile ?? featureModule.featureProfile;
    try {
      morphology = createMorphology(morphologyModule.data, lexical.dictionary, featureModule, {
        core, lexicon: lexical, ...(featureProfile ? {featureProfile} : {})
      });
    } catch (error) {
      fail('PLUGIN_PACKAGE_INVALID', 'Cannot build the declared morphology provider.', error);
    }
  }

  const signalModule = uniqueModuleForLayer(plan, 'signal', () => true);
  const signalCapabilities = capabilities.filter(item => item.channel === 'signal');
  let signal;
  if (signalCapabilities.some(item => item.status === 'implemented')) {
    if (!signalModule) fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Implemented signal capability has no module.');
    if (signalCapabilities.some(item => item.status === 'implemented' &&
        item.construction !== 'written')) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Only written signal is supported by this runtime.');
    }
    signal = createSignalProviders(signalModule.data);
    if (signalCapabilities.some(item => item.status === 'implemented' &&
        item.operation !== 'decode')) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'The written signal provider supports decoding only.');
    }
  }

  let adapter = null;
  if (hasSentenceImplementation) {
    try {
      adapter = createRuleAdapter(plan, {morphology,lexicon:lexical,core});
    } catch (error) {
      fail('PLUGIN_PACKAGE_INVALID', 'Cannot build the declared sentence runtime.', error);
    }
  }

  const semanticBridge = createSemanticBridge({plan, core});
  const lexicalProvider = wantsLexicon
    ? adapter?.lexicon || morphology?.lexicon || lexical
    : null;
  if (lexiconCapabilities.some(item => item.status === 'implemented') && !lexicalProvider) {
    fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Implemented lexicon capability has no lexical module.');
  }

  const plugin = {
    contractVersion: '1.0',
    code: plan.language,
    describe() { return {language: plan.language, version: runtimeVersion}; },
    capabilities() { return structuredClone(capabilities); }
  };
  if (lexiconCapabilities.length && lexicalProvider) plugin.lexicon = lexicalProvider;
  if (morphologyCapabilities.length && morphology) {
    plugin.morphology = Object.freeze({
      generate: input => morphology.generate(input),
      analyze: input => morphology.analyze(input),
      paradigm: input => morphology.paradigm(input),
      availability: input => morphology.availability(input),
      inventory: () => structuredClone(morphology.lexicon.entries),
      describe: () => structuredClone(morphology.describe())
    });
  }
  if (signalCapabilities.length && signal) plugin.signal = signal;

  const analyzeRows = sentenceCapabilities.filter(item => item.operation === 'analyze');
  if (analyzeRows.length) {
    plugin.analyze = function analyze(input = {}) {
      try {
        const context = validateInput(input, 'analyze');
        if (!adapter || !analyzeRows.some(item => item.status === 'implemented')) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Sentence analysis is unsupported for this package.');
        }
        const candidates = adapter.analyzeCandidates(input.text);
        if (!Array.isArray(candidates) || !candidates.length) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'No declared sentence analysis is available.');
        }
        if (candidates.length > 32) fail('PLUGIN_RESOURCE_LIMIT', 'Sentence analysis exceeded its reading limit.');
        const readings = candidates.map(candidate => {
          const transfer = semanticBridge.transferFor(candidate.interlingua, context.construction);
          if (!availableForTransfer(capabilities, 'analyze', transfer)) {
            fail('PLUGIN_CAPABILITY_UNAVAILABLE',
              `Analysis is unsupported for construction ${transfer.construction} or its proposition.`);
          }
          const reading = semanticBridge.validateReading(candidate, transfer);
          const runtimeTransfer = semanticBridge.projectMeaning(
            reading.meaning, transfer, reading.lexicalSenses);
          return {meaning: reading.meaning, analysis: {
            lexicalSenses: reading.lexicalSenses, score: reading.score,
            transfer: runtimeTransfer,
            ...(Array.isArray(candidate.sourceSegments)?{sourceSegments:candidate.sourceSegments}: {}),
            ...(Array.isArray(candidate.surfaceVariants)&&candidate.surfaceVariants.length?{
              surface:{variants:candidate.surfaceVariants.map(variant=>({
                id:variant.id,construction:runtimeTransfer.construction,
                slots:variant.slots,markedness:variant.markedness
              }))}
            }: {})
          }};
        });
        const distinct = distinctReadings(readings);
        const ambiguous = distinct.length > 1;
        return normalizeAnalysisResult({status: ambiguous ? 'ambiguous' : 'ok', readings: distinct,
          diagnostics: ambiguous ? [{code: 'PLUGIN_ANALYSIS_AMBIGUOUS',
            message: 'More than one meaning fits the input.'}] : []});
      } catch (error) {
        return refusalAnalysis(normalizeUnsupportedQuestion(error, input?.text, capabilities));
      }
    };
  }

  const realizeRows = sentenceCapabilities.filter(item => item.operation === 'realize');
  if (realizeRows.length) {
    plugin.realize = function realize(input = {}) {
      try {
        const context = validateInput(input, 'realize');
        const transfer = semanticBridge.transferFor(input.meaning, context.construction);
        if (!availableForTransfer(capabilities, 'realize', transfer)) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE',
            `Realization is unsupported for construction ${transfer.construction} or its proposition.`);
        }
        if (!adapter) fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Sentence realization is unsupported.');
        const runtimeTransfer = semanticBridge.projectMeaning(input.meaning, transfer);
        const result = adapter.realize(input.meaning, {
          ...(context.lexicalRegister ? {lexicalRegister: context.lexicalRegister} : {}),
          ...(context.subjectPronoun ? {subjectPronoun: context.subjectPronoun} : {}),
          ...(context.informationStructure ? {informationStructure: context.informationStructure} : {}),
          ...(context.omitDeicticSubject===true?{omitDeicticSubject:true}:{}),
          semanticTransfer: runtimeTransfer,
          ...(input.includeSegments===true?{includeSegments:true,
            sourceSegments:input.sourceSegments||[]}: {})
        });
        if (!isRecord(result) || typeof result.text !== 'string' || !result.text.trim()) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Realizer produced no supported sentence.');
        }
        const informationLoss = adapter.informationLoss(input.meaning);
        const trace = semanticBridge.realizationTrace(input.meaning, transfer, informationLoss);
        const unsupportedFeature = trace.find(item => item.status === 'unsupported');
        if (unsupportedFeature) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE',
            `Target cannot realize semantic feature ${unsupportedFeature.feature}.`);
        }
        return normalizeRealizationResult({status: 'ok', text: result.text,
          alternatives: result.alternatives || [], warnings: result.warnings || [],
          informationLoss: trace.flatMap(item => {
            if (item.status === 'preserved') return [];
            const loss = informationLoss.find(candidate => candidate.path === item.path);
            return loss ? [loss] : [];
          }), diagnostics: [],
          ...(Array.isArray(result.realizations)?{realizations:result.realizations}: {})});
      } catch (error) {
        return refusalRealization(error);
      }
    };
  }

  return Object.freeze(plugin);
}
