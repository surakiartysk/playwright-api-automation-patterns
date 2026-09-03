import type { APIResponse } from '@playwright/test'
import { BaseClient } from '@core/BaseClient'
import type { ListMaintenanceLogsQuery, ResolveMaintenanceRequest } from './types'

/**
 * No `create` method, because the API has no POST for it — a log exists only
 * because a reservation reached CHECKED_OUT. The missing method is the point.
 */
export class MaintenanceLogsClient extends BaseClient {
  listLogs(query?: ListMaintenanceLogsQuery): Promise<APIResponse> {
    return this.get('maintenance-logs', query, 'List maintenance logs')
  }

  resolveLog(logId: string, data: ResolveMaintenanceRequest): Promise<APIResponse> {
    return this.post(`maintenance-logs/${logId}/resolve`, data, 'Resolve maintenance log')
  }
}
