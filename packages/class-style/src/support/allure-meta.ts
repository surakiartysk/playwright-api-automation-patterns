import { epic, feature, layer, severity } from 'allure-js-commons'
import type { TestInfo } from '@playwright/test'

/**
 * Derives Allure's Behaviors tree from the tags a spec already carries.
 *
 * The alternative is annotating every test by hand, which is ~160 edits here
 * and drifts the moment someone forgets one. Tags are already required for
 * filtering (`--grep @smoke`), so deriving from them keeps a single source and
 * makes the report a consequence of the tags rather than a parallel system to
 * maintain.
 *
 * Called once from a fixture, so specs stay unaware of the reporter entirely.
 */

/** Display names, written out rather than derived by casing a slug. */
const EPIC_NAMES: Record<string, string> = {
  '@items': 'Items',
  '@reservations': 'Reservations',
  '@maintenance-logs': 'Maintenance Logs',
  '@core': 'Test Infrastructure',
}

/**
 * Tests whose subject is an effect that crosses a service boundary get their
 * own epic rather than sitting under whichever service they were filed in.
 *
 * Filing them under one service hides them from the other: "cancelling a
 * reservation releases the item" is as much an items behaviour as a
 * reservations one, and someone auditing items coverage should see it.
 *
 * `@cross-service` is applied by hand, not derived from which clients a spec
 * uses. Most tests touch a second service only to *set up* — a reservation
 * needs an item to exist — and calling those cross-service would label nearly
 * everything, which labels nothing. The tag marks what a test asserts about,
 * which only its author knows.
 */
const CROSS_SERVICE_EPIC = 'Cross-Service'

/** Tags that describe the *kind* of test rather than its domain. */
const TYPE_TAGS: Record<string, string> = {
  '@isolated': 'Isolated — single endpoint',
  '@flow': 'Flow — multi-step',
}

export async function applyAllureMeta(testInfo: TestInfo): Promise<void> {
  const tags = testInfo.tags

  if (tags.includes('@cross-service')) {
    await epic(CROSS_SERVICE_EPIC)
  } else {
    const serviceTag = tags.find((t) => t in EPIC_NAMES)
    if (serviceTag) await epic(EPIC_NAMES[serviceTag]!)
  }

  // Inside Cross-Service, group by the service the effect lands in — otherwise
  // the epic is one flat list and the tree stops helping.
  if (tags.includes('@cross-service')) {
    const owning = tags.find((t) => t in EPIC_NAMES)
    if (owning) await feature(`Driven from ${EPIC_NAMES[owning]}`)
  } else {
    const typeTag = tags.find((t) => t in TYPE_TAGS)
    if (typeTag) await feature(TYPE_TAGS[typeTag]!)
  }

  // Smoke is what a deploy gate would run, so it is the one worth flagging as
  // critical; everything else is normal severity until something argues
  // otherwise.
  await severity(tags.includes('@smoke') ? 'critical' : 'normal')

  await layer('api')
}
