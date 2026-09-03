import { Hono } from 'hono'
import type { MaintenanceLog } from '../../domain'
import { fail, notFound, ok, validationFailed } from '../envelope'
import { requireAuth, requireRole } from '../auth'
import { now, store } from '../store'
import { asObject, validate } from '../validate'

export const MaintenanceCode = {
  ALREADY_RESOLVED: 'MNT_ALREADY_RESOLVED',
} as const

export const maintenanceRoutes = new Hono()

maintenanceRoutes.use('/maintenance-logs', requireAuth)
maintenanceRoutes.use('/maintenance-logs/*', requireAuth)

/**
 * There is no POST here on purpose.
 *
 * A log row appears only as a side effect of a reservation reaching
 * CHECKED_OUT. A test that wants one has to drive a reservation to produce it,
 * which is what makes the composed provisioner necessary rather than
 * decorative — the dependency is real, not simulated.
 */
maintenanceRoutes.get('/maintenance-logs', (c) => {
  const { reservationId, itemId, state, page, pageSize } = c.req.query()

  const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)
  const size = Math.min(100, Math.max(1, Number.parseInt(pageSize ?? '20', 10) || 20))

  let rows = [...store.maintenanceLogs.values()]
  if (reservationId) rows = rows.filter((l) => l.reservationId === reservationId)
  if (itemId) rows = rows.filter((l) => l.itemId === itemId)
  if (state) rows = rows.filter((l) => l.state === state)

  rows.sort((a, b) =>
    a.openedAt === b.openedAt ? a.id.localeCompare(b.id) : a.openedAt.localeCompare(b.openedAt),
  )

  const total = rows.length
  const start = (pageNum - 1) * size

  return c.json(
    ok({
      logs: rows.slice(start, start + size),
      pagination: { page: pageNum, pageSize: size, total, totalPages: Math.ceil(total / size) },
    }),
  )
})

maintenanceRoutes.post(
  '/maintenance-logs/:logId/resolve',
  requireRole('staff', 'admin'),
  async (c) => {
    const log = store.maintenanceLogs.get(c.req.param('logId'))
    if (!log) return c.json(...notFound('maintenance log'))

    const body = asObject(await c.req.json().catch(() => undefined))
    if (!body) {
      return c.json(
        ...validationFailed([{ field: '_body', rule: 'type', message: 'body must be an object' }]),
      )
    }

    const errors = validate(body, [
      { field: 'resolutionNote', required: true, type: 'string', minLength: 3, maxLength: 280 },
    ])
    if (errors.length > 0) return c.json(...validationFailed(errors))

    if (log.state === 'RESOLVED') {
      return c.json(fail(MaintenanceCode.ALREADY_RESOLVED, 'log is already resolved'), 409)
    }

    const timestamp = now()
    const resolved: MaintenanceLog = {
      ...log,
      state: 'RESOLVED',
      resolvedAt: timestamp,
      resolutionNote: body.resolutionNote as string,
    }
    store.maintenanceLogs.set(resolved.id, resolved)

    // Servicing is finished, so the item can be rented again. Without this the
    // item would sit in MAINTENANCE forever and the lifecycle would not close.
    const item = store.items.get(log.itemId)
    if (item && item.status === 'MAINTENANCE') {
      store.items.set(item.id, { ...item, status: 'AVAILABLE', updatedAt: timestamp })
    }

    return c.json(ok(resolved, 'maintenance log resolved'))
  },
)
