import { z } from 'zod'
import { test, type APIResponse } from '@playwright/test'
import { RESERVATION_STATES, TRANSITION_ACTIONS } from '@gear-rental/shared-contract'
import type { ReservationState, TransitionAction } from '@gear-rental/shared-contract'
import { ServiceContext } from '@core/ServiceContext'
import { isoDate, isoDateTime } from '@core/schemas'
import { futureDateRange } from '@support/random'
import type { ItemsContext } from '@services/items/ItemsContext'

export const ReservationError = {
  ITEM_UNAVAILABLE: 'RSV_ITEM_UNAVAILABLE',
  ILLEGAL_TRANSITION: 'RSV_ILLEGAL_TRANSITION',
  NOT_OWNER: 'RSV_NOT_OWNER',
} as const

const historyEntrySchema = z
  .object({
    from: z.enum(RESERVATION_STATES),
    to: z.enum(RESERVATION_STATES),
    action: z.enum(TRANSITION_ACTIONS),
    at: isoDateTime,
  })
  .strict()

export const reservationSchema = z
  .object({
    id: z.string().min(1),
    itemId: z.string().min(1),
    memberId: z.string().min(1),
    state: z.enum(RESERVATION_STATES),
    startDate: isoDate,
    endDate: isoDate,
    history: z.array(historyEntrySchema),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()

export const illegalTransitionSchema = z
  .object({
    currentState: z.enum(RESERVATION_STATES),
    attempted: z.enum(TRANSITION_ACTIONS),
    allowed: z.array(z.enum(TRANSITION_ACTIONS)),
  })
  .strict()

export type Reservation = z.infer<typeof reservationSchema>
export type IllegalTransitionData = z.infer<typeof illegalTransitionSchema>

export interface CreateReservationRequest {
  itemId: string
  startDate: string
  endDate: string
}

/** Transitions to apply, in order, to arrive at each state from DRAFT. */
const PATH_TO: Record<ReservationState, TransitionAction[]> = {
  DRAFT: [],
  CONFIRMED: ['confirm'],
  CHECKED_OUT: ['confirm', 'check_out'],
  RETURNED: ['confirm', 'check_out', 'return'],
  CLOSED: ['confirm', 'check_out', 'return', 'close'],
  CANCELLED: ['cancel'],
}

export class ReservationsContext extends ServiceContext {
  // ── data ───────────────────────────────────────────────────────────────────
  buildPayload(itemId: string, overrides: Partial<CreateReservationRequest> = {}) {
    return { itemId, ...futureDateRange(), ...overrides }
  }

  // ── requests ───────────────────────────────────────────────────────────────
  create(data: CreateReservationRequest): Promise<APIResponse> {
    return this.http.post('reservations', data, 'Create reservation')
  }

  getById(reservationId: string): Promise<APIResponse> {
    return this.http.get(`reservations/${reservationId}`, undefined, 'Get reservation by id')
  }

  /**
   * One method taking an action, not a confirm/checkOut/cancel set — the same
   * decision the other package makes, and for the same reason: five methods
   * would put the state machine in the client's method list as well as in the
   * API's table, and only one of them changes when a sixth action appears.
   *
   * Worth noting that this choice is orthogonal to class-vs-functional. Both
   * packages land here, which is itself a useful data point.
   */
  transition(reservationId: string, action: TransitionAction, note?: string): Promise<APIResponse> {
    return this.http.post(
      `reservations/${reservationId}/transitions`,
      note === undefined ? { action } : { action, note },
      `Transition reservation: ${action}`,
    )
  }

  // ── assertions ─────────────────────────────────────────────────────────────
  async expectReservation(response: APIResponse, expectedStatus = 200): Promise<Reservation> {
    return (await this.assert(response)).succeedsWith(reservationSchema, expectedStatus)
  }

  async expectError(response: APIResponse, status: number, code?: string) {
    return (await this.assert(response)).failsWith(status, code)
  }

  async expectValidationError(response: APIResponse, field?: string) {
    return (await this.assert(response)).failsValidation(field)
  }

  async expectIllegalTransition(response: APIResponse): Promise<IllegalTransitionData> {
    const envelope = (await this.assert(response)).failsWith(
      409,
      ReservationError.ILLEGAL_TRANSITION,
    )

    const parsed = illegalTransitionSchema.safeParse(envelope.data)
    if (!parsed.success) {
      throw new Error(
        `409 body did not carry a usable transition detail: ${JSON.stringify(envelope.data)}`,
      )
    }
    return parsed.data
  }

  // ── provisioning ───────────────────────────────────────────────────────────
  /**
   * Drives a reservation to a target state through real API calls.
   *
   * Takes the items context as an argument rather than holding one: a
   * reservation needs an item to exist, but that does not make items part of
   * this service. Passing the collaborator keeps the dependency visible at the
   * call site and avoids a context that quietly owns half the API.
   */
  async provision(
    items: ItemsContext,
    state: ReservationState = 'DRAFT',
  ): Promise<{ reservation: Reservation; itemId: string }> {
    // Wrapped in a step so the report separates setup from the behaviour under
    // test. Reaching CLOSED costs five calls before anything is asserted, and a
    // flat list of them leaves a reader working out which request was the point.
    return test.step(`Precondition: a ${state} reservation`, async () => {
      const item = await items.provision()

      let reservation = await this.expectReservation(
        await this.create(this.buildPayload(item.id)),
        201,
      )

      for (const action of PATH_TO[state]) {
        reservation = await this.expectReservation(await this.transition(reservation.id, action))
      }

      if (reservation.state !== state) {
        throw new Error(`provisioning ended in '${reservation.state}', expected '${state}'`)
      }
      return { reservation, itemId: item.id }
    })
  }
}
