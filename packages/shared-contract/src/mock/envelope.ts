import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Every response the mock emits wears one of these two envelopes. Keeping the
 * shape in one place is what lets the test-side BaseValidator make its
 * structural assertions once for all services.
 */

export interface FieldError {
  field: string
  rule: string
  message: string
}

export function ok<T>(data: T, message = 'success') {
  return { success: true as const, code: 'OK' as const, message, data }
}

export function fail(code: string, message: string, data: unknown = null) {
  return { success: false as const, code, message, data }
}

/** Cross-cutting codes. Service-specific ones live with their handlers. */
export const CommonCode = {
  OK: 'OK',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const

export const unauthorized = () =>
  [fail(CommonCode.UNAUTHORIZED, 'authentication required'), 401 as ContentfulStatusCode] as const

export const forbidden = (role: string) =>
  [
    fail(CommonCode.FORBIDDEN, `role '${role}' may not perform this action`),
    403 as ContentfulStatusCode,
  ] as const

export const notFound = (what: string) =>
  [fail(CommonCode.NOT_FOUND, `${what} not found`), 404 as ContentfulStatusCode] as const

export const validationFailed = (fields: FieldError[]) =>
  [
    fail(CommonCode.VALIDATION_FAILED, 'request validation failed', { fields }),
    422 as ContentfulStatusCode,
  ] as const
