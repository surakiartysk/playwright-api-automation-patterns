import { z } from 'zod'

/**
 * Response shapes, identical to the other package's.
 *
 * Schemas are declarative data in both styles — a Zod object is not more or
 * less "class-first" than it was before. Where the two packages differ is in
 * who owns and applies them, not in how a shape is described.
 */

export const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict()

export const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    code: z.literal('OK'),
    message: z.string(),
    data,
  })

export const errorEnvelope = z.object({
  success: z.literal(false),
  code: z.string().min(1),
  message: z.string(),
  data: z.unknown().nullable().optional(),
})

export const fieldErrorSchema = z
  .object({ field: z.string(), rule: z.string(), message: z.string() })
  .strict()

export const validationErrorEnvelope = z.object({
  success: z.literal(false),
  code: z.literal('VALIDATION_FAILED'),
  message: z.string(),
  data: z.object({ fields: z.array(fieldErrorSchema).min(1) }),
})

export const idOnlySchema = z.object({ id: z.string().min(1) }).strict()

export const isoDateTime = z.string().datetime()
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const CommonError = {
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const
