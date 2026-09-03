#!/usr/bin/env node
/**
 * Uploads a run's report into the dashboard's R2 bucket.
 *
 * Run from `on-demand.yml` after the suite finishes, so the dashboard's
 * "Report" link resolves for a real run. Writes to `runs/{runId}/index.html`,
 * which is the key the dashboard serves once the webhook records the path.
 *
 * One file, not a directory. `scripts/allure-report.mjs` builds the report
 * with `--single-file`, which inlines the JS, CSS, fonts and per-test JSON
 * that would otherwise be ~450 separate objects. Uploading those would be
 * hundreds of round trips per run, and serving them would mean every asset
 * has to be individually reachable and authorised.
 *
 * Usage: node upload-report.mjs <file> <destination-key>
 */

import { readFileSync, statSync } from 'node:fs'

const [source, key] = process.argv.slice(2)

if (!source || !key) {
  console.error('usage: node upload-report.mjs <file> <destination-key>')
  process.exit(1)
}

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID } = process.env
const BUCKET = 'run-dashboard-reports'

/**
 * No credentials is "not configured", not "broken".
 *
 * A fork, or a deployment that has not set these up, should still get its
 * numbers reported — the caller simply gets no report link. The step is
 * `continue-on-error`, and exiting non-zero is what tells the callback step to
 * omit `reportPath` rather than claim a report that is not there.
 */
if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.log('No Cloudflare credentials set — skipping the report upload.')
  process.exit(1)
}

const body = readFileSync(source)
const megabytes = (statSync(source).size / 1024 / 1024).toFixed(1)

console.log(`Uploading ${source} (${megabytes} MB) to ${BUCKET}/${key} …`)

const endpoint =
  `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}` +
  `/r2/buckets/${BUCKET}/objects/${key.split('/').map(encodeURIComponent).join('/')}`

const response = await fetch(endpoint, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    // Set explicitly: the dashboard serves whatever content-type was stored,
    // so guessing wrong here is a report that renders as plain text.
    'Content-Type': 'text/html; charset=utf-8',
  },
  body,
})

if (!response.ok) {
  console.error(`✗ ${response.status}: ${await response.text()}`)
  process.exit(1)
}

console.log('✓ uploaded')
