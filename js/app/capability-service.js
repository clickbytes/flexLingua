const QUESTION_CONSTRUCTION = /question|interrogative/iu;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function declarationsFor(declarations, channel, operation, predicate = () => true) {
  return declarations.filter(item => item.channel === channel && item.operation === operation &&
    predicate(item));
}

function operationSummary(declarations) {
  const implemented = declarations.filter(item => item.status === 'implemented');
  const unsupported = declarations.filter(item => item.status !== 'implemented');
  const constructions = values => [...new Set(values.map(item => item.construction))].sort();
  let status = 'undeclared';
  if (implemented.length && unsupported.length) status = 'partial';
  else if (implemented.length) status = 'available';
  else if (declarations.length) status = 'unsupported';
  return {
    status,
    available: implemented.length > 0,
    constructions: constructions(implemented),
    unsupportedConstructions: constructions(unsupported),
    declarations
  };
}

function diagnostic(code, message) {
  return {code, message};
}

/** Read-only capability catalog joining package declarations with the live Engine inventory. */
export function createCapabilityService(runtime) {
  if (!Array.isArray(runtime?.languages) || !Array.isArray(runtime?.capabilities?.languages)) {
    throw new Error('Capability service requires an initialized application runtime.');
  }

  const engineLanguages = new Map(runtime.capabilities.languages.map(item => [item.code, item]));
  const packages = new Map(runtime.languages.map(item => [item.code, item]));
  const codes = [...new Set([...packages.keys(), ...engineLanguages.keys()])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0);

  const languages = codes.map(code => {
    const declared = packages.get(code);
    const engine = engineLanguages.get(code);
    const packageStatus = declared?.status ?? 'unavailable';
    const diagnostics = clone(declared?.diagnostics ?? []);
    let status = 'available';
    if (!declared || packageStatus === 'unavailable') status = 'package_unavailable';
    else if (!engine) {
      status = 'runtime_unavailable';
      diagnostics.push(diagnostic('PLUGIN_RUNTIME_UNAVAILABLE',
        `Language package ${code} is declared but was not registered by the runtime.`));
    }
    const capabilities = clone(engine?.capabilities ?? declared?.capabilities ?? []);
    return freeze({
      code,
      status,
      packageStatus,
      ...(declared?.directions === undefined ? {} : {directions: [...declared.directions]}),
      capabilities,
      manifestCapabilities: clone(declared?.capabilities ?? []),
      runtimeCapabilities: clone(engine?.runtimeCapabilities ?? {
        parsing: false, realization: false, questions: false,
        morphology: false, lexicon: false, signal: false
      }),
      diagnostics
    });
  });
  const byCode = new Map(languages.map(language => [language.code, language]));

  function language(code) {
    return byCode.get(code) ?? null;
  }

  function statusResult(code, item) {
    if (!item) return {status: 'not_found', code: 'PLUGIN_NOT_FOUND', languageCode: code,
      diagnostics: [diagnostic('PLUGIN_NOT_FOUND', `Language plugin not found: ${code}.`)]};
    if (item.status === 'package_unavailable') return {status: 'package_unavailable',
      code: item.diagnostics[0]?.code ?? 'PLUGIN_PACKAGE_UNAVAILABLE', languageCode: code,
      diagnostics: item.diagnostics.length ? item.diagnostics : [diagnostic(
        'PLUGIN_PACKAGE_UNAVAILABLE', `Language package ${code} is unavailable.`)]};
    if (item.status === 'runtime_unavailable') return {status: 'runtime_unavailable',
      code: 'PLUGIN_RUNTIME_UNAVAILABLE', languageCode: code,
      diagnostics: item.diagnostics};
    return null;
  }

  function translation({from, to} = {}) {
    const source = language(from);
    const target = language(to);
    const failure = statusResult(from, source) ?? statusResult(to, target);
    const base = {from: from ?? null, to: to ?? null, source, target};
    if (failure) return freeze({...base, ...failure, sharedConstructions: []});

    const direction = `${from}->${to}`;
    const restrictedBy = [source, target].filter(item => item.directions !== undefined &&
      !item.directions.includes(direction)).map(item => item.code);
    const analyze = operationSummary(declarationsFor(source.capabilities, 'sentence', 'analyze'));
    const realize = operationSummary(declarationsFor(target.capabilities, 'sentence', 'realize'));
    const sharedConstructions = analyze.constructions.filter(item =>
      realize.constructions.includes(item));
    if (restrictedBy.length) return freeze({...base, status: 'direction_unavailable',
      code: 'PLUGIN_DIRECTION_UNAVAILABLE',
      diagnostics: [diagnostic('PLUGIN_DIRECTION_UNAVAILABLE',
        `Translation direction ${from} -> ${to} is not declared by ${restrictedBy.join(', ')}.`)],
      analyze, realize, sharedConstructions});
    if (!analyze.available || !realize.available) {
      const missing = [!analyze.available ? 'source sentence analysis' : null,
        !realize.available ? 'target sentence realization' : null].filter(Boolean);
      return freeze({...base, status: 'capability_unavailable', code: 'PLUGIN_CAPABILITY_UNAVAILABLE',
        diagnostics: [diagnostic('PLUGIN_CAPABILITY_UNAVAILABLE',
          `Sentence translation ${from} → ${to} is unsupported: ${missing.join(' and ')} is unavailable.`)],
        analyze, realize, sharedConstructions});
    }
    return freeze({...base, status: 'available', scope: 'declared-subset',
      diagnostics: [], analyze, realize, sharedConstructions});
  }

  function listDirections({availableOnly = false} = {}) {
    const result = [];
    for (const from of codes) {
      for (const to of codes) {
        const item = translation({from, to});
        if (!availableOnly || item.status === 'available') result.push(item);
      }
    }
    return freeze(result);
  }

  function chat({language: code} = {}) {
    const item = language(code);
    const failure = statusResult(code, item);
    if (failure) return freeze({language: code ?? null, status: failure.status,
      code: failure.code, sentence: null, questions: null, responsePlanning: 'engine-dependent',
      diagnostics: failure.diagnostics});
    const sentence = {
      analyze: operationSummary(declarationsFor(item.capabilities, 'sentence', 'analyze',
        declaration => !QUESTION_CONSTRUCTION.test(declaration.construction))),
      realize: operationSummary(declarationsFor(item.capabilities, 'sentence', 'realize',
        declaration => !QUESTION_CONSTRUCTION.test(declaration.construction)))
    };
    const questions = {
      analyze: operationSummary(declarationsFor(item.capabilities, 'sentence', 'analyze',
        declaration => QUESTION_CONSTRUCTION.test(declaration.construction))),
      realize: operationSummary(declarationsFor(item.capabilities, 'sentence', 'realize',
        declaration => QUESTION_CONSTRUCTION.test(declaration.construction)))
    };
    return freeze({language: code, status: 'capabilities_only', sentence, questions,
      responsePlanning: 'engine-dependent', diagnostics: []});
  }

  function formOperation(item, channel, operation, providerAvailable) {
    const summary = operationSummary(declarationsFor(item.capabilities, channel, operation));
    if (!providerAvailable) return freeze({...summary, status: 'provider_unavailable', available: false,
      diagnostics: [diagnostic('PLUGIN_CAPABILITY_UNAVAILABLE',
        `${channel === 'lexicon' ? 'Lexical lookup' : 'Morphology'} provider is unavailable for ${item.code}.`)]});
    return freeze({...summary, diagnostics: []});
  }

  function forms({language: code} = {}) {
    const item = language(code);
    const failure = statusResult(code, item);
    if (failure) return freeze({language: code ?? null, status: failure.status,
      code: failure.code,
      lookup: null, analyzeForm: null, inspectParadigm: null, diagnostics: failure.diagnostics});
    const lookup = formOperation(item, 'lexicon', 'lookup', item.runtimeCapabilities.lexicon);
    const analyzeForm = formOperation(item, 'morphology', 'analyze',
      item.runtimeCapabilities.morphology);
    const inspectParadigm = formOperation(item, 'morphology', 'paradigm',
      item.runtimeCapabilities.morphology);
    return freeze({language: code, status: 'capabilities_only', lookup, analyzeForm,
      inspectParadigm, diagnostics: []});
  }

  return Object.freeze({
    listLanguages: () => languages,
    language,
    translation,
    listDirections,
    chat,
    forms
  });
}
