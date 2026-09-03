import { defineConfig } from '@playwright/test'

/**
 * Same settings as the other package — deliberately.
 *
 * Worker count, parallelism and retries are held constant so the comparison is
 * about test-code organisation and nothing else. A class-first suite quietly
 * run with fewer workers would look better for reasons that have nothing to do
 * with its style.
 *
 * Both packages share one mock process, so `pnpm test` runs them sequentially
 * at the workspace root; the port is the same either way.
 */
const MOCK_PORT = process.env.MOCK_PORT ?? '4010'
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${MOCK_PORT}/api/v1`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries, anywhere.
  //
  // A retry turns a real failure into a slow one and trains a reader to
  // re-run rather than investigate. The usual argument for `retries: 1` in CI
  // is that the environment is flakier than a laptop; that does not apply to a
  // mock running in the same process, and if it ever did the honest fix is the
  // test rather than the runner. Stability is verified instead — the suite
  // holds at 12 workers with `--repeat-each=5`. See CLAUDE.md rule 4.
  retries: 0,
  // Half the available cores, which is also Playwright's own default.
  //
  // Measured rather than assumed: on a 10-core machine this suite runs fastest
  // at 5 workers (2.9s), and gets *slower* at 10 (3.5s) and 16 (4.1s). API
  // tests are I/O-bound so more workers sounds free, but one mock process
  // serves all of them and becomes the bottleneck.
  //
  // Expressed as a fraction rather than a number so a bigger CI runner is
  // actually used; hardcoding 4 wasted anything above four cores.
  workers: '50%',
  reporter: [
    ...(process.env.CI ? ([['github']] as const) : ([['list']] as const)),
    ['html', { open: 'never' }],
    // Allure results are always written; generating the report is a separate
    // step (`pnpm allure`) so a plain test run stays fast.
    // Results accumulate across runs — allure-playwright appends. The report
    // script clears them before each build; see scripts/allure-report.mjs.
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        detail: false,
        /**
         * Failure categories — the triage taxonomy, applied automatically.
         *
         * Allure buckets every failure by matching its message, so a red run
         * arrives already sorted into "twelve schema mismatches" rather than
         * twelve separate investigations. The regexes match what
         * BaseValidator and ResponseAssert actually throw; if a message there
         * is reworded, the category stops matching and quietly collects
         * nothing — which is why each one names its source.
         *
         * The buckets deliberately mirror docs/triage.md: infrastructure
         * first (it is the cheapest to rule out), then our own assertions,
         * then a genuine contract mismatch.
         */
        categories: [
          {
            // BaseValidator / ResponseAssert: `response did not match schema:`
            name: 'Schema mismatch',
            messageRegex: '.*did not match schema.*',
            matchedStatuses: ['failed'],
          },
          {
            // `expected <n>, got <n> — body: ...`
            name: 'Unexpected HTTP status',
            messageRegex: '.*expected \\d+, got \\d+.*',
            matchedStatuses: ['failed'],
          },
          {
            // `expected business code 'X'`
            name: 'Unexpected business code',
            messageRegex: '.*expected business code.*',
            matchedStatuses: ['failed'],
          },
          {
            // `expected a validation error naming 'field'`
            name: 'Validation error named the wrong field',
            messageRegex: '.*validation error naming.*',
            matchedStatuses: ['failed'],
          },
          {
            // The mock never started, or died mid-run. Not a test failure.
            name: 'Test infrastructure',
            messageRegex: '.*ECONNREFUSED.*|.*ETIMEDOUT.*|.*webServer.*|.*spawn.*ENOENT.*',
            matchedStatuses: ['failed', 'broken'],
          },
        ],
      },
    ],
  ],

  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json' },
    trace: 'retain-on-failure',
  },

  webServer: {
    command: 'pnpm --filter @gear-rental/shared-contract start',
    url: `http://127.0.0.1:${MOCK_PORT}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { MOCK_PORT },
  },
})
