# Architecture

How the repo fits together, and which part demonstrates what.

## The shape

```
packages/
  shared-contract/          the fictional API — contract + mock
    openapi.yaml            written first; the arbiter when anything disagrees
    src/domain.ts           state machine as data; role table
    src/mock/               Hono, in-process, started by Playwright

  functional-style/         classes for the API surface, functions elsewhere
    src/core/               BaseClient, BaseValidator, envelopes, codes
    src/services/<svc>/     types → schemas → Client → Validator → factory
    src/fixtures/base.ts    worker-scoped tokens, per-test request context
    tests/<svc>/            specs, per-service fixtures, provisioners

  class-style/              the same three services, class-first
    src/core/               HttpClient, ResponseAssert, ServiceContext
    src/services/<svc>/     one <Svc>Context.ts per service
    src/support/            fixtures, random data, tokens
    tests/                  one spec per service
```

The two test packages share **nothing but the contract**. That is deliberate: two
styles built on a common base would be one style with two spellings.

## The dependency direction

```
openapi.yaml
     │  (the arbiter — mock and both suites conform to it)
     ├──────────────┬──────────────────┐
     ▼              ▼                  ▼
   mock       functional-style     class-style
     ▲              │                  │
     └──────────────┴──────────────────┘
              tests run against the mock
```

Nothing points back at the suites. Change the contract and three things must
follow; change a suite and nothing else moves.

## Which service demonstrates what

Each service was chosen for a different structural problem, not for coverage.

| Service            | Shape                    | What it demonstrates                                                                                                                                     |
| ------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`            | Baseline CRUD            | The reference implementation. Read this first — it is the smallest complete example of the layering.                                                     |
| `reservations`     | State machine            | A provisioner that walks a resource through real API calls; exhaustive transition guards; `test.step` flows.                                             |
| `maintenance-logs` | Cross-service dependency | Composition forced by the contract — a log exists only as a side effect of a reservation reaching `CHECKED_OUT`, and there is no endpoint to create one. |

`auth` is infrastructure behind the worker-scoped token fixture, not a showcase.

## The state machine

The reservation lifecycle is the repo's most-tested behaviour.

```
DRAFT ──confirm──▶ CONFIRMED ──check_out──▶ CHECKED_OUT ──return──▶ RETURNED ──close──▶ CLOSED
  │                    │
  └──cancel───────────-┴──▶ CANCELLED
```

`CLOSED` and `CANCELLED` are terminal. `cancel` is legal only from `DRAFT` or
`CONFIRMED`.

It is encoded as **data** in `domain.ts` rather than as branching in the
handlers, which is what lets a rejected transition answer with the actions that
_would_ have been legal. Tests assert on that list, so it is contract rather than
courtesy.

Each transition also moves the item:

| Transition         | Item becomes                                         |
| ------------------ | ---------------------------------------------------- |
| `confirm`          | `RESERVED`                                           |
| `check_out`        | `CHECKED_OUT` + a maintenance log opens              |
| `return`           | `MAINTENANCE` — returned is not the same as rentable |
| `close` / `cancel` | `AVAILABLE`                                          |

Resolving the log returns the item to `AVAILABLE`, which closes the loop.

## Two layers of defence against vacuous tests

A green suite proves nothing on its own. Two mechanisms make that claim
checkable.

**Mutation testing.** Break one behaviour in the mock, confirm the suite goes
red, restore. Every behaviour asserted here has been through it, and both
packages produce the same failure counts — see [comparison.md](comparison.md).
Three findings came from this that reading the code did not surface, including
one where a rewritten test still could not fail.

**Testing the assertion helper.** Specs only observe "no exception was thrown",
so a weakened check inside the shared helper is invisible to all of them at
once. Both packages test their helper directly — see decision 9.

## Isolation without a reset

One mock process serves every worker, and there is deliberately **no reset
endpoint**: a reset would clear state out from under tests running in parallel.

Isolation comes from each test creating uniquely-named data and asserting only
against what it created. That is also how a suite must behave against a shared
real environment, so the constraint is a feature.

Two rules follow, and both are enforced by review:

- When asserting a filter, seed a **match and a non-match**. Asserting only that
  everything returned matches will pass against a deleted filter whenever the
  store happens to hold nothing else — which is exactly the case when a spec runs
  alone.
- Never assert on global counts. Claims about totals are claims about what other
  tests happened to create.

Every spec file passes on its own as well as in a full run.

## Running it

```bash
pnpm install && pnpm test     # both suites, mock started automatically
pnpm test:functional          # one package
pnpm test:class
pnpm verify                   # what CI runs
```

## Further reading

| Document                         | Contents                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| [decisions.md](decisions.md)     | **Read first** — why every convention exists, with its cost |
| [comparison.md](comparison.md)   | The two styles scored against each other, with measurements |
| [qa-workflow.md](qa-workflow.md) | How the suite is operated — triggers, reporting, triage     |
| [provenance.md](provenance.md)   | Where this came from, and how AI was used                   |
| [../CLAUDE.md](../CLAUDE.md)     | Working rules for contributors, human or AI                 |
