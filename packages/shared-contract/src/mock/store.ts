import type { Actor, Item, MaintenanceLog, Reservation, Role } from '../domain'

/**
 * In-memory state for one mock process.
 *
 * Deliberately not persisted: the contract's fidelity line says the mock
 * enforces what the tests assert (transitions, validation, roles, side effects)
 * and skips what they don't (durability, crypto, rate limiting).
 *
 * State lives for the whole run and is shared by every worker — it is never
 * cleared between tests or between spec files. That is the point: isolation has
 * to come from each test creating uniquely-named data, exactly as it must
 * against a shared real environment. A suite that only passes on an empty
 * database is not isolated, it is just alone.
 */

let sequence = 0
const nextId = (prefix: string): string => {
  sequence += 1
  return `${prefix}_${sequence.toString().padStart(6, '0')}`
}

export interface SeedUser extends Actor {
  password: string
}

/**
 * Fixed accounts, one per role. Credentials are public on purpose — there is
 * nothing to protect, and a reader can curl the mock without hunting for a
 * secret. Tests read them from here rather than hardcoding strings.
 */
export const SEED_USERS: readonly SeedUser[] = [
  { id: 'usr_member', email: 'member@gear-rental.test', password: 'Passw0rd!', role: 'member' },
  { id: 'usr_staff', email: 'staff@gear-rental.test', password: 'Passw0rd!', role: 'staff' },
  { id: 'usr_admin', email: 'admin@gear-rental.test', password: 'Passw0rd!', role: 'admin' },
]

export const userByRole = (role: Role): SeedUser => {
  const user = SEED_USERS.find((u) => u.role === role)
  if (!user) throw new Error(`no seed user for role '${role}'`)
  return user
}

export interface Store {
  items: Map<string, Item>
  reservations: Map<string, Reservation>
  maintenanceLogs: Map<string, MaintenanceLog>
}

export const store: Store = {
  items: new Map(),
  reservations: new Map(),
  maintenanceLogs: new Map(),
}

export const now = (): string => new Date().toISOString()

export const newItemId = () => nextId('itm')
export const newReservationId = () => nextId('rsv')
export const newMaintenanceId = () => nextId('mnt')
