# API Test Automation — one contract, two styles

The same API suite built twice, so the approaches can be read side by side:

- **`functional-style`** — classes only for the API Object Model, where state
  genuinely lives; functions and fixtures everywhere else.
- **`class-style`** — the same three services modelled class-first, with client,
  assertions, and data builder grouped into one context per service.

Both cover the same behaviours, run under the same settings, and catch the same
defects — 97 tests each, verified by mutating the mock and checking that both
suites fail identically.

The interesting part is not that they pass. It is **why each is shaped the way it
is** — start with [`docs/decisions.md`](docs/decisions.md) if you have five
minutes and want the reasoning rather than the code, or
[`docs/comparison.md`](docs/comparison.md) for the two styles scored against each
other with measurements.

> The most transferable thing here is probably decision 9: removing the
> status-code check from the shared assertion helper left **every test passing**
> in both packages. That is a property of centralising assertions, not of either
> style.

## Provenance

The architecture here comes from production API automation at work, where I am
the sole author — I started the project, designed it, and made every convention
and architectural call in it; the QA team works in what I built.
**The approach travelled; the code and the business context did not.** Everything
in this repository — the domain, the contract, the mock, every test — is written
from scratch against a fictional equipment-rental API. No employer endpoint,
field name, business rule, or line of source appears anywhere, and
[`scripts/check-leak.mjs`](scripts/check-leak.mjs) enforces that on every CI run
rather than leaving it to good intentions.

I work with AI here and at work, and not as a code generator: it proposes an
approach, I push back on it — why not the other way, what breaks at scale, what
does this cost us later — and I decide. Several decisions in `docs/` are ones I
argued the model out of, and a few are ones it changed my mind on. The
architecture, the trade-offs, and the judgement about what may be published are
mine, and I can talk through any line of it.

## Quick start

No backend, no credentials, no environment setup — the suite carries its own API.

```bash
pnpm install && pnpm test
```

Playwright starts the bundled mock, runs the suite against it, and shuts it down.
That property is deliberate: a reviewer should be able to clone this and see it
run within a minute, and CI should need no secrets.

```bash
pnpm test:functional   # one package only
pnpm test:class
pnpm verify            # everything CI runs: format, lint, types, leak check, tests
```

## Layout

```
packages/
  shared-contract/     openapi.yaml — written first, the arbiter for everything
                       src/mock/    — Hono in-process API implementing it
  functional-style/    src/core/    — BaseClient, BaseValidator, Zod schemas
                       src/services/— one client + validator per service
  class-style/         src/core/    — HttpClient, ResponseAssert, ServiceContext
                       src/services/— one context per service
scripts/check-leak.mjs vocabulary tripwire, wired into CI
```

## Which service demonstrates what

Each was chosen for a different structural problem, not for coverage.

| Service            | Shape                    | Why it earns its place                                                      |
| ------------------ | ------------------------ | --------------------------------------------------------------------------- |
| `items`            | Baseline CRUD            | The reference — smallest complete example of the layering. Read this first. |
| `reservations`     | State machine            | Provisioner walking real API state; exhaustive transition guards.           |
| `maintenance-logs` | Cross-service dependency | Composition forced by the contract — no endpoint creates a log.             |

`auth` exists as infrastructure behind the worker-scoped token fixture, not as a
showcase.

## Documentation

| Document                                              | Contents                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| [decisions.md](docs/decisions.md)                     | **Start here** — 11 decisions, each with its cost stated           |
| [comparison.md](docs/comparison.md)                   | The two styles scored, with measurements and a verdict             |
| [architecture.md](docs/architecture.md)               | How it fits together; the state machine; isolation without reset   |
| [test-strategy.md](docs/test-strategy.md)             | What is tested and in what order — risk-first, and what is cut     |
| [test-design-process.md](docs/test-design-process.md) | How cases get designed, and what was scaled down                   |
| [triage.md](docs/triage.md)                           | What to do when the suite goes red, and oracles for varying values |
| [qa-workflow.md](docs/qa-workflow.md)                 | How a run gets triggered, by whom, and where the result goes       |
| [provenance.md](docs/provenance.md)                   | Where this came from, and how AI was used                          |

## The companion repository

A suite has to be _operated_, not only written. That half is published
separately:

**`playwright-run-dashboard`** — self-service test
running: a developer picks a slice, presses Run, and gets a link to the report
without waiting for QA. Four roles — including a `demo` role that can never
trigger a real run, which is why its password is safe to publish — and the
authorisation that makes self-service safe.

The two meet at one point: that dashboard dispatches this repo's
`on-demand.yml`, and this repo's workflow posts its result back to its
`/webhook`. They share nothing else — this one stays clonable with no
infrastructure, which is why the dashboard is not in it.

## License

MIT — see [LICENSE](LICENSE).
