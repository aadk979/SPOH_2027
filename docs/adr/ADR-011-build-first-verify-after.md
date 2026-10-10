# ADR-011 — Build every feature first, verify on staging after

| Field      | Value                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | Accepted by the owner's instruction of 10 October 2026 (D-23)                                                                                   |
| Applies to | All remaining remediation work: P08 and P10–P16                                                                                                 |
| Amends     | ADR-010 (implementation cadence and per-milestone acceptance); D-20 and D-22 for the remaining P11 work                                         |
| Keeps      | ADR-010's CI classification; production, cutover and real-data boundaries. **AWS is torn down (10 October 2026), so nothing deploys until P16** |

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

### 2. The batch cycle (owner, 10 October 2026)

Work in large batches, not feature by feature:

1. **Write** a batch of features and systems (for example the rest of P11, or all of P12). While
   writing, run only typecheck and lint, which take seconds.
2. **Test**: write the batch's tests, then run the suites the batch touched and fix them.
3. **One full local run** of the CI steps under Node 24 (CI's version), green by exit code.
4. **One push** of the batch. GitHub CI (about 12 minutes) runs once per push, not per commit;
   watch it to the end and fix forward if it fails.

Do not rerun the full local and online pipeline per feature. A docs-only push runs none of the
tests, so a green docs run says nothing about code pushed before it.

### 3. What every batch still needs (not optional)

- **Full CI** on `main` per pushed batch: lint, typecheck, build, architecture and hardcoding
  guards, tracker validation, secret scan and dependency audit; shared, access-policies, CDK,
  server (unit and integration) and client suites with coverage floors unchanged.
- **New code lands with its tests** (in the same batch): unit, integration, route contract and policy tests as
  engineering standards §9 require. A bug fix lands with a test that fails without it. Coverage
  floors never drop.
- **No deploy.** The owner had all AWS torn down on 10 October 2026
  ([teardown record](../../remediation/reports/P08/aws-teardown-2026-10-10.md)); the deploy and
  infra workflows run only when dispatched. CI on every push is the gate.
- **Data safety:** migrations follow ADR-009 §7. Never migrate, reset or seed the real local
  `spoh2027` database; tests use `_test` databases only.

### 4. What moves to the verification campaign (P16)

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

### 5. Completing a step

A step is **done** when its code is built and its tests are written and green in CI. Where its "Done when" asks for staging acceptance, a soak, a load
number or an owner sign-off, record that part in **P16.8** and close the step. Do not close a step
whose code or tests are missing.

### 6. Decisions

Stop for the owner only for decisions that are genuinely theirs: money and AWS cost, production
and anything outward-facing, data that cannot be recovered, and product rules the ADRs leave open.
Otherwise take the documented recommendation, record it as **assumed** in `DECISIONS.md`, and keep
going. Release plans for the remaining P11 work (release 3 and later) do not need approval.

### 7. The verification campaign

When every feature step is closed: recreate AWS (bootstrap, the GitHub deploy role, then the stacks) and deploy staging sized like production (the real
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

Every batch: the cycle in §2 and the gate in §3. The campaign in §7 is the acceptance of the whole build.

## Migration

From 10 October 2026. P11.5 release 2b was accepted under the old process (staging revision 156,
`ffc377e`). Everything after it follows this ADR.
