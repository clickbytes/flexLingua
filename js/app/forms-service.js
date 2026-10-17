function errorResult(error) {
  const code = error?.code ?? 'FORMS_SERVICE_ERROR';
  const message = error?.message ?? 'Forms service failed.';
  const unsupported = error?.status === 'unsupported' || code === 'PLUGIN_NOT_FOUND' ||
    code === 'PLUGIN_CAPABILITY_UNAVAILABLE';
  return {status: unsupported ? 'unsupported' : 'error', code, message,
    diagnostics: Array.isArray(error?.diagnostics) && error.diagnostics.length ?
      error.diagnostics : [{code, message}]};
}

function featureSet(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) =>
      key.length > 0 && typeof item === 'string' && item.length > 0);
}

function morphologyFailure(error, {language, lexemeId, features, hasProvider = false} = {}) {
  const failure = errorResult(error);
  return {...failure, language, providerStatus: hasProvider ? 'available' : failure.status,
    hasProvider, ...(lexemeId === undefined ? {} : {lexemeId}),
    ...(features === undefined ? {} : {cellQuery: features}),
    hasParadigm: null, paradigmStatus: 'unknown', availability: null, cellAvailability: null};
}

/** Pass-through facade for declared lexicon and morphology providers. */
export function createFormsService(runtime) {
  if (!runtime?.engine) throw new Error('Forms service requires an initialized application runtime.');
  const {engine} = runtime;

  function lookupLexemes({language, lemma} = {}) {
    try {
      const lexemes = engine.lookupLexemes({language, lemma});
      return {status: lexemes.length > 1 ? 'ambiguous' : lexemes.length ? 'found' : 'not_found',
        lexemes};
    } catch (error) {
      return errorResult(error);
    }
  }

  function analyzeForm({language, text} = {}) {
    try {
      const analyses = engine.analyzeForm({language, text});
      return {status: analyses.length > 1 ? 'ambiguous' : analyses.length ? 'found' : 'not_found',
        analyses};
    } catch (error) {
      return errorResult(error);
    }
  }

  /** Optional features must describe one complete cell; cell availability never describes a paradigm. */
  function morphology({language, lexemeId, features} = {}) {
    if (features !== undefined && (typeof lexemeId !== 'string' || !lexemeId ||
        !featureSet(features))) {
      const code = 'INVALID_INPUT';
      const message = 'A complete feature set and lexeme ID are required for cell availability.';
      return {status: 'invalid', code, message, diagnostics: [{code, message}],
        language, providerStatus: 'not_checked', hasProvider: null,
        hasParadigm: null, paradigmStatus: 'unknown', availability: null, cellAvailability: null};
    }
    let provider;
    try {
      provider = engine.morphology(language);
    } catch (error) {
      return morphologyFailure(error, {language, lexemeId, features});
    }
    try {
      const availability = lexemeId === undefined ? null :
        provider.availability({lexemeId, exact: false});
      const hasParadigm = availability === null ? null : availability.supported === true ? true :
        availability.reason === 'unknown_lexeme' ? false : null;
      const paradigmStatus = availability === null ? 'not_requested' :
        hasParadigm === true ? 'available' : hasParadigm === false ? 'absent' : 'unknown';
      const cellAvailability = features === undefined ? null :
        provider.availability({lexemeId, features, exact: true});
      return {status: hasParadigm === false ? 'no_paradigm' :
        hasParadigm === null && availability !== null ? 'unknown_availability' : 'available',
        providerStatus: 'available', hasProvider: true, hasParadigm, paradigmStatus,
        language, ...(lexemeId === undefined ? {} : {lexemeId}), availability,
        ...(features === undefined ? {} : {cellQuery: features}), cellAvailability,
        description: typeof provider.describe === 'function' ? provider.describe() : null};
    } catch (error) {
      return morphologyFailure(error, {language, lexemeId, features, hasProvider: true});
    }
  }

  function inspectParadigm({language, lexemeId} = {}) {
    try {
      return {status: 'ok', forms: engine.inspectParadigm({language, lexemeId})};
    } catch (error) {
      return errorResult(error);
    }
  }

  return Object.freeze({lookupLexemes, analyzeForm, morphology, inspectParadigm});
}
