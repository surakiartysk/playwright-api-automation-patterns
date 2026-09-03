import type { APIResponse } from '@playwright/test'
import { BaseValidator } from '@core/BaseValidator'
import { illegalTransitionSchema, reservationSchema } from './schemas'
import type { IllegalTransitionData, Reservation } from './types'

export const ReservationError = {
  ITEM_UNAVAILABLE: 'RSV_ITEM_UNAVAILABLE',
  ILLEGAL_TRANSITION: 'RSV_ILLEGAL_TRANSITION',
  NOT_OWNER: 'RSV_NOT_OWNER',
} as const

export class ReservationsValidator extends BaseValidator {
  async expectReservation(response: APIResponse, expectedStatus = 200): Promise<Reservation> {
    return this.expectSuccess(response, reservationSchema, expectedStatus)
  }

  /**
   * Asserts a rejected transition and returns the detail.
   *
   * The 409 body is parsed rather than merely present-checked: `allowed` is the
   * part a caller would act on, so a test that only checked the status code
   * would let the API stop explaining itself without anything going red.
   */
  async expectIllegalTransition(response: APIResponse): Promise<IllegalTransitionData> {
    const envelope = await this.expectError(response, 409, ReservationError.ILLEGAL_TRANSITION)

    const parsed = illegalTransitionSchema.safeParse(envelope.data)
    if (!parsed.success) {
      throw new Error(
        `409 body did not carry a usable transition detail: ${JSON.stringify(envelope.data)}`,
      )
    }
    return parsed.data
  }
}
