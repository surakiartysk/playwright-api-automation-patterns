import type { APIResponse } from '@playwright/test'
import { expect } from '@playwright/test'
import type { z } from 'zod'
import { errorEnvelope, successEnvelope, validationErrorEnvelope } from './schemas'
import type { ApiResponse, FieldError } from './types'

/**
 * Structural assertions, wrapped around one response.
 *
 * The other package passes a response *into* a validator method. Here a
 * response is wrapped once and the assertions chain off it. Two consequences,
 * both real:
 *
 * - the response is read once and reused, so a body is never parsed twice
 * - assertions read left to right (`assert(res).isCreated().matching(schema)`)
 *   rather than nesting validator calls inside each other
 *
 * The cost is an extra object per call and a second way to spell the same
 * checks. Whether that trade is worth it is exactly what docs/comparison.md
 * argues out rather than asserts.
 */
export class ResponseAssert {
  private constructor(
    private readonly response: APIResponse,
    private readonly body: unknown,
  ) {}

  /** Async factory, because reading the body is async and constructors are not. */
  static async of(response: APIResponse): Promise<ResponseAssert> {
    return new ResponseAssert(response, await response.json())
  }

  get status(): number {
    return this.response.status()
  }

  hasStatus(expected: number): this {
    expect(
      this.status,
      `expected ${expected}, got ${this.status} — body: ${JSON.stringify(this.body)}`,
    ).toBe(expected)
    return this
  }

  /** Asserts the success envelope and returns the typed payload. */
  succeedsWith<S extends z.ZodTypeAny>(dataSchema: S, expectedStatus = 200): z.infer<S> {
    this.hasStatus(expectedStatus)

    const parsed = successEnvelope(dataSchema).safeParse(this.body)
    expect(parsed.success, `response did not match schema:\n${formatIssues(parsed)}`).toBe(true)

    return (parsed.success ? parsed.data.data : undefined) as z.infer<S>
  }

  /** Asserts the error envelope, and the business code when given one. */
  failsWith(expectedStatus: number, expectedCode?: string): ApiResponse<unknown> {
    this.hasStatus(expectedStatus)

    const parsed = errorEnvelope.safeParse(this.body)
    expect(parsed.success, `error envelope did not match schema:\n${formatIssues(parsed)}`).toBe(
      true,
    )

    const envelope = (parsed.success ? parsed.data : this.body) as ApiResponse<unknown>
    if (expectedCode) {
      expect(envelope.code, `expected business code '${expectedCode}'`).toBe(expectedCode)
    }
    return envelope
  }

  /** Asserts a 422 and returns the offending fields. */
  failsValidation(expectedField?: string): FieldError[] {
    this.hasStatus(422)

    const parsed = validationErrorEnvelope.safeParse(this.body)
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

/** Convenience entry point: `const res = await assertResponse(raw)`. */
export const assertResponse = ResponseAssert.of
