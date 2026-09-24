import type { APIRequestContext } from '@playwright/test'
import { userByRole } from '@gear-rental/shared-contract'
import { BaseValidator } from '@core/BaseValidator'
import { CommonError } from '@core/codes'
import type { ApiConfig } from '@core/types'
import { test } from '@fixtures/base'

/**
 * Sign-in's one validation rule, at its boundary.
 *
 * Auth is infrastructure here rather than a showcase — the worker-scoped token
 * fixture signs in once and every other spec rides on it — so nothing asserted
 * the `minLength: 8` on the password. The mock could accept a one-character
 * password and all 97 tests stayed green.
 *
 * The pair is chosen so each side fails a different mutation: seven characters
 * must be refused as malformed (422), and eight characters that are simply the
 * wrong password must reach the credential check (401) — not be refused as
 * malformed first, which is what a tightened limit would do.
 */
test.describe('POST /auth/login', { tag: ['@core', '@isolated'] }, () => {
  const validator = new BaseValidator()

  const signIn = (api: APIRequestContext, apiConfig: ApiConfig, password: string) =>
    api.post(`${apiConfig.baseUrl}/auth/login`, {
      data: { email: userByRole('staff').email, password },
    })

  test('should refuse a password one character under the minimum as malformed', async ({
    api,
    apiConfig,
  }) => {
    const response = await signIn(api, apiConfig, 'p'.repeat(7))

    await validator.expectValidationError(response, 'password')
  })

  test('should check a wrong password of exactly the minimum length as credentials', async ({
    api,
    apiConfig,
  }) => {
    const response = await signIn(api, apiConfig, 'p'.repeat(8))

    await validator.expectError(response, 401, CommonError.INVALID_CREDENTIALS)
  })
})
