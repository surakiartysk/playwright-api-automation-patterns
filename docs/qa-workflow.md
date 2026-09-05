# How this suite is operated

The repository shows a test suite. This page shows the thing around it — how a
run gets triggered, who triggers it, and where the result goes.

That context is usually missing from a portfolio, and it is most of the job. A
suite nobody can run without a QA engineer present is a suite that gets used
once a sprint.

## The picture

```
   ┌──────────────┐         ┌──────────────┐        ┌──────────────┐
   │  Developer   │         │  QA / lead   │        │ Deploy       │
   │  opens a PR  │         │  investigates│        │ pipeline     │
   └──────┬───────┘         └──────┬───────┘        └──────┬───────┘
          │                        │                       │
          │ pull_request           │ workflow_dispatch     │ repository_dispatch
          │                        │ (pick style + tag)    │ {"event_type":"run-tests"}
          ▼                        ▼                       ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                      GitHub Actions                             │
   │  pr-gate        ci          on-demand        scheduled          │
   │  smoke only     full+parity  chosen slice    weekly, unpinned   │
   └───────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │  Playwright        │
                    │  + bundled mock    │
                    └─────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       exit code        HTML report      allure-results
       (gate)           (artifact)       (trend + Behaviors tree)
```

Four ways in, because the question differs each time. See decision 10 for why
they are separate workflows rather than one with branching.

## Who triggers what, and why

| Who              | How                         | What they want to know                                             |
| ---------------- | --------------------------- | ------------------------------------------------------------------ |
| Developer        | opens a PR                  | "Did I obviously break something?" — smoke, in a couple of minutes |
| Maintainer       | merge to `main`             | "Is `main` green?" — full suite, both Node versions                |
| QA investigating | Actions tab → **On-demand** | "Is this _service_ red, or just that one spec?"                    |
| Deploy pipeline  | `repository_dispatch`       | "The environment is up — verify it"                                |
| Nobody           | weekly cron                 | "Has anything rotted while we were not looking?"                   |

### The self-service part

The **On-demand** workflow takes three inputs: which style, which tag, and how
many workers. That combination exists because those are the three questions
asked during triage:

- _which style_ — is this a bug in the API, or in how one package tests it?
- _which tag_ — narrow to a service, or a kind of test
- _how many workers_ — drop to `1` to see whether a failure is a real defect or
  a race between parallel tests

Anyone with repository access can run it from the Actions tab. No local setup,
no asking QA to run something.

### Triggering it from somewhere else

Two doors, and which one you want depends on who is knocking.

