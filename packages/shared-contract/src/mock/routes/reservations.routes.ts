import { Hono } from 'hono'
import { TRANSITION_ACTIONS, TRANSITION_ROLES, allowedActions, nextState } from '../../domain'
import type { Reservation, TransitionAction } from '../../domain'
import { fail, forbidden, notFound, ok, validationFailed } from '../envelope'
import { actorOf, requireAuth } from '../auth'
import { newMaintenanceId, newReservationId, now, store } from '../store'
import { asObject, validate } from '../validate'

/** Service-namespaced codes. Tests assert on these, never on `message`. */
export const ReservationCode = {
  ITEM_UNAVAILABLE: 'RSV_ITEM_UNAVAILABLE',
  ILLEGAL_TRANSITION: 'RSV_ILLEGAL_TRANSITION',
  NOT_OWNER: 'RSV_NOT_OWNER',
} as const

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const reservationRoutes = new Hono()

reservationRoutes.use('/reservations', requireAuth)
reservationRoutes.use('/reservations/*', requireAuth)

// ── create ───────────────────────────────────────────────────────────────────
reservationRoutes.post('/reservations', async (c) => {
  const actor = actorOf(c)
  const body = asObject(await c.req.json().catch(() => undefined))
  if (!body) {
    return c.json(
      ...validationFailed([{ field: '_body', rule: 'type', message: 'body must be an object' }]),
    )
  }

  const errors = validate(body, [
    { field: 'itemId', required: true, type: 'string' },
    { field: 'startDate', required: true, type: 'string', pattern: DATE_PATTERN },
    {
      field: 'endDate',
      required: true,
      type: 'string',
      pattern: DATE_PATTERN,
      check: (value, all) =>
        typeof all.startDate === 'string' && (value as string) < all.startDate
          ? 'endDate must be on or after startDate'
          : undefined,
    },
  ])
  if (errors.length > 0) return c.json(...validationFailed(errors))

  const item = store.items.get(body.itemId as string)
  if (!item) return c.json(...notFound('item'))

  // The item must be free. Without this the state machine could be driven from
  // two reservations at once and the item status would be meaningless.
  if (item.status !== 'AVAILABLE') {
    return c.json(
      fail(ReservationCode.ITEM_UNAVAILABLE, `item is ${item.status}, not AVAILABLE`),
      409,
    )
  }

  const timestamp = now()
  const reservation: Reservation = {
    id: newReservationId(),
    itemId: item.id,
    memberId: actor.id,
    state: 'DRAFT',
    startDate: body.startDate as string,
    endDate: body.endDate as string,
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  store.reservations.set(reservation.id, reservation)

  return c.json(ok(reservation, 'reservation created'), 201)
})

// ── read ─────────────────────────────────────────────────────────────────────
reservationRoutes.get('/reservations/:reservationId', (c) => {
  const reservation = store.reservations.get(c.req.param('reservationId'))
  if (!reservation) return c.json(...notFound('reservation'))
  return c.json(ok(reservation))
})

// ── transition ───────────────────────────────────────────────────────────────
/**
 * The single mutation point for reservation state.
 *
 * There is deliberately no "set status" escape hatch: every state change goes
 * through the transition table, so an illegal edge cannot be reached by any
 * route. That is what makes the guard tests meaningful rather than decorative.
 */
reservationRoutes.post('/reservations/:reservationId/transitions', async (c) => {
  const actor = actorOf(c)
  const reservation = store.reservations.get(c.req.param('reservationId'))
  if (!reservation) return c.json(...notFound('reservation'))

  const body = asObject(await c.req.json().catch(() => undefined))
  if (!body) {
    return c.json(
      ...validationFailed([{ field: '_body', rule: 'type', message: 'body must be an object' }]),
    )
  }

  const errors = validate(body, [
    { field: 'action', required: true, type: 'string', enum: TRANSITION_ACTIONS },
    { field: 'note', type: 'string', maxLength: 280 },
  ])
  if (errors.length > 0) return c.json(...validationFailed(errors))

  const action = body.action as TransitionAction

  // Role gate first: "you may not do this at all" outranks "you may not do this
  // yet", so a member attempting `confirm` gets 403 regardless of the state.
  if (!TRANSITION_ROLES[action].includes(actor.role)) {
    return c.json(...forbidden(actor.role))
  }

  // A member may only cancel their own reservation.
  if (actor.role === 'member' && reservation.memberId !== actor.id) {
    return c.json(
      fail(ReservationCode.NOT_OWNER, 'a member may only cancel their own reservation'),
      403,
    )
  }

  const target = nextState(reservation.state, action)
  if (!target) {
    return c.json(
      fail(
        ReservationCode.ILLEGAL_TRANSITION,
        `cannot '${action}' a reservation in state '${reservation.state}'`,
        {
          currentState: reservation.state,
          attempted: action,
          allowed: allowedActions(reservation.state),
        },
      ),
      409,
    )
  }

  const timestamp = now()
  const updated: Reservation = {
    ...reservation,
    state: target,
    history: [
      ...reservation.history,
      { from: reservation.state, to: target, action, at: timestamp },
    ],
    updatedAt: timestamp,
  }
  store.reservations.set(updated.id, updated)

  applySideEffects(updated, action, timestamp)

  return c.json(ok(updated, `reservation ${action}`))
})

/**
 * Consequences a transition has outside its own resource.
 *
 * Kept in one function rather than inline so the cross-service seam is visible:
 * a maintenance log exists only because a reservation reached CHECKED_OUT, and
 * that is precisely why its provisioner has to compose the reservation one.
 */
function applySideEffects(
  reservation: Reservation,
  action: TransitionAction,
  timestamp: string,
): void {
  const item = store.items.get(reservation.itemId)
  if (!item) return

  const setStatus = (status: typeof item.status) =>
    store.items.set(item.id, { ...item, status, updatedAt: timestamp })

  switch (action) {
    case 'confirm':
      setStatus('RESERVED')
      break

    case 'check_out': {
      setStatus('CHECKED_OUT')
      // The log is opened here, never by a client — there is no POST for it.
      const logId = newMaintenanceId()
      store.maintenanceLogs.set(logId, {
        id: logId,
        reservationId: reservation.id,
        itemId: item.id,
        state: 'OPEN',
        openedAt: timestamp,
        resolvedAt: null,
        resolutionNote: null,
      })
      break
    }

    case 'return':
      // Back from the customer but not yet re-rentable: it goes to maintenance
      // until its log is resolved.
      setStatus('MAINTENANCE')
      break

    case 'close':
    case 'cancel':
      setStatus('AVAILABLE')
      break
  }
}
