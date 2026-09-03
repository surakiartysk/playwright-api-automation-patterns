import { z } from 'zod'
import { ITEM_CATEGORIES, ITEM_STATUSES } from '@gear-rental/shared-contract'
import { isoDateTime, paginationSchema } from '@core/schemas'

/**
 * `.strict()` on the resource is the point: if the API starts returning a
 * field this suite has never heard of, that is a contract change and the tests
 * should notice rather than silently ignore it.
 */
export const itemSchema = z
  .object({
    id: z.string().min(1),
    sku: z.string().regex(/^[A-Z]{3}-\d{4}$/),
    name: z.string().min(3).max(80),
    category: z.enum(ITEM_CATEGORIES),
    status: z.enum(ITEM_STATUSES),
    dailyRateCents: z.number().int().nonnegative(),
    conditionNote: z.string().max(280),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()

export const itemPageSchema = z
  .object({
    items: z.array(itemSchema),
    pagination: paginationSchema,
  })
  .strict()

/**
 * Retirement answers with just the id. Re-exported from core rather than
 * re-declared: an identical shape written twice is two things to keep in step.
 */
export { idOnlySchema as retiredItemSchema } from '@core/schemas'
