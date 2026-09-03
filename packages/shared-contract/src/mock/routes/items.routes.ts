import { Hono } from 'hono'
import { ITEM_CATEGORIES } from '../../domain'
import type { Item, ItemCategory, ItemStatus } from '../../domain'
import { fail, notFound, ok, validationFailed } from '../envelope'
import { requireAuth, requireRole } from '../auth'
import { newItemId, now, store } from '../store'
import { asObject, validate } from '../validate'

/** Service-namespaced codes. Tests assert on these, never on `message`. */
export const ItemCode = {
  SKU_TAKEN: 'ITM_SKU_TAKEN',
  IN_USE: 'ITM_IN_USE',
} as const

const SKU_PATTERN = /^[A-Z]{3}-\d{4}$/

/** Statuses that block retirement — the item is physically out with someone. */
const BLOCKS_RETIRE: readonly ItemStatus[] = ['RESERVED', 'CHECKED_OUT']

export const itemRoutes = new Hono()

itemRoutes.use('/items', requireAuth)
itemRoutes.use('/items/*', requireAuth)

// ── list ─────────────────────────────────────────────────────────────────────
itemRoutes.get('/items', (c) => {
  const { page, pageSize, category, status, sku } = c.req.query()

  const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)
  const size = Math.min(100, Math.max(1, Number.parseInt(pageSize ?? '20', 10) || 20))

  let rows = [...store.items.values()]

  // Retired items are hidden unless asked for by name — a soft delete that
  // still shows up in every list would not be much of a delete.
  rows = status
    ? rows.filter((i) => i.status === status)
    : rows.filter((i) => i.status !== 'RETIRED')
  if (category) rows = rows.filter((i) => i.category === category)
  if (sku) rows = rows.filter((i) => i.sku === sku)

  rows.sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  )

  const total = rows.length
  const start = (pageNum - 1) * size

  return c.json(
    ok({
      items: rows.slice(start, start + size),
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages: Math.ceil(total / size),
      },
    }),
  )
})

// ── create ───────────────────────────────────────────────────────────────────
itemRoutes.post('/items', requireRole('staff', 'admin'), async (c) => {
  const body = asObject(await c.req.json().catch(() => undefined))
  if (!body) {
    return c.json(
      ...validationFailed([{ field: '_body', rule: 'type', message: 'body must be an object' }]),
    )
  }

  const errors = validate(body, [
    { field: 'sku', required: true, type: 'string', pattern: SKU_PATTERN },
    { field: 'name', required: true, type: 'string', minLength: 3, maxLength: 80 },
    { field: 'category', required: true, type: 'string', enum: ITEM_CATEGORIES },
    { field: 'dailyRateCents', required: true, type: 'integer', min: 0 },
    { field: 'conditionNote', type: 'string', maxLength: 280 },
  ])
  if (errors.length > 0) return c.json(...validationFailed(errors))

  const sku = body.sku as string
  if ([...store.items.values()].some((i) => i.sku === sku)) {
    return c.json(fail(ItemCode.SKU_TAKEN, `sku '${sku}' already exists`), 409)
  }

  const timestamp = now()
  const item: Item = {
    id: newItemId(),
    sku,
    name: body.name as string,
    category: body.category as ItemCategory,
    status: 'AVAILABLE',
    dailyRateCents: body.dailyRateCents as number,
    conditionNote: (body.conditionNote as string | undefined) ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  store.items.set(item.id, item)

  return c.json(ok(item, 'item created'), 201)
})

// ── read ─────────────────────────────────────────────────────────────────────
itemRoutes.get('/items/:itemId', (c) => {
  const item = store.items.get(c.req.param('itemId'))
  if (!item) return c.json(...notFound('item'))
  return c.json(ok(item))
})

// ── update ───────────────────────────────────────────────────────────────────
itemRoutes.patch('/items/:itemId', requireRole('staff', 'admin'), async (c) => {
  const item = store.items.get(c.req.param('itemId'))
  if (!item) return c.json(...notFound('item'))

  const body = asObject(await c.req.json().catch(() => undefined))
  if (!body) {
    return c.json(
      ...validationFailed([{ field: '_body', rule: 'type', message: 'body must be an object' }]),
    )
  }

  const errors = validate(
    body,
    [
      { field: 'name', type: 'string', minLength: 3, maxLength: 80 },
      { field: 'category', type: 'string', enum: ITEM_CATEGORIES },
      { field: 'dailyRateCents', type: 'integer', min: 0 },
      { field: 'conditionNote', type: 'string', maxLength: 280 },
    ],
    { minProperties: 1 },
  )
  if (errors.length > 0) return c.json(...validationFailed(errors))

  const updated: Item = {
    ...item,
    name: (body.name as string | undefined) ?? item.name,
    category: (body.category as ItemCategory | undefined) ?? item.category,
    dailyRateCents: (body.dailyRateCents as number | undefined) ?? item.dailyRateCents,
    conditionNote: (body.conditionNote as string | undefined) ?? item.conditionNote,
    updatedAt: now(),
  }
  store.items.set(updated.id, updated)

  return c.json(ok(updated, 'item updated'))
})

// ── retire (soft delete) ─────────────────────────────────────────────────────
itemRoutes.delete('/items/:itemId', requireRole('admin'), (c) => {
  const item = store.items.get(c.req.param('itemId'))
  if (!item) return c.json(...notFound('item'))

  if (BLOCKS_RETIRE.includes(item.status)) {
    return c.json(fail(ItemCode.IN_USE, `item is ${item.status} and cannot be retired`), 409)
  }

  store.items.set(item.id, { ...item, status: 'RETIRED', updatedAt: now() })
  return c.json(ok({ id: item.id }, 'item retired'))
})
