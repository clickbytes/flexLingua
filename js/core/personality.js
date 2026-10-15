/** Validated presentation preferences kept outside CORE meaning documents. */
import {record} from './features.js';

export const PERSONALITY_PROFILE_VERSION = '1.1';

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
  realization:{pronounRealization:'repeat',outputVariant:'preferred',
    replyStyles:{pl:'standard',en:'standard'}}
});

const PROFILE_KEYS = ['version','id','realization'];
const REALIZATION_KEYS = ['pronounRealization','outputVariant'];
const STYLE_LANGUAGES=['pl','en'];

export function createPersonalityProfile(input=DEFAULT_PERSONALITY_PROFILE) {
  if (!record(input) || Object.keys(input).length !== PROFILE_KEYS.length ||
      PROFILE_KEYS.some(key=>!Object.hasOwn(input,key)) ||
      !['1.0',PERSONALITY_PROFILE_VERSION].includes(input.version) ||
      typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/u.test(input.id) ||
      !record(input.realization) ||
      Object.keys(input.realization).length !== REALIZATION_KEYS.length+
        (Object.hasOwn(input.realization,'replyStyles')?1:0) ||
      REALIZATION_KEYS.some(key=>!Object.hasOwn(input.realization,key)) ||
      !['repeat','safe'].includes(input.realization.pronounRealization) ||
      !['preferred','first_alternative'].includes(input.realization.outputVariant) ||
      (input.version==='1.0' && Object.hasOwn(input.realization,'replyStyles')) ||
      (Object.hasOwn(input.realization,'replyStyles') &&
        (!record(input.realization.replyStyles) ||
         Object.keys(input.realization.replyStyles).length!==STYLE_LANGUAGES.length ||
         STYLE_LANGUAGES.some(language=>typeof input.realization.replyStyles[language]!=='string' ||
           !/^[a-z][a-z0-9_]{0,31}$/u.test(input.realization.replyStyles[language]))))) {
    throw new Error('Invalid personality profile or unsupported realization option.');
  }
  return {
    version:PERSONALITY_PROFILE_VERSION,
    id:input.id,
    realization:{
      pronounRealization:input.realization.pronounRealization,
      outputVariant:input.realization.outputVariant,
      replyStyles:{pl:input.realization.replyStyles?.pl||'standard',
        en:input.realization.replyStyles?.en||'standard'}
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
