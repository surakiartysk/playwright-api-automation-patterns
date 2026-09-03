import type { ApiConfig } from '@core/types'

/**
 * Configuration, read from the environment with defaults that work out of the
 * box. Nothing here is secret: the mock is local and its credentials are in
 * the contract package. A clean clone runs with no setup at all — that is the
 * point, and it is why there is no `.env` requirement.
 */

const DEFAULT_PORT = 4010

export function loadApiConfig(): ApiConfig {
  const port = process.env.MOCK_PORT ?? String(DEFAULT_PORT)

  return {
    baseUrl: process.env.BASE_URL ?? `http://127.0.0.1:${port}/api/v1`,
    debug: process.env.DEBUG_API === 'true',
  }
}
