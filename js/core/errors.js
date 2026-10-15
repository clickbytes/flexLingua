/** A refusal with a stable, machine-readable category. */
export class EngineError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'EngineError';
    this.code = code;
  }
}

export function isResourceLimitError(error) {
  return error instanceof EngineError && /(?:LIMIT|TOO_COMPLEX)$/u.test(error.code);
}
