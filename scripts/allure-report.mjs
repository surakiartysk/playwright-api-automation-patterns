#!/usr/bin/env node
/**
 * Builds one Allure report covering both packages.
 *
 * Two suites in one report rather than two reports, because the whole question
 * this repo asks is how they compare. Separate reports would mean opening two
 * tabs and diffing by eye.
 *
 * Each package's results are copied into a shared directory first; Allure's
 * `parentSuite` label keeps them distinguishable in the tree.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MERGED = join(ROOT, 'allure-results')
const REPORT = join(ROOT, 'allure-report')
const HISTORY = join(ROOT, 'allure-history.json')

const PACKAGES = ['functional-style', 'class-style']

rmSync(MERGED, { recursive: true, force: true })
rmSync(REPORT, { recursive: true, force: true })
mkdirSync(MERGED, { recursive: true })

/**
 * Drops the history file if it cannot be parsed.
 *
 * Allure writes this file itself and reads it back on the next run, so a
 * corrupt one crashes the generator outright rather than degrading. That has
 * happened: Prettier reformatted it before the ignore rules caught up, and
 * Allure could not read its own output. Losing a trend is a nuisance; a report
 * command that dies is worse — so a bad file is discarded and the trend starts
 * again. Absent is fine: Allure creates it on first use.
 */
function dropUnreadableHistory() {
  if (!existsSync(HISTORY)) return
  try {
    JSON.parse(readFileSync(HISTORY, 'utf8'))
  } catch {
    console.warn('  ! allure-history.json is unreadable — starting a fresh trend')
    rmSync(HISTORY, { force: true })
  }
}

let found = 0
for (const pkg of PACKAGES) {
  const dir = join(ROOT, 'packages', pkg, 'allure-results')
  if (!existsSync(dir)) {
    console.warn(`  ! no results for ${pkg} — run its tests first`)
    continue
  }

  for (const entry of readdirSync(dir)) {
    // Prefix so identically-named result files from the two packages cannot
    // overwrite each other in the merged directory.
    cpSync(join(dir, entry), join(MERGED, `${pkg}-${entry}`))
    found += 1
  }

  dropErrorContext(MERGED, pkg)

  // Tags the whole package as one top-level group in the report tree.
  writeFileSync(
    join(MERGED, `${pkg}-environment.properties`),
    `package=${pkg}\ncontract=gear-rental v1.0.0\n`,
  )
}

if (found === 0) {
  console.error('\n✖ allure — no results found. Run `pnpm test` first.\n')
  process.exit(1)
}

console.log(`\nMerged ${found} result files from ${PACKAGES.length} packages.`)

/**
 * `awesome` is Allure 3's UI. The three-level Behaviors tree
 * (epic → feature → story) is the reason for it over the classic report, which
 * flattens that into one list.
 *
 * `--history-path` points at one file that Allure reads and rewrites each run.
 * It is generated, not committed — see .gitignore for why.
 */
dropUnreadableHistory()

/**
 * `--single-file` inlines the whole report into one `index.html`.
 *
 * The default output is ~450 files — a JS bundle, fonts, and one JSON per test
 * under `data/`. That is fine to open locally, and the wrong shape to ship
 * anywhere: uploading it is hundreds of round trips, and serving it means every
 * one of those assets has to be reachable and authorised individually.
 *
 * Passed via SINGLE_FILE so a local `pnpm allure` can opt out — the multi-file
 * report loads faster when you are opening it from disk repeatedly.
 */
const singleFile = process.env.SINGLE_FILE !== 'false'

execFileSync(
  'pnpm',
  [
    'exec',
    'allure',
    'awesome',
    'allure-results',
    '-o',
    'allure-report',
    '--name',
    'Gear Rental API — both styles',
    '--group-by',
    'epic,feature,story',
    ...(singleFile ? ['--single-file'] : []),
    // Always passed. Allure reads the trend from here and writes it back, so
    // the file appears on the first run and accumulates from then on.
    '--history-path',
    HISTORY,
  ],
  { cwd: ROOT, stdio: 'inherit' },
)

console.log('\n✓ allure — report written to allure-report/')
console.log('  open it with: pnpm allure:open\n')

/**
 * Removes Playwright's `error-context` attachment from the merged results.
 *
 * Playwright attaches an `error-context.md` to every failed test with no way
 * to switch it off. It is a prompt written for an AI — "explain why this
 * failed, suggest a fix" — wrapping the same error message the report already
 * shows a line above. In Allure it is a tab a reader opens once, finds
 * nothing new in, and stops opening.
 *
 * Only the report copy is dropped; the original stays under `test-results/`
 * for local debugging.
 */
function dropErrorContext(merged, pkg) {
  for (const entry of readdirSync(merged)) {
    if (!entry.startsWith(`${pkg}-`) || !entry.endsWith('-result.json')) continue

    const path = join(merged, entry)
    let result
    try {
      result = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }

    // Attachments hang off steps, not off the result — Playwright nests them
    // under the step that failed, so a top-level pass finds nothing.
    const dropped = []
    const prune = (node) => {
      if (Array.isArray(node.attachments)) {
        node.attachments = node.attachments.filter((a) => {
          const isNoise = String(a.name ?? '').includes('error-context')
          if (isNoise) dropped.push(a.source)
          return !isNoise
        })
      }
      // Recurse first, then drop. The attachment lives *inside* the step that
      // is itself named `error-context`, so filtering the step away first
      // would leave its file behind as an orphan.
      for (const step of node.steps ?? []) prune(step)

      // The step holds nothing else once its attachment is gone, so leaving it
      // would render an empty row.
      if (Array.isArray(node.steps)) {
        node.steps = node.steps.filter((s) => !String(s.name ?? '').includes('error-context'))
      }
    }
    prune(result)

    if (dropped.length === 0) continue

    // Delete the file too, or the merged directory keeps an orphan.
    for (const source of dropped) {
      const file = join(merged, `${pkg}-${source}`)
      if (existsSync(file)) rmSync(file)
    }

    writeFileSync(path, JSON.stringify(result))
  }
}
