# ADR-011 — Build every feature first, verify on staging after

| Field      | Value                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Status     | Accepted by the owner's instruction of 10 October 2026 (D-23)                                              |
| Applies to | All remaining remediation work: P08 and P10–P16                                                            |
| Amends     | ADR-010 (implementation cadence and per-milestone acceptance); D-20 and D-22 for the remaining P11 work    |
| Keeps      | ADR-010's CI classification and automatic staging deployment; production, cutover and real-data boundaries |

## Context

Through P11.5 each feature went out as its own staged rollout: a shadow release, an enforcing
release and a clean-up release, each followed by staging acceptance, a soak (24 hours for release
2b), an owner checkpoint and a report. CI and the staging deploy take about 20 minutes and run on
their own; the waiting around them took days. On 10 October 62 of 171 steps remained, and at that
pace the programme would finish around the event itself.

Staging has almost no traffic, and production does not exist yet. A defect on staging costs a fix
forward, not a refused volunteer.

## Decision

### 1. Build first

Implement every remaining feature (P08, P10–P15 code and infrastructure) before the staging
verification campaign. Commit and push each coherent batch to `main` as it is ready; there is no
staged rollout, shadow release or soak between features.

### 2. What every push still needs (unchanged, not optional)

- **Full CI** on `main`: lint, typecheck, build, architecture and hardcoding guards, tracker
  validation, secret scan and dependency audit; shared, access-policies, CDK, server (unit and
  integration) and client suites with coverage floors unchanged. Run those steps locally before a
  code push, under Node 24 (CI's version). A docs-only push runs none of the tests, so a green
  docs run says nothing about code pushed before it.
- **New code lands with its tests**: unit, integration, route contract and policy tests as
  engineering standards §9 require. A bug fix lands with a test that fails without it. Coverage
  floors never drop.
- **The automatic staging deploy** stays on. Its smoke step must pass; a failed deploy is fixed
  before the next batch.
- **Data safety:** migrations follow ADR-009 §7. Never migrate, reset or seed the real local
  `spoh2027` database; tests use `_test` databases only.

### 3. What moves to the verification campaign (P16)

| Deferred                                                          | Was                                         | Now                           |
| ----------------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| Soaks and shadow releases                                         | D-22 (24 h), D-20 (shadow, enforce, delete) | P16.9                         |
| Per-feature staging acceptance (walks, baselines, probe compares) | each step's "Done when"                     | P16.8                         |
| Full browser (Playwright) and visual suites                       | ADR-010 "before release"                    | P16.1                         |
| Load, p95 and failure behaviour                                   | P11.9, P16.2                                | P16.2                         |
| Resilience drills, restore rehearsal                              | P16.3, P16.4                                | unchanged                     |
| Granular API tests: every route, every role, every edge case      | new                                         | P16.10                        |
| Owner sign-offs of UX (IA walkthrough P13.1, copy P14.8)          | blocking                                    | reviewed in P16, non-blocking |

Write browser specs alongside the features they cover; running the full suite is P16's job. Run a
single affected spec only when it is cheap and the change is risky.

### 4. Completing a step

A step is **done** when its code is built, its tests are written and green in CI, and the pipeline
has deployed it to staging. Where its "Done when" asks for staging acceptance, a soak, a load
number or an owner sign-off, record that part in **P16.8** and close the step. Do not close a step
whose code or tests are missing.

### 5. Decisions

Stop for the owner only for decisions that are genuinely theirs: money and AWS cost, production
and anything outward-facing, data that cannot be recovered, and product rules the ADRs leave open.
Otherwise take the documented recommendation, record it as **assumed** in `DECISIONS.md`, and keep
going. Release plans for the remaining P11 work (release 3 and later) do not need approval.

### 6. The verification campaign

When every feature step is closed: deploy to staging sized like production (the real
infrastructure, ADR-008), then run P16 in this order: P16.10 granular API suite, P16.1 full
regression including browser and visual suites, P16.8 deferred acceptance, P16.9 soak, P16.2 load,
P16.3 drills, P16.4 restore. Fix what they find, with a test per fix, and re-run what the fix
touched. Production creation and cutover follow (P12.8), with the owner's approval as before.

## Options considered

- **Keep ADR-010's per-milestone acceptance.** Safest per feature, but the programme ends at the
  event.
- **Build first, verify after (chosen).** Defects are found later and several at once; CI and the
  tests written with each feature keep that bounded.
- **Drop CI as well.** Rejected by the owner: without the suites, a defect found in P16 cannot be
  traced to the batch that caused it.

## Consequences

- Staging may run code with defects until P16. That is acceptable for staging only.
- **The 28 October go/no-go (ADR-009 §2) is affected.** Several of its twelve criteria are
  verification items (p95 at twice peak, restore rehearsal, AVP degraded mode, the route × role
  matrix on staging). Under this order they are not measured by 28 October unless the features are
  done well before it. The owner still makes the call on 28 October (D-01); if it is a no-go,
  training and January run on `release/january` as ADR-009 §3 already prepares.
- P16 grows: the deferred acceptance list (P16.8), the soak (P16.9) and the API suite (P16.10).

## How it is tested

Every push: the CI gate in §2. The campaign in §6 is the acceptance of the whole build.

## Migration

From 10 October 2026. P11.5 release 2b was accepted under the old process (staging revision 156,
`ffc377e`). Everything after it follows this ADR.
