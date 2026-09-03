import { expect, test } from '@playwright/test'
import type { ReservationState, TransitionAction } from '@gear-rental/shared-contract'
import type { ItemsClient } from '@services/items/ItemsClient'
import type { ReservationsClient } from '@services/reservations/ReservationsClient'
import type { Reservation } from '@services/reservations/types'
import { buildItemPayload } from '@services/items/factory'
import { futureDateRange } from '@services/reservations/factory'

/**
 * Drives a reservation to a target state through the real API.
 *
 * A test that needs a CHECKED_OUT reservation has two options: reach into the
 * backend and fabricate one, or ask the API for it the way a user would. The
 * second is slower and is the only one that keeps the test honest — a
 * fabricated row can sit in a state the API would never have allowed, and the
 * test then passes against a machine that is broken.
 *
 * A function, not a class. It holds nothing between calls; the clients it needs
 * arrive as arguments, which is also what lets the maintenance-log provisioner
 * compose this one without inheriting anything.
 */

/** Transitions to apply, in order, to arrive at each state from DRAFT. */
const PATH_TO: Record<ReservationState, TransitionAction[]> = {
  DRAFT: [],
  CONFIRMED: ['confirm'],
  CHECKED_OUT: ['confirm', 'check_out'],
  RETURNED: ['confirm', 'check_out', 'return'],
  CLOSED: ['confirm', 'check_out', 'return', 'close'],
  CANCELLED: ['cancel'],
}

export interface ProvisionedReservation {
  reservation: Reservation
  itemId: string
  itemSku: string
}

export interface ProvisionOptions {
  /** Staff or admin — the roles allowed to drive the machine. */
  items: ItemsClient
  reservations: ReservationsClient
  state?: ReservationState
}

/**
 * Creates an item, opens a reservation on it, and applies the transitions that
 * lead to `state`. Every step is asserted, so a provisioning failure surfaces
 * as a clear error rather than as a confusing assertion later in the test.
 *
 * Wrapped in a `test.step` so the report separates setup from the behaviour
 * under test. A flow test that reaches CLOSED makes five calls before it
 * asserts anything, and a flat list of them leaves a reader working out which
 * request was the point — the collapsed step answers "did setup even get
 * there?" at a glance.
 */
export async function provisionReservation(
  options: ProvisionOptions,
): Promise<ProvisionedReservation> {
  const { state = 'DRAFT' } = options
  return test.step(`Precondition: a ${state} reservation`, () => provision(options))
}

async function provision({
  items,
  reservations,
  state = 'DRAFT',
}: ProvisionOptions): Promise<ProvisionedReservation> {
  const itemPayload = buildItemPayload()
  const itemResponse = await items.createItem(itemPayload)
  expect(itemResponse.status(), 'provisioning: item creation failed').toBe(201)
  const item = (await itemResponse.json()).data as { id: string }

  const { startDate, endDate } = futureDateRange()
  const created = await reservations.createReservation({ itemId: item.id, startDate, endDate })
  expect(created.status(), 'provisioning: reservation creation failed').toBe(201)
  let reservation = (await created.json()).data as Reservation

  for (const action of PATH_TO[state]) {
    const response = await reservations.transition(reservation.id, action)
    expect(
      response.status(),
      `provisioning: '${action}' failed from '${reservation.state}' — ${await response.text()}`,
    ).toBe(200)
    reservation = (await response.json()).data as Reservation
  }

  expect(reservation.state, 'provisioning: ended in the wrong state').toBe(state)

  return { reservation, itemId: item.id, itemSku: itemPayload.sku }
}
