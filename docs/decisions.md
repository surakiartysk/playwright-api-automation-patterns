# Decisions

Why this repo is shaped the way it is. Read this first if a convention looks
strange — the reasoning is here rather than in the code.

Each entry carries a **trade-off** section. A decision without a stated cost is
usually a decision that has not been examined, and it is the section an
interviewer should press on hardest.

**Contents**

1. [Hybrid OOP + functional — class only where state lives](#1-hybrid-oop--functional--class-only-where-state-lives)
2. [One client per service domain, not per user story](#2-one-client-per-service-domain-not-per-user-story)
3. [Validator asserts structure, test asserts values](#3-validator-asserts-structure-test-asserts-values)
4. [Zod for response shape, not hand-written checks](#4-zod-for-response-shape-not-hand-written-checks)
5. [`test.step()`, not a `@step` decorator](#5-teststep-not-a-step-decorator)
6. [Bundle a mock — the opposite of what the same question needs at work](#6-bundle-a-mock--the-opposite-of-what-the-same-question-needs-at-work)
7. [Provisioners walk real API state; compose, never inherit](#7-provisioners-walk-real-api-state-compose-never-inherit)
8. [What breaks at scale, and the seam that absorbs it](#8-what-breaks-at-scale-and-the-seam-that-absorbs-it)
9. [Test the assertion helper, or it can rot silently](#9-test-the-assertion-helper-or-it-can-rot-silently)
10. [Four CI workflows, split by what triggers them](#10-four-ci-workflows-split-by-what-triggers-them)
11. [Allure for trends; the HTML report for debugging](#11-allure-for-trends-the-html-report-for-debugging)

---

## 1. Hybrid OOP + functional — class only where state lives

**Context.** People arriving from a typical automation course expect one of two
things this repo deliberately does not do: every artifact wrapped in a class
(a `CreateItem` class with `callAPI()` / `verifySuccess()` / `buildPayload()`,
instantiated once and shared), or an actor/action Screenplay layer. The question
"why doesn't this look like what I learned?" deserves a written answer.

**Decision.** Use a class where something genuinely carries state for its
lifetime; use a function everywhere else.

- **Class** — the API surface. `BaseClient` holds config, bearer token, and
  request context, and every call needs all three. Dependencies arrive through
  the constructor.
- **Function** — the tests themselves, the HTTP helper, the data builders. None
  of them hold anything between calls.
- **Fixtures** — the wiring. Playwright guarantees per-test values and teardown
  on failure, which a `beforeEach` and a shared instance cannot.
- **Declarative** — response shape is a schema, not code.

**Reason.** State in a module-level instance fights isolation the moment workers
run in parallel. The shape that breaks is a class per operation exported as a
ready-made instance: one object holding the call, the assertion, the payload
builder and the auth token, shared by every test in the process. It also grows on
every axis at once — each new endpoint adds a method to all four
responsibilities.

(That pattern is described here, never reproduced. `pnpm check:leak` caught an
earlier draft of this very paragraph quoting it verbatim, which is the check
doing its job — see [provenance.md](provenance.md).)

**Trade-off.** More files and more moving parts than "one class per thing", and
a newcomer's muscle memory is briefly wrong. `packages/class-style` exists
precisely because that trade is arguable — see [comparison.md](comparison.md),
which is honest about where the other shape wins.

**Where.** `packages/functional-style/src/core/BaseClient.ts` (the class layer),
`src/fixtures/base.ts` (the functional wiring).

---

## 2. One client per service domain, not per user story

**Context.** A BDD or Selenium background suggests a client per story —
`CheckoutClient`, `RegistrationClient`.

**Decision.** Clients mirror resources. Stories live one level up, in the specs,
where they compose clients.

**Reason.** REST is resource-oriented, so a resource axis stays orthogonal while
a story axis overlaps: "member reserves gear" spans items _and_ reservations. Cut
clients per story and `POST /items` gets reimplemented in several of them. One
source of truth per endpoint is worth more than a client that reads like a
sentence.

**Trade-off.** A multi-step flow has to wire several clients together in the
test body. When the same flow appears three times, it becomes a provisioner that
_composes_ the existing clients — never a `CheckoutClient` that re-implements
their endpoints.

**Where.** `src/services/<service>/`, one folder each.

---

## 3. Validator asserts structure, test asserts values

**Decision.** The validator checks shape — status code, envelope, schema,
business code. The test checks the values it cares about, inline.

**Reason.** Structure is identical for every caller of an endpoint; values differ
per case. Put field-value assertions in the validator and it grows a parameter
per caller until it is a worse copy of the test. Put structural checks in the
tests and the envelope is pasted into all of them.

Tests assert on the **business code**, never on `message`. The code is contract;
the message is prose that should stay free to improve.

**Trade-off.** Two places to look when a test fails. The validator returns the
parsed payload to soften this: the test gets a typed value to assert on directly
rather than re-parsing what the validator already read.

**Rule of thumb.** If the same field-value combination appears in three tests,
extract it. Until then, inline.

**Where.** `src/core/BaseValidator.ts`, and every `*Validator.ts`.

---

## 4. Zod for response shape, not hand-written checks

**Decision.** Response shapes are Zod schemas. Resources are `.strict()`.

**Reason.** A schema is data: composable, reusable, and printable in a failure
message. A chain of `expect(typeof x.id).toBe('string')` is none of those.
`.strict()` matters more than it looks — if the API starts returning a field the
suite has never heard of, that is a contract change and the tests should say so
rather than ignore it.

Envelopes are deliberately looser than resources: `data` varies per endpoint, and
on errors it is optional-but-nullable, because most errors carry no detail while
a 422 carries `fields`.

**Trade-off.** A dependency, and a second place where the API's shape is written
down — the contract states it, and the schema restates it in TypeScript. Drift
between them is possible; that is the cost of type-safety at the test boundary.

**Where.** `src/core/schemas.ts` and each service's `schemas.ts`.

---

## 5. `test.step()`, not a `@step` decorator

**Decision.** Multi-step tests use Playwright's built-in `test.step()`.

**Reason.** The `@step` decorator is almost always a Java carry-over — Allure's
`@Step` annotation and a class-based test model. JavaScript does not need it:
functions are first-class and a string label is the native equivalent of an
annotation. Three concrete costs of the decorator route:

- **It forces class-based tests**, which fights Playwright's fixture model —
  fixtures do not inject into class methods, and `this`-binding in async code
  gets confusing.
- **The TS decorator spec is in transition**; most `@step` libraries depend on
  the legacy `experimentalDecorators` flag.
- **Inline reads better.** The label sits where the action is, not above a
  method the reader has to scroll up to find.

`test.step()` also feeds the trace viewer and HTML report with no wiring.

**Trade-off.** A few more characters per step. If verbosity ever hurts, reach for
a helper function before reaching for a decorator.

**Rule of thumb.** Use the idiom of the current tool, not the previous one.

**Where.** The lifecycle and servicing flow specs in both packages.

---

## 6. Bundle a mock — the opposite of what the same question needs at work

**Decision.** A Hono mock runs in-process, started by Playwright's `webServer`.
`pnpm install && pnpm test` works on a clean clone with no backend, no
credentials, and no environment file.

**Reason.** For a public repo the first interaction is a stranger cloning it.
Anything that stands between them and a green run — a secret to obtain, a
service to provision — means most readers never see it run at all. CI gets the
same benefit: no environments, no gates, no secrets.

**The same question has the opposite answer in the production suite this
approach comes from.** There, a bundled mock was removed. It was an internal QA
repo running against live SIT and UAT, so the mock was maintenance overhead that
could silently drift from the real API and give false confidence. The contexts
differ, so the answers differ:

|            | this repo            | the production suite                      |
| ---------- | -------------------- | ----------------------------------------- |
| audience   | strangers, no access | a QA team with environments               |
| worst case | reader never runs it | tests pass against a fiction              |
| answer     | bundle it            | delete it, test against real environments |

Writing this down is the point. A decision copied without its context is
cargo-culting, and the same engineer arriving at opposite answers is what
context-sensitivity looks like.

**Trade-off.** The mock can drift from the contract. Mitigated by writing
`openapi.yaml` first and treating it as the arbiter — but on a real project this
would need a periodic run against the live API, which this repo has no way to do.
That is a genuine limitation, not a solved problem.

**Fidelity is deliberate.** The mock enforces exactly what the tests assert:
state transitions, validation naming the offending field, role gates,
cross-service side effects. It skips persistence, real crypto, rate limiting,
and pricing math. A mock drifting toward being a real backend stops being worth
maintaining; a mock too permissive lets the best specs pass vacuously.

**Where.** `packages/shared-contract/`.

---

## 7. Provisioners walk real API state; compose, never inherit

**Context.** A test needing a `CHECKED_OUT` reservation can fabricate the row or
ask the API for it the way a user would.

**Decision.** Drive it through real calls, asserting each step.

**Reason.** A fabricated row can sit in a state the API would never have
allowed, and the test then passes against a broken machine. Driving it also
means the provisioner exercises the happy path on the way to setting up an edge
case.

**Composition, not inheritance.** The maintenance-log provisioner _calls_ the
reservation provisioner and uses its result. The API leaves no alternative —
there is no endpoint that creates a log; one exists only because a reservation
reached `CHECKED_OUT`. Inheritance would also be wrong on the merits: a
maintenance log is not a kind of reservation.

The class-first package reaches the same place: `MaintenanceContext` takes the
other contexts as arguments rather than holding them, so the dependency stays
visible at the call site and no context quietly owns half the API.

**Trade-off.** Slower — provisioning to `CLOSED` is five HTTP calls before the
test starts. Accepted deliberately: the alternative trades honesty for speed,
and at this suite's size the wall-clock difference is seconds.

**Where.** `tests/reservations/provisioner.ts`, `tests/maintenance-logs/provisioner.ts`.

---

## 8. What breaks at scale, and the seam that absorbs it

**Context.** Three services is small. The design question that matters is what
happens at fifteen.

**What does not scale.** Copying a service folder to make the next one. By the
sixth copy the envelope schema, the error catalogue, the admin-client helper,
and the provisioner scaffolding exist six times, and fixing any of them means
six edits. Drift becomes a question of when.

**The seam.** Pull the genuinely-shared pieces into `core` and have each service
**delegate** to it, keeping the per-service surface unchanged. Each
`expect<Service>Error` becomes a thin façade over one shared implementation, so
call sites never change and the diff is structural only.

**What to hoist, and what to leave.** Hoist only what is byte-identical. In the
production suite this approach comes from, the shared envelope and the five
error codes with identical values across every service were hoisted; the
business codes were not, because their membership genuinely varies — one service
validates no body, so spreading them would have invented codes it never returns.
The provisioner _logic_ was left in each subclass too: three subtly different
variants existed, and normalising them would have changed behaviour on the test
backbone in a way type-checking alone could not prove safe.

**Extract identical-and-safe now; defer the risky normalisation until it can be
verified.** That restraint is the decision, not the extraction.

**Trade-off.** Deliberate duplication survives in the subclasses, and a reader
may see it as an unfinished refactor. It is the cheaper mistake: a wrong shared
base costs more than duplication across two services.

**How this repo reflects it.** `core` holds exactly the shared envelope, codes,
and base classes. Each service keeps its own schemas and its own error
constants. Duplication between the two packages is left in place on purpose —
sharing a base would make the comparison meaningless.

**Rule of thumb.** Extract when a third case proves the shape, and extract only
the parts that are genuinely identical.

---

## 9. Test the assertion helper, or it can rot silently

**Context.** Every spec routes its assertions through one helper — a validator in
one package, a response wrapper in the other.

**The problem, found by mutation rather than by reading.** Replacing the
status-code check inside the helper with a no-op left **every test passing** in
both packages. The suite verified business codes and response shapes but never
once confirmed that a 403 was actually a 403.

It hid because in this mock the business code and the HTTP status always agree —
asserting `AUTH_FORBIDDEN` incidentally implies 403. Against a real API the two
can diverge, and nothing here would have noticed.

**Decision.** Test the helper directly, feeding it hand-built responses so each
check has to fire: wrong status with right code, right status with wrong code,
payload violating the schema, unknown extra field, error envelope handed to the
success path.

**Reason.** Specs only ever observe "no exception was thrown". A weakened check
inside a shared helper is invisible to all of them at once — the blast radius is
the entire suite, and the failure mode is silence.

**Trade-off.** Tests for test infrastructure, which is a cost and can turn into
navel-gazing if it spreads. Contained deliberately: only the shared helper gets
this treatment, because only it has that blast radius.

**This belongs to neither style.** Both packages had the identical gap, so it is
a property of centralising assertions at all — and it applies to any suite with
a shared assertion helper.

**Where.** `functional-style/tests/core/validator.spec.ts`,
`class-style/tests/response-assert.spec.ts`.

---

## 10. Four CI workflows, split by what triggers them

**Context.** One workflow running everything on every event is the default, and
it is wrong in both directions at once: too slow for a pull request, and too
narrow for anything else.

**Decision.** Split by trigger, because each trigger is asking a different
question.

| Workflow    | Trigger                        | Question it answers                            |
| ----------- | ------------------------------ | ---------------------------------------------- |
| `pr-gate`   | pull request                   | Is this change obviously broken?               |
| `ci`        | push to `main`                 | Is `main` actually green?                      |
| `on-demand` | manual / `repository_dispatch` | What is wrong with _this_ slice?               |
| `scheduled` | weekly cron                    | Has anything rotted while we were not looking? |

**Reason, per workflow.**

**The gate runs smoke, not everything.** Every pull request pays that cost, so it
should buy the checks that catch the most per second. The full suite runs on
merge instead. A gate slow enough to context-switch away from stops being a gate
and becomes something people merge around.

**The scheduled run installs _without_ `--frozen-lockfile`.** Every other
workflow pins the lockfile so a failure means "the code changed". This one
resolves fresh, because a dependency that shifted under us is exactly what it
exists to catch. It is the one place a surprise is useful.

**It is weekly, not nightly.** A daily job on a repo that may go untouched for
weeks trains its owner to ignore the failure mail, and a notification nobody
reads is worse than none. The production suite this approach comes from ended up
pausing its nightly for precisely that reason — which is a stronger argument
than any reasoning from first principles.

**Failures become issues, not email.** Nobody watches a scheduled run. An
existing open issue is commented on rather than duplicated, so a persistent
breakage is one thread instead of ten.

**`repository_dispatch` exists honestly.** In a real setup a deploy pipeline
posts `run-tests` to say "the environment is up, verify it". Here there is no
external environment — the mock ships with the repo — so the trigger demonstrates
the wiring and the workflow's own comments say so. Showing a hook while
pretending it is load-bearing would be worse than not showing it.

**Trade-off.** Four files instead of one, with setup steps duplicated across
them. A composite action or reusable workflow would remove that duplication —
and would be the right call at more workflows or more steps. At four, the
indirection costs more reading than the duplication costs maintenance. This is
decision 8's rule applied to CI: extract when a third case proves the shape.

**A gate on the repo's own claim.** `ci` also runs `check:parity`, which fails if
the two suites stop covering the same number of behaviours. The comparison this
repo is built on only means something if neither side is quietly better tested,
and that has already gone wrong once — `class-style` was missing two
authentication cases. An argument that depends on a property should have that
property checked by a machine.

**Where.** `.github/workflows/`, `scripts/check-parity.mjs`.

---

## 11. Allure for trends; the HTML report for debugging

**Context.** Playwright's own HTML report is excellent at one job: showing what
failed in _this_ run, with the trace. It is not built to answer "is this test
flaky?" or "which service costs us the most triage time?".

**Decision.** Keep both. Playwright's report for debugging a run, Allure 3 for
what accumulates across runs.

**Reason.** They answer different questions and cost almost nothing together —
`allure-playwright` writes results during the same run, and generating the
report is a separate step so a plain `pnpm test` stays fast.

What Allure adds that the built-in report does not:

- **A Behaviors tree** (epic → feature → story) so failures group by service
  rather than by file path.
- **Trend across runs**, via a single `allure-history.json` that Allure writes
  and reads back. No server needed — though see the trade-off about where that
  file should live.
- **One report for both packages.** The suites are merged before generating,
  because comparing them is the entire point — two reports would mean two tabs.

**The labels are derived, not annotated.** Tags already exist for filtering
(`--grep @smoke`), so an auto fixture reads them and stamps the Allure labels.
Annotating ~160 tests by hand would be a second source of truth that drifts the
first time someone forgets one, and specs stay unaware of the reporter
entirely.

**Trade-off.** A dependency and a build step. The trend also needs somewhere to
live: `allure-history.json` is ignored here rather than committed, because
shipping run data from a contributor's laptop is noise and a merge conflict —
which means a fresh clone has no trend until CI accumulates one. That is the
honest state, not a solved problem. Allure is also run-centric: it says nothing across repositories, so an
organisation tracking flakiness over a dozen suites would outgrow it and need
something aggregating — at which point Allure becomes one input rather than the
answer. Not a problem at one repository.

**Where.** `scripts/allure-report.mjs`, `src/utils/allure-meta.ts` (and its
`class-style` twin), the reporter block in both `playwright.config.ts`.

---

## How to add a decision

Keep the shape: **Context → Decision → Reason → Trade-off → Where.** If the
trade-off section is hard to write, the decision probably has not been examined
enough to record yet.
