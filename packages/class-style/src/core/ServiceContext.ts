import type { APIResponse } from '@playwright/test'
import { assertResponse } from './ResponseAssert'
import type { ResponseAssert } from './ResponseAssert'
import type { HttpClient } from './HttpClient'

/**
 * The base every service context extends.
 *
 * A service context is one object that knows how to call its endpoints, assert
 * its responses, and build its payloads. The other package splits those three
 * across a client, a validator, and a factory, wired together per spec by
 * fixtures.
 *
 * The honest case for grouping them: a spec touches one name instead of three,
 * autocomplete on `ctx.` lists everything the service can do, and adding an
 * endpoint means editing one file rather than three. For a large suite with
 * many services, that is a real reduction in wiring.
 *
 * The honest case against: the three responsibilities have genuinely different
 * reasons to change, and one class holding all of them grows on every axis at
 * once. Inheritance also fixes the shape early — a service that needs a
 * different assertion style has to fight the base rather than simply not use a
 * helper.
 *
 * Both are argued out in docs/comparison.md rather than settled here.
 */
export abstract class ServiceContext {
  constructor(protected readonly http: HttpClient) {}

  /** Wraps a raw response so assertions can chain off it. */
  protected assert(response: APIResponse): Promise<ResponseAssert> {
    return assertResponse(response)
  }
}
