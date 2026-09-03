# Test strategy

What gets tested, in what order, and what gets cut when there is not time.
[`decisions.md`](decisions.md) covers how the code is shaped; this covers how
the coverage was chosen.

The short version: **risk-first**. Most-likely-to-break and most-expensive-to-
get-wrong come first, then work down. That ordering matters more than any
technique, because it is the only part that still helps when a deadline moves.

## Two levels, and why both

Every test here is one of two kinds.

| Level                    | Answers                                              | Cost                  | Here     |
| ------------------------ | ---------------------------------------------------- | --------------------- | -------- |
| **Isolated** `@isolated` | Does this endpoint honour its contract?              | Fast, easy to debug   | 82 of 97 |
| **Flow** `@flow`         | Does a chain of endpoints reach the right end state? | Slower, catches seams | 15 of 97 |

Isolated tests find bugs faster and with less noise, so they come first.
Flows are promoted from the handful of journeys that actually matter — here,
the reservation lifecycle and the maintenance-log side effect.

**Isolated does not mean "no other calls".** A test for
`POST /reservations/{id}/transitions` still has to create a reservation first.
The distinction is what is being _asserted_, not how many requests it takes to
get there. A prerequisite that fails is a broken setup, not a failed test —
which is why the provisioners throw rather than skip.

## Risk = impact × likelihood

Which behaviours got tests, and how many, came from asking what breaking each
one would cost. The drivers below are not generic advice — each is a place
where a defect was found or would have been expensive to miss.

| Risk driver                   | Why it earns priority                                           | Where it lands here                                                 |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| **State-machine transitions** | An illegal transition corrupts data that later steps trust      | `reservations` — every legal _and_ illegal edge is asserted         |
| **Authorization per role**    | Over-permission is a security defect, not a bug                 | `TRANSITION_ROLES`; `AUTH_FORBIDDEN` asserted per guarded action    |
| **Cross-entity dependency**   | Breaks only in combination — invisible to single-endpoint tests | `maintenance-logs` cannot be created directly; `@cross-service` (5) |
| **Filters and pagination**    | A filter that silently matches everything reads as passing      | `items` — every filter seeds a match **and** a non-match            |
| **Shared assertion helpers**  | If the helper stops checking, every test using it goes vacuous  | `@core` (13) — the helpers have their own tests                     |

Deliberately deprioritised: response-field ordering, exhaustive optional-field
permutations that share one validation path, and free-text `maxLength` with no
stated oracle. Each would add tests without adding information.

### Two gaps that were found by asking this question

