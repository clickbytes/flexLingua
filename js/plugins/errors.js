const ERROR_STATUS = Object.freeze({
  PLUGIN_INVALID: 'invalid',
  PLUGIN_VERSION_UNSUPPORTED: 'unsupported',
  PLUGIN_CAPABILITY_UNAVAILABLE: 'unsupported',
  PLUGIN_RESULT_INVALID: 'invalid',
  PLUGIN_DUPLICATE: 'invalid',
  PLUGIN_RESOURCE_LIMIT: 'resource_limit',
  PLUGIN_NOT_FOUND: 'unsupported',
  PLUGIN_PATH_INVALID: 'invalid',
  PLUGIN_REGISTRY_INVALID: 'invalid',
  PLUGIN_PACKAGE_INVALID: 'invalid',
  PLUGIN_LOAD_FAILED: 'invalid',
  PLUGIN_GRAPH_INVALID: 'invalid',
  PLUGIN_GRAPH_CYCLE: 'invalid',
  PLUGIN_MODULE_MISSING: 'invalid',
  PLUGIN_CORE_REFERENCE_INVALID: 'invalid'
});

export const PLUGIN_ERROR_CODES = Object.freeze(Object.keys(ERROR_STATUS));

export class PluginError extends Error {
  constructor(code, message, options = {}) {
    if (!Object.hasOwn(ERROR_STATUS, code)) {
      throw new TypeError(`Unknown plugin error code: ${String(code)}`);
    }
    super(message, options.cause === undefined ? undefined : {cause: options.cause});
    this.name = 'PluginError';
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}
