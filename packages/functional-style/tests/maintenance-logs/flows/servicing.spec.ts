import { CommonError } from '@core/codes'
import { MaintenanceError } from '@services/maintenance-logs/MaintenanceLogsValidator'
import { provisionReservation } from '../../reservations/provisioner'
import { provisionOpenLog } from '../provisioner'
import { expect, test } from '../fixtures'

/**
 * Maintenance logs exist as a consequence of another service.
 *
 * Every test here has to walk a reservation to CHECKED_OUT before it has
 * anything to assert on. That is the cross-service dependency made real rather
 * than mocked out — and the reason these are `@flow` rather than `@isolated`.
 */
test.describe('maintenance log servicing', { tag: ['@maintenance-logs', '@flow'] }, () => {
  test(
    'should open a log when gear is checked out',
    { tag: ['@smoke', '@cross-service'] },
    async ({ itemsAsStaff, reservationsAsStaff, maintenanceAsStaff }) => {
      const { log, reservation, itemId } = await provisionOpenLog({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
        maintenance: maintenanceAsStaff,
      })

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
    async ({ itemsAsStaff, reservationsAsStaff, maintenanceAsStaff, maintenanceValidator }) => {
      // Stopping one step short of CHECKED_OUT is the whole test: it proves the
      // log is tied to that specific transition and not merely to a reservation
      // existing.
      const { reservation } = await provisionReservation({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
        state: 'CONFIRMED',
      })

      const page = await maintenanceValidator.expectLogPage(
        await maintenanceAsStaff.listLogs({ reservationId: reservation.id }),
      )

      expect(page.logs).toHaveLength(0)
    },
  )

  test(
    'should resolve a log and return the item to service',
    {
      tag: '@cross-service',
    },
    async ({ itemsAsStaff, reservationsAsStaff, maintenanceAsStaff, maintenanceValidator }) => {
      const { log, reservation, itemId } = await provisionOpenLog({
        items: itemsAsStaff,
        reservations: reservationsAsStaff,
        maintenance: maintenanceAsStaff,
      })

      await test.step('Gear comes back — item sits in MAINTENANCE', async () => {
        const response = await reservationsAsStaff.transition(reservation.id, 'return')
        expect(response.status()).toBe(200)

        const item = (await (await itemsAsStaff.getItemById(itemId)).json()).data as {
          status: string
        }
        expect(item.status).toBe('MAINTENANCE')
      })

      await test.step('Servicing is recorded', async () => {
        const resolved = await maintenanceValidator.expectLog(
          await maintenanceAsStaff.resolveLog(log.id, { resolutionNote: 'cleaned and inspected' }),
        )

        expect(resolved).toMatchObject({
          id: log.id,
          state: 'RESOLVED',
          resolutionNote: 'cleaned and inspected',
        })
        expect(resolved.resolvedAt).not.toBeNull()
      })

      await test.step('Item is rentable again', async () => {
        const item = (await (await itemsAsStaff.getItemById(itemId)).json()).data as {
          status: string
        }
        expect(item.status).toBe('AVAILABLE')
      })
    },
  )

  test('should reject resolving the same log twice', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
    maintenanceValidator,
  }) => {
    const { log } = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })

    await maintenanceValidator.expectLog(
      await maintenanceAsStaff.resolveLog(log.id, { resolutionNote: 'first pass' }),
    )

    const second = await maintenanceAsStaff.resolveLog(log.id, { resolutionNote: 'second pass' })

    await maintenanceValidator.expectError(second, 409, MaintenanceError.ALREADY_RESOLVED)
  })

  test('should forbid a member from resolving a log', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
    maintenanceAsMember,
    maintenanceValidator,
  }) => {
    const { log } = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })

    const response = await maintenanceAsMember.resolveLog(log.id, { resolutionNote: 'not mine' })

    await maintenanceValidator.expectError(response, 403, CommonError.FORBIDDEN)
  })

  test('should return 404 when resolving an unknown log', async ({
    maintenanceAsStaff,
    maintenanceValidator,
  }) => {
    const response = await maintenanceAsStaff.resolveLog('mnt_does_not_exist', {
      resolutionNote: 'nothing to resolve',
    })

    await maintenanceValidator.expectError(response, 404, CommonError.NOT_FOUND)
  })

  test('should require a resolution note', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
    maintenanceValidator,
  }) => {
    const { log } = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })

    const response = await maintenanceAsStaff.resolveLog(log.id, {} as never)

    await maintenanceValidator.expectValidationError(response, 'resolutionNote')
  })

  test('should filter logs by item', async ({
    itemsAsStaff,
    reservationsAsStaff,
    maintenanceAsStaff,
    maintenanceValidator,
  }) => {
    // Two logs on two different items: one that must come back, one that must
    // not. Asserting only "everything returned matches" would pass against a
    // broken filter whenever the store happens to hold nothing else.
    const wanted = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })
    const unwanted = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })

    const page = await maintenanceValidator.expectLogPage(
      await maintenanceAsStaff.listLogs({ itemId: wanted.itemId }),
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
    maintenanceValidator,
  }) => {
    const resolved = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })
    await maintenanceValidator.expectLog(
      await maintenanceAsStaff.resolveLog(resolved.log.id, { resolutionNote: 'cleaned and dried' }),
    )

    const stillOpen = await provisionOpenLog({
      items: itemsAsStaff,
      reservations: reservationsAsStaff,
      maintenance: maintenanceAsStaff,
    })

    const page = await maintenanceValidator.expectLogPage(
      await maintenanceAsStaff.listLogs({ state: 'RESOLVED', pageSize: 100 }),
    )

    const ids = page.logs.map((l) => l.id)
    expect(ids).toContain(resolved.log.id)
    expect(ids).not.toContain(stillOpen.log.id)
    expect(page.logs.every((l) => l.state === 'RESOLVED')).toBe(true)
  })
})
