# Two styles, one contract

Both packages test the same API, cover the same behaviours, and run under the
same settings. What differs is how the test code is organised.

This document is the scorecard. It tries to be useful rather than flattering:
where the class-first version wins, it says so.

## Making the comparison fair

A comparison is worthless if one side is quietly handicapped, so the conditions
were fixed first and checked afterwards.

| Control               | How it was enforced                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Same behaviours       | Test names diffed between packages. Two auth cases were missing from `class-style` and were added.                                              |
| Same test count       | 97 each.                                                                                                                                        |
| Same settings         | Identical `workers`, `fullyParallel`, and `retries`.                                                                                            |
| No shared code        | `class-style` imports nothing from `functional-style` — only the contract package. Sharing a base would make this one style with two spellings. |
| Same defect detection | Every mutation to the mock produces the **same failure count in both packages**.                                                                |

That last row is the one that matters most, and it caught a real problem. An
earlier draft of `class-style` had no test guarding its assertion helper, while
`functional-style` did. Both suites passed, but one was strictly better
protected for reasons unrelated to its style. See "The finding that belongs to
neither style" below.

```
mutation                    functional-style   class-style
token expiry unchecked           1 failed        1 failed
illegal state edge added         2 failed        2 failed
item availability unchecked      1 failed        1 failed
double-resolve allowed           1 failed        1 failed
retiring an in-use item          1 failed        1 failed
```

## What the numbers actually say

Measured, not estimated:

|                                  | functional-style | class-style |
| -------------------------------- | ---------------- | ----------- |
| source files                     | 25               | 11          |
| test files                       | 13               | 4           |
| source lines                     | 980              | 887         |
| test lines                       | 1426             | 901         |
| files touched to add an endpoint | 5                | 1           |
| imports per spec                 | 3–7              | 3–7         |

Two of these deserve comment because they contradict what is usually claimed.

**Import count is not the difference.** The class-first case is often argued as
"one import instead of three". In practice both sides sit in the same 3–7 range:
a spec needs its error codes, its fixtures, and its helpers either way. The
grouping moves where things live; it does not remove the need to name them.

**The line difference is mostly test-file structure, not density.** 1426 vs 901
test lines looks decisive until you notice `functional-style` splits items across
three spec files with a fixture file per service, while `class-style` keeps one
spec per service. Per assertion the two are close.

## Where class-first genuinely wins

**One place to add an endpoint.** Adding `PATCH /items/{id}/condition` means
editing `ItemsContext.ts` — the request, its schema, and its assertion sit
together. In `functional-style` the same change touches `types.ts`,
`schemas.ts`, `ItemsClient.ts`, and `ItemsValidator.ts`. For a suite that grows
by endpoints rather than by services, that is a real and repeated saving.

**Discoverability.** Typing `ctx.` lists everything the service can do —
requests, assertions, and builders in one completion list. Finding the
equivalent in `functional-style` means knowing that payloads live in a factory,
assertions in a validator, and calls in a client.

**Provisioning reads better.** `await items.provision()` is one line because the
context can call its own assertion. The functional version needs a separate
provisioner precisely because a client has no validator to call.

**Familiarity.** For a team arriving from Selenium-Java or .NET, a service object
with methods is the shape they already have. That is a real onboarding cost
saved, and it is not a small one.

## Where functional wins

**Responsibilities that change for different reasons stay separated.** A schema
changes when the API's shape changes. A payload builder changes when a test
needs different data. A client changes when an endpoint moves. In
`ItemsContext` all three grow in one file, on three independent schedules.

**No inheritance to fight.** `ServiceContext` fixes the assertion style for
every service that extends it. A service needing something different has to work
around the base or duplicate it. The functional version composes helpers instead,
so an odd case is just a different function.

**Composition stays obvious.** Both packages compose rather than inherit for the
cross-service case, but the functional one makes it structural: the maintenance
provisioner is a function that takes the reservation provisioner's output. The
class version has to be careful — `MaintenanceContext.provisionOpenLog` takes
two other contexts as arguments specifically to avoid a context that quietly
owns half the API.

**Smaller units to read.** A reviewer opening `ItemsValidator.ts` sees 33 lines
about assertions. Opening `ItemsContext.ts` sees 131 lines covering three
concerns, sectioned by comments rather than by file boundaries.

## The finding that belongs to neither style

Both packages centralise their assertions — `BaseValidator` in one,
`ResponseAssert` in the other. Both had the identical blind spot, found by
mutating the helpers rather than the mock:

> Removing the status-code check left **every test passing** in both packages.

Specs only ever observe "no exception was thrown", so a weakened check inside
the shared helper is invisible to all of them. It hid because business codes and
HTTP statuses always agree in this mock — assert `AUTH_FORBIDDEN` and you have
incidentally implied 403. Against a real API the two can diverge, and neither
suite would have noticed.

The fix is the same on both sides: a test at that layer, feeding hand-built
responses so each check has to fire. `validator.spec.ts` and
`response-assert.spec.ts` are that test, 13 cases each.

This is the most transferable thing in the repo. It is not an argument for
either style — it is a property of _centralising assertions at all_, and it
applies to any suite with a shared assertion helper.

## Where both styles landed in the same place

Worth recording, because it narrows what the style choice actually decides:

- **One `transition(id, action)` method, not five.** Both packages rejected
  `confirm()` / `checkOut()` / `cancel()`. Five methods would put the state
  machine in the client's method list as well as the API's table. That is a
  question about where a machine lives, not about classes.
- **Fixtures stayed functional.** Playwright injects into a function signature.
  A `TestBase` class with `beforeEach` would trade per-test isolation for a
  label, so even the class-first package wires with functions.
- **Data builders stayed functions.** `randomSku()` holds no state; wrapping it
  in a `TestDataUtils` class would be ceremony.
- **Schemas stayed declarative.** A Zod object is not more or less class-first.

## The verdict, and its scope

For this contract, at this size, **the hybrid in `functional-style` is the one I
would ship** — and the reason is narrower than "it is better".

The deciding factor is that this suite grows by _service_, not by endpoint. Each
new service brings a state machine, or a cross-service dependency, or a
different assertion need. That is exactly where `ServiceContext`'s fixed shape
starts costing more than the file count it saves.

Invert that assumption and the answer inverts. A suite over a large, stable CRUD
API — many endpoints, few shapes, a team fluent in OOP — would find the
one-file-per-service context the better trade, and I would not argue against it.

What I would not accept in either style is a shared singleton or state on a
module. That is not a style question; under parallel workers it is a defect.
