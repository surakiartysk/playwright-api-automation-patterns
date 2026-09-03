import type { ItemCategory, ItemStatus } from '@gear-rental/shared-contract'

export interface Item {
  id: string
  sku: string
  name: string
  category: ItemCategory
  status: ItemStatus
  dailyRateCents: number
  conditionNote: string
  createdAt: string
  updatedAt: string
}

export interface CreateItemRequest {
  sku: string
  name: string
  category: ItemCategory
  dailyRateCents: number
  conditionNote?: string
}

/** Every field optional, but the contract requires at least one. */
export type UpdateItemRequest = Partial<Omit<CreateItemRequest, 'sku'>>

/**
 * A type alias, not an interface, on purpose: only aliases get an implicit
 * index signature, which is what lets this satisfy `QueryParams` and be handed
 * to the client without a cast.
 */
export type ListItemsQuery = {
  page?: number
  pageSize?: number
  category?: ItemCategory
  status?: ItemStatus
  /** Exact match — how a test finds the row it created without paging. */
  sku?: string
}
