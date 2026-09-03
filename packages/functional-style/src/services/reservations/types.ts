import type { ReservationState, TransitionAction } from '@gear-rental/shared-contract'

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

export interface CreateReservationRequest {
  itemId: string
  startDate: string
  endDate: string
}

export interface TransitionRequest {
  action: TransitionAction
  note?: string
}

/** Detail carried by a 409 from the transition endpoint. */
export interface IllegalTransitionData {
  currentState: ReservationState
  attempted: TransitionAction
  allowed: TransitionAction[]
}
