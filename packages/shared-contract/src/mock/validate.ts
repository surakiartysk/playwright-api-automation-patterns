import type { FieldError } from './envelope'

/**
 * A deliberately small validation kit.
 *
 * The mock validates for real — a missing field must produce a 422 naming that
 * field, because tests assert on the field name. But it is not trying to be a
 * schema library: rules are added as endpoints need them, and nothing more.
 */

type Primitive = 'string' | 'integer' | 'boolean'

export interface Rule {
  field: string
  required?: boolean
  type?: Primitive
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  enum?: readonly string[]
  /** Custom check run only when the value is present and passed every rule above. */
  check?: (value: unknown, body: Record<string, unknown>) => string | undefined
}

const typeName = (v: unknown): string => (Array.isArray(v) ? 'array' : typeof v)

export function validate(
  body: Record<string, unknown>,
  rules: Rule[],
  options: { allowUnknown?: boolean; minProperties?: number } = {},
): FieldError[] {
  const errors: FieldError[] = []

  if (options.minProperties !== undefined && Object.keys(body).length < options.minProperties) {
    errors.push({
      field: '_body',
      rule: 'minProperties',
      message: `at least ${options.minProperties} field(s) required`,
    })
  }

  if (!options.allowUnknown) {
    const known = new Set(rules.map((r) => r.field))
    for (const key of Object.keys(body)) {
      if (!known.has(key)) {
        errors.push({ field: key, rule: 'unknown', message: `unknown field '${key}'` })
      }
    }
  }

  for (const rule of rules) {
    const value = body[rule.field]
    const missing = value === undefined || value === null

    if (missing) {
      if (rule.required) {
        errors.push({
          field: rule.field,
          rule: 'required',
          message: `${rule.field} is required`,
        })
      }
      continue
    }

    if (rule.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push({
          field: rule.field,
          rule: 'type',
          message: `${rule.field} must be an integer, got ${typeName(value)}`,
        })
        continue
      }
    } else if (rule.type && typeof value !== rule.type) {
      errors.push({
        field: rule.field,
        rule: 'type',
        message: `${rule.field} must be a ${rule.type}, got ${typeName(value)}`,
      })
      continue
    }

    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({
          field: rule.field,
          rule: 'min',
          message: `${rule.field} must be >= ${rule.min}`,
        })
        continue
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({
          field: rule.field,
          rule: 'max',
          message: `${rule.field} must be <= ${rule.max}`,
        })
        continue
      }
    }

    if (typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({
          field: rule.field,
          rule: 'minLength',
          message: `${rule.field} must be at least ${rule.minLength} characters`,
        })
        continue
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push({
          field: rule.field,
          rule: 'maxLength',
          message: `${rule.field} must be at most ${rule.maxLength} characters`,
        })
        continue
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push({
          field: rule.field,
          rule: 'pattern',
          message: `${rule.field} does not match ${rule.pattern.source}`,
        })
        continue
      }
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({
          field: rule.field,
          rule: 'enum',
          message: `${rule.field} must be one of: ${rule.enum.join(', ')}`,
        })
        continue
      }
    }

    const custom = rule.check?.(value, body)
    if (custom) {
      errors.push({ field: rule.field, rule: 'invalid', message: custom })
    }
  }

  return errors
}

/** Guard for handlers: a non-object JSON body is a body-level validation error. */
export function asObject(raw: unknown): Record<string, unknown> | undefined {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined
}
