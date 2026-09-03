import type { APIRequestContext, APIResponse } from '@playwright/test'
import type { QueryParams } from '@core/types'

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete'

export interface SendOptions {
  method: HttpMethod
  path: string
  headers?: Record<string, string>
  params?: QueryParams
  data?: unknown
  debug?: boolean
}

/**
 * The single place an HTTP call leaves this suite.
 *
 * A function rather than a class: it holds no state between calls — everything
 * it needs arrives as an argument. Funnelling every request through here means
 * debug logging, param handling and timing exist once instead of per service.
 */
export async function sendRequest(
  request: APIRequestContext,
  { method, path, headers, params, data, debug }: SendOptions,
): Promise<{ response: APIResponse; elapsedMs: number }> {
  const query = buildQuery(params)
  const url = query ? `${path}?${query}` : path

  if (debug) {
    console.log(`→ ${method.toUpperCase()} ${url}`, data ? JSON.stringify(data) : '')
  }

  const startedAt = performance.now()
  const response = await request[method](url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    ...(data === undefined ? {} : { data }),
  })
  const elapsedMs = Math.round(performance.now() - startedAt)

  if (debug) {
    console.log(`← ${response.status()} ${url} (${elapsedMs}ms)`)
  }

  return { response, elapsedMs }
}

/** Drops undefined/null so optional filters can be passed through directly. */
function buildQuery(params?: QueryParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.append(key, String(value))
  }
  return search.toString()
}
