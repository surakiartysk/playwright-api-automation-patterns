import { CommonError } from '@core/codes'
import { ItemError } from '@services/items/ItemsValidator'
import { ReservationError } from '@services/reservations/ReservationsValidator'
import { futureDateRange } from '@services/reservations/factory'
import { provisionReservation } from '../provisioner'
import { expect, test } from '../fixtures'
import { buildItemPayload } from '@services/items/factory'

/**
 * The legal path, end to end.
 *
 * `test.step` rather than a `@step` decorator: the label sits at the point of
 * action where the reader already is, instead of above a method they have to
 * scroll up to find — and it needs no decorator library, no class-based test,
 * and no `experimentalDecorators`. It feeds the HTML report and trace viewer
 * for free.
 */
test.describe('reservation lifecycle', { tag: ['@reservations', '@flow'] }, () => {
  test(
    'should walk DRAFT to CLOSED and move the item with it',
    { tag: '@smoke' },
    async ({ itemsAsStaff, reservationsAsMember, reservationsAsStaff, reservationsValidator }) => {
      const itemId = await test.step('Create a rentable item', async () => {
        const response = await itemsAsStaff.createItem(buildItemPayload())
        expect(response.status()).toBe(201)
        const item = (await response.json()).data as { id: string; status: string }
        expect(item.status).toBe('AVAILABLE')
        return item.id
      })

      const reservationId = await test.step('Member opens a reservation', async () => {
        const reservation = await reservationsValidator.expectReservation(
          await reservationsAsMember.createReservation({ itemId, ...futureDateRange() }),
          201,
        )
        expect(reservation.state).toBe('DRAFT')
        return reservation.id
      })

      await test.step('Staff confirms — item becomes RESERVED', async () => {
        const reservation = await reservationsValidator.expectReservation(
          await reservationsAsStaff.transition(reservationId, 'confirm'),
        )
        expect(reservation.state).toBe('CONFIRMED')

        const item = (await (await itemsAsStaff.getItemById(itemId)).json()).data as {
          status: string
        }
        expect(item.status).toBe('RESERVED')
      })

      await test.step('Staff checks the gear out — item becomes CHECKED_OUT', async () => {
        const reservation = await reservationsValidator.expectReservation(
          await reservationsAsStaff.transition(reservationId, 'check_out'),
        )
        expect(reservation.state).toBe('CHECKED_OUT')

        const item = (await (await itemsAsStaff.getItemById(itemId)).json()).data as {
          status: string
        }
        expect(item.status).toBe('CHECKED_OUT')
      })

      await test.step('Gear comes back — item goes to MAINTENANCE', async () => {
        const reservation = await reservationsValidator.expectReservation(
          await reservationsAsStaff.transition(reservationId, 'return'),
        )
        expect(reservation.state).toBe('RETURNED')

        // Returned is not the same as rentable: it is serviced first.
        const item = (await (await itemsAsStaff.getItemById(itemId)).json()).data as {
          status: string
        }
        expect(item.status).toBe('MAINTENANCE')
      })

      await test.step('Staff closes the reservation', async () => {
        const reservation = await reservationsValidator.expectReservation(
          await reservationsAsStaff.transition(reservationId, 'close'),
        )
        expect(reservation.state).toBe('CLOSED')
      })

      await test.step('History records every transition in order', async () => {
        const reservation = await reservationsValidator.expectReservation(
          await reservationsAsStaff.getReservationById(reservationId),
        )

        expect(reservation.history.map((h) => h.action)).toEqual([
          'confirm',
          'check_out',
          'return',
          'close',
        ])
        // Each entry's `from` must be the previous entry's `to`, or the audit
        // trail is not a trail.
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
    async ({ itemsAsAdmin, itemsAsStaff, reservationsAsStaff, reservationsValidator }) => {
      // Retirement is an items concern, but it can only be exercised once
      // another service has moved the item — so the test lives with the flow
      // that produces that state rather than in the items spec, where setting it
      // up would mean reaching for reservations anyway.
      const { itemId } = await provisionReservation({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
        state: 'CHECKED_OUT',
      })

      const response = await itemsAsAdmin.retireItem(itemId)

      // Admin is allowed to retire; the item's state is what refuses. A 403 here
      // would mean the role gate ran when the state guard should have.
      await reservationsValidator.expectError(response, 409, ItemError.IN_USE)
    },
  )

  test(
    'should release the item when a reservation is cancelled',
    {
      tag: '@cross-service',
    },
    async ({ itemsAsStaff, reservationsAsStaff, reservationsValidator }) => {
      const { reservation, itemId } = await provisionReservation({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
        state: 'CONFIRMED',
      })

      const cancelled = await reservationsValidator.expectReservation(
        await reservationsAsStaff.transition(reservation.id, 'cancel', 'customer changed plans'),
      )
      expect(cancelled.state).toBe('CANCELLED')

      // The item must go back into circulation, otherwise a cancellation would
      // quietly take stock out of service.
      const item = (await (await itemsAsStaff.getItemById(itemId)).json()).data as {
        status: string
      }
      expect(item.status).toBe('AVAILABLE')
    },
  )

  test.describe('role gates', () => {
    test('should forbid a member from confirming', async ({
      itemsAsStaff,
      reservationsAsStaff,
      reservationsAsMember,
      reservationsValidator,
    }) => {
      const { reservation } = await provisionReservation({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
      })

      const response = await reservationsAsMember.transition(reservation.id, 'confirm')

      await reservationsValidator.expectError(response, 403, CommonError.FORBIDDEN)
    })

    test('should forbid a member from cancelling someone else’s reservation', async ({
      itemsAsStaff,
      reservationsAsStaff,
      reservationsAsMember,
      reservationsValidator,
    }) => {
      // Provisioned by staff, so the member is not the owner.
      const { reservation } = await provisionReservation({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
      })

      const response = await reservationsAsMember.transition(reservation.id, 'cancel')

      // 403 with a distinct code: the role is allowed to cancel in general, so
      // "wrong owner" is a different failure from "wrong role".
      await reservationsValidator.expectError(response, 403, ReservationError.NOT_OWNER)
    })

    test('should let a member cancel their own reservation', async ({
      itemsAsStaff,
      reservationsAsMember,
      reservationsValidator,
    }) => {
      const itemResponse = await itemsAsStaff.createItem(buildItemPayload())
      const item = (await itemResponse.json()).data as { id: string }

      const own = await reservationsValidator.expectReservation(
        await reservationsAsMember.createReservation({ itemId: item.id, ...futureDateRange() }),
        201,
      )

      const cancelled = await reservationsValidator.expectReservation(
        await reservationsAsMember.transition(own.id, 'cancel'),
      )
      expect(cancelled.state).toBe('CANCELLED')
    })
  })
})
