import { randomBytes } from 'node:crypto'

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Random suffix for test data.
 *
 * Uses `crypto` rather than `Math.random()`: with several workers creating
 * resources at the same instant, a weak generator produces collisions often
 * enough to cause the kind of intermittent failure nobody wants to debug.
 */
export function randomAlphanumeric(length = 8): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHANUM[bytes[i]! % ALPHANUM.length]
  }
  return out
}

const DIGITS = '0123456789'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A contract-shaped SKU (`ABC-1234`) that will not collide across workers. */
export function randomSku(): string {
  const bytes = randomBytes(7)
  const letters = Array.from({ length: 3 }, (_, i) => UPPER[bytes[i]! % UPPER.length]).join('')
  const digits = Array.from({ length: 4 }, (_, i) => DIGITS[bytes[i + 3]! % DIGITS.length]).join('')
  return `${letters}-${digits}`
}
