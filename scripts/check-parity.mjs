#!/usr/bin/env node
/**
 * Both suites must cover the same behaviours.
 *
 * The comparison this repo is built on only means something if neither side is
 * quietly better tested. That was not hypothetical: an early draft of
 * `class-style` was missing two authentication cases, so one suite was strictly
 * better protected for reasons unrelated to its style.
 *
 * Counting is the cheap approximation. It will not notice two differently-named
 * tests covering different things, but it does catch the failure that actually
 * happened — a behaviour added to one package and forgotten in the other.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const PACKAGES = ['functional-style', 'class-style']

/** Test titles reported by Playwright's list reporter, one per line. */
function listTests(pkg) {
  const raw = execFileSync('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json'], {
    cwd: `${ROOT}packages/${pkg}`,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })

  const report = JSON.parse(raw)
  const titles = []

  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) titles.push(spec.title)
      walk(suite.suites)
    }
  }
  walk(report.suites)

  return titles.sort()
}

const counts = {}
for (const pkg of PACKAGES) {
  counts[pkg] = listTests(pkg)
  console.log(`${pkg}: ${counts[pkg].length} tests`)
}

const [a, b] = PACKAGES
if (counts[a].length !== counts[b].length) {
  console.error(
    `\n✖ check:parity — ${a} has ${counts[a].length} tests, ${b} has ${counts[b].length}.\n`,
  )
  console.error('Both suites must cover the same behaviours, or the comparison in')
  console.error('docs/comparison.md is not a fair one. Add the missing case, or —')
  console.error('if the difference is deliberate — say so there and update this check.\n')
  process.exit(1)
}

console.log('\n✓ check:parity — both suites cover the same number of behaviours')

/**
 * The count the docs advertise must be the count the suite has.
 *
 * Not hypothetical either: the README and comparison.md both said 82 for a
 * while after the suites reached 83. A number in prose has no way to notice it
 * has gone stale, and a reader who counts and finds a different answer has
 * every reason to distrust the rest of the document.
 */
const actual = counts[a].length

const CLAIMS = [
  { file: 'README.md', pattern: /(\d+) tests each/ },
  { file: 'docs/comparison.md', pattern: /\| Same test count\s*\|\s*(\d+) each/ },
]

const stale = []
for (const { file, pattern } of CLAIMS) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  const match = pattern.exec(text)
  if (!match) {
    stale.push(`${file}: could not find the test-count claim this check guards`)
  } else if (Number(match[1]) !== actual) {
    stale.push(`${file}: claims ${match[1]} tests, suite has ${actual}`)
  }
}

if (stale.length > 0) {
  console.error('\n✖ check:parity — the docs advertise a stale test count.\n')
  for (const problem of stale) console.error(`  ${problem}`)
  console.error('\nUpdate the number, or the claim stops being true.\n')
  process.exit(1)
}

console.log(`✓ check:parity — the documented count (${actual}) matches the suite`)

/**
 * The tags CONTRIBUTING.md documents must be the tags the suite uses.
 *
 * This is not hypothetical: the tag table listed `@regression` for weeks while
 * no test carried it. Documentation that describes a tag nobody applies sends
 * a reader to run a filter that silently matches nothing — worse than saying
 * nothing, because it looks authoritative.
 */
/**
 * Only the table rows count as claims. The prose beneath it names tags
 * deliberately *not* used — `@regression`, the priority tags — and explains
 * why; treating a mention as a claim would make that explanation unwritable.
 */
const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
const tagTable = contributing.slice(
  contributing.indexOf('| Tag '),
  contributing.indexOf('**There is deliberately no'),
)

const documented = new Set(
  [...tagTable.matchAll(/`(@[a-z-]+)`/g)]
    .map((m) => m[1])
    // `@<service>` is a placeholder; the concrete names appear beside it.
    .filter((t) => t !== '@<service>'),
)

