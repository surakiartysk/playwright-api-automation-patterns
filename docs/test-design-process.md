# How test cases get designed

[`test-strategy.md`](test-strategy.md) says what gets tested and in what order.
This says how that decision is _made_ — and, more usefully for a reader, how
much of that process is worth carrying into a repo this size.

## The process at full size

On a larger effort — many services, a contract owned by someone else, several
releases — test design is worth splitting into steps, each producing something
the next one reads: what is in scope, the cases each risk area gets, and a
review that the cases still match the requirements.

The step that earns its keep is the review. A traceability matrix — one row per
requirement, listing the cases that cover it — is less about proving coverage
than about catching _"edited one artifact, forgot the dependent"_: a requirement
that changed and left its test cases describing the old behaviour. That failure
is invisible in a code review, because both files are individually consistent.

## What this repo keeps, and what it drops

**Dropped: the requirement traceability matrix.**

An RTM maps _requirements_ to _tests_. Here there is no requirements document
to map from — [`openapi.yaml`](../packages/shared-contract/openapi.yaml) is the
requirement, and it is machine-readable. A matrix tracing tests back to a
schema that the tests already validate against would restate the contract in a
second, hand-maintained format that can go stale. That is ceremony, and
[rule 6](../CLAUDE.md) says not to.

The thing an RTM protects against — an artifact drifting from its dependents —
is real here too. It is handled by making drift _fail a build_ instead:

| Drift                                           | What catches it  |
| ----------------------------------------------- | ---------------- |
| One suite gains a behaviour, the other does not | `check:parity`   |
| A tag documented but used by nothing            | `check:parity`   |
| The advertised test count going stale           | `check:parity`   |
| The contract and the mock disagreeing           | the suite itself |

Same intent, without a hand-maintained artifact to keep in sync.

**Dropped: design steps as documents.**

Separate design documents are right when a service takes weeks and several
people read the output. For three services designed in one pass, the steps
collapse into the order the work is done: contract first, then the mock, then
the tests — stated in [`CLAUDE.md`](../CLAUDE.md) as four steps rather than
separate documents.

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
nobody reads; no RTM across many services is a gap that shows up as a
requirement silently losing its coverage six months later.

The transferable skill is not the matrix. It is knowing which of the two
situations you are in.
