import {
  RESERVATION_STATES,
  TRANSITION_ACTIONS,
  allowedActions,
} from '@gear-rental/shared-contract'
import type { ReservationState, TransitionAction } from '@gear-rental/shared-contract'
import { CommonError } from '@core/schemas'
import { ItemError } from '@services/items/ItemsContext'
import { ReservationError } from '@services/reservations/ReservationsContext'
import { invertedDateRange } from '@support/random'
import { expect, test } from '@support/fixtures'

/**
 * The machine as specified — written from the contract, not read from code.
 *
 * Restated here for the same reason as in the other package: deriving the
 * illegal pairs from the shipped table would make the test agree with whatever
 * the table says, so widening it would widen the expectations too. The
 * duplication is what turns a wrong table into a failure.
 */
const EXPECTED_LEGAL: Record<ReservationState, TransitionAction[]> = {
  DRAFT: ['confirm', 'cancel'],
  CONFIRMED: ['check_out', 'cancel'],
  CHECKED_OUT: ['return'],
  RETURNED: ['close'],
  CLOSED: [],
  CANCELLED: [],
}

const REACHABLE = RESERVATION_STATES.filter((s) => s !== 'CANCELLED')

const illegalPairs: Array<{ state: ReservationState; action: TransitionAction }> = []
for (const state of REACHABLE) {
  for (const action of TRANSITION_ACTIONS) {
    if (!EXPECTED_LEGAL[state].includes(action)) illegalPairs.push({ state, action })
  }
}

