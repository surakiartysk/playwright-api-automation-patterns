import { z } from 'zod'
import { RESERVATION_STATES, TRANSITION_ACTIONS } from '@gear-rental/shared-contract'
import { isoDate, isoDateTime } from '@core/schemas'

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

/**
 * The 409 body from an illegal transition.
 *
 * Worth a schema of its own because tests assert on `allowed` — the API telling
 * a caller what it *could* have done is part of the contract, not a courtesy.
 */
export const illegalTransitionSchema = z
  .object({
    currentState: z.enum(RESERVATION_STATES),
    attempted: z.enum(TRANSITION_ACTIONS),
    allowed: z.array(z.enum(TRANSITION_ACTIONS)),
  })
  .strict()
