import type { APIRequestContext, APIResponse } from '@playwright/test'
import { test } from '@playwright/test'
import { sendRequest } from '@utils/http'
import type { ApiConfig, QueryParams } from './types'

/**
 * The API Object Model base — and the one place in this package where a class
 * is the right tool.
 *
 * The justification is state: a client carries a base URL, a bearer token, and
 * a request context for its whole life, and every call needs all three. That
 * is precisely what an object is for. Note what is *not* here: no singleton,
 * no module-level instance, no `beforeEach` assignment. Dependencies arrive
 * through the constructor, so two workers hold two independent clients and
 * neither can observe the other.
 *
 * Everything without that justification — tests, data builders, HTTP helpers —
 * stays a function. See docs/decisions.md §1.
 */
export abstract class BaseClient {
  protected readonly config: ApiConfig
  protected readonly request: APIRequestContext
  protected readonly token?: string

  constructor(config: ApiConfig, request: APIRequestContext, token?: string) {
    this.config = config
    this.request = request
    this.token = token
  }

  /** Override in a subclass that needs additional headers. */
  protected headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  private url(path: string): string {
    return `${this.config.baseUrl}/${path.replace(/^\//, '')}`
  }

  /**
   * Wrapping each call in `test.step` gives the HTML report and trace viewer a
   * readable tree for free. This is Playwright's own idiom — a label passed at
   * the call site, where the reader already is, rather than an annotation
   * above a method they have to scroll up to find.
   */
  private async call(
    method: 'get' | 'post' | 'patch' | 'delete',
    label: string,
    path: string,
    options: { params?: QueryParams; data?: unknown } = {},
  ): Promise<APIResponse> {
    return test.step(label, async () => {
      const { response } = await sendRequest(this.request, {
        method,
        path: this.url(path),
        headers: this.headers(),
        debug: this.config.debug,
        ...options,
      })
      return response
    })
  }

  protected get(path: string, params?: QueryParams, label = `GET ${path}`): Promise<APIResponse> {
    return this.call('get', label, path, { params })
  }

  protected post(path: string, data?: unknown, label = `POST ${path}`): Promise<APIResponse> {
    return this.call('post', label, path, { data })
  }

  protected patch(path: string, data?: unknown, label = `PATCH ${path}`): Promise<APIResponse> {
    return this.call('patch', label, path, { data })
  }

  protected del(path: string, label = `DELETE ${path}`): Promise<APIResponse> {
    return this.call('delete', label, path)
  }
}
