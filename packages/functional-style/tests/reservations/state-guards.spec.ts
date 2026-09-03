import {
  RESERVATION_STATES,
  TRANSITION_ACTIONS,
  allowedActions,
} from '@gear-rental/shared-contract'
import type { ReservationState, TransitionAction } from '@gear-rental/shared-contract'
import { provisionReservation } from './provisioner'
import { expect, test } from './fixtures'

/**
 * The transition guards, exhaustively.
 *
 * **The expected machine is restated here by hand, on purpose.** An earlier
 * version derived the illegal pairs from the shipped `TRANSITIONS` table, which
 * looked rigorous and tested nothing: the test asked the implementation what
 * was legal, so widening the table widened the test's own expectations with it.
 * Adding a `DRAFT -> check_out` edge — letting gear leave without ever being
 * confirmed — kept the suite green; one generated case simply disappeared.
 *
 * A second, independent statement of the rules is what gives the assertion
 * something to disagree with. It is duplication, and it is the point: if this
 * table and the shipped one drift apart, that is exactly the alarm worth having.
 *
 * The legal edges are covered by the lifecycle flow spec; this file is about
 * what the API must refuse.
 */

/** The machine as specified — written from the contract, not read from code. */
const EXPECTED_LEGAL: Record<ReservationState, TransitionAction[]> = {
  DRAFT: ['confirm', 'cancel'],
  CONFIRMED: ['check_out', 'cancel'],
  CHECKED_OUT: ['return'],
  RETURNED: ['close'],
  CLOSED: [],
  CANCELLED: [],
}

/** States a reservation can actually be provisioned into and driven from. */
const REACHABLE = RESERVATION_STATES.filter((s) => s !== 'CANCELLED')

const illegalPairs: Array<{ state: ReservationState; action: TransitionAction }> = []
for (const state of REACHABLE) {
  for (const action of TRANSITION_ACTIONS) {
    if (!EXPECTED_LEGAL[state].includes(action)) illegalPairs.push({ state, action })
  }
}

test.describe('reservation state guards', { tag: ['@reservations', '@isolated'] }, () => {
  test('the shipped transition table matches the specified machine', () => {
    // The one place the two statements are compared directly. Without this, a
    // widened table would only ever cause a generated case to vanish — and a
    // test that disappears is a test that cannot fail.
    for (const state of RESERVATION_STATES) {
      expect(allowedActions(state).slice().sort(), `legal actions from ${state}`).toEqual(
        EXPECTED_LEGAL[state].slice().sort(),
      )
    }

    // Guards the guard: if the derivation above broke and produced no pairs,
    // every generated test below would vanish and the suite would still pass.
    expect(illegalPairs.length).toBe(19)
  })

  for (const { state, action } of illegalPairs) {
    test(`should reject '${action}' from ${state}`, async ({
      itemsAsStaff,
      reservationsAsStaff,
      reservationsValidator,
    }) => {
      const { reservation } = await provisionReservation({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
        state,
      })

      const response = await reservationsAsStaff.transition(reservation.id, action)

      const detail = await reservationsValidator.expectIllegalTransition(response)
      expect(detail.currentState).toBe(state)
      expect(detail.attempted).toBe(action)
      // The API tells the caller what it could have done instead.
      expect(detail.allowed).toEqual(allowedActions(state))
      expect(detail.allowed).not.toContain(action)
    })
  }

  test('should leave the reservation untouched after a rejected transition', async ({
    itemsAsStaff,
    reservationsAsStaff,
    reservationsValidator,
  }) => {
    const { reservation } = await provisionReservation({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      state: 'DRAFT',
    })

    await reservationsValidator.expectIllegalTransition(
      await reservationsAsStaff.transition(reservation.id, 'close'),
    )

    // A rejected call must not be a partial write: no state change, and no
    // phantom history entry recording an attempt that never happened.
    const after = await reservationsValidator.expectReservation(
      await reservationsAsStaff.getReservationById(reservation.id),
    )
    expect(after.state).toBe('DRAFT')
    expect(after.history).toHaveLength(0)
    expect(after.updatedAt).toBe(reservation.updatedAt)
  })

  test('should reject an unknown action with 422, not 409', async ({
    itemsAsStaff,
    reservationsAsStaff,
    reservationsValidator,
  }) => {
    const { reservation } = await provisionReservation({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
    })

    const response = await reservationsAsStaff.transition(
      reservation.id,
      'teleport' as TransitionAction,
    )

    // A nonexistent action is a malformed request, not an illegal move — the
    // distinction matters to a client deciding whether to retry.
    await reservationsValidator.expectValidationError(response, 'action')
  })
})