**A person, or anything that can hold a GitHub token** uses the API directly.
`repository_dispatch` is what `on-demand.yml` already listens for:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{"event_type":"run-tests","client_payload":{"scope":"regression"}}'
```

That token needs `actions: write` on this repository, which is the problem with
handing it to people. A fine-grained PAT scoped to one repository is the least
bad version, and it is still a credential that can start jobs, read Actions
logs, and outlive the person's need for it. It suits a _system_ — a deploy
pipeline, a release script — where the token lives in that system's secret
store and rotates with it.

**A developer** should not be holding one. The reason is not trust, it is
blast radius and revocation: a token per person is a token per person to
inventory, rotate and remove at offboarding, and GitHub's own scopes cannot
express "may run smoke against `main`, and nothing else". The moment you want
that sentence enforced, you need something between the person and GitHub that
holds the single token and applies its own rules to each request.

That something is the companion dashboard below. It holds one `GITHUB_TOKEN`
server-side, authenticates people separately, and applies the per-role rules
GitHub cannot — which branches, how many workers, and whether runs are open
right now. No developer ever holds a credential that can reach Actions.

**A pipeline** is the case that does want a key, and it is a different key. Not
a GitHub token handed to a developer, but one the dashboard issues and whose
authority it defines: scoped to a service and a branch, revocable in one place,
and attributable in the run history. A deploy job then verifies its own
environment the moment it finishes, with nobody watching.

That is built. `POST /runs` accepts `Authorization: Bearer <key>` alongside a
session, a key resolves to a role before any handler runs, and every rule the
dashboard already had — which branches, how many workers, whether runs are open
right now — applies to it unchanged. A key may narrow what its role allows and
can never widen it. The reasoning, and the authorisation bug that building it
exposed, are in the dashboard's
[decision 15](https://github.com/surakiartysk/playwright-run-dashboard/blob/main/docs/decisions.md#15-machine-keys-the-dashboard-issues-not-github-tokens-it-hands-out).

**Scheduled runs** need no key at all: `scheduled.yml` runs weekly on cron, and
carries a `workflow_dispatch` trigger so the same job can be started by hand
without waiting for Monday. It exists to catch decay rather than regressions —
see the reasoning in that file.

So the honest summary: cron for decay, the dashboard for people, and a key the
dashboard issues for machines. `repository_dispatch` with a scoped GitHub token
remains the way in for anything that never talks to the dashboard at all.

## What this repo does _not_ have, and where it lives instead

Being explicit, because the boundary is the interesting part.

In the production setup this approach comes from, the self-service piece is a
small internal dashboard rather than the GitHub Actions UI:

- a developer picks a service and tags from a web page and presses **Run**
- that writes a queued row to a database and triggers the workflow
- the workflow runs the tests, uploads the report to object storage, and posts
  a signed webhook back with the totals
- the page polls for status and links the finished report

The reason to build that rather than send people to the Actions tab is
adoption. A developer who has to find the right workflow, expand the inputs,
and later dig through artifacts will ask QA instead — and then the suite is
gated on a person being available. A one-page form and a link to the report
removes that.

**None of that is in this repository**, and deliberately so: a dashboard needs
hosting, a database, and secrets, while this repo's first promise is that a
stranger can clone it and run everything with none of those. The
`repository_dispatch` trigger in `on-demand.yml` is the seam it attaches to.

It is published as a **companion repository** instead, built the same way and
for the same reason:

**`playwright-run-dashboard`** — the trigger →
run → report flow, with four roles and the authorisation that makes
self-service safe. Its interesting question is not the Run button but _who may
run what, against which branch, and who may then see the result_.

The two repos meet at exactly three points, and share no code:

1. **Dispatch.** The dashboard calls `on-demand.yml` with `run_id`, `scope`
   (the service, or a tag), `style`, and `workers`. Those are this workflow's
   input names, not the dashboard's vocabulary, and they do not line up — a
   service goes in `scope`, because `style` selects a package.
2. **Report upload.** The merged Allure report is written straight into the
   dashboard's R2 bucket under `runs/{run_id}/`, using a token scoped to that
   one bucket. Uploading directly rather than POSTing several megabytes
   through the dashboard keeps a body-size limit, a multipart parser and a
   signing scheme over unbufferable input out of the API entirely — see the
   dashboard's decision 14.
3. **Callback.** When the run finishes, the workflow posts totals back, signed
   over `timestamp.body` with a shared secret, whether the suite passed or
   failed. A red run that never reports leaves a dashboard stuck on "running".
   It runs _after_ the upload and only claims `reportPath` if that succeeded:
   the dashboard trusts the field, so a path pointing at nothing is a report
   link that 404s.

All three are inert here by default: they are skipped unless `run_id` is set
_and_ `DASHBOARD_WEBHOOK_URL` is configured, so a hand-started run — or a fork
with neither — behaves exactly as it did before. A failed upload is
`continue-on-error`: the run's numbers still reach the dashboard, it just does
not claim a report.

**This is a contract that nothing in either repo enforces at compile time**, and
it had already broken: the dashboard was sending a service name in `style`,
which accepts three package names and nothing else, so every dispatch would have
been rejected. Both repos' documentation said the integration worked. It is now
covered by tests on the dashboard side that pin this workflow's accepted values,
so the next drift fails a suite rather than a deployment.

Keeping the repos separate is still what lets this one stay clonable with no
infrastructure.

## Reporting

Three outputs, for three different readers.

| Output                 | Reader               | Answers                                          |
| ---------------------- | -------------------- | ------------------------------------------------ |
| Exit code              | CI                   | Pass or fail. Nothing else.                      |
| Playwright HTML report | Whoever is debugging | What failed, with the trace                      |
| Allure report          | QA lead, over time   | What is failing _repeatedly_, grouped by service |

```bash
pnpm test          # writes allure-results in both packages
pnpm allure        # merges both into one report
pnpm allure:open
```

The Allure tree groups by service first, then by test type:

```
Items                 54
Cross-Service         10
  ├ Driven from Maintenance Logs   6
  └ Driven from Reservations       4
Maintenance Logs      10
Reservations          66
  ├ Isolated          58
  └ Flow               8
Test Infrastructure   26
```

`Cross-Service` is its own epic rather than a row under whichever service the
test was filed in. "Cancelling a reservation releases the item" is as much an
items behaviour as a reservations one, and someone auditing items coverage
should see it. The tag is applied by hand: most tests touch a second service
only to set up, and calling those cross-service would label nearly everything.

Counts are doubled because both packages land in the same report. The
Playwright HTML report covers the same ground per package, with tags rendered as
clickable chips — typing `@reservations` into its search box narrows to exactly
the 35 tests `--grep @reservations` would run.

Both packages land in **one** report, because the comparison is the point —
separate reports would mean two tabs and diffing by eye.

The Behaviors tree (epic → feature → story) is derived from the tags each spec
already carries rather than annotated by hand. Tags are needed for filtering
anyway, so the report becomes a consequence of them instead of a second thing to
keep in sync. See `src/utils/allure-meta.ts`.

Everything Allure produces is generated and ignored, including
`allure-history.json` — the file that carries the trend. Committing it would
mean a quarter-megabyte of run data from whichever machine generated it last,
which is noise to a reader and a merge conflict to a contributor. A real
deployment keeps that history in CI, cached between runs or written back by the
reporting job.

## Triage: what to do when it is red

1. **Read the failure message before the trace.** The validators are written to
   say what was expected and what arrived; most failures do not need the trace.
2. **Re-run that spec file alone.** Every spec passes standalone by design. If
   it passes alone but fails in the suite, the problem is shared state, not the
   assertion.
3. **Drop to one worker.** If a failure disappears at `--workers=1`, it is a
   race — likely a test asserting on data another test created.

   The inverse is also worth doing deliberately: **run at more workers than
   usual**. A race that never appears at the default may appear at twice it.
   `--workers=8 --repeat-each=3` found a real one here — a listing assertion
   that fetched a wide page and filtered locally, which quietly assumed the row
   it wanted was _on_ that page. Under enough parallelism it was not.

4. **Break the mock deliberately.** If a test is suspected of being vacuous,
   remove the behaviour it targets and confirm it goes red. Two tests in this
   repo passed while testing nothing, and both were found this way — see
   decisions 9 and 10.

Steps 2 and 3 are cheap because the suite carries its own backend: reproducing
a CI failure locally needs no environment access.
