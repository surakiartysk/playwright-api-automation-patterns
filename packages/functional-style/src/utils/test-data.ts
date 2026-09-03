import { randomAlphanumeric } from './random'

/**
 * Prefix on every resource this suite creates.
 *
 * Centralised so that renaming it is a one-line change rather than a
 * find-and-replace across every spec — and so cleanup can identify test data
 * by a single rule.
 */
export const TEST_PREFIX = 'autotest-'

/**
 * A unique, identifiable name for a test resource.
 *
 * @example
 *   testSlug()          // "autotest-Xk92mQ1p"
 *   testSlug('paging')  // "autotest-paging-Xk92mQ1p"
 */
export function testSlug(descriptor?: string): string {
  const suffix = randomAlphanumeric(8)
  return descriptor ? `${TEST_PREFIX}${descriptor}-${suffix}` : `${TEST_PREFIX}${suffix}`
}

/** A display name that fits the contract's 3–80 character bound. */
export function testItemName(descriptor?: string): string {
  return testSlug(descriptor).slice(0, 80)
}
