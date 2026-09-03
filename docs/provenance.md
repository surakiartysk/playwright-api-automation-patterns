# Provenance

Where this repository came from, what did and did not travel, and how AI was
used. Written plainly because the alternative — depth with no explanation —
invites the wrong question.

## The short version

**This repository is a stand-in for production work I cannot show.**

The original is API automation at a company, where I am the sole author: I
started the project, designed it, and made every convention and architectural
call in it. The QA team works in what I built. That suite is not mine to
publish, and it should not be.

So it was rebuilt here — with AI as the drafting tool, working from the
architecture and the decisions rather than from the code — against a business
domain I invented for the purpose. Same reasoning, same shape, same operational
habits; entirely different subject matter.

**The approach travelled. The code and the business context did not.** Every
line here — the domain, the contract, the mock, every test — is written from
scratch against a fictional equipment-rental API.

The point of the exercise is that the _judgement_ is what transfers between
jobs, not the endpoints. A suite is worth something because of how it is
structured, what it refuses to assert, and how it is operated day to day — and
none of that is proprietary.

## What travelled

Ideas, and the reasoning behind them:

- The hybrid position: classes for the API surface, functions and fixtures
  everywhere else.
- Client per service domain rather than per user story.
- The structural-versus-behavioural split between validator and test.
- Provisioners that drive real API state, and composition for cross-service
  dependencies.
- The scaling story in decision 8 — what breaks at a dozen services, and the
  restraint about hoisting only what is provably identical.
- How the suite is _operated_: the split between a fast gate and a full run, a
  self-service trigger for developers, a scheduled run that exists to catch
  decay, and Allure for trends rather than for a single run's pass/fail. See
  [qa-workflow.md](qa-workflow.md).

All of it restated in a new domain's vocabulary. Several decisions here also
reach the _opposite_ conclusion from the production suite, most visibly the
bundled mock (decision 6), because the context differs.

## What did not

- No employer endpoint, field name, business rule, or environment URL.
- No copied file, function, or test.
- No employer, product, or repository name — not here and not in the commit
  history.
- Nothing from third-party training material. Course code is licensed for study,
  not redistribution; paying for a course buys attendance, not copyright.

`scripts/check-leak.mjs` enforces this on every CI run rather than leaving it to
good intentions. It carries a vocabulary denylist covering domain terms from the
original project and identifiers from training material, plus credential and
non-public-host patterns.

Every term in it is specific enough to be meaningless outside its source. An
early draft included the word `application`, which matches every
`application/json` header in the repo — a check that cries wolf on line one gets
ignored by line two, which is worse than no check. If a pattern ever fires on
innocent code, the pattern gets narrowed; the code does not get renamed around
it.

**It has already caught something.** Writing decision 1, I quoted the training
course's singleton idiom verbatim to illustrate what this repo avoids. The check
failed the build. Reproducing the line as a negative example is still
reproducing it, so the paragraph was rewritten to describe the shape in its own
words. A rule that has never fired is a rule nobody has tested.

## What the original does that this does not

Worth stating plainly, because otherwise a reader sizes the original by this
repo and gets it wrong in both directions.

The production suite is roughly **twelve services and two thousand tests**,
against a contract owned by a systems analyst rather than by the tests. Test
design there runs as phases with gates — scope, breakdown, review, export —
each producing an artifact the next reads, with a requirement traceability
matrix and a script that fails the build when a requirement marked covered
names no test case. Scope tiers nest three deep (`@smoke ⊂ @acceptance ⊂
@regression`), each running at a different moment in the deploy.

**Three things were deliberately not brought across:**

- **The traceability matrix.** It maps requirements to tests. Here
  `openapi.yaml` _is_ the requirement and it is machine-readable — a matrix
  would restate the contract in a second, hand-maintained format that can go
  stale. What an RTM actually protects against is handled by making drift fail
  a build instead. See
  [test-design-process.md](test-design-process.md#what-this-repo-keeps-and-what-it-drops).

- **The `@acceptance` tier.** A tier is worth having when running the smaller
  set saves something. The full suite here is 97 tests in under three seconds.
  See
  [test-strategy.md](test-strategy.md#scope-tiers-why-there-is-only-one-here).

- **The tooling that runs the process.** The phase skills, seeding and cleanup
  scripts for a shared UAT environment, and the design-consistency checks are
  how a particular team works. That is method rather than craft, and it is not
  mine to hand out.

The reasoning travelled; the apparatus did not. Scaling a process down is a
decision, not a shortcut — an RTM at three services produces a document nobody
reads, and no RTM at twelve services is a gap that surfaces six months later as
a requirement that quietly lost its coverage. Knowing which situation you are
in is the part that transfers.

## How AI was used

I work with AI here and at work, and not as a code generator.

The working loop is: it proposes an approach, I push back — why not the other
way, what breaks at scale, what does this cost us later — and I decide. Several
decisions in this repo are ones I argued the model out of, and a few are ones it
changed my mind on.

Concretely, in building this repo:

- **I set the constraints.** The fictional domain, the IP boundaries, the
  decision to build both styles, the rule that no code from the training course
  would be used even as a reference for the class-first package.
- **AI wrote most of the first drafts**, and found several real defects through
  mutation testing — including a state-guard test that passed while the state
  machine was broken, and a status-code assertion that no test in either package
  was actually exercising.
- **I rejected work that was wrong.** The repository was renamed when its
  original name stopped matching what it demonstrates. An early draft invented a
  surname for the licence file and it was caught and corrected. Where a
  suggestion did not match how I actually work, it was rewritten in my words.

What AI cannot supply is the judgement in decision 8 — deciding to extract only
the byte-identical parts and to _leave_ the risky normalisation alone until it
can be smoke-verified. That call needs someone who understands the live system
and what a wrong move costs the team using it.

## The obligation this creates

Disclosing invites deeper questions, which is only an advantage if every line
holds up. The standard for this repo is that **I can talk through any of it** —
what it does, why it is shaped that way, and what it costs.

That is also why the repo is small. Three services, two styles, and a documented
reason for each choice is worth more than breadth I would have to reconstruct
under questioning.

## Why say any of this

A reader who finds ADRs of this depth in a side project reasonably wonders how
it got there. Unexplained, that depth reads as inflated. Explained, it is
production experience carefully de-identified — and drawing that line is itself
part of the work.

On AI: in 2026 competence with it is assumed, so disclosure costs nothing, while
being caught hiding it would be fatal to exactly the trust this repo is meant to
build.
