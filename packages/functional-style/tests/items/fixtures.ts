import { test as base } from '@fixtures/base'
import { ItemsClient } from '@services/items/ItemsClient'
import { ItemsValidator } from '@services/items/ItemsValidator'

/**
 * Per-service fixtures, composed from the shared base.
 *
 * A client per role, because "can a member do this?" is a question nearly
 * every service has to answer, and building the client inline in each spec
 * would bury the actual test behind three lines of setup.
 */
export const test = base.extend<{
  itemsAsStaff: ItemsClient
  itemsAsAdmin: ItemsClient
  itemsAsMember: ItemsClient
  itemsValidator: ItemsValidator
}>({
  itemsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsClient(apiConfig, api, authTokens.staff))
  },

  itemsAsAdmin: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsClient(apiConfig, api, authTokens.admin))
  },

  itemsAsMember: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsClient(apiConfig, api, authTokens.member))
  },

  itemsValidator: async ({}, use) => {
    await use(new ItemsValidator())
  },
})

export { expect } from '@playwright/test'
