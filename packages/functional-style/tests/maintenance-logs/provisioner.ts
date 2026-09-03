import { expect, test } from '@playwright/test'
import type { ItemsClient } from '@services/items/ItemsClient'
import type { MaintenanceLogsClient } from '@services/maintenance-logs/MaintenanceLogsClient'
import type { MaintenanceLog } from '@services/maintenance-logs/types'
import type { ReservationsClient } from '@services/reservations/ReservationsClient'
import type { Reservation } from '@services/reservations/types'
import { provisionReservation } from '../reservations/provisioner'

/**
 * Provisions an open maintenance log — by composing the reservation
 * provisioner rather than reimplementing it.
 *
 * This is the composition pattern, and the API forces it: there is no POST for
 * a log. A row exists only because a reservation reached CHECKED_OUT, so the
 * only way to get one is to drive a reservation there. Composition here is not
 * a stylistic choice; anything else would be fabricating state the API never
 * produces.
 *
 * Note what it does *not* do: it does not subclass, and it does not reach into
 * the reservation provisioner's internals. It calls it and uses the result,
 * which is why either can change without breaking the other.
 */

export interface ProvisionedLog {
  log: MaintenanceLog
  reservation: Reservation
  itemId: string
}

export interface ProvisionLogOptions {
  items: ItemsClient
  reservations: ReservationsClient
  maintenance: MaintenanceLogsClient
}

export async function provisionOpenLog(options: ProvisionLogOptions): Promise<ProvisionedLog> {
  return test.step('Precondition: an open maintenance log', () => provision(options))
}

async function provision({
  items,
  reservations,
  maintenance,
}: ProvisionLogOptions): Promise<ProvisionedLog> {
  const { reservation, itemId } = await provisionReservation({
    items,
    reservations,
    state: 'CHECKED_OUT',
  })

  // Fetched by reservation id rather than "the most recent log": with several
  // workers checking gear out at once, "most recent" belongs to whoever was
  // last, which is a race dressed up as a lookup.
  const response = await maintenance.listLogs({ reservationId: reservation.id })
  expect(response.status(), 'provisioning: could not list maintenance logs').toBe(200)

  const { logs } = (await response.json()).data as { logs: MaintenanceLog[] }
  expect(
    logs,
    `provisioning: check_out did not open a log for reservation ${reservation.id}`,
  ).toHaveLength(1)

  return { log: logs[0]!, reservation, itemId }
}
