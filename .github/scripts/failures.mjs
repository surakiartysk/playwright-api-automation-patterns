#!/usr/bin/env node
/**
 * Which tests failed, and why, in a shape small enough to send to the dashboard.
 *
 * The result callback carried totals — 42 run, 40 passed, 2 failed — and
 * nothing about which two. Answering that meant opening the whole Allure report
 * for a run the dashboard already knew had failed. This reads the same
 * `results.json` Playwright writes for the totals and keeps, for each test that
 * did not pass, what a person scanning a list needs: which test, where, which
 * tags, and the first line of what went wrong.
 *
 * Bounded on purpose. A suite that is broken at the root fails every test with
 * the same message, and a callback carrying a hundred copies of it is a worse
 * answer than twenty and a count of the rest. Messages are cut and stripped of
 * terminal colour: Playwright writes them for a terminal, and what lands in a
 * page is read, not rendered.
 *
 * Usage: node .github/scripts/failures.mjs [packages-dir] [out-file]
 *   writes `failures.json` (default) with { failures, omitted }.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_FAILURES = 20
export const MAX_MESSAGE = 240

// ESC [ … m — the colour codes Playwright puts in an error for a terminal.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g

/** The first thing a failure says, on one line, without colour, cut to size. */
export function firstLine(message) {
  const lines = String(message ?? '')
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const line = (lines[0] ?? '').replace(/\s+/g, ' ')
  return line.length > MAX_MESSAGE ? `${line.slice(0, MAX_MESSAGE - 1)}…` : line
}

/**
 * Playwright's own list of a spec's tags is used when the report has one (it
 * does from 1.42, without the `@`); the title is read only for a report that
 * predates it.
 *
 * `@smoke` and `@items` in a title, as `['smoke', 'items']`. A tag follows a space: `not@this` is not one. */
export const tagsIn = (title) =>
  [...String(title).matchAll(/(?:^|\s)@([a-z][a-z0-9-]*)/g)].map((m) => m[1])

/**
 * A test failed when Playwright says it failed, or — for a report that does not
 * say — when it ran and never passed. A test that failed and passed on retry is
 * `flaky` and is not a failure here; a skipped test is not one either.
 */
export function didFail(test) {
  if (test.status !== undefined) return test.status === 'unexpected'
  const results = test.results ?? []
  return results.length > 0 && !results.some((r) => r.status === 'passed' || r.status === 'skipped')
}

/**
 * @param reports - `[{ style, report }]`, one per package, `report` being the
 *   parsed `results.json`
 * @returns the failures (at most MAX_FAILURES) and how many were left out
 */
export function collectFailures(reports) {
  const all = []
  for (const { style, report } of reports) {
    const walk = (suites) => {
      for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) {
          for (const test of spec.tests ?? []) {
            if (!didFail(test)) continue
            const last = (test.results ?? []).at(-1)
            all.push({
              title: spec.title,
              file: spec.file,
              ...(spec.line ? { line: spec.line } : {}),
              style,
              tags: Array.isArray(spec.tags) ? spec.tags : tagsIn(spec.title),
              message: firstLine(last?.error?.message ?? last?.errors?.[0]?.message),
            })
          }
        }
        walk(suite.suites)
      }
    }
    walk(report.suites)
  }
  return { failures: all.slice(0, MAX_FAILURES), omitted: Math.max(0, all.length - MAX_FAILURES) }
}

/** Read every package's `results.json` under `dir`. */
export function readReports(dir) {
  const reports = []
  for (const style of readdirSync(dir)) {
    const file = join(dir, style, 'results.json')
    if (existsSync(file)) reports.push({ style, report: JSON.parse(readFileSync(file, 'utf8')) })
  }
  return reports
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = 'packages', out = 'failures.json'] = process.argv.slice(2)
  const summary = collectFailures(readReports(dir))
  writeFileSync(out, JSON.stringify(summary))
  console.log(`failures: ${summary.failures.length} kept, ${summary.omitted} left out`)
}
