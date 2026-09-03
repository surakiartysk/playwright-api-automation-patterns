import { test as base } from '@fixtures/base'
import { ItemsClient } from '@services/items/ItemsClient'
import { ReservationsClient } from '@services/reservations/ReservationsClient'
import { ReservationsValidator } from '@services/reservations/ReservationsValidator'

export const test = base.extend<{
  itemsAsStaff: ItemsClient
  itemsAsAdmin: ItemsClient
  reservationsAsStaff: ReservationsClient
  reservationsAsMember: ReservationsClient
  reservationsValidator: ReservationsValidator
}>({
  itemsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsClient(apiConfig, api, authTokens.staff))
  },

  itemsAsAdmin: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsClient(apiConfig, api, authTokens.admin))
  },

  reservationsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ReservationsClient(apiConfig, api, authTokens.staff))
  },

  reservationsAsMember: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ReservationsClient(apiConfig, api, authTokens.member))
  },

  reservationsValidator: async ({}, use) => {
    await use(new ReservationsValidator())
  },
})

export { expect } from '@playwright/test'
