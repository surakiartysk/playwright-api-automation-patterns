/**
 * The response envelope every endpoint wears, plus the config a client needs.
 *
 * `ApiResponse<T>` mirrors the `SuccessEnvelope`/`ErrorEnvelope` pair in
 * openapi.yaml. One generic covers both because the contract keeps the shape
 * identical and flips `success` — which is exactly what lets BaseValidator
 * assert structure once for every service.
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  code: string
  message: string
  data: T
}

/** Detail carried by a 422. Tests assert on `field`, never on `message`. */
export interface FieldError {
  field: string
  rule: string
  message: string
}

export interface ApiConfig {
  baseUrl: string
  debug: boolean
}

/**
 * Query parameters accepted by `sendRequest`.
 *
 * A read-only mapped type rather than `Record<…>`: a service's own query
 * interface (`ListItemsQuery`) satisfies this structurally, so clients pass
 * their typed query straight through instead of casting it at every call site.
 */
export type QueryParams = {
  readonly [key: string]: string | number | boolean | undefined | null
}
