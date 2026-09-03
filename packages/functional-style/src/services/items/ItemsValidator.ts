import type { APIResponse } from '@playwright/test'
import { BaseValidator } from '@core/BaseValidator'
import { itemPageSchema, itemSchema, retiredItemSchema } from './schemas'
import type { Item } from './types'

/** Codes this service can return, beyond the cross-cutting ones. */
export const ItemError = {
  SKU_TAKEN: 'ITM_SKU_TAKEN',
  IN_USE: 'ITM_IN_USE',
} as const

/**
 * A thin delegate over BaseValidator.
 *
 * There is no clever logic here on purpose — the shared envelope work already
 * happens in the base, and this layer only binds the service's own schemas to
 * it. If a fourth service later needs the same thing, it writes the same six
 * lines; that duplication stays cheaper than a premature abstraction until the
 * shapes prove they really are identical.
 */
export class ItemsValidator extends BaseValidator {
  async expectItem(response: APIResponse, expectedStatus = 200): Promise<Item> {
    return this.expectSuccess(response, itemSchema, expectedStatus)
  }

  async expectItemPage(response: APIResponse) {
    return this.expectSuccess(response, itemPageSchema)
  }

  async expectRetired(response: APIResponse) {
    return this.expectSuccess(response, retiredItemSchema)
  }
}
