import type { APIResponse } from '@playwright/test'
import { attachment, ContentType } from 'allure-js-commons'

/**
 * Writes each HTTP exchange into the Allure report.
 *
 * `test.step` already gives the report a readable tree, but a step only says
 * which call happened — not what was sent or what came back. That is the first
 * thing anyone asks of a red run, and without it the answer is "re-run it
 * locally and add a console.log", which is the loop this suite exists to close.
 *
 * The Playwright trace carries the same data, but it is a separate artifact
 * behind a separate viewer and it is only retained on failure. These are
 * attached on every call, so a passing run can be audited too — which is the
 * case when someone asks whether a test asserted what its name claims.
 *
 * Duplicated in both packages, like `allure-meta`: each package is meant to be
 * readable on its own, and a shared reporting module would be a third place to
 * look for behaviour neither style owns.
 */

/** Header names whose values are replaced before anything is written to a report. */
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key'])

/**
 * Bodies above this are truncated in the attachment. A report is for reading;
 * a response needing more than this to understand is one to reproduce with the
 * trace, not to scroll through in a browser.
 */
const MAX_ATTACHED_BODY = 16 * 1024

export interface Exchange {
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody: unknown
  response: APIResponse
  elapsedMs: number
}

/**
 * Attach one request/response pair to the current test.
 *
 * Never throws: a reporting problem must not fail a test that otherwise passed,
 * and this runs on every call including ones made outside a test context.
 *
 * @param exchange - The call as it was sent and answered
 */
export async function attachExchange({
  method,
  url,
  requestHeaders,
  requestBody,
  response,
  elapsedMs,
}: Exchange): Promise<void> {
  try {
    await attachment(
      `→ ${method.toUpperCase()} ${url}`,
      JSON.stringify(
        {
          method: method.toUpperCase(),
          url,
          headers: redact(requestHeaders),
          body: requestBody ?? null,
        },
        null,
        2,
      ),
      ContentType.JSON,
    )

    await attachment(
      `← ${response.status()} ${response.statusText()} (${elapsedMs}ms)`,
      JSON.stringify(
        {
          status: response.status(),
          statusText: response.statusText(),
          elapsedMs,
          headers: redact(response.headers()),
          body: await readBody(response),
        },
        null,
        2,
      ),
      ContentType.JSON,
    )
  } catch {
    // Best-effort. A body that cannot be read, or a call made outside a test
    // context, is not a reason to fail the test.
  }
}

/**
 * Read a response body for the report without consuming it for the caller.
 *
 * Playwright buffers the body, so reading it here does not stop a test reading
 * it again. A non-JSON body is returned as text and an oversized one is cut,
 * both stated in the value so a reader is never guessing what they are seeing.
 *
 * @param response - The response to read
 * @returns Parsed JSON, raw text, or null for an empty body
 */
async function readBody(response: APIResponse): Promise<unknown> {
  const text = await response.text()
  if (text === '') return null

  if (text.length > MAX_ATTACHED_BODY) {
    return `[truncated at ${MAX_ATTACHED_BODY} bytes of ${text.length}] ${text.slice(0, MAX_ATTACHED_BODY)}`
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Replace credential-bearing header values.
 *
 * The report is an artifact that gets uploaded, linked and shared; a bearer
 * token in it outlives the run that produced it. The header name is kept,
 * because knowing a request was authenticated is part of reading the exchange.
 *
 * @param headers - Headers as sent or received
 * @returns The same headers with credential values replaced
 */
function redact(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) =>
      REDACTED_HEADERS.has(key.toLowerCase()) ? [key, '[redacted]'] : [key, value],
    ),
  )
}
