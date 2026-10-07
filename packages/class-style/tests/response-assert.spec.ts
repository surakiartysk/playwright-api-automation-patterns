import { z } from 'zod'
import type { APIResponse } from '@playwright/test'
import { assertResponse } from '@core/ResponseAssert'
import {
  codeMessage,
  fieldMessage,
  listMessage,
  schemaMessage,
  statusMessage,
} from '@core/check-message'
import categories from '../../../allure-categories.json' with { type: 'json' }
import { expect, test } from '@support/fixtures'

/**
 * Tests for the assertion helper itself.
 *
 * Every spec in this package routes its checks through `ResponseAssert`, which
 * makes it the one place whose failure is invisible: weaken a check inside it
 * and every other spec keeps passing, because they only ever observe "no
 * exception thrown".
 *
 * Verified, not assumed — removing the status check, the schema check, or the
 * business-code check each left the whole suite green. The other package hit
 * the identical problem in its `BaseValidator`, which is itself the useful
 * finding: this failure mode belongs to *centralising assertions*, not to
 * either style. Both packages need a test at this layer, and for the same
 * reason.
 */

/** A fake APIResponse — only the members ResponseAssert touches. */
function fakeResponse(status: number, body: unknown): APIResponse {
  return {
    status: () => status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as APIResponse
}

const okBody = (data: unknown) => ({ success: true, code: 'OK', message: 'success', data })
const errBody = (code: string, data: unknown = null) => ({
  success: false,
  code,
  message: 'something went wrong',
  data,
})

const anyData = z.object({ id: z.string() }).strict()

async function rejects(fn: () => Promise<unknown> | unknown, because: string): Promise<void> {
  let threw = false
  try {
    await fn()
  } catch {
    threw = true
  }
  expect(threw, because).toBe(true)
}

/** The message a check failed with. Fails itself if the check did not fail. */
async function failureOf(fn: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('the check was expected to fail and did not')
}

test.describe('ResponseAssert', { tag: ['@core', '@isolated'] }, () => {
  test.describe('succeedsWith', () => {
    test('should return the payload of a well-formed response', async () => {
      const assert = await assertResponse(fakeResponse(200, okBody({ id: 'x' })))

      expect(assert.succeedsWith(anyData)).toEqual({ id: 'x' })
    })

    test('should reject a status that does not match', async () => {
      const assert = await assertResponse(fakeResponse(200, okBody({ id: 'x' })))

      await rejects(
        () => assert.succeedsWith(anyData, 201),
        'succeedsWith must check the status, not just the body',
      )
    })

    test('should reject a payload that violates the schema', async () => {
      const assert = await assertResponse(fakeResponse(200, okBody({ id: 42 })))

      await rejects(() => assert.succeedsWith(anyData), 'succeedsWith must apply the schema')
    })

    test('should reject an unexpected field in the payload', async () => {
      const assert = await assertResponse(fakeResponse(200, okBody({ id: 'x', extra: true })))

      await rejects(() => assert.succeedsWith(anyData), 'strict schemas must reject unknown fields')
    })

    test('should reject an error envelope handed to the success path', async () => {
      const assert = await assertResponse(fakeResponse(200, errBody('NOT_FOUND')))

      await rejects(
        () => assert.succeedsWith(anyData),
        'success:false must never satisfy succeedsWith',
      )
    })
  })

  test.describe('failsWith', () => {
    test('should return the envelope of a well-formed error', async () => {
      const assert = await assertResponse(fakeResponse(403, errBody('AUTH_FORBIDDEN')))

      expect(assert.failsWith(403, 'AUTH_FORBIDDEN').code).toBe('AUTH_FORBIDDEN')
    })

    test('should reject a status that does not match', async () => {
      // Right code, wrong status. The two always agree in this mock, so only
      // this test keeps the status check honest.
      const assert = await assertResponse(fakeResponse(200, errBody('AUTH_FORBIDDEN')))

      await rejects(
        () => assert.failsWith(403),
        'failsWith must check the status independently of the code',
      )
    })

    test('should reject a business code that does not match', async () => {
      const assert = await assertResponse(fakeResponse(403, errBody('AUTH_FORBIDDEN')))

      await rejects(() => assert.failsWith(403, 'NOT_FOUND'), 'failsWith must check the code')
    })

    test('should reject a success envelope handed to the error path', async () => {
      const assert = await assertResponse(fakeResponse(403, okBody(null)))

      await rejects(() => assert.failsWith(403), 'success:true must never satisfy failsWith')
    })
  })

  test.describe('failsValidation', () => {
    const fields = [{ field: 'name', rule: 'required', message: 'name is required' }]
    const body = {
      success: false,
      code: 'VALIDATION_FAILED',
      message: 'request validation failed',
      data: { fields },
    }

    test('should return the offending fields', async () => {
      const assert = await assertResponse(fakeResponse(422, body))

      expect(assert.failsValidation('name')).toEqual(fields)
    })

    test('should reject a status that is not 422', async () => {
      const assert = await assertResponse(fakeResponse(400, body))

      await rejects(() => assert.failsValidation(), 'failsValidation must require 422')
    })

    test('should reject when the expected field is absent', async () => {
      const assert = await assertResponse(fakeResponse(422, body))

      await rejects(
        () => assert.failsValidation('email'),
        'failsValidation must check which field was named',
      )
    })

    test('should reject a 422 carrying no field detail', async () => {
      const assert = await assertResponse(fakeResponse(422, { ...body, data: { fields: [] } }))

      await rejects(() => assert.failsValidation(), 'a 422 must name at least one offending field')
    })
  })

  /**
   * What a check calls itself, in the report and when it fails.
   *
   * Playwright names an assertion's step after its message whether it passed or
   * not, so a message written for the failure sat in the report as a green step
   * that read like an error, with the whole body in its title. These hold the
   * failure down to what the dashboard's one line needs, and the passing name
   * to a claim.
   */
  test.describe('messages', () => {
    test('should say what was expected and what came back when the status is wrong', async () => {
      const message = await failureOf(async () =>
        (await assertResponse(fakeResponse(200, okBody({ id: 'x' })))).succeedsWith(anyData, 201),
      )

      expect(message).toContain('expected 201, got 200 ("success")')
    })

    test('should keep the response body out of a failure message', async () => {
      const message = await failureOf(async () =>
        (await assertResponse(fakeResponse(200, okBody({ id: 'x' })))).succeedsWith(anyData, 201),
      )

      // The body is attached to the call, pretty-printed; a copy here is what
      // made the one-line summary an unreadable run of JSON.
      expect(message).not.toContain('{')
      expect(message).not.toContain('"id"')
    })

    test('should name the business code that came back when it is the wrong one', async () => {
      const message = await failureOf(async () =>
        (await assertResponse(fakeResponse(403, errBody('AUTH_FORBIDDEN')))).failsWith(
          403,
          'NOT_FOUND',
        ),
      )

      expect(message).toContain("expected business code 'NOT_FOUND', got 'AUTH_FORBIDDEN'")
    })

    test('should word a check that holds as a claim, not as an error', () => {
      const names = [
        statusMessage(201, 201, okBody({ id: 'x' })),
        schemaMessage('response', true, ''),
        codeMessage('NOT_FOUND', 'NOT_FOUND'),
      ]

      expect(names[0]).toBe('status is 201')
      for (const name of names) expect(name).not.toMatch(/expected|did not|body:|failed/)
    })

    test('should say what was expected and what came back when a list differs', () => {
      expect(listMessage('legal actions from CLOSED', [], ['cancel'])).toBe(
        'legal actions from CLOSED: expected [], got [cancel]',
      )
      expect(listMessage('legal actions from OPEN', ['close', 'return'], ['return'])).toBe(
        'legal actions from OPEN: expected [close, return], got [return]',
      )
      // The callers sort both sides, so order is part of what the helper compares.
      expect(listMessage('legal actions from OPEN', ['close', 'return'], ['return', 'close'])).toBe(
        'legal actions from OPEN: expected [close, return], got [return, close]',
      )
    })

    test('should word a list that matches as a claim, not as an error', () => {
      expect(listMessage('legal actions from OPEN', ['close', 'return'], ['close', 'return'])).toBe(
        'legal actions from OPEN are [close, return]',
      )
      expect(listMessage('legal actions from CLOSED', [], [])).toBe(
        'legal actions from CLOSED are []',
      )
    })

    // The failure categories (allure-categories.json, applied to every report)
    // match on these phrases and quietly collect nothing when one changes, which
    // is how a reworded message would go unnoticed. Held against the file itself,
    // so it is the categories that are tested and not a copy of their regexes.
    test('should keep the wording the failure categories match on', () => {
      const categoryOf = (message: string) =>
        categories.filter((c) => new RegExp(c.messageRegex).test(message)).map((c) => c.name)

      expect(categoryOf(statusMessage(201, 200, null))).toEqual(['Unexpected HTTP status'])
      expect(categoryOf(schemaMessage('response', false, '  • id: Required'))).toEqual([
        'Schema mismatch',
      ])
      expect(categoryOf(codeMessage('NOT_FOUND', 'AUTH_FORBIDDEN'))).toEqual([
        'Unexpected business code',
      ])
      expect(categoryOf(fieldMessage('name', ['sku']))).toEqual([
        'Validation error named the wrong field',
      ])
    })
  })
})
