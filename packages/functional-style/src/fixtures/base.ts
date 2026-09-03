import { test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type { Role } from '@gear-rental/shared-contract'
import { userByRole } from '@gear-rental/shared-contract'
import { loadApiConfig } from '@config/api-config'
import type { ApiConfig } from '@core/types'
import { applyAllureMeta } from '@utils/allure-meta'

/**
 * Wiring, as functions.
 *
 * This is the other half of the hybrid: the API surface is objects, but the
 * *assembly* of a test's world is fixtures. Playwright then guarantees what a
 * `beforeEach` and a shared instance cannot — each test receives its own
 * values, teardown runs even on failure, and nothing leaks between workers.
 *
 * Tokens are worker-scoped: logging in once per worker rather than once per
 * test removes a network round-trip from every single spec, and the token is
 * immutable so sharing it is safe.
 */

export interface AuthTokens {
  member: string
  staff: string
  admin: string
}

type WorkerFixtures = {
  apiConfig: ApiConfig
  authTokens: AuthTokens
}

type TestFixtures = {
  /** Fresh request context per test — isolation over speed for the mutable part. */
  api: APIRequestContext
  /** Auto fixture: stamps the Allure Behaviors labels. Specs never call it. */
  allureMeta: void
}

async function login(request: APIRequestContext, baseUrl: string, role: Role): Promise<string> {
  const user = userByRole(role)
  const response = await request.post(`${baseUrl}/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: user.email, password: user.password },
  })

  if (!response.ok()) {
    // Throwing beats skipping: a suite that cannot authenticate has not
    // "passed with tests skipped", it has failed to run at all.
    throw new Error(
      `login failed for role '${role}': ${response.status()} ${await response.text()}`,
    )
  }

  const body = (await response.json()) as { data: { token: string } }
  return body.data.token
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

  // `auto` so every test gets its report labels without importing anything.
  // The reporter stays invisible to the specs, which is the point: a spec
  // should describe behaviour, not how it will be displayed.
  allureMeta: [
    async ({}, use, testInfo) => {
      await applyAllureMeta(testInfo)
      await use()
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
