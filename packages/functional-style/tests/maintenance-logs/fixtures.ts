import { test as base } from '@fixtures/base'
import { ItemsClient } from '@services/items/ItemsClient'
import { MaintenanceLogsClient } from '@services/maintenance-logs/MaintenanceLogsClient'
import { MaintenanceLogsValidator } from '@services/maintenance-logs/MaintenanceLogsValidator'
import { ReservationsClient } from '@services/reservations/ReservationsClient'

/**
 * A cross-service spec needs several clients, so its fixture file composes
 * them. Note it composes the shared base rather than the reservations fixture
 * file — fixtures compose the layer below, not each other.
 */
export const test = base.extend<{
  itemsAsStaff: ItemsClient
  reservationsAsStaff: ReservationsClient
  maintenanceAsStaff: MaintenanceLogsClient
  maintenanceAsMember: MaintenanceLogsClient
  maintenanceValidator: MaintenanceLogsValidator
}>({
  itemsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ItemsClient(apiConfig, api, authTokens.staff))
  },

  reservationsAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new ReservationsClient(apiConfig, api, authTokens.staff))
  },

  maintenanceAsStaff: async ({ apiConfig, api, authTokens }, use) => {
    await use(new MaintenanceLogsClient(apiConfig, api, authTokens.staff))
  },

  maintenanceAsMember: async ({ apiConfig, api, authTokens }, use) => {
    await use(new MaintenanceLogsClient(apiConfig, api, authTokens.member))
  },

  maintenanceValidator: async ({}, use) => {
    await use(new MaintenanceLogsValidator())
  },
})

export { expect } from '@playwright/test'
