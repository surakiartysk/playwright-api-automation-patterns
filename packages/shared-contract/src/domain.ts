/**
 * Domain vocabulary for the fictional Gear Rental API.
 *
 * These types mirror `openapi.yaml`. The contract is the arbiter; this file is
 * the TypeScript expression of it, shared by the mock and available to tests
 * that want the enum values without re-declaring them.
 */

export const ROLES = ['member', 'staff', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const ITEM_CATEGORIES = ['tent', 'backpack', 'climbing', 'cooking', 'navigation'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const ITEM_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'CHECKED_OUT',
  'MAINTENANCE',
  'RETIRED',
] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export const RESERVATION_STATES = [
  'DRAFT',
  'CONFIRMED',
  'CHECKED_OUT',
  'RETURNED',
  'CLOSED',
  'CANCELLED',
] as const
export type ReservationState = (typeof RESERVATION_STATES)[number]

export const TRANSITION_ACTIONS = ['confirm', 'check_out', 'return', 'close', 'cancel'] as const
export type TransitionAction = (typeof TRANSITION_ACTIONS)[number]

export const MAINTENANCE_STATES = ['OPEN', 'RESOLVED'] as const
export type MaintenanceState = (typeof MAINTENANCE_STATES)[number]

/**
 * The reservation state machine, as data.
 *
 * Encoding the edges in one table — rather than scattering `if (state === …)`
 * through the handlers — is what makes "which transitions are legal from here?"
 * answerable in the 409 body. Tests assert against that `allowed` list, so the
 * table is effectively part of the public contract.
 */
export const TRANSITIONS: Readonly<
  Record<ReservationState, Partial<Record<TransitionAction, ReservationState>>>
> = {
  DRAFT: { confirm: 'CONFIRMED', cancel: 'CANCELLED' },
  CONFIRMED: { check_out: 'CHECKED_OUT', cancel: 'CANCELLED' },
  CHECKED_OUT: { return: 'RETURNED' },
  RETURNED: { close: 'CLOSED' },
  CLOSED: {},
  CANCELLED: {},
}

/** Actions legal from `state`, in declaration order. */
export function allowedActions(state: ReservationState): TransitionAction[] {
  return Object.keys(TRANSITIONS[state]) as TransitionAction[]
}

/** The state `action` leads to, or `undefined` if that edge does not exist. */
export function nextState(
  state: ReservationState,
  action: TransitionAction,
): ReservationState | undefined {
  return TRANSITIONS[state][action]
}

/**
 * Which roles may drive each transition.
 *
 * `cancel` is the interesting one: staff and admin can always cancel, and a
 * member may cancel their *own* reservation. Ownership is checked separately
 * in the handler — this table only covers the role half of the rule.
 */
export const TRANSITION_ROLES: Readonly<Record<TransitionAction, readonly Role[]>> = {
  confirm: ['staff', 'admin'],
  check_out: ['staff', 'admin'],
  return: ['staff', 'admin'],
  close: ['staff', 'admin'],
  cancel: ['member', 'staff', 'admin'],
}

export interface Actor {
  id: string
  email: string
  role: Role
}

export interface Item {
  id: string
  sku: string
  name: string
  category: ItemCategory
  status: ItemStatus
  dailyRateCents: number
  conditionNote: string
  createdAt: string
  updatedAt: string
}

export interface ReservationHistoryEntry {
  from: ReservationState
  to: ReservationState
  action: TransitionAction
  at: string
}

export interface Reservation {
  id: string
  itemId: string
  memberId: string
  state: ReservationState
  startDate: string
  endDate: string
  history: ReservationHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface MaintenanceLog {
  id: string
  reservationId: string
  itemId: string
  state: MaintenanceState
  openedAt: string
  resolvedAt: string | null
  resolutionNote: string | null
}