Both come from [decision 9](decisions.md#9-test-the-assertion-helper-or-it-can-rot-silently)
and the mutation log, and both had passed review:

- A `category` filter test passed **with the filter deleted**, because run
  alone the store happened to hold only matching rows. Hence the rule: a filter
  test seeds a non-match too.
- The status-code assertions in `BaseValidator` could be removed entirely with
  all 67 tests still green. Hence `@core` — the helper every other test leans
  on now has tests of its own.

## Validation errors versus business errors

They look alike in a response body and are worth very different amounts.

| Kind                 | Example                                | Cause                                      |
| -------------------- | -------------------------------------- | ------------------------------------------ |
| **Business error**   | Illegal transition, role not permitted | Request is well-formed; a rule rejected it |
| **Validation error** | Missing field, wrong type              | Request is malformed                       |

**Business errors: always test.** Each maps to a distinct behaviour, and each
is a decision someone made that could have gone the other way.

**Validation errors: ask one question first —** _does every invalid input
return the same code?_

- **Same code for all** → one representative case, and a comment saying so.
- **A distinct code per field** → one case per field; each is a separate
  contract.

This contract is a third variant, and it is the reason the rule is phrased as a
question rather than a rule. Everything invalid returns `VALIDATION_FAILED`
— one code — but the body carries a `fields` array naming what was wrong. So
one representative test covers the _code_, and the tests that matter assert
that **`fields` names the offending field**. A single code with no detail would
be one test; a code per field would be one test each; this is neither.

Unknown properties in a request body are not tested. The contract marks
resources `additionalProperties: false`, so the schema already rejects them —
a test would assert what Zod asserts.

## Which technique produces which test

Risk decides _what_ to test first. Technique decides _which cases_ to write once
a field is worth testing at all — and naming it is what makes coverage arguable
rather than a matter of taste.

Three do nearly all the work here:

| Technique                         | Answers                                  | In this suite                                        |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| **Equivalence partitioning** (EP) | Which inputs are interchangeable?        | absent / `null` / `''` / `'   '` on `name`           |
| **Boundary value analysis** (BVA) | Where exactly does valid become invalid? | `name` at 2, 3, 80, 81; `dailyRateCents` at −1 and 0 |
| **State transition**              | Which moves are legal from here?         | every reservation edge, legal and illegal            |

**EP is why the four empty-ish `name` cases exist.** They look like one case —
"no useful name" — and they are four partitions, because the API treats them
differently: absent and `null` fail _required_, `''` fails _minLength_, and
`'   '` is accepted. One test for "empty name" would have covered whichever
partition the author happened to pick and missed the interesting one.

**BVA is why both sides of every limit are asserted.** A test for `name: 'ab'`
alone passes whether the limit is 3 or 30 — it only proves _something_ rejects
short names. Pairing it with `'abc'` accepted is what pins the boundary, so an
off-by-one in either direction fails one of the pair. `dailyRateCents` gets the
same treatment at `0` and `-1`.

**State transition is why `reservations` is nearly the largest service here**
despite having the fewest fields to validate. The
[transition table](../packages/shared-contract/src/domain.ts) has six states,
and the test asserts every legal edge _and_ that every illegal one is refused —
derived from a table written by hand in the spec, deliberately not from the
shipped one, or it would agree with whatever the code says.

Two techniques are deliberately absent. **Pairwise** earns its place when a
feature has three or more independent parameters with several values each; the
widest thing here is `GET /items`, with three filters and two paging
parameters — enough to qualify on a count, but the filters do not interact:
each narrows the set independently, so a pair adds nothing a single filter test
did not already cover. Pairwise pays when combinations behave differently from
their parts. **Decision tables** pay off
when several conditions combine into one outcome — the role checks here are a
single condition each.

## Scope tiers: why there is only one here

The suite this repo is drawn from runs three nested tiers, each answering a
different question at a different moment:

```
@smoke ⊂ @acceptance ⊂ @regression
```

| Tier          | Question                                    | When               |
| ------------- | ------------------------------------------- | ------------------ |
| `@smoke`      | Is the service alive on its critical paths? | pre-deploy         |
| `@acceptance` | Is this build good enough to accept?        | post-deploy        |
| `@regression` | Did anything at all change?                 | full gate, nightly |

**This repo has `@smoke` and nothing above it, on purpose.**

A tier is only worth having when running the tier below it _saves something_ —
almost always time. At 12 services and a suite measured in minutes, the gap
between "verify the deploy" and "run everything" is real, and `@acceptance`
earns its place by filling it. Here the full suite is **97 tests in under three
seconds**. There is no time to save, so a middle tier would be a label that
sorts tests without ever changing what anyone runs.

`@regression` is the same argument taken further: it would mean "everything
that is not smoke", which `--grep-invert @smoke` already says. It was in fact
[documented here for a while and used by nothing](../CONTRIBUTING.md) — a tag
table listing a filter that silently matches zero tests is worse than no table,
so it was removed and `check:parity` now fails if that drifts again.

`@smoke` survives because it does change what runs: the PR gate runs those six
and nothing else.

**The transferable part is the test, not the answer.** Ask what running the
smaller set actually saves. If the answer is "nothing measurable", the tier is
bookkeeping.

## What is deliberately not covered

A gap nobody wrote down is indistinguishable from a gap nobody noticed, so:

- **No performance or load testing.** The mock is in-process; any number it
  produced would describe this laptop. An earlier draft asserted a response-time
  ceiling that was never implemented — the comment outlived the behaviour, which
  is exactly the failure [rule 5](../CLAUDE.md) exists to prevent.
- **No security scanning.** Authorization _rules_ are tested (roles, forbidden
  transitions); the transport is not, because there is none.
- **No contract-drift detection against a live service.** `openapi.yaml` is the
  arbiter and the mock implements it, so drift is impossible by construction —
  and that is a property of the bundled mock, not something this suite verifies.
- **No `@acceptance` tier**, for the reason above.

## Where this came from

The reasoning here is extracted from production work, where it is applied at a
larger scale — see [`provenance.md`](provenance.md) for what travelled and what
was deliberately left behind.
