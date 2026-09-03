import type { APIResponse } from '@playwright/test'
import { BaseValidator } from '@core/BaseValidator'
import { maintenanceLogPageSchema, maintenanceLogSchema } from './schemas'
import type { MaintenanceLog } from './types'

export const MaintenanceError = {
  ALREADY_RESOLVED: 'MNT_ALREADY_RESOLVED',
} as const

export class MaintenanceLogsValidator extends BaseValidator {
  async expectLog(response: APIResponse, expectedStatus = 200): Promise<MaintenanceLog> {
    return this.expectSuccess(response, maintenanceLogSchema, expectedStatus)
  }

  async expectLogPage(response: APIResponse) {
    return this.expectSuccess(response, maintenanceLogPageSchema)
  }
}
