const DOMAIN_STATUSES = new Set(['unsupported', 'invalid', 'ambiguous', 'resource_limit']);

function safeStatusMessage(status) {
  return {
    unsupported: 'The requested translation is unsupported.',
    invalid: 'The request is invalid.',
    ambiguous: 'The source has multiple possible meanings.',
    resource_limit: 'The request exceeds supported resource limits.'
  }[status] ?? 'The translation request could not be completed.';
}

function refusal(status, code, message, extra = {}) {
  const {diagnostics: suppliedDiagnostics, ...details} = extra;
  return {status, ...details,
    alternatives: details.alternatives ?? [],
    informationLoss: details.informationLoss ?? [],
    diagnostics: suppliedDiagnostics?.length ? suppliedDiagnostics : [{code, message}]};
}

function statusFor(error) {
  if (DOMAIN_STATUSES.has(error?.status)) return error.status;
  if (error?.code === 'PLUGIN_NOT_FOUND' || error?.code === 'PLUGIN_CAPABILITY_UNAVAILABLE') {
    return 'unsupported';
  }
  if (error?.code === 'INVALID_INPUT') return 'invalid';
  return null;
}

/** Thin translation facade. Domain refusals remain results; unexpected failures still throw. */
export function createTranslationService(runtime) {
  if (!runtime?.engine || !Array.isArray(runtime.languages)) {
    throw new Error('Translation service requires an initialized application runtime.');
  }
  const {engine, languages} = runtime;

  function translate({from, to, text} = {}) {
    const base = {from: from ?? null, to: to ?? null, input: text ?? null,
      text: null, meaning: null, alternatives: []};
    const source = languages.find(item => item.code === from);
    const target = languages.find(item => item.code === to);
    if (!source || !target) {
      const code = !source ? from : to;
      return refusal('unsupported', 'PLUGIN_NOT_FOUND',
        `Language plugin not found: ${code}.`, base);
    }
    for (const language of [source, target]) {
      if (language.status === 'unavailable') {
        return refusal('unsupported', 'PLUGIN_PACKAGE_UNAVAILABLE',
          `Language package ${language.code} is unavailable.`, base);
      }
    }
    const direction = `${from}->${to}`;
    const rejectingConstraints = [source, target].filter(language => language.directions !== undefined &&
      !language.directions.includes(direction));
    if (rejectingConstraints.length) {
      return refusal('unsupported', 'PLUGIN_DIRECTION_UNAVAILABLE',
        `Translation direction ${from} → ${to} is not declared by ${rejectingConstraints.map(language =>
          language.code).join(', ')}.`, base);
    }
    const implemented = (language, operation) => language.capabilities.some(item =>
      item.channel === 'sentence' && item.operation === operation && item.status === 'implemented');
    if (!implemented(source, 'analyze') || !implemented(target, 'realize')) {
      return refusal('unsupported', 'PLUGIN_CAPABILITY_UNAVAILABLE',
        `Sentence translation ${from} → ${to} is unsupported by declared capabilities.`, base);
    }

    try {
      const readings = engine.analyzeCandidates({text, from});
      if (readings.length !== 1) {
        return refusal('ambiguous', 'AMBIGUOUS_MEANING',
          `Source has ${readings.length} distinct semantic readings.`,
          {...base, alternatives: readings.map(item => ({meaning: item.interlingua,
            lexicalSenses: item.lexicalSenses, score: item.score}))});
      }
      const meaning = readings[0].interlingua;
      const result = engine.realize({interlingua: meaning, to});
      return {status: 'ok', ...base, text: result.text, meaning,
        alternatives: result.alternatives ?? [], diagnostics: result.diagnostics ?? [],
        warnings: result.warnings ?? [], informationLoss: result.informationLoss ?? []};
    } catch (error) {
      const status = statusFor(error);
      if (!status) throw error;
      return refusal(status, error.code ?? 'INVALID_INPUT', safeStatusMessage(status), base);
    }
  }

  return Object.freeze({translate});
}
