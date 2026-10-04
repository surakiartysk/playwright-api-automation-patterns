#!/usr/bin/env node
/**
 * The failure summary the callback carries, held against fixtures.
 *
 * `.github/scripts/failures.mjs` reads Playwright's JSON and nothing runs it
 * except a workflow on GitHub, so a mistake in it would be found by a dashboard
 * showing the wrong failures. This feeds it reports shaped like the real thing
 * and checks what comes out. `pnpm verify` runs it.
 */

import assert from 'node:assert/strict'
import {
  MAX_FAILURES,
  MAX_MESSAGE,
  collectFailures,
  didFail,
  firstLine,
  tagsIn,
} from '../.github/scripts/failures.mjs'

const test = (status, message) => ({
  status,
  results: [
    {
      status: status === 'expected' ? 'passed' : 'failed',
      ...(message ? { error: { message } } : {}),
    },
  ],
})
const spec = (title, tests, extra = {}) => ({
  title,
  file: 'items.spec.ts',
  line: 12,
  tests,
  ...extra,
})
const report = (...specs) => ({ suites: [{ specs }] })

let checks = 0
const check = (name, fn) => {
  try {
    fn()
    checks++
  } catch (e) {
    console.error(`\n✖ check:failures — ${name}\n\n${e.message}\n`)
    process.exit(1)
  }
}

check('a passing test is not a failure', () => {
  const r = collectFailures([{ style: 'a', report: report(spec('ok @smoke', [test('expected')])) }])
  assert.deepEqual(r.failures, [])
})

check('a failing test says which, where, in what style, under which tags, and why', () => {
  const r = collectFailures([
    {
      style: 'class-style',
      report: report(
        spec('items.list @smoke @items', [test('unexpected', 'expected 200, got 500')]),
      ),
    },
  ])
  assert.deepEqual(r.failures, [
    {
      title: 'items.list @smoke @items',
      file: 'items.spec.ts',
      line: 12,
      style: 'class-style',
      tags: ['smoke', 'items'],
      message: 'expected 200, got 500',
    },
  ])
})

check('a test that failed and then passed is flaky, not failed; a skipped one is neither', () => {
  assert.equal(didFail({ status: 'flaky' }), false)
  assert.equal(didFail({ status: 'skipped' }), false)
  assert.equal(didFail({ status: 'unexpected' }), true)
})

check(
  'without a status, a test that ran and never passed failed, and one that passed on retry did not',
  () => {
    assert.equal(didFail({ results: [{ status: 'failed' }, { status: 'failed' }] }), true)
    assert.equal(didFail({ results: [{ status: 'failed' }, { status: 'passed' }] }), false)
    assert.equal(didFail({ results: [{ status: 'skipped' }] }), false)
    assert.equal(didFail({ results: [] }), false)
  },
)

check('nested suites are walked, and every package contributes', () => {
  const nested = {
    suites: [{ specs: [], suites: [{ specs: [spec('deep', [test('unexpected', 'boom')])] }] }],
  }
  const r = collectFailures([
    { style: 'a', report: nested },
    { style: 'b', report: report(spec('shallow', [test('unexpected', 'bang')])) },
  ])
  assert.deepEqual(
    r.failures.map((f) => [f.style, f.title]),
    [
      ['a', 'deep'],
      ['b', 'shallow'],
    ],
  )
})

check('the first line only, without terminal colour, on one line', () => {
  assert.equal(
    firstLine('\u001b[31mError:\u001b[39m   expected 200\n  at foo.ts:1'),
    'Error: expected 200',
  )
  assert.equal(firstLine('\n\n  second line first\nthird'), 'second line first')
  assert.equal(firstLine(undefined), '')
})

check('the tags Playwright lists are used, and the title is read only when there are none', () => {
  const listed = spec('title with @other', [test('unexpected', 'x')], { tags: ['items', 'smoke'] })
  const r = collectFailures([{ style: 'a', report: report(listed) }])
  assert.deepEqual(r.failures[0].tags, ['items', 'smoke'])
  const bare = spec('title with @other', [test('unexpected', 'x')])
  assert.deepEqual(collectFailures([{ style: 'a', report: report(bare) }]).failures[0].tags, [
    'other',
  ])
})

check('a long message is cut, and says so', () => {
  const long = firstLine('x'.repeat(1000))
  assert.equal(long.length, MAX_MESSAGE)
  assert.ok(long.endsWith('…'))
  assert.equal(firstLine('x'.repeat(MAX_MESSAGE)).length, MAX_MESSAGE)
})

check('a broken suite sends twenty and a count of the rest, not every copy', () => {
  const many = Array.from({ length: MAX_FAILURES + 7 }, (_, i) =>
    spec(`t${i}`, [test('unexpected', 'same')]),
  )
  const r = collectFailures([{ style: 'a', report: report(...many) }])
  assert.equal(r.failures.length, MAX_FAILURES)
  assert.equal(r.omitted, 7)
  assert.equal(
    collectFailures([{ style: 'a', report: report(...many.slice(0, MAX_FAILURES)) }]).omitted,
    0,
  )
})

check('tags are read from the title the way the specs write them', () => {
  assert.deepEqual(tagsIn('a thing @smoke @cross-service not@this'), ['smoke', 'cross-service'])
  assert.deepEqual(tagsIn('no tags here'), [])
})

check('the message comes from the last attempt, and from errors[] when error is absent', () => {
  const t = {
    status: 'unexpected',
    results: [
      { status: 'failed', error: { message: 'first attempt' } },
      { status: 'failed', errors: [{ message: 'last attempt' }] },
    ],
  }
  const r = collectFailures([{ style: 'a', report: report(spec('x', [t])) }])
  assert.equal(r.failures[0].message, 'last attempt')
})

console.log(`✓ check:failures — ${checks} checks on the failure summary the callback carries`)
