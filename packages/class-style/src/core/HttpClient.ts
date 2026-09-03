import type { APIRequestContext, APIResponse } from '@playwright/test'
import { test } from '@playwright/test'
import type { ApiConfig, QueryParams } from './types'

/**
 * HTTP transport as an object.
 *
 * The other package makes this a `sendRequest` function taking everything it
 * needs per call. Here it is a class that holds base URL, token and request
 * context once, so callers pass only what varies. That is the genuine
 * difference: the same state exists either way, the question is whether it
 * travels in an object or in a parameter list.
 *
 * Injected through the constructor, never module-level. A shared instance would
 * be a real defect under parallel workers, not a stylistic choice — so the
 * class-first version does not take that shortcut either.
 */
export class HttpClient {
  constructor(
    private readonly config: ApiConfig,
    private readonly request: APIRequestContext,
    private readonly token?: string,
  ) {}

  /** A copy of this client that authenticates as someone else. */
  withToken(token: string | undefined): HttpClient {
    return new HttpClient(this.config, this.request, token)
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    }
  }

  private url(path: string): string {
    return `${this.config.baseUrl}/${path.replace(/^\//, '')}`
  }

  private async send(
    method: 'get' | 'post' | 'patch' | 'delete',
    label: string,
    path: string,
    options: { params?: QueryParams; data?: unknown } = {},
  ): Promise<APIResponse> {
    return test.step(label, async () => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(options.params ?? {})) {
        if (value !== undefined && value !== null) query.append(key, String(value))
      }
      const suffix = query.toString() ? `?${query.toString()}` : ''

      if (this.config.debug) {
        console.log(`→ ${method.toUpperCase()} ${this.url(path)}${suffix}`)
      }

      return this.request[method](`${this.url(path)}${suffix}`, {
        headers: this.headers(),
        ...(options.data === undefined ? {} : { data: options.data }),
      })
    })
  }

  get(path: string, params?: QueryParams, label = `GET ${path}`): Promise<APIResponse> {
    return this.send('get', label, path, { params })
  }

  post(path: string, data?: unknown, label = `POST ${path}`): Promise<APIResponse> {
    return this.send('post', label, path, { data })
  }

  patch(path: string, data?: unknown, label = `PATCH ${path}`): Promise<APIResponse> {
    return this.send('patch', label, path, { data })
  }

  delete(path: string, label = `DELETE ${path}`): Promise<APIResponse> {
    return this.send('delete', label, path)
  }
}
