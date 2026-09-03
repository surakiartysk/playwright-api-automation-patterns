/**
 * The same contract types as the other package, restated here.
 *
 * This package deliberately shares nothing with `functional-style` except the
 * API contract itself. Importing its core would make the comparison meaningless:
 * two styles that use the same base classes are one style with two spellings.
 * The duplication is the experiment's control.
 */

export interface ApiResponse<T = unknown> {
  success: boolean
  code: string
  message: string
  data: T
}

export interface FieldError {
  field: string
  rule: string
  message: string
}

export interface ApiConfig {
  baseUrl: string
  debug: boolean
}

export type QueryParams = {
  readonly [key: string]: string | number | boolean | undefined | null
}
