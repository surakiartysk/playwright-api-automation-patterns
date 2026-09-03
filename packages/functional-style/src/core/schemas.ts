import { z } from 'zod'

/**
 * Response shape as data, not as code.
 *
 * A schema object can be composed, reused, and printed in a failure message;
 * a hand-written `expect(typeof x.id).toBe('string')` chain cannot. Every
 * service builds its response schemas from these two envelope helpers, so the
 * envelope is defined once for the whole suite.
 */

export const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict()

/**
 * Resources are `.strict()` — an unexpected field is a contract change and the
 * suite should say so. Envelopes are deliberately looser: `data` varies per
 * endpoint, so it is typed by the caller.
 */
export const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    code: z.literal('OK'),
    message: z.string(),
    data,
  })

/**
 * `data` on an error is optional-but-nullable: most errors carry no detail, a
 * 422 carries `fields`, an illegal transition carries the state triple. Making
 * it required would force every error path to invent a payload.
 */
export const errorEnvelope = z.object({
  success: z.literal(false),
  code: z.string().min(1),
  message: z.string(),
  data: z.unknown().nullable().optional(),
})

export const fieldErrorSchema = z
  .object({
    field: z.string(),
    rule: z.string(),
    message: z.string(),
  })
  .strict()

export const validationErrorEnvelope = z.object({
  success: z.literal(false),
  code: z.literal('VALIDATION_FAILED'),
  message: z.string(),
  data: z.object({ fields: z.array(fieldErrorSchema).min(1) }),
})

/** `data: { id }` — the shape returned by soft-delete style endpoints. */
export const idOnlySchema = z.object({ id: z.string().min(1) }).strict()

export const isoDateTime = z.string().datetime()
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
