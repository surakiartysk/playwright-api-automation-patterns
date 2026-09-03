import { test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { userByRole } from '@gear-rental/shared-contract'
import type { Role } from '@gear-rental/shared-contract'
import { HttpClient } from '@core/HttpClient'
import type { ApiConfig } from '@core/types'
import { applyAllureMeta } from '@support/allure-meta'
import { ItemsContext } from '@services/items/ItemsContext'
import { MaintenanceContext } from '@services/maintenance-logs/MaintenanceContext'
import { ReservationsContext } from '@services/reservations/ReservationsContext'

/**
 * Fixtures stay functional in this package too.
 *
 * This is the honest limit of "class-first": Playwright injects into a function
 * signature, so the wiring layer is functions no matter which style the code
 * under it uses. Fighting that — a `TestBase` class with `beforeEach` — would
 * give up per-test isolation and worker safety to satisfy a label. The contexts
 * are objects; how they get built is the framework's business.
 *
 * A context is built per test rather than per worker: contexts are cheap, and
 * one instance shared across tests would be the module-level state this package
 * is careful to avoid.
 */

export function loadApiConfig(): ApiConfig {
  const port = process.env.MOCK_PORT ?? '4010'
  return {
    baseUrl: process.env.BASE_URL ?? `http://127.0.0.1:${port}/api/v1`,
    debug: process.env.DEBUG_API === 'true',
  }
}

export interface AuthTokens {
  member: string
  staff: string
  admin: string
}

async function login(request: APIRequestContext, baseUrl: string, role: Role): Promise<string> {
  const user = userByRole(role)
  const response = await request.post(`${baseUrl}/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: user.email, password: user.password },
  })

  if (!response.ok()) {
    throw new Error(`login failed for role '${role}': ${response.status()}`)
  }
  return ((await response.json()) as { data: { token: string } }).data.token
}

type WorkerFixtures = {
  apiConfig: ApiConfig
  authTokens: AuthTokens
}

type TestFixtures = {
  api: APIRequestContext
  /** Auto fixture: stamps the Allure Behaviors labels. Specs never call it. */
  allureMeta: void
  /** Unauthenticated — for the tests that must be refused. */
  anonymousItems: ItemsContext
  itemsAsStaff: ItemsContext
  itemsAsAdmin: ItemsContext
  itemsAsMember: ItemsContext
  reservationsAsStaff: ReservationsContext
  reservationsAsMember: ReservationsContext
  maintenanceAsStaff: MaintenanceContext
  maintenanceAsMember: MaintenanceContext
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  apiConfig: [
    async ({}, use) => {
      await use(loadApiConfig())
    },
    { scope: 'worker' },
  ],

  authTokens: [
    async ({ playwright, apiConfig }, use) => {
      const context = await playwright.request.newContext()
      try {
        const [member, staff, admin] = await Promise.all([
          login(context, apiConfig.baseUrl, 'member'),
          login(context, apiConfig.baseUrl, 'staff'),
          login(context, apiConfig.baseUrl, 'admin'),
        ])
        await use({ member, staff, admin })
      } finally {
        await context.dispose()
      }
    },
    { scope: 'worker' },
  ],

  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext()
    await use(context)
    await context.dispose()
  },

  // `auto` so the reporter stays invisible to the specs — same approach as the
  // other package, since this is a reporting concern rather than a style one.
  allureMeta: [
    async ({}, use, testInfo) => {
      await applyAllureMeta(testInfo)
      await use()
    },
    { auto: true },
  ],

  anonymousItems: async ({ apiConfig, api }, use) => {
    await use(new ItemsContext(new HttpClient(apiConfig, api)))
  },

  itemsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsContext(new HttpClient(apiConfig, api, authTokens.staff)))
  },

  itemsAsAdmin: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsContext(new HttpClient(apiConfig, api, authTokens.admin)))
  },

  itemsAsMember: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsContext(new HttpClient(apiConfig, api, authTokens.member)))
  },

  reservationsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ReservationsContext(new HttpClient(apiConfig, api, authTokens.staff)))
  },

  reservationsAsMember: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ReservationsContext(new HttpClient(apiConfig, api, authTokens.member)))
  },

  maintenanceAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new MaintenanceContext(new HttpClient(apiConfig, api, authTokens.staff)))
  },

  maintenanceAsMember: async ({ apiConfig, api, authTokens }, use) => {
    await use(new MaintenanceContext(new HttpClient(apiConfig, api, authTokens.member)))
  },
})

export { expect } from '@playwright/test'
