/**
 * Taxonomie d'erreurs du projet (doc 01-architecture, section 5).
 *
 * Les quatre codes LLM_* sont distincts a dessein : ce sont eux qui prouvent,
 * en soutenance, que l'exigence « gestion des erreurs d'appel API » de l'enonce
 * est traitee. Un message generique ne prouverait rien.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'LLM_KEY_MISSING'
  | 'LLM_TIMEOUT'
  | 'LLM_QUOTA_EXCEEDED'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  LLM_KEY_MISSING: 503,
  LLM_TIMEOUT: 504,
  LLM_QUOTA_EXCEEDED: 429,
  LLM_INVALID_OUTPUT: 502,
  LLM_UNAVAILABLE: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }
}
