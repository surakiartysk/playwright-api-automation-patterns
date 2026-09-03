/**
 * Date helpers for reservation payloads.
 *
 * Dates are computed relative to today rather than hardcoded: a fixed
 * "2026-08-01" is a test that quietly starts failing, or quietly stops meaning
 * anything, once that date is in the past.
 */

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

export function futureDateRange(startInDays = 1, lengthInDays = 3) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + startInDays)

  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + lengthInDays)

  return { startDate: toIsoDate(start), endDate: toIsoDate(end) }
}

/** A range whose end precedes its start — for the validation case. */
export function invertedDateRange() {
  const { startDate, endDate } = futureDateRange()
  return { startDate: endDate, endDate: startDate }
}
