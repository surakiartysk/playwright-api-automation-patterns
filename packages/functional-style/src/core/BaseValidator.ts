import type { APIResponse } from '@playwright/test'
import { expect } from '@playwright/test'
import type { z } from 'zod'
import { errorEnvelope, successEnvelope, validationErrorEnvelope } from './schemas'
import type { ApiResponse, FieldError } from './types'

/**
 * Structural assertions, in one place.
 *
 * The split this enforces: a validator checks *shape* — status code, envelope,
 * schema, business code — because that is identical for every test that hits
 * the endpoint. A test checks *values*, inline, because those differ per case.
 *
 * Putting field-value assertions in here would grow a parameter for every
 * caller until the validator became a second, worse copy of the test. Putting
 * structural checks in the tests would copy-paste the envelope into all of
 * them. See docs/decisions.md §3.
 *
 * Note there is no constructor: unlike a client, a validator carries no state —
 * it only holds behaviour. It stays a class purely so each service can bind its
 * own schemas by extending it; that is inheritance for naming, not for state.
 */
export class BaseValidator {
  /**
   * Asserts a successful response and returns its typed `data`.
   *
   * Returning the payload is deliberate: the test gets a value it can assert
   * on directly, so the two layers hand off cleanly instead of the test
   * re-parsing what the validator already read.
   */
  async expectSuccess<S extends z.ZodTypeAny>(
    response: APIResponse,
    dataSchema: S,
    expectedStatus = 200,
  ): Promise<z.infer<S>> {
    const body: unknown = await response.json()

    expect(
      response.status(),
      `expected ${expectedStatus}, got ${response.status()} — body: ${JSON.stringify(body)}`,
    ).toBe(expectedStatus)

    const parsed = successEnvelope(dataSchema).safeParse(body)
    expect(parsed.success, `response did not match schema:\n${formatIssues(parsed)}`).toBe(true)

    return (parsed.success ? parsed.data.data : undefined) as z.infer<S>
  }

  /**
   * Asserts a failed response and returns the parsed envelope.
   *
   * Callers assert on `code`, never on `message` — the code is the contract,
   * the message is prose that should stay free to improve.
   */
  async expectError(
    response: APIResponse,
    expectedStatus: number,
    expectedCode?: string,
  ): Promise<ApiResponse<unknown>> {
    const body: unknown = await response.json()

    expect(
      response.status(),
      `expected ${expectedStatus}, got ${response.status()} — body: ${JSON.stringify(body)}`,
    ).toBe(expectedStatus)

    const parsed = errorEnvelope.safeParse(body)
    expect(parsed.success, `error envelope did not match schema:\n${formatIssues(parsed)}`).toBe(
      true,
    )

    // The expect above throws when parsing failed, so this branch only runs on
    // a validated body — returning the parsed value rather than re-casting the
    // raw one keeps that guarantee visible instead of asserting it by hand.
    const envelope = parsed.success
      ? (parsed.data as ApiResponse<unknown>)
      : (body as ApiResponse<unknown>)

    if (expectedCode) {
      expect(envelope.code, `expected business code '${expectedCode}'`).toBe(expectedCode)
    }
    return envelope
  }

  /**
   * Asserts a 422 and returns the offending fields.
   *
   * Validation failures get their own helper because every caller wants the
   * same follow-up question answered — *which* field was rejected — and
   * digging that out of `data` by hand in each spec is noise.
   */
  async expectValidationError(
    response: APIResponse,
    expectedField?: string,
  ): Promise<FieldError[]> {
    const body: unknown = await response.json()

    expect(
      response.status(),
      `expected 422, got ${response.status()} — body: ${JSON.stringify(body)}`,
    ).toBe(422)

    const parsed = validationErrorEnvelope.safeParse(body)
    expect(parsed.success, `422 body did not match schema:\n${formatIssues(parsed)}`).toBe(true)

    const fields = parsed.success ? parsed.data.data.fields : []
    if (expectedField) {
      expect(
        fields.map((f) => f.field),
        `expected a validation error naming '${expectedField}'`,
      ).toContain(expectedField)
    }
    return fields
  }
}

function formatIssues(result: z.SafeParseReturnType<unknown, unknown>): string {
  if (result.success) return ''
  return result.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
