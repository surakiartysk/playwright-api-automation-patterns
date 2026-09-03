# CLAUDE.md

Working notes for AI assistants (and humans) contributing here.

Deliberately one short file. Three services and no team; the layered steering
docs a large suite needs would be ceremony here, and would contradict the rule
below about not abstracting ahead of evidence. Grow this file only when something
actually goes wrong twice.

## What this repo is

A portfolio piece: the same API suite built two ways against one contract, so the
approaches can be compared. The audience is engineers who will read the reasoning
and ask about it — so **`docs/decisions.md` is the deliverable, not an artifact of
the code**. Anything that cannot be explained in an interview does not belong here.

`packages/shared-contract` — `openapi.yaml` (the arbiter) + the Hono mock implementing it
`packages/functional-style` — classes only for the AOM layer; functions and fixtures elsewhere
`packages/class-style` — the class-first comparison; one context per service

The two test packages share **nothing but the contract**. Never import one from
the other — a common base would make the comparison meaningless. Duplication
between them is the experiment's control, not an oversight to clean up.

Any change to behaviour must land in **both** packages, or the comparison stops
being fair. Diff the test names when unsure.

## Non-negotiables

**1. Nothing from the source material.** Patterns and reasoning travelled from
production work; code, endpoints, field names, and business rules did not. Same
for third-party training material — licensed for study, not redistribution.
`pnpm check:leak` enforces a vocabulary denylist on every CI run. If it fires on
innocent code, narrow the pattern in `scripts/check-leak.mjs` — never work around
it by renaming a variable.

**2. Every test must be proven able to fail.** A green suite means nothing until
you have watched it go red for the right reason. Before claiming a spec is done,
break the mock behaviour it targets and confirm the failure, then restore. This
has already caught two vacuous assertions that read as correct:

- a `category` filter test that passed with the filter deleted, because run alone the store held only matching rows
- a token-expiry check that could be removed entirely with nothing failing

When asserting a filter, seed both a match **and** a non-match. When asserting a
listing, assert against data the test created — never global counts.

**3. Tests share one backend.** One mock process serves every worker, and there
is no reset endpoint (a reset would wipe state from tests running in parallel).
Isolation comes from unique test data, which is also how a suite must behave
against a shared real environment. **Every spec file must pass on its own**, not
only as part of a full run.

**4. Same result every run, in any order.** A test that fails intermittently is
worse than no test: it trains people to ignore red, and once red is ignored the
suite has stopped working regardless of how much it covers. Never make a flaky
test pass by retrying it — a retry converts a real failure into a slow one.
Assert what the contract actually promises, not an exact value that is merely
usual: `createdAt` gets equality because it must not move, `updatedAt` gets `>=`
because only advancement is guaranteed. Verify with
`--repeat-each=5 --workers=12` before believing a suite is stable; that is how
the `pageSize` assumption in decision 9 was found. See
[docs/triage.md](docs/triage.md).

**5. Comments must be true.** A comment describing behaviour that does not exist
is worse than no comment — a reader will believe it and ask about it. An earlier
draft documented a "hard ceiling that fails the assertion" for response times
that was never implemented. If you remove behaviour, remove its comment.

**6. Class only where state lives.** `BaseClient` is a class because it carries
config, token, and request context. `BaseValidator` is a class only so services
can bind their schemas by extending it — it has no constructor and no state.
Tests, fixtures, and data builders stay functions. No singletons, no
module-level instances, no `beforeEach` wiring.

**7. Do not abstract ahead of evidence.** Duplication across two services is
cheaper than the wrong shared base. Extract when a third case proves the shape,
and extract only the parts that are genuinely identical.

## Adding a service

1. Define it in `openapi.yaml` first — the contract is the arbiter.
2. Implement it in the mock, enforcing only what tests assert: state transitions,
   validation naming the offending field, role gates, cross-service side effects.
   Not persistence, real crypto, rate limiting, or pricing math.
3. `src/services/<svc>/`: `types.ts` → `schemas.ts` → `<Svc>Client.ts` → `<Svc>Validator.ts` → `factory.ts`
4. `tests/<svc>/fixtures.ts` composing `@fixtures/base`, then specs.
5. Mutation-test the new behaviour (see #2), then `pnpm verify`.

Query types must be `type` aliases, not `interface` — only aliases get the
implicit index signature that satisfies `QueryParams` without a cast.

## Commands

```bash
pnpm verify        # what CI runs: format, lint, types, leak check, tests
pnpm test          # all packages
pnpm check:leak    # vocabulary tripwire alone
```

## Working style

Propose an approach and say what it costs, not just what it does. Expect
pushback; disagreement about trade-offs is the point of this repo, and several
decisions in `docs/` came from arguing one down. Do not report work as complete
without running `pnpm verify` — and do not describe a test as passing without
having seen it fail first.
