import { Hono } from 'hono'
import { authRoutes } from './routes/auth.routes'
import { itemRoutes } from './routes/items.routes'
import { maintenanceRoutes } from './routes/maintenance.routes'
import { reservationRoutes } from './routes/reservations.routes'

/**
 * The Gear Rental mock.
 *
 * Runs in-process, started by Playwright's `webServer`. A stranger clones this
 * repo and runs `pnpm test` — no backend to provision, no secrets to obtain.
 * That property is the whole reason the mock exists; see docs/decisions.md.
 *
 * There is deliberately no reset endpoint. One process serves every worker, so
 * a reset would clear state out from under tests running in parallel. Isolation
 * comes from each test creating its own uniquely-named data instead — which is
 * also how a suite must behave against a shared real environment.
 *
 */
export function createApp(): Hono {
  const app = new Hono().basePath('/api/v1')

  app.route('/', authRoutes)
  app.route('/', itemRoutes)
  app.route('/', reservationRoutes)
  app.route('/', maintenanceRoutes)

  app.notFound((c) =>
    c.json({ success: false, code: 'NOT_FOUND', message: 'no such endpoint', data: null }, 404),
  )

  app.onError((err, c) => {
    console.error('[mock] unhandled error:', err)
    return c.json(
      { success: false, code: 'INTERNAL_ERROR', message: 'mock server error', data: null },
      500,
    )
  })

  return app
}
