import { randomBytes } from 'node:crypto'

/**
 * Randomness helpers.
 *
 * These stay plain functions even in the class-first package: they hold no
 * state and there is nothing for an object to carry. Making them methods on a
 * `TestDataUtils` class would be ceremony — "class-first" is a claim about
 * where responsibilities live, not a rule that everything must be a class.
 */

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'

export const TEST_PREFIX = 'autotest-'

export function randomAlphanumeric(length = 8): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHANUM[bytes[i]! % ALPHANUM.length]
  return out
}

export function testSlug(descriptor?: string): string {
  const suffix = randomAlphanumeric(8)
  return descriptor ? `${TEST_PREFIX}${descriptor}-${suffix}` : `${TEST_PREFIX}${suffix}`
}

export function randomSku(): string {
  const bytes = randomBytes(7)
  const letters = Array.from({ length: 3 }, (_, i) => UPPER[bytes[i]! % UPPER.length]).join('')
  const digits = Array.from({ length: 4 }, (_, i) => DIGITS[bytes[i + 3]! % DIGITS.length]).join('')
  return `${letters}-${digits}`
}

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

export function futureDateRange(startInDays = 1, lengthInDays = 3) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + startInDays)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + lengthInDays)
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) }
}

export function invertedDateRange() {
  const { startDate, endDate } = futureDateRange()
  return { startDate: endDate, endDate: startDate }
}
