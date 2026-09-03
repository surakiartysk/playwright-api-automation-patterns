/**
 * Error codes shared by every service.
 *
 * Scope is deliberately narrow: only codes whose value is identical across all
 * services live here. Service-specific codes stay in their own service folder,
 * because hoisting a code a service never returns would invent surface that
 * does not exist.
 *
 * There is no matching `OK` constant — the success code is pinned as a literal
 * inside `successEnvelope`, so a second copy here would be a second source of
 * truth for the same fact.
 */
export const CommonError = {
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const

export type CommonErrorCode = (typeof CommonError)[keyof typeof CommonError]
