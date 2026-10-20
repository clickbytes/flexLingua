import {PluginError} from '../plugins/errors.js';

// Legacy EngineError call sites without an explicit status still receive a
// typed category at construction. Unknown codes remain infrastructure errors.
const defaultStatusByCode = Object.freeze({
  SOURCE_TEXT_INVALID:'invalid', SOURCE_CHARACTER_UNSUPPORTED:'unsupported',
  SOURCE_TEXT_SIZE_LIMIT:'resource_limit', SOURCE_TOKEN_LIMIT:'resource_limit',
  DISCOURSE_EVENT_LIMIT:'resource_limit', GRAMMAR_SEARCH_LIMIT:'resource_limit',
  INTERLINGUA_INVALID:'invalid',
  INVALID_INPUT:'invalid', PLUGIN_NOT_FOUND:'unsupported',
  PLUGIN_CAPABILITY_UNAVAILABLE:'unsupported'
});

/** A refusal with a stable, machine-readable category. */
export class EngineError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'EngineError';
    this.code = code;
    const status=options.status ?? defaultStatusByCode[code];
    if (status !== undefined) this.status = status;
    if (Array.isArray(options.diagnostics)) this.diagnostics = structuredClone(options.diagnostics);
  }
}

/** Preserve plugin status and code when crossing into the shared engine. */
export function toEngineError(error) {
  if (error instanceof EngineError || !(error instanceof PluginError)) return error;
  return new EngineError(error.code, error.message, {cause: error, status: error.status,
    ...(Array.isArray(error.diagnostics) ? {diagnostics: error.diagnostics} : {})});
}

/** Turn a normalized plugin refusal into a stable engine error without changing its status. */
export function pluginResultError(result, operation) {
  const status = ['unsupported', 'invalid', 'resource_limit', 'ambiguous'].includes(result?.status)
    ? result.status : 'invalid';
  const diagnostic = Array.isArray(result?.diagnostics) ? result.diagnostics[0] : null;
  const code = typeof diagnostic?.code === 'string' ? diagnostic.code
    : status === 'unsupported' ? 'PLUGIN_CAPABILITY_UNAVAILABLE' : 'PLUGIN_RESULT_INVALID';
  const message = typeof diagnostic?.message === 'string' ? diagnostic.message
    : `Language plugin ${operation} returned ${status}.`;
  return new EngineError(code, message, {status, diagnostics: result.diagnostics});
}

export function isResourceLimitError(error) {
  return error instanceof EngineError && error.status === 'resource_limit';
}
