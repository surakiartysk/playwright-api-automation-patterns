import type { APIResponse } from '@playwright/test'
import { BaseClient } from '@core/BaseClient'
import type { CreateItemRequest, ListItemsQuery, UpdateItemRequest } from './types'

/**
 * One client per service domain — not per user story.
 *
 * REST is resource-oriented, so clients mirror resources. A story like "member
 * browses and reserves gear" spans items *and* reservations; if clients were
 * cut per story, `POST /items` would end up reimplemented in several of them.
 * Stories live one level up, in the specs, where they compose clients.
 *
 * Every method returns the raw `APIResponse` rather than a parsed body, so a
 * test that wants to assert a 4xx has something to assert on. Parsing is the
 * validator's job. See docs/decisions.md §2.
 */
export class ItemsClient extends BaseClient {
  listItems(query?: ListItemsQuery): Promise<APIResponse> {
    return this.get('items', query, 'List items')
  }

  getItemById(itemId: string): Promise<APIResponse> {
    return this.get(`items/${itemId}`, undefined, 'Get item by id')
  }

  createItem(data: CreateItemRequest): Promise<APIResponse> {
    return this.post('items', data, 'Create item')
  }

  updateItem(itemId: string, data: UpdateItemRequest): Promise<APIResponse> {
    return this.patch(`items/${itemId}`, data, 'Update item')
  }

  retireItem(itemId: string): Promise<APIResponse> {
    return this.del(`items/${itemId}`, 'Retire item')
  }
}
