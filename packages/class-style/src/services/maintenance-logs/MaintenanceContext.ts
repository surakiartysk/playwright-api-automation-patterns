import { z } from 'zod'
import { test, type APIResponse } from '@playwright/test'
import { MAINTENANCE_STATES } from '@gear-rental/shared-contract'
import type { MaintenanceState } from '@gear-rental/shared-contract'
import { ServiceContext } from '@core/ServiceContext'
import { isoDateTime, paginationSchema } from '@core/schemas'
import type { ItemsContext } from '@services/items/ItemsContext'
import type { Reservation, ReservationsContext } from '@services/reservations/ReservationsContext'

export const MaintenanceError = {
  ALREADY_RESOLVED: 'MNT_ALREADY_RESOLVED',
} as const

export const maintenanceLogSchema = z
  .object({
    id: z.string().min(1),
    reservationId: z.string().min(1),
    itemId: z.string().min(1),
    state: z.enum(MAINTENANCE_STATES),
    openedAt: isoDateTime,
    resolvedAt: isoDateTime.nullable(),
    resolutionNote: z.string().nullable(),
  })
  .strict()

export const maintenanceLogPageSchema = z
  .object({ logs: z.array(maintenanceLogSchema), pagination: paginationSchema })
  .strict()

export type MaintenanceLog = z.infer<typeof maintenanceLogSchema>

export type ListLogsQuery = {
  reservationId?: string
  itemId?: string
  state?: MaintenanceState
  page?: number
  pageSize?: number
}

/**
 * No `create` — the API has none. A log exists only because a reservation
 * reached CHECKED_OUT, so `provision` below has to drive one there.
 */
export class MaintenanceContext extends ServiceContext {
  // ── requests ───────────────────────────────────────────────────────────────
  list(query?: ListLogsQuery): Promise<APIResponse> {
    return this.http.get('maintenance-logs', query, 'List maintenance logs')
  }

  resolve(logId: string, resolutionNote: string): Promise<APIResponse> {
    return this.http.post(
      `maintenance-logs/${logId}/resolve`,
      { resolutionNote },
      'Resolve maintenance log',
    )
  }

  // ── assertions ─────────────────────────────────────────────────────────────
  async expectLog(response: APIResponse, expectedStatus = 200): Promise<MaintenanceLog> {
    return (await this.assert(response)).succeedsWith(maintenanceLogSchema, expectedStatus)
  }

  async expectPage(response: APIResponse) {
    return (await this.assert(response)).succeedsWith(maintenanceLogPageSchema)
  }

  async expectError(response: APIResponse, status: number, code?: string) {
    return (await this.assert(response)).failsWith(status, code)
  }

  async expectValidationError(response: APIResponse, field?: string) {
    return (await this.assert(response)).failsValidation(field)
  }

  // ── provisioning ───────────────────────────────────────────────────────────
  /**
   * Composes the reservation context to produce an open log.
   *
   * The same composition the other package uses, expressed with objects: this
   * context calls `reservations.provision(...)` and uses the result. It does
   * not extend it and does not reach into it — inheritance here would tie a
   * maintenance log to being a kind of reservation, which it is not.
   *
   * Worth noting for the comparison: the class-first version does *not* make
   * composition harder. The dependency is the API's, not the style's.
   */
  async provisionOpenLog(
    items: ItemsContext,
    reservations: ReservationsContext,
  ): Promise<{ log: MaintenanceLog; reservation: Reservation; itemId: string }> {
    return test.step('Precondition: an open maintenance log', async () => {
      const { reservation, itemId } = await reservations.provision(items, 'CHECKED_OUT')

      // By reservation id, not "the newest log": with workers checking gear out
      // concurrently, newest belongs to whoever was last.
      const page = await this.expectPage(await this.list({ reservationId: reservation.id }))

      if (page.logs.length !== 1) {
        throw new Error(
          `expected exactly one log for reservation ${reservation.id}, got ${page.logs.length}`,
        )
      }
      return { log: page.logs[0]!, reservation, itemId }
    })
  }
}
