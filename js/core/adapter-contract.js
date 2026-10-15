import {safeName} from './features.js';

export const LANGUAGE_ADAPTER_CONTRACT_VERSION='1.0';
export const MORPHOLOGY_ADAPTER_CONTRACT_VERSION='1.0';

/** Validate structural obligations before an adapter enters the neutral CORE. */
export function validateLanguageAdapter(adapter) {
  if(!safeName(adapter?.code) || adapter.code==='core' ||
      adapter.contractVersion!==LANGUAGE_ADAPTER_CONTRACT_VERSION ||
      ['analyze','analyzeCandidates','realize','validateOntology','describe']
        .some(method=>typeof adapter[method]!=='function'))
    throw new Error('Invalid or unsupported language adapter contract.');
  const description=adapter.describe();
  if(description?.language!==adapter.code ||
      typeof description.grammarVersion!=='string' ||
      !description.grammarVersion)
    throw new Error('Language adapter description does not match its code or grammar version.');
  return description;
}

export function validateMorphologyAdapter(adapter) {
  if(!safeName(adapter?.language) ||
      adapter.contractVersion!==MORPHOLOGY_ADAPTER_CONTRACT_VERSION ||
      ['generate','analyze','paradigm','availability','describe']
        .some(method=>typeof adapter[method]!=='function') ||
      typeof adapter.lexicon?.validateCore!=='function')
    throw new Error('Invalid or unsupported morphology adapter contract.');
  const description=adapter.describe();
  if(description?.language!==adapter.language ||
      typeof description.featuresVersion!=='string' ||
      !description.featuresVersion)
    throw new Error('Morphology adapter description does not match its language or feature version.');
  return description;
}
