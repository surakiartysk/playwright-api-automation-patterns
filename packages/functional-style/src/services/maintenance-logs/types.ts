import type { MaintenanceState } from '@gear-rental/shared-contract'

export interface MaintenanceLog {
  id: string
  reservationId: string
  itemId: string
  state: MaintenanceState
  openedAt: string
  resolvedAt: string | null
  resolutionNote: string | null
}

/** Type alias, not interface — see `QueryParams` in `@core/types`. */
export type ListMaintenanceLogsQuery = {
  reservationId?: string
  itemId?: string
  state?: MaintenanceState
  page?: number
  pageSize?: number
}

export interface ResolveMaintenanceRequest {
  resolutionNote: string
}
