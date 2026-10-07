/**
 * What an assertion calls itself, in the report and when it fails.
 *
 * Playwright names the step of `expect(value, message)` after the message, and
 * it does so whether the assertion passed or not. A message written for the
 * failure ("response did not match schema:", "expected 200, got 200 — body:
 * {…}") therefore sat in the report as a green step that read like an error,
 * with the whole body repeated in its title, one line, beside the pretty-printed
 * copy attached to the call.
 *
 * So each message here is a claim while it holds and says what broke when it
 * does not. The body stays where it already is — the response attached to the
 * call — and a failure carries only enough to see the cause from the dashboard's
 * one-line summary: the status that came back and the API's own `message`.
 *
 * Duplicated in both packages, like `allure-http`: each package is meant to be
 * readable on its own.
 */

/** The message for an assertion that holds, or for one that does not. */
export function said(ok: boolean, holds: string, broke: string): string {
  return ok ? holds : broke
}

/** The API's own account of what it did, as ` ("…")`, or nothing when it gave none. */
export function bodyHint(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown }
    if (typeof message === 'string' && message !== '') return ` ("${message}")`
  }
  return ''
}

export function statusMessage(expected: number, actual: number, body: unknown): string {
  return said(
    actual === expected,
    `status is ${expected}`,
    `expected ${expected}, got ${actual}${bodyHint(body)}`,
  )
}

/** `what` is the thing that was parsed: `response`, `error envelope` or `422 body`. */
export function schemaMessage(what: string, ok: boolean, issues: string): string {
  return said(ok, `${what} matches the schema`, `${what} did not match schema:\n${issues}`)
}

export function codeMessage(expected: string, actual: unknown): string {
  return said(
    actual === expected,
    `business code is '${expected}'`,
    `expected business code '${expected}', got '${String(actual)}'`,
  )
}

export function fieldMessage(field: string, named: string[]): string {
  return said(
    named.includes(field),
    `validation error names '${field}'`,
    `expected a validation error naming '${field}', got ${named.length > 0 ? named.map((n) => `'${n}'`).join(', ') : 'none'}`,
  )
}
