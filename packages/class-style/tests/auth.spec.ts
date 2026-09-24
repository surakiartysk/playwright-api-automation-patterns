import { userByRole } from '@gear-rental/shared-contract'
import { assertResponse } from '@core/ResponseAssert'
import { CommonError } from '@core/schemas'
import { test } from '@support/fixtures'

/**
 * Sign-in's one validation rule, at its boundary.
 *
 * Auth is infrastructure here — the worker-scoped token fixture signs in once
 * and every other spec rides on it — so nothing asserted the password's
 * `minLength: 8`, and a mock accepting a one-character password kept all 97
 * tests green.
 *
 * Seven characters must be refused as malformed (422); eight that are simply
 * wrong must reach the credential check (401), not be refused as malformed
 * first — so loosening and tightening the limit each fail one of the pair.
 */
test.describe('auth', { tag: ['@core', '@isolated'] }, () => {
  test('should refuse a password one character under the minimum as malformed', async ({
    api,
    apiConfig,
  }) => {
    const response = await api.post(`${apiConfig.baseUrl}/auth/login`, {
      data: { email: userByRole('staff').email, password: 'p'.repeat(7) },
    })

    ;(await assertResponse(response)).failsValidation('password')
  })

  test('should check a wrong password of exactly the minimum length as credentials', async ({
    api,
    apiConfig,
  }) => {
    const response = await api.post(`${apiConfig.baseUrl}/auth/login`, {
      data: { email: userByRole('staff').email, password: 'p'.repeat(8) },
    })

    ;(await assertResponse(response)).failsWith(401, CommonError.INVALID_CREDENTIALS)
  })
})
