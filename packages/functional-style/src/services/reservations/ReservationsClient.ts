import type { APIResponse } from '@playwright/test'
import type { TransitionAction } from '@gear-rental/shared-contract'
import { BaseClient } from '@core/BaseClient'
import type { CreateReservationRequest } from './types'

/**
 * The transition endpoint gets one method, not five.
 *
 * A `confirm()` / `checkOut()` / `cancel()` set would read a little nicer at
 * the call site, but it would put the state machine in two places: the API's
 * table and this class's method list. When a sixth action appears, only one of
 * them changes. Passing the action through keeps the client a transport
 * concern and leaves the machine where it belongs.
 */
export class ReservationsClient extends BaseClient {
  createReservation(data: CreateReservationRequest): Promise<APIResponse> {
    return this.post('reservations', data, 'Create reservation')
  }

  getReservationById(reservationId: string): Promise<APIResponse> {
    return this.get(`reservations/${reservationId}`, undefined, 'Get reservation by id')
  }

  transition(reservationId: string, action: TransitionAction, note?: string): Promise<APIResponse> {
    return this.post(
      `reservations/${reservationId}/transitions`,
      note === undefined ? { action } : { action, note },
      `Transition reservation: ${action}`,
    )
  }
}
