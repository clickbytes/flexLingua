import {translationRefusal as refusal} from '../core/translation-result.js';

/** Thin translation facade. Domain refusals remain results; unexpected failures still throw. */
export function createTranslationService(runtime) {
  if (!runtime?.engine || !Array.isArray(runtime.languages)) {
    throw new Error('Translation service requires an initialized application runtime.');
  }
  const {engine, languages} = runtime;

  function translate({from, to, text, context} = {}) {
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

    return {...base, ...engine.translate({text, from, to, context})};
  }

  return Object.freeze({translate});
}
