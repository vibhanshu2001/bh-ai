export const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  UNSUPPORTED: 'UNSUPPORTED',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export interface BhaiError {
  code: ErrorCode;
  userMessage: string;
  details?: string;
  retryable: boolean;
}

export function createBhaiError(code: ErrorCode, userMessage: string, details?: string, retryable = false): BhaiError {
  return { code, userMessage, details, retryable };
}
