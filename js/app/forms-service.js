function errorResult(error) {
  const code = error?.code ?? 'FORMS_SERVICE_ERROR';
  const message = error?.message ?? 'Forms service failed.';
  const unsupported = error?.status === 'unsupported' || code === 'PLUGIN_NOT_FOUND' ||
    code === 'PLUGIN_CAPABILITY_UNAVAILABLE';
  return {status: unsupported ? 'unsupported' : 'error', code, message,
    diagnostics: Array.isArray(error?.diagnostics) && error.diagnostics.length ?
      error.diagnostics : [{code, message}]};
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

  function morphology({language, lexemeId} = {}) {
    try {
      const provider = engine.morphology(language);
      const availability = lexemeId === undefined ? null :
        provider.availability({lexemeId, exact: true});
      return {status: availability?.supported === false ? 'no_paradigm' : 'available',
        language, ...(lexemeId === undefined ? {} : {lexemeId}), availability,
        description: typeof provider.describe === 'function' ? provider.describe() : null};
    } catch (error) {
      return errorResult(error);
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