const used = new Set()
for (const pkg of PACKAGES) {
  const raw = execFileSync('grep', ['-rohE', "'@[a-z-]+'", 'tests'], {
    cwd: `${ROOT}packages/${pkg}`,
    encoding: 'utf8',
  })
  for (const match of raw.split('\n')) {
    const tag = match.replace(/'/g, '').trim()
    if (tag) used.add(tag)
  }
}

const undocumented = [...used].filter((t) => !documented.has(t)).sort()
const unused = [...documented].filter((t) => !used.has(t)).sort()

if (undocumented.length > 0 || unused.length > 0) {
  console.error('\n✖ check:parity — the tag table and the suite disagree.\n')
  if (undocumented.length > 0) {
    console.error(`  used but not documented: ${undocumented.join(', ')}`)
  }
  if (unused.length > 0) {
    console.error(`  documented but unused:   ${unused.join(', ')}`)
  }
  console.error('\nUpdate the Tags table in CONTRIBUTING.md, or drop the tag.\n')
  process.exit(1)
}

console.log(`✓ check:parity — ${used.size} tags, all documented and all in use`)

/**
 * The per-tag counts the strategy doc quotes must be the counts that exist.
 *
 * These are the numbers a reader checks first, because they are the easiest to
 * check. The suite's own titles are the source of truth — the counts come from
 * `--list --grep`, not from anything hand-maintained.
 */
const tagCounts = new Map()
for (const tag of used) {
  const listed = execFileSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--list', '--grep', tag, '--reporter=json'],
    { cwd: `${ROOT}packages/${PACKAGES[0]}`, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )

  let n = 0
  const countSpecs = (suites) => {
    for (const suite of suites ?? []) {
      n += (suite.specs ?? []).length
      countSpecs(suite.suites)
    }
  }
  countSpecs(JSON.parse(listed).suites)
  tagCounts.set(tag, n)
}

const strategy = readFileSync(join(ROOT, 'docs/test-strategy.md'), 'utf8')

const STRATEGY_CLAIMS = [
  ['@isolated', /`@isolated`.*?\|\s*(\d+) of \d+ \|/s],
  ['@flow', /`@flow`.*?\|\s*(\d+) of \d+ \|/s],
  ['@cross-service', /`@cross-service` \((\d+)\)/],
  ['@core', /`@core` \((\d+)\)/],
]

const wrong = []
for (const [tag, pattern] of STRATEGY_CLAIMS) {
  const match = pattern.exec(strategy)
  if (!match) {
    wrong.push(`docs/test-strategy.md: could not find the ${tag} count this check guards`)
  } else if (Number(match[1]) !== tagCounts.get(tag)) {
    wrong.push(
      `docs/test-strategy.md: claims ${match[1]} ${tag} tests, suite has ${tagCounts.get(tag)}`,
    )
  }
}

// The doc also states the total in prose.
const totalClaim = /\*\*(\d+) tests in under three/.exec(strategy)
if (!totalClaim) {
  wrong.push('docs/test-strategy.md: could not find the total-test claim this check guards')
} else if (Number(totalClaim[1]) !== actual) {
  wrong.push(`docs/test-strategy.md: claims ${totalClaim[1]} tests, suite has ${actual}`)
}

if (wrong.length > 0) {
  console.error('\n✖ check:parity — docs/test-strategy.md quotes a stale count.\n')
  for (const problem of wrong) console.error(`  ${problem}`)
  console.error('\nUpdate the number, or the claim stops being true.\n')
  process.exit(1)
}

/**
 * CONTRIBUTING.md prints the same counts as a tag taxonomy block.
 *
 * Two files stating the same number is two chances for one to go stale, so
 * both are checked against the suite rather than against each other.
 */
const contributingCounts = [
  ['@smoke', /@smoke \((\d+)\)/],
  ['@isolated', /@isolated \((\d+)\)/],
  ['@flow', /@flow \((\d+)\)/],
  ['@items', /@items \((\d+)\)/],
  ['@reservations', /@reservations \((\d+)\)/],
  ['@maintenance-logs', /@maintenance-logs \((\d+)\)/],
  ['@core', /@core \((\d+)\)/],
  ['@cross-service', /@cross-service \((\d+)\)/],
]

for (const [tag, pattern] of contributingCounts) {
  const match = pattern.exec(contributing)
  if (!match) {
    wrong.push(`CONTRIBUTING.md: could not find the ${tag} count this check guards`)
  } else if (Number(match[1]) !== tagCounts.get(tag)) {
    wrong.push(`CONTRIBUTING.md: claims ${match[1]} ${tag} tests, suite has ${tagCounts.get(tag)}`)
  }
}

if (wrong.length > 0) {
  console.error('\n✖ check:parity — a documented tag count is stale.\n')
  for (const problem of wrong) console.error(`  ${problem}`)
  console.error('\nUpdate the number, or the claim stops being true.\n')
  process.exit(1)
}

console.log('✓ check:parity — the per-tag counts in test-strategy.md match the suite')
console.log('✓ check:parity — the tag taxonomy in CONTRIBUTING.md matches the suite')
