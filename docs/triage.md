# When the suite goes red

A failing test names a symptom, not an owner. This is the step between _"tests
ran"_ and _"someone fixes something"_ — and getting it wrong is expensive in
both directions: a defect filed against the backend that turns out to be our own
bad assertion costs a team's afternoon, and a real defect waved off as "probably
flaky" ships.

Every example below happened in this repository. Nothing here is illustrative.

## Five owners, ruled out cheapest first

| Class          | What it means                                                   | Who fixes it         |
| -------------- | --------------------------------------------------------------- | -------------------- |
| **ENV**        | Infrastructure, not behaviour — the run never really happened   | whoever runs it      |
| **FLAKY**      | Intermittent, order-dependent, or an oracle that can't be exact | us — reliability     |
| **TEST-BUG**   | The test is wrong: bad assertion, bad data, wrong expectation   | us — the test        |
| **SPEC-GAP**   | The contract is wrong, incomplete, or ambiguous                 | whoever owns it      |
| **API-DEFECT** | The contract is clear and the implementation violates it        | whoever owns the API |

**The order is the method.** Work top-down, ruling out the cheapest and most
common false alarms first:

```
Did it run at all?          ── no ──▶  ENV
        │ yes
Does it fail consistently?  ── no ──▶  FLAKY
        │ yes
Is our assertion correct?   ── no ──▶  TEST-BUG
        │ yes
Does the contract say?      ── no ──▶  SPEC-GAP
        │ yes
                                    API-DEFECT
```

Running it in the other direction is the expensive mistake: start by assuming
the API is broken and every flaky test becomes a bug report someone has to close.

> **A red test is never fixed by a retry.** Blanket retries convert a real
> failure into a slow one. The only honest responses are: fix it, or record it
> as a known defect that stays red on purpose.

## Worked examples from this repo

### FLAKY on the surface, SPEC-GAP underneath

**Symptom.** One test in 246 failed under `--workers=8 --repeat-each=3`. Every
earlier run had been green.

**Ruling out.** Not ENV — the other 245 ran. It looked like FLAKY, and by the
letter of the definition it was: intermittent and load-dependent.

Stopping there would have been wrong. Eight listing assertions fetched
`pageSize: 100` and filtered locally for the row the test had just created —
which looks like the isolation rule ("assert only on your own data") but smuggles
in a second assumption: **that the row lands on that page.** With enough parallel
workers the store outgrows 100 items and it does not.

**The real class was SPEC-GAP.** `GET /items` had no way to ask for one known
row, which forced every caller — not just tests — to page through everything and
filter client-side. The fix was a `sku` filter added to the contract, the mock,
and both suites, not a bigger page.

**What this shows:** flakiness under load is often a design assumption that was
never true, only never contradicted. See commit `6cd8de2`.

### TEST-BUG that no failure would ever have revealed

**Symptom.** None. Everything was green.

A `category` filter test passed **with the filter deleted from the mock**. Run
alone, the store happened to hold only matching rows, so the assertion was true
for a reason unrelated to the behaviour.

This is the failure mode that never appears in a triage queue, because a vacuous
test does not go red. The only way to find it is to break the thing on purpose
and check the test notices — which is why
[every test here must be proven able to fail](../CONTRIBUTING.md).

**The rule that came out of it:** when asserting a filter, seed a match **and** a
non-match. The `sku` fix above added the empty case for exactly this reason —
without it, a filter that silently ignored `sku` would still have satisfied every
other test, since they only ever ask for skus that exist.

### ENV — the run that reported nothing

**Symptom.** `pnpm allure` exited zero and produced no usable report.

The history file had been reformatted by Prettier before the ignore rules caught
up, so Allure could not parse its own output and generation crashed. Separately,
results had accumulated to 3,401 files across runs because the reporter appends.

Neither is a test failure. Both would have been invisible to anyone checking
exit codes — the lesson being that **a green exit is not evidence the run
reported anything.** Verified by opening the report in a browser, not by grep.
See commit `3993c00`.

### API-DEFECT is the thinnest section here, on purpose

In production this is the class that matters most: the contract is clear, the
backend disagrees with it, and a bug report goes to another team.

