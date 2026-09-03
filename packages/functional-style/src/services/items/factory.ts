import { randomSku } from '@utils/random'
import { testItemName } from '@utils/test-data'
import type { CreateItemRequest } from './types'

/**
 * Payload builder — a function, not a class method.
 *
 * It holds nothing between calls and needs no configuration, so an object
 * would only add ceremony. Overrides come last so a test can state just the
 * field it cares about and let the rest default to something valid.
 */
export function buildItemPayload(overrides: Partial<CreateItemRequest> = {}): CreateItemRequest {
  return {
    sku: randomSku(),
    name: testItemName('item'),
    category: 'tent',
    dailyRateCents: 1500,
    ...overrides,
  }
}
