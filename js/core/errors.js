import {PluginError} from '../plugins/errors.js';

/** A refusal with a stable, machine-readable category. */
export class EngineError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'EngineError';
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
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
  return error instanceof EngineError && /(?:LIMIT|TOO_COMPLEX)$/u.test(error.code);
}
