import {PluginError} from './errors.js';
import {tokenizeDetailed, validateTextProfile} from '../core/text.js';

const isRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

/** Written-text signal provider. Spoken and signed channels have no provider here. */
export function createWrittenSignalProvider(profile) {
  let validated;
  try {
    validated = validateTextProfile(profile);
  } catch (error) {
    fail('PLUGIN_INVALID', 'Invalid written signal text profile.', error);
  }
  return Object.freeze({
    channel: 'written',
    profile: validated,
    decode(input = {}) {
      if (!isRecord(input) || Object.keys(input).some(key => key !== 'text') ||
          typeof input.text !== 'string') {
        fail('PLUGIN_INVALID', 'Written signal decoding requires a text string.');
      }
      try {
        return tokenizeDetailed(input.text, validated);
      } catch (error) {
        const code = error?.code === 'SOURCE_TEXT_SIZE_LIMIT' || error?.code === 'SOURCE_TOKEN_LIMIT'
          ? 'PLUGIN_RESOURCE_LIMIT' : error?.code === 'SOURCE_CHARACTER_UNSUPPORTED'
            || error?.code === 'SOURCE_SEGMENTER_UNAVAILABLE'
            ? 'PLUGIN_CAPABILITY_UNAVAILABLE' : 'PLUGIN_INVALID';
        fail(code, error?.message || 'Written input could not be decoded.', error);
      }
    }
  });
}

/** Build only explicitly declared signal providers from the package module. */
export function createSignalProviders(module) {
  if (!isRecord(module)) fail('PLUGIN_INVALID', 'Invalid signal module.');
  if (module.channel !== 'written') {
    fail('PLUGIN_CAPABILITY_UNAVAILABLE',
      `Signal channel is unsupported: ${String(module.channel)}.`);
  }
  const profile = module.textProfile ?? module.profile;
  if (!isRecord(profile)) fail('PLUGIN_INVALID', 'Written signal module requires a text profile.');
  return Object.freeze({written: createWrittenSignalProvider(profile)});
}
