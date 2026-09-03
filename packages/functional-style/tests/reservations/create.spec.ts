import { buildItemPayload } from '@services/items/factory'
import { CommonError } from '@core/codes'
import { ReservationError } from '@services/reservations/ReservationsValidator'
import { futureDateRange, invertedDateRange } from '@services/reservations/factory'
import { provisionReservation } from './provisioner'
import { expect, test } from './fixtures'

test.describe('POST /reservations', { tag: ['@reservations', '@isolated'] }, () => {
  test(
    'should open a reservation in DRAFT with an empty history',
    { tag: '@smoke' },
    async ({ itemsAsStaff, reservationsAsMember, reservationsValidator }) => {
      const itemResponse = await itemsAsStaff.createItem(buildItemPayload())
      const item = (await itemResponse.json()).data as { id: string }
      const { startDate, endDate } = futureDateRange()

      const response = await reservationsAsMember.createReservation({
        itemId: item.id,
        startDate,
        endDate,
      })

      const reservation = await reservationsValidator.expectReservation(response, 201)
      expect(reservation).toMatchObject({ itemId: item.id, state: 'DRAFT', startDate, endDate })
      // History records transitions, and nothing has happened yet.
      expect(reservation.history).toEqual([])
    },
  )

  test('should attribute the reservation to the caller', async ({
    itemsAsStaff,
    reservationsAsMember,
    reservationsValidator,
  }) => {
    const itemResponse = await itemsAsStaff.createItem(buildItemPayload())
    const item = (await itemResponse.json()).data as { id: string }

    const reservation = await reservationsValidator.expectReservation(
      await reservationsAsMember.createReservation({ itemId: item.id, ...futureDateRange() }),
      201,
    )

    // The member id comes from the token, never from the payload — a caller
    // must not be able to book on someone else's behalf by editing a field.
    expect(reservation.memberId).toBe('usr_member')
  })

  test('should reject a reservation on an item that is not AVAILABLE', async ({
    itemsAsStaff,
    reservationsAsStaff,
    reservationsValidator,
  }) => {
    // Provisioning to CONFIRMED moves the item to RESERVED.
    const { itemId } = await provisionReservation({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      state: 'CONFIRMED',
    })

    const response = await reservationsAsStaff.createReservation({
      itemId,
      ...futureDateRange(),
    })

    await reservationsValidator.expectError(response, 409, ReservationError.ITEM_UNAVAILABLE)
  })

  test('should return 404 for an unknown item', async ({
    reservationsAsMember,
    reservationsValidator,
  }) => {
    const response = await reservationsAsMember.createReservation({
      itemId: 'itm_does_not_exist',
      ...futureDateRange(),
    })

    await reservationsValidator.expectError(response, 404, CommonError.NOT_FOUND)
  })

  test.describe('validation', () => {
    test('should name every missing required field', async ({
      reservationsAsMember,
      reservationsValidator,
    }) => {
      const response = await reservationsAsMember.createReservation({} as never)

      const fields = await reservationsValidator.expectValidationError(response)
      expect(fields.map((f) => f.field).sort()).toEqual(['endDate', 'itemId', 'startDate'])
    })

    test('should reject an endDate before the startDate', async ({
      itemsAsStaff,
      reservationsAsMember,
      reservationsValidator,
    }) => {
      const itemResponse = await itemsAsStaff.createItem(buildItemPayload())
      const item = (await itemResponse.json()).data as { id: string }

      const response = await reservationsAsMember.createReservation({
        itemId: item.id,
        ...invertedDateRange(),
      })

      await reservationsValidator.expectValidationError(response, 'endDate')
    })

    test('should reject a malformed date', async ({
      itemsAsStaff,
      reservationsAsMember,
      reservationsValidator,
    }) => {
      const itemResponse = await itemsAsStaff.createItem(buildItemPayload())
      const item = (await itemResponse.json()).data as { id: string }

      const response = await reservationsAsMember.createReservation({
        itemId: item.id,
        startDate: '01/09/2026',
        endDate: '2026-09-04',
      })

      await reservationsValidator.expectValidationError(response, 'startDate')
    })
  })
})
