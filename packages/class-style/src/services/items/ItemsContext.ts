import { z } from 'zod'
import type { APIResponse } from '@playwright/test'
import { ITEM_CATEGORIES, ITEM_STATUSES } from '@gear-rental/shared-contract'
import type { ItemCategory, ItemStatus } from '@gear-rental/shared-contract'
import { ServiceContext } from '@core/ServiceContext'
import { idOnlySchema, isoDateTime, paginationSchema } from '@core/schemas'
import { randomSku, testSlug } from '@support/random'

export const ItemError = {
  SKU_TAKEN: 'ITM_SKU_TAKEN',
  IN_USE: 'ITM_IN_USE',
} as const

export const itemSchema = z
  .object({
    id: z.string().min(1),
    sku: z.string().regex(/^[A-Z]{3}-\d{4}$/),
    name: z.string().min(3).max(80),
    category: z.enum(ITEM_CATEGORIES),
    status: z.enum(ITEM_STATUSES),
    dailyRateCents: z.number().int().nonnegative(),
    conditionNote: z.string().max(280),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()

export const itemPageSchema = z
  .object({ items: z.array(itemSchema), pagination: paginationSchema })
  .strict()

export type Item = z.infer<typeof itemSchema>

export interface CreateItemRequest {
  sku: string
  name: string
  category: ItemCategory
  dailyRateCents: number
  conditionNote?: string
}

export type UpdateItemRequest = Partial<Omit<CreateItemRequest, 'sku'>>

export type ListItemsQuery = {
  page?: number
  pageSize?: number
  category?: ItemCategory
  status?: ItemStatus
  /** Exact match — how a test finds the row it created without paging. */
  sku?: string
}

/**
 * Everything a spec needs to work with items, in one object.
 *
 * Three groups of members, and the grouping is the whole point of this package:
 *
 *   build*   — payload construction (the other package's `factory.ts`)
 *   call     — raw requests, returning the response untouched
 *   expect*  — assertions that parse and return typed data
 *
 * `call` stays public and separate so a test asserting a 4xx still has a raw
 * response to work with. Folding assertions into every call — a `createItem`
 * that always expects 201 — would make the error paths unreachable, which is
 * the failure mode this shape is most often accused of.
 */
export class ItemsContext extends ServiceContext {
  // ── data ───────────────────────────────────────────────────────────────────
  buildPayload(overrides: Partial<CreateItemRequest> = {}): CreateItemRequest {
    return {
      sku: randomSku(),
      name: testSlug('item').slice(0, 80),
      category: 'tent',
      dailyRateCents: 1500,
      ...overrides,
    }
  }

  // ── requests ───────────────────────────────────────────────────────────────
  create(data: CreateItemRequest): Promise<APIResponse> {
    return this.http.post('items', data, 'Create item')
  }

  getById(itemId: string): Promise<APIResponse> {
    return this.http.get(`items/${itemId}`, undefined, 'Get item by id')
  }

  list(query?: ListItemsQuery): Promise<APIResponse> {
    return this.http.get('items', query, 'List items')
  }

  update(itemId: string, data: UpdateItemRequest): Promise<APIResponse> {
    return this.http.patch(`items/${itemId}`, data, 'Update item')
  }

  retire(itemId: string): Promise<APIResponse> {
    return this.http.delete(`items/${itemId}`, 'Retire item')
  }

  // ── assertions ─────────────────────────────────────────────────────────────
  async expectItem(response: APIResponse, expectedStatus = 200): Promise<Item> {
    return (await this.assert(response)).succeedsWith(itemSchema, expectedStatus)
  }

  async expectPage(response: APIResponse) {
    return (await this.assert(response)).succeedsWith(itemPageSchema)
  }

  async expectRetired(response: APIResponse) {
    return (await this.assert(response)).succeedsWith(idOnlySchema)
  }

  async expectError(response: APIResponse, status: number, code?: string) {
    return (await this.assert(response)).failsWith(status, code)
  }

  async expectValidationError(response: APIResponse, field?: string) {
    return (await this.assert(response)).failsValidation(field)
  }

  /**
   * Creates an item and returns it, failing loudly if setup did not work.
   *
   * The convenience the grouped shape buys: a spec that needs an item as a
   * precondition writes one line instead of create-then-assert. In the other
   * package this lives in a provisioner, because a client has no validator to
   * call.
   */
  async provision(overrides: Partial<CreateItemRequest> = {}): Promise<Item> {
    const payload = this.buildPayload(overrides)
    return this.expectItem(await this.create(payload), 201)
  }
}
