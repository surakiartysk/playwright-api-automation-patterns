import { z } from 'zod'
import type { APIResponse } from '@playwright/test'
import { BaseValidator } from '@core/BaseValidator'
import { expect, test } from '@fixtures/base'

/**
 * Tests for the validator itself.
 *
 * Everything else in this suite routes its assertions through BaseValidator,
 * which makes it the one component whose failure is invisible: weaken a check
 * inside it and every spec keeps passing, because they only ever see "no
 * exception thrown".
 *
 * That is not hypothetical. Replacing the status-code assertion in both
 * `expectSuccess` and `expectError` with a no-op left all 67 tests green — the
 * suite verified business codes and response shapes but never once checked that
 * a 403 was actually a 403. Against this mock the two travel together; against a
 * real API they can diverge, and nothing here would have noticed.
 *
 * These tests feed the validator hand-built responses so its checks have to
 * fire. They are the reason a removed assertion now fails something.
 */

/** A fake APIResponse — only the members BaseValidator touches. */
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

const validator = new BaseValidator()
const anyData = z.object({ id: z.string() }).strict()

/** Asserts that `fn` fails — i.e. the validator refused to accept the response. */
async function rejects(fn: () => Promise<unknown>, because: string): Promise<void> {
  let threw = false
  try {
    await fn()
  } catch {
    threw = true
  }
  expect(threw, because).toBe(true)
}

test.describe('BaseValidator', { tag: ['@core', '@isolated'] }, () => {
  test.describe('expectSuccess', () => {
    test('should accept a well-formed success response', async () => {
      const data = await validator.expectSuccess(fakeResponse(200, okBody({ id: 'x' })), anyData)

      expect(data).toEqual({ id: 'x' })
    })

    test('should reject a status that does not match', async () => {
      // The case the suite could not previously catch: 200 where 201 is
      // required. Shape and code are both correct here, so only the status
      // assertion can fail this.
      await rejects(
        () => validator.expectSuccess(fakeResponse(200, okBody({ id: 'x' })), anyData, 201),
        'expectSuccess must check the status code, not just the body',
      )
    })

    test('should reject a payload that violates the schema', async () => {
      await rejects(
        () => validator.expectSuccess(fakeResponse(200, okBody({ id: 42 })), anyData),
        'expectSuccess must validate data against the schema',
      )
    })

    test('should reject an unexpected field in the payload', async () => {
      await rejects(
        () => validator.expectSuccess(fakeResponse(200, okBody({ id: 'x', extra: true })), anyData),
        'strict schemas must reject unknown fields',
      )
    })

    test('should reject an error envelope handed to the success path', async () => {
      await rejects(
        () => validator.expectSuccess(fakeResponse(200, errBody('NOT_FOUND')), anyData),
        'success:false must never satisfy expectSuccess',
      )
    })
  })

  test.describe('expectError', () => {
    test('should accept a well-formed error response', async () => {
      const envelope = await validator.expectError(
        fakeResponse(403, errBody('AUTH_FORBIDDEN')),
        403,
        'AUTH_FORBIDDEN',
      )

      expect(envelope.code).toBe('AUTH_FORBIDDEN')
    })

    test('should reject a status that does not match', async () => {
      // Right code, wrong status. In this mock the two always agree, so without
      // this test the status check could be deleted unnoticed.
      await rejects(
        () => validator.expectError(fakeResponse(200, errBody('AUTH_FORBIDDEN')), 403),
        'expectError must check the status code independently of the business code',
      )
    })

    test('should reject a business code that does not match', async () => {
      await rejects(
        () => validator.expectError(fakeResponse(403, errBody('AUTH_FORBIDDEN')), 403, 'NOT_FOUND'),
        'expectError must check the business code',
      )
    })

    test('should reject a success envelope handed to the error path', async () => {
      await rejects(
        () => validator.expectError(fakeResponse(403, okBody(null)), 403),
        'success:true must never satisfy expectError',
      )
    })
  })

  test.describe('expectValidationError', () => {
    const fields = [{ field: 'name', rule: 'required', message: 'name is required' }]
    const body = {
      success: false,
      code: 'VALIDATION_FAILED',
      message: 'request validation failed',
      data: { fields },
    }

    test('should return the offending fields', async () => {
      const result = await validator.expectValidationError(fakeResponse(422, body), 'name')

      expect(result).toEqual(fields)
    })

    test('should reject a status that is not 422', async () => {
      await rejects(
        () => validator.expectValidationError(fakeResponse(400, body)),
        'expectValidationError must require 422',
      )
    })

    test('should reject when the expected field is absent', async () => {
      await rejects(
        () => validator.expectValidationError(fakeResponse(422, body), 'email'),
        'expectValidationError must check which field was named',
      )
    })

    test('should reject a 422 carrying no field detail', async () => {
      await rejects(
        () => validator.expectValidationError(fakeResponse(422, { ...body, data: { fields: [] } })),
        'a 422 must name at least one offending field',
      )
    })
  })
})