test.describe('reservations', { tag: ['@reservations'] }, () => {
  test.describe('create', { tag: '@isolated' }, () => {
    test(
      'should open a reservation in DRAFT with an empty history',
      { tag: '@smoke' },
      async ({ itemsAsStaff, reservationsAsMember }) => {
        const item = await itemsAsStaff.provision()
        const payload = reservationsAsMember.buildPayload(item.id)

        const reservation = await reservationsAsMember.expectReservation(
          await reservationsAsMember.create(payload),
          201,
        )

        expect(reservation).toMatchObject({ itemId: item.id, state: 'DRAFT' })
        expect(reservation.history).toEqual([])
      },
    )

    test('should attribute the reservation to the caller', async ({
      itemsAsStaff,
      reservationsAsMember,
    }) => {
      const item = await itemsAsStaff.provision()

      const reservation = await reservationsAsMember.expectReservation(
        await reservationsAsMember.create(reservationsAsMember.buildPayload(item.id)),
        201,
      )

      // Taken from the token, never the payload.
      expect(reservation.memberId).toBe('usr_member')
    })

    test('should reject a reservation on an item that is not AVAILABLE', async ({
      itemsAsStaff,
      reservationsAsStaff,
    }) => {
      const { itemId } = await reservationsAsStaff.provision(itemsAsStaff, 'CONFIRMED')

      const response = await reservationsAsStaff.create(reservationsAsStaff.buildPayload(itemId))

      await reservationsAsStaff.expectError(response, 409, ReservationError.ITEM_UNAVAILABLE)
    })

    test('should return 404 for an unknown item', async ({ reservationsAsMember }) => {
      const response = await reservationsAsMember.create(
        reservationsAsMember.buildPayload('itm_does_not_exist'),
      )

      await reservationsAsMember.expectError(response, 404, CommonError.NOT_FOUND)
    })

    test('should name every missing required field', async ({ reservationsAsMember }) => {
      const fields = await reservationsAsMember.expectValidationError(
        await reservationsAsMember.create({} as never),
      )

      expect(fields.map((f) => f.field).sort()).toEqual(['endDate', 'itemId', 'startDate'])
    })

    test('should reject an endDate before the startDate', async ({
      itemsAsStaff,
      reservationsAsMember,
    }) => {
      const item = await itemsAsStaff.provision()

      const response = await reservationsAsMember.create({
        itemId: item.id,
        ...invertedDateRange(),
      })

      await reservationsAsMember.expectValidationError(response, 'endDate')
    })

    test('should reject a malformed date', async ({ itemsAsStaff, reservationsAsMember }) => {
      const item = await itemsAsStaff.provision()

      const response = await reservationsAsMember.create({
        itemId: item.id,
        startDate: '01/09/2026',
        endDate: '2026-09-04',
      })

      await reservationsAsMember.expectValidationError(response, 'startDate')
    })
  })

  test.describe('state guards', { tag: '@isolated' }, () => {
    test('the shipped transition table matches the specified machine', () => {
      for (const state of RESERVATION_STATES) {
        expect(allowedActions(state).slice().sort(), `legal actions from ${state}`).toEqual(
          EXPECTED_LEGAL[state].slice().sort(),
        )
      }
      expect(illegalPairs.length).toBe(19)
    })

    for (const { state, action } of illegalPairs) {
      test(`should reject '${action}' from ${state}`, async ({
        itemsAsStaff,
        reservationsAsStaff,
      }) => {
        const { reservation } = await reservationsAsStaff.provision(itemsAsStaff, state)

        const detail = await reservationsAsStaff.expectIllegalTransition(
          await reservationsAsStaff.transition(reservation.id, action),
        )

        expect(detail.currentState).toBe(state)
        expect(detail.attempted).toBe(action)
        expect(detail.allowed).toEqual(allowedActions(state))
      })
    }

    test('should leave the reservation untouched after a rejected transition', async ({
      itemsAsStaff,
      reservationsAsStaff,
    }) => {
      const { reservation } = await reservationsAsStaff.provision(itemsAsStaff, 'DRAFT')

      await reservationsAsStaff.expectIllegalTransition(
        await reservationsAsStaff.transition(reservation.id, 'close'),
      )

      const after = await reservationsAsStaff.expectReservation(
        await reservationsAsStaff.getById(reservation.id),
      )
      expect(after.state).toBe('DRAFT')
      expect(after.history).toHaveLength(0)
      expect(after.updatedAt).toBe(reservation.updatedAt)
    })

    test('should reject an unknown action with 422, not 409', async ({
      itemsAsStaff,
      reservationsAsStaff,
    }) => {
      const { reservation } = await reservationsAsStaff.provision(itemsAsStaff)

      const response = await reservationsAsStaff.transition(
        reservation.id,
        'teleport' as TransitionAction,
      )

      await reservationsAsStaff.expectValidationError(response, 'action')
    })
  })

  test.describe('lifecycle', { tag: '@flow' }, () => {
    test(
      'should walk DRAFT to CLOSED and move the item with it',
      { tag: '@smoke' },
      async ({ itemsAsStaff, reservationsAsMember, reservationsAsStaff }) => {
        const itemId = await test.step('Create a rentable item', async () => {
          const item = await itemsAsStaff.provision()
          expect(item.status).toBe('AVAILABLE')
          return item.id
        })

        const reservationId = await test.step('Member opens a reservation', async () => {
          const reservation = await reservationsAsMember.expectReservation(
            await reservationsAsMember.create(reservationsAsMember.buildPayload(itemId)),
            201,
          )
          expect(reservation.state).toBe('DRAFT')
          return reservation.id
        })

        await test.step('Staff confirms — item becomes RESERVED', async () => {
          const reservation = await reservationsAsStaff.expectReservation(
            await reservationsAsStaff.transition(reservationId, 'confirm'),
          )
          expect(reservation.state).toBe('CONFIRMED')

          const item = await itemsAsStaff.expectItem(await itemsAsStaff.getById(itemId))
          expect(item.status).toBe('RESERVED')
        })

        await test.step('Staff checks the gear out', async () => {
          const reservation = await reservationsAsStaff.expectReservation(
            await reservationsAsStaff.transition(reservationId, 'check_out'),
          )
          expect(reservation.state).toBe('CHECKED_OUT')

          const item = await itemsAsStaff.expectItem(await itemsAsStaff.getById(itemId))
          expect(item.status).toBe('CHECKED_OUT')
        })

        await test.step('Gear comes back — item goes to MAINTENANCE', async () => {
          const reservation = await reservationsAsStaff.expectReservation(
            await reservationsAsStaff.transition(reservationId, 'return'),
          )
          expect(reservation.state).toBe('RETURNED')

          const item = await itemsAsStaff.expectItem(await itemsAsStaff.getById(itemId))
          expect(item.status).toBe('MAINTENANCE')
        })

        await test.step('Staff closes the reservation', async () => {
          const reservation = await reservationsAsStaff.expectReservation(
            await reservationsAsStaff.transition(reservationId, 'close'),
          )
          expect(reservation.state).toBe('CLOSED')
        })

        await test.step('History records every transition in order', async () => {
          const reservation = await reservationsAsStaff.expectReservation(
            await reservationsAsStaff.getById(reservationId),
          )

          expect(reservation.history.map((h) => `${h.from}->${h.to}`)).toEqual([
            'DRAFT->CONFIRMED',
            'CONFIRMED->CHECKED_OUT',
            'CHECKED_OUT->RETURNED',
            'RETURNED->CLOSED',
          ])
        })
      },
    )

    test(
      'should refuse to retire an item that is out on a reservation',
      {
        tag: '@cross-service',
      },
      async ({ itemsAsStaff, itemsAsAdmin, reservationsAsStaff }) => {
        const { itemId } = await reservationsAsStaff.provision(itemsAsStaff, 'CHECKED_OUT')

        // Admin may retire; the item's state is what refuses.
        await itemsAsAdmin.expectError(await itemsAsAdmin.retire(itemId), 409, ItemError.IN_USE)
      },
    )

    test(
      'should release the item when a reservation is cancelled',
      {
        tag: '@cross-service',
      },
      async ({ itemsAsStaff, reservationsAsStaff }) => {
        const { reservation, itemId } = await reservationsAsStaff.provision(
          itemsAsStaff,
          'CONFIRMED',
        )

        const cancelled = await reservationsAsStaff.expectReservation(
          await reservationsAsStaff.transition(reservation.id, 'cancel', 'customer changed plans'),
        )
        expect(cancelled.state).toBe('CANCELLED')

        const item = await itemsAsStaff.expectItem(await itemsAsStaff.getById(itemId))
        expect(item.status).toBe('AVAILABLE')
      },
    )

    test('should forbid a member from confirming', async ({
      itemsAsStaff,
      reservationsAsStaff,
      reservationsAsMember,
    }) => {
      const { reservation } = await reservationsAsStaff.provision(itemsAsStaff)

      const response = await reservationsAsMember.transition(reservation.id, 'confirm')

      await reservationsAsMember.expectError(response, 403, CommonError.FORBIDDEN)
    })

    test('should forbid a member from cancelling someone else’s reservation', async ({
      itemsAsStaff,
      reservationsAsStaff,
      reservationsAsMember,
    }) => {
      const { reservation } = await reservationsAsStaff.provision(itemsAsStaff)

      const response = await reservationsAsMember.transition(reservation.id, 'cancel')

      await reservationsAsMember.expectError(response, 403, ReservationError.NOT_OWNER)
    })

    test('should let a member cancel their own reservation', async ({
      itemsAsStaff,
      reservationsAsMember,
    }) => {
      const item = await itemsAsStaff.provision()
      const own = await reservationsAsMember.expectReservation(
        await reservationsAsMember.create(reservationsAsMember.buildPayload(item.id)),
        201,
      )

      const cancelled = await reservationsAsMember.expectReservation(
        await reservationsAsMember.transition(own.id, 'cancel'),
      )

      expect(cancelled.state).toBe('CANCELLED')
    })
  })
})