**It barely exists in this repo, because the "backend" is a mock in this
repository, written to satisfy the same contract the tests read.** A mismatch
here is caught the moment it is introduced, and fixing it is a commit rather
than a ticket. That is a property of bundling the mock
([decision 6](decisions.md#6-bundle-a-mock--the-opposite-of-what-the-same-question-needs-at-work)),
not a claim that this class is unimportant.

The distinction still shapes the tests: assertions are on the **stable business
code** (`AUTH_FORBIDDEN`, `VALIDATION_FAILED`), never on `message`, so a wording
change is not a red suite.

## Where the expected value comes from

Before a failure can be classified, something has to have said what the right
answer was. Three situations, and conflating them is how a suite quietly gets
weaker:

**1. The contract states the rule.** Derive the expectation at design time, from
the contract, and do not wait for a run to learn it. If the implementation
disagrees, that is an API-DEFECT and the test **stays red on purpose** — it is
not weakened to match, because a test rewritten to agree with a bug is a test
that now guards the bug.

Marked with a one-line comment naming what is wrong, not a special category. No
`test.fail`, no banner. A red test in a suite that is otherwise green already
says "still broken"; the comment only has to say _what_.

**2. The contract is silent.** You cannot derive an expectation from silence, so
probe the running API, assert the behaviour you observe, and get the contract
updated to say so. This is **not** a defect and not a weakened test — there was
no stated rule to disagree with.

This repo has one: `minLength: 3` said nothing about whether a name is trimmed,
so `'   '` was accepted with nobody having decided it should be. Probing found
it, the contract now
[states it](../packages/shared-contract/openapi.yaml), and a test holds it
there. Silence is a defect class of its own — a gap in the contract rather than
in the code — and the fix is to close the gap, not to skip the case.

**3. The behaviour cannot be reached.** Some cases need a precondition the
environment will not produce — a token that expired an hour ago, a clock moved
forward a week. Skip with the reason and the manual procedure written down,
rather than faking the precondition. A fabricated state passes against a machine
that would have failed, which is worse than a gap you can see.

Nothing here is skipped for that reason today: the mock is bundled, so any state
the API can reach, a test can reach. That is a property of
[decision 6](decisions.md#6-bundle-a-mock--the-opposite-of-what-the-same-question-needs-at-work),
and it stops being true the moment a suite points at a real environment.

## Oracles for values that legitimately vary

The single largest cause of flakiness is asserting an exact value on something
that is allowed to change. The fix is not a retry or a `waitFor` — it is
choosing an oracle that matches what the contract actually guarantees.

| The value                | Bad oracle             | What the contract really promises         |
| ------------------------ | ---------------------- | ----------------------------------------- |
| Generated id             | equals a literal       | present, and matches a shape              |
| `createdAt`              | equals a fixed instant | **unchanged** across an update            |
| `updatedAt`              | equals a fixed instant | **advances**, or at least doesn't go back |
| List ordering            | index equality         | contains the expected members             |
| Totals in a shared store | an absolute number     | your own rows are present                 |

[`items/update-retire.spec.ts`](../packages/functional-style/tests/items/update-retire.spec.ts)
is this table in miniature — two timestamps in adjacent lines, deliberately
asserted differently:

```ts
expect(updated.createdAt).toBe(created.createdAt)
expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt))
```

`createdAt` gets exact equality because the contract promises it never moves —
that is the behaviour under test. `updatedAt` gets a relational oracle because
the contract promises only that it advances, and `toBe` would be asserting
something nobody guaranteed. `>=` rather than `>` because a fast update can land
in the same millisecond, which is not a defect.

The same reasoning is why listings are asserted against rows the test created,
never against a global count — the store is shared, so a total is a value that
legitimately varies.

## Writing it up for someone else

Once classified, the audience changes. A note to the team and a ticket for
another team are not the same document.

**Keep in the team's view:** the class, your confidence in it, test-handling
decisions (kept red on purpose, `test.fixme`, catalogue updated), and internal
identifiers.

**Put in the ticket:** a title someone can read cold, environment and versions,
plain steps, expected versus actual, and evidence — the request, the redacted
response, and a link to the run.

The reason to separate them is not formality. A ticket that opens with an
internal classification and a test id asks the reader to learn your vocabulary
before they can help, and the most common outcome is that it sits unread.

## Where this came from

The classification and its ordering are extracted from production practice,
where a red run routes to one of five different owners and the cost of guessing
wrong is a team's day. See [`provenance.md`](provenance.md).
