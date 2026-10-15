/** Validated presentation preferences kept outside CORE meaning documents. */
import {record} from './features.js';

export const PERSONALITY_PROFILE_VERSION = '1.0';

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_PERSONALITY_PROFILE = freezeDeep({
  version:PERSONALITY_PROFILE_VERSION,
  id:'default',
  realization:{pronounRealization:'repeat',outputVariant:'preferred'}
});

const PROFILE_KEYS = ['version','id','realization'];
const REALIZATION_KEYS = ['pronounRealization','outputVariant'];

export function createPersonalityProfile(input=DEFAULT_PERSONALITY_PROFILE) {
  if (!record(input) || Object.keys(input).length !== PROFILE_KEYS.length ||
      PROFILE_KEYS.some(key=>!Object.hasOwn(input,key)) ||
      input.version !== PERSONALITY_PROFILE_VERSION ||
      typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/u.test(input.id) ||
      !record(input.realization) || Object.keys(input.realization).length !== REALIZATION_KEYS.length ||
      REALIZATION_KEYS.some(key=>!Object.hasOwn(input.realization,key)) ||
      !['repeat','safe'].includes(input.realization.pronounRealization) ||
      !['preferred','first_alternative'].includes(input.realization.outputVariant)) {
    throw new Error('Invalid personality profile or unsupported realization option.');
  }
  return {
    version:PERSONALITY_PROFILE_VERSION,
    id:input.id,
    realization:{
      pronounRealization:input.realization.pronounRealization,
      outputVariant:input.realization.outputVariant
    }
  };
}

export function applyPersonalityProfile(output, profile) {
  const validated=createPersonalityProfile(profile);
  if (validated.realization.outputVariant !== 'first_alternative') return output;
  const alternatives=Array.isArray(output.alternatives) ? output.alternatives : [];
  if (!alternatives.length) {
    return {...output,warnings:[...(output.warnings || []),
      'The profile requested an alternate wording, but this realization has no alternatives; preferred wording was kept.']};
  }
  return {...output,text:alternatives[0],
    alternatives:[output.text,...alternatives.slice(1)]};
}
