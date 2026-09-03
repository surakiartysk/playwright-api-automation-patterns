# How test cases get designed

[`test-strategy.md`](test-strategy.md) says what gets tested and in what order.
This says how that decision is _made_ — and, more usefully for a reader, how
much of that process is worth carrying into a repo this size.

## The process at full size

At the scale this reasoning came from — twelve services, a contract owned by
someone else, several releases — designing a service's tests runs as phases
with a gate between each:

```
scope ──▶ breakdown ──▶ review ──▶ export
 │           │             │          │
 what is    features,    does it    the test
 in, what   risk,        hold       catalogue
 is out     TC budget    together?
```

Each phase writes an artifact the next one reads, and a gate refuses to let
work move on while the previous artifact is incomplete. The two that carry the
most weight:

**Breakdown** assigns each feature block a _risk profile_ and a _test-case
budget_ from it. The budget is the point: without one, coverage drifts toward
whatever was easy to write. A block over ~15 cases usually wants splitting; an
average over ~4 cases per block usually means over-testing something cheap.

**Review** is where a traceability matrix earns its keep — one row per
requirement, listing the cases that cover it. Its real job is not proving
coverage to an auditor. It is catching _"edited one artifact, forgot the
dependent"_: a requirement that changed and left its test cases describing the
old behaviour. That failure is invisible in a code review, because both files
are individually consistent.

A script checks the mechanical half — every requirement marked covered names at
least one case, every case referenced exists, the counts agree. Judgement stays
with a person; arithmetic does not.

## What this repo keeps, and what it drops

**Dropped: the requirement traceability matrix.**

An RTM maps _requirements_ to _tests_. Here there is no requirements document
to map from — [`openapi.yaml`](../packages/shared-contract/openapi.yaml) is the
requirement, and it is machine-readable. A matrix tracing tests back to a
schema that the tests already validate against would restate the contract in a
second, hand-maintained format that can go stale. That is ceremony, and
[rule 7](../CLAUDE.md) says not to.

The thing an RTM protects against — an artifact drifting from its dependents —
is real here too. It is handled by making drift _fail a build_ instead:

| Drift                                           | What catches it  |
| ----------------------------------------------- | ---------------- |
| One suite gains a behaviour, the other does not | `check:parity`   |
| A tag documented but used by nothing            | `check:parity`   |
| The advertised test count going stale           | `check:parity`   |
| Vocabulary from the source material             | `check:leak`     |
| The contract and the mock disagreeing           | the suite itself |

Same intent, one-tenth the machinery, and no artifact to keep in sync by hand.

**Dropped: phase gates as documents.**

Four artifacts per service is right when a service takes weeks and several
people read the output. For three services designed in one pass, the gates
collapse into the order the work is done: contract first, then the mock, then
the tests — stated in [`CLAUDE.md`](../CLAUDE.md) as four steps rather than
four documents.

**Kept: everything that changes what gets written.**

- Risk drives order, and what is cut first — see
  [test-strategy.md](test-strategy.md#risk--impact--likelihood).
- Coverage decisions are recorded, including the gaps. A gap nobody wrote down
  is indistinguishable from one nobody noticed.
- Design happens against the contract, before the tests. The contract is the
  arbiter; a test that disagrees with it is wrong by definition.
- Every test is proven able to fail before it is believed. That is the one
  practice here that no artifact can replace — see
  [CONTRIBUTING.md](../CONTRIBUTING.md).

## The judgement being demonstrated

Scaling a process down is a decision, not a shortcut, and it is the part worth
asking about. An RTM at three services is overhead that produces a document
nobody reads; no RTM at twelve services is a gap that shows up as a
requirement silently losing its coverage six months later.

The transferable skill is not the matrix. It is knowing which of the two
situations you are in.
