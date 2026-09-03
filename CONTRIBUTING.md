# Contributing

Conventions here are enforced rather than described, so most of this page is
about what runs and when.

For the _why_ behind any convention, see [docs/decisions.md](docs/decisions.md).
For the rules a change must not break, see [CLAUDE.md](CLAUDE.md).

## Setup

```bash
pnpm install
```

That is the whole setup. No backend to provision, no credentials, no `.env` —
the suite ships the API it tests against. `pnpm install` also installs the git
hooks via `prepare`.

## Running tests

| Command                | Runs                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `pnpm test`            | Both packages, full suite                                  |
| `pnpm test:functional` | `functional-style` only                                    |
| `pnpm test:class`      | `class-style` only                                         |
| `pnpm test:smoke`      | `@smoke` in both — the critical paths                      |
| `pnpm test:debug`      | Both, with HTTP logging (`DEBUG_API=true`)                 |
| `pnpm verify`          | Everything CI runs: format, lint, types, leak check, tests |

Inside a package, the Playwright CLI works as usual:

```bash
cd packages/functional-style
pnpm exec playwright test --grep @reservations     # one service
pnpm exec playwright test tests/items/read.spec.ts # one file
pnpm exec playwright test --workers=1              # serialised, to inspect a suspected race
pnpm exec playwright test --repeat-each=3          # hunting flakiness
pnpm exec playwright show-report                   # last HTML report
```

### Tags

Three independent axes. A test carries one from each of the first two, and
`@cross-service` when it applies.

```
importance    @smoke (6)
kind          @isolated (82)  |  @flow (15)
domain        @items (40)  |  @reservations (35)  |  @maintenance-logs (9)  |  @core (13)
scope         @cross-service (5) — orthogonal to the rest
```

| Tag              | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `@smoke`         | Critical paths. The PR gate runs these.                          |
| `@isolated`      | Single-endpoint contract tests                                   |
| `@flow`          | Multi-step scenarios                                             |
| `@<service>`     | Domain — `@items`, `@reservations`, `@maintenance-logs`, `@core` |
| `@cross-service` | The test asserts an effect that crosses a service boundary       |

**There is deliberately no `@regression` and no priority tag.**

`@regression` would mean "everything that is not smoke", which
`--grep-invert @smoke` already expresses. It earns its place in a suite large
enough to need a nightly subset; at 97 tests running in under three seconds
there is nothing to subset.

Priority tags (`@high` / `@medium` / `@low`) decay: nobody labels their own
test low, so within months everything is high and the label stops carrying
information. Allure severity is derived from `@smoke` instead — one source,
and it cannot drift from what CI actually gates on.

Add a tag when a query someone actually runs cannot be expressed without it.

## Quality gates

### Local, on commit

| Hook         | Runs                                              | Why                                                     |
| ------------ | ------------------------------------------------- | ------------------------------------------------------- |
| `pre-commit` | `lint-staged` — eslint + prettier on staged files | Under a second. Keeps mechanical noise out of the diff. |
| `commit-msg` | `commitlint`                                      | The history is part of what this repo demonstrates.     |

The pre-commit hook deliberately does **not** run the tests. A hook slow enough
to be annoying gets bypassed with `--no-verify`, and a hook people routinely
skip is worse than no hook. Correctness is CI's job.

### Commit format

```
<type>(<scope>): <subject>
```

Scopes are a closed list in [`commitlint.config.mjs`](commitlint.config.mjs) —
`contract`, `mock`, `functional-style`, `class-style`, the service names, `core`,
`ci`, `deps`. An open list drifts into near-synonyms; adding one should be a
decision.

The body is where the reasoning goes. Commits here explain _why_, because that is
the part a future reader cannot reconstruct from the diff.

### CI

Four workflows, split by what triggers them.

| Workflow    | Trigger                       | Runs                                        | Why this split                                                 |
| ----------- | ----------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `pr-gate`   | pull request                  | leak → format → lint → types → **smoke**    | Fast feedback. A gate you wait on stops being a gate.          |
| `ci`        | push to `main`, manual        | **full suite** on Node 22 + 24, then parity | The full cost, paid once, on the branch that matters.          |
| `on-demand` | manual, `repository_dispatch` | a chosen style + tag + worker count         | Triage, and the hook another system would call after a deploy. |
| `scheduled` | Mondays 01:00 UTC             | full suite with **unpinned** dependencies   | Catches decay, not regressions. Opens an issue on failure.     |

Two details worth knowing:

- **`scheduled` installs without `--frozen-lockfile` on purpose.** Every other
  workflow pins for reproducibility; that one resolves fresh because catching a
  dependency that broke us is the entire reason it exists.
- **`ci` runs `check:parity`.** Both suites must cover the same number of
  behaviours, or the comparison in [docs/comparison.md](docs/comparison.md) is
  not a fair one. This has already caught a real gap.

## Adding a service

1. Define it in `openapi.yaml` first — the contract is the arbiter.
2. Implement it in the mock, enforcing only what tests assert.
3. Add it to **both** packages. A behaviour in one and not the other breaks the
   comparison, and `check:parity` will fail the build.
4. Mutation-test the new behaviour: break it in the mock, watch the suite go
   red for the right reason, restore.
5. `pnpm verify`.

Step 4 is not optional. A green test proves nothing until it has been seen
failing — see decisions 8 and 9 for two cases where a test that looked correct
could not fail at all.
