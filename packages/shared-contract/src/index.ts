/**
 * Public surface of the shared contract package.
 *
 * Test packages import the domain vocabulary and seed accounts from here so
 * that enum values and credentials have exactly one definition in the repo.
 */
export * from './domain'
export { SEED_USERS, userByRole } from './mock/store'
export type { SeedUser } from './mock/store'
export { createApp } from './mock/server'
