import { CommonError } from '@core/schemas'
import { MaintenanceError } from '@services/maintenance-logs/MaintenanceContext'
import { expect, test } from '@support/fixtures'

/**
 * Every test here drives a reservation to CHECKED_OUT before it has anything to
 * assert on — the API has no endpoint that creates a log. The cross-service
 * dependency is the contract's, which is why both packages end up composing
 * rather than inheriting.
 */
test.describe('maintenance logs', { tag: ['@maintenance-logs', '@flow'] }, () => {
  test(
    'should open a log when gear is checked out',
    { tag: ['@smoke', '@cross-service'] },
    async ({ itemsAsStaff, reservationsAsStaff, maintenanceAsStaff }) => {
      const { log, reservation, itemId } = await maintenanceAsStaff.provisionOpenLog(
        itemsAsStaff,
        reservationsAsStaff,
      )

      expect(log).toMatchObject({
        reservationId: reservation.id,
        itemId,
        state: 'OPEN',
        resolvedAt: null,
        resolutionNote: null,
      })
    },
  )

  test(
    'should not open a log before check-out',
    { tag: '@cross-service' },
    async ({ itemsAsStaff, reservationsAsStaff, maintenanceAsStaff }) => {
      // Stopping one step short is the test: the log is tied to that transition,
      // not merely to a reservation existing.
      const { reservation } = await reservationsAsStaff.provision(itemsAsStaff, 'CONFIRMED')

      const page = await maintenanceAsStaff.expectPage(
        await maintenanceAsStaff.list({ reservationId: reservation.id }),
      )

      expect(page.logs).toHaveLength(0)
    },
  )

  test(
    'should resolve a log and return the item to service',
    {
      tag: '@cross-service',
    },
    async ({ itemsAsStaff, reservationsAsStaff, maintenanceAsStaff }) => {
      const { log, reservation, itemId } = await maintenanceAsStaff.provisionOpenLog(
        itemsAsStaff,
        reservationsAsStaff,
      )

      await test.step('Gear comes back — item sits in MAINTENANCE', async () => {
        await reservationsAsStaff.expectReservation(
          await reservationsAsStaff.transition(reservation.id, 'return'),
        )

        const item = await itemsAsStaff.expectItem(await itemsAsStaff.getById(itemId))
        expect(item.status).toBe('MAINTENANCE')
      })

      await test.step('Servicing is recorded', async () => {
        const resolved = await maintenanceAsStaff.expectLog(
          await maintenanceAsStaff.resolve(log.id, 'cleaned and inspected'),
        )

        expect(resolved).toMatchObject({
          id: log.id,
          state: 'RESOLVED',
          resolutionNote: 'cleaned and inspected',
        })
        expect(resolved.resolvedAt).not.toBeNull()
      })

      await test.step('Item is rentable again', async () => {
        const item = await itemsAsStaff.expectItem(await itemsAsStaff.getById(itemId))
        expect(item.status).toBe('AVAILABLE')
      })
    },
  )

  test('should reject resolving the same log twice', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
  }) => {
    const { log } = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)

    await maintenanceAsStaff.expectLog(await maintenanceAsStaff.resolve(log.id, 'first pass'))

    await maintenanceAsStaff.expectError(
      await maintenanceAsStaff.resolve(log.id, 'second pass'),
      409,
      MaintenanceError.ALREADY_RESOLVED,
    )
  })

  test('should forbid a member from resolving a log', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
    maintenanceAsMember,
  }) => {
    const { log } = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)

    await maintenanceAsMember.expectError(
      await maintenanceAsMember.resolve(log.id, 'not mine'),
      403,
      CommonError.FORBIDDEN,
    )
  })

  test('should return 404 when resolving an unknown log', async ({ maintenanceAsStaff }) => {
    await maintenanceAsStaff.expectError(
      await maintenanceAsStaff.resolve('mnt_does_not_exist', 'nothing to resolve'),
      404,
      CommonError.NOT_FOUND,
    )
  })

  test('should require a resolution note', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
  }) => {
    const { log } = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)

    const response = await maintenanceAsStaff.resolve(log.id, '')

    await maintenanceAsStaff.expectValidationError(response, 'resolutionNote')
  })

  test('should filter logs by item', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
  }) => {
    const wanted = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)
    const unwanted = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)

    const page = await maintenanceAsStaff.expectPage(
      await maintenanceAsStaff.list({ itemId: wanted.itemId }),
    )

    const ids = page.logs.map((l) => l.id)
    expect(ids).toContain(wanted.log.id)
    expect(ids).not.toContain(unwanted.log.id)
  })

  /**
   * The `state` filter, which could be deleted with every other test still
   * green — verified. The two id filters are covered; this one was not.
   *
   * Both states are provisioned so the assertion means something: a filter
   * that ignored `state` entirely would still return the resolved log, and a
   * test that only checked for its presence would pass.
   */
  test('should filter logs by state', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
  }) => {
    const resolved = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)
    await maintenanceAsStaff.expectLog(
      await maintenanceAsStaff.resolve(resolved.log.id, 'cleaned and dried'),
    )

    const stillOpen = await maintenanceAsStaff.provisionOpenLog(itemsAsStaff, reservationsAsStaff)

    const page = await maintenanceAsStaff.expectPage(
      await maintenanceAsStaff.list({ state: 'RESOLVED', pageSize: 100 }),
    )

    const ids = page.logs.map((l) => l.id)
    expect(ids).toContain(resolved.log.id)
    expect(ids).not.toContain(stillOpen.log.id)
    expect(page.logs.every((l) => l.state === 'RESOLVED')).toBe(true)
  })
})
