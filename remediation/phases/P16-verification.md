# P16 — Verification, load, dry-run readiness and handover

| Field             | Value |
| ----------------- | ----- |
| Gate              | G5    |
| Depends on        | P15   |
| Decisions         | D-01  |
| Changes behaviour | No    |
| Size              | M     |

## Purpose

Prove the platform is ready for real volunteers under real load and real failures. Leave
documentation that lets someone else run it next year. Close the programme.

## Context for a fresh session

- Hard dates: training 4 Nov 2026, Dry Run #1 18 Nov 2026, Dry Run #2 4 Jan 2027, event 6–9 Jan 2027.
- Go/no-go criteria are in ADR-009 (from D-01).
- **ADR-011 (D-23, 10 October 2026): this phase is the verification campaign for the whole build.**
  It starts when every feature step in P08 and P10–P15 is closed. Earlier phases deferred their
  staging acceptance, soaks, load numbers, browser and visual runs and UX sign-offs to here
  (P16.8 lists them). First recreate AWS, torn down on 10 October 2026
  ([record](../reports/P08/aws-teardown-2026-10-10.md)), and deploy staging sized like production (ADR-008), then run, in this
  order: **P16.10** granular API suite → **P16.1** full regression → **P16.8** deferred
  acceptance → **P16.9** soak → **P16.2** load → **P16.3** drills → **P16.4** restore. Fix what
  each finds (a failing test first), and re-run what the fix touched.

## Steps

### P16.1 — Full regression on staging and prod

- **Do:** Run all suites in CI, plus the e2e role journeys (P13.9) against staging, plus a
  read-only smoke against prod.
- **Done when:** everything is green, with results recorded.

### P16.10 — Granular API suite (run first)

- **Do:**
  1. Generate the case list from the route inventory (`remediation/tools/route-inventory.mjs`)
     and the committed route × role matrix (`server/tests/integration/route-role-matrix.json`): every route, every role,
     every station scope, and a member of another event.
  2. For each route cover: success; validation failures for every field (missing, wrong type,
     out of range, too long, unknown keys); auth missing, expired and refreshed; policy refusals
     with their reasons (self-mutation, role escalation, station scope, structure frozen once LIVE,
     archived event, capture window); not found and cross-event ids; conflicts and idempotent
     replays; pagination ends and bad cursors; rate limits; every lifecycle state (DRAFT,
     REHEARSAL, LIVE, CLOSED, ARCHIVED) where the route depends on it.
  3. Run it against staging, and in CI against a `_test` database, so a later regression fails
     the build.
- **Done when:** every inventoried route has its cases, the suite is green on staging and in CI,
  and each defect it found has a fix with a test.

### P16.8 — Deferred staging acceptance

- **Do:** Run the staging acceptance that earlier steps recorded here under ADR-011 §4, and the
  owner reviews they deferred. Each step adds its line when it closes. Known at 10 October 2026:
  - P08.5: the staging DuckDNS client signs in against the API's DuckDNS HTTPS address end to end.
  - P08.7: a presigned upload from staging works, and direct public access fails.
  - P08.8: a test alarm reaches the owner's email.
  - P08.10: smoke is green in the pipeline, and cost is within D-10.
  - P11.6: staging's policy store matches the repo, and the drift check is green.
  - P11.9: decision latency recorded; AVP-unreachable and evaluation-failure behaviour
    demonstrated on staging.
  - P11.6: `infra.yml`'s AVP drift step green against staging's store.
  - P11.7: `client/tests/e2e/role-permissions.spec.ts` green (an edit takes effect; the simulator).
  - P11.8: the browser journeys green with `/me/permissions` driving every affordance.
  - P12.1: the pool settings are applied on staging, and `cdk diff` on identity is empty.
  - P12.2: a staging invite arrives as configured.
  - P13.1: the owner reviews the information-architecture walkthrough.
  - P13.9: every role journey passes on staging; Journey 1 needs no API, SQL, seed or env edit.
  - P14.8: the owner reviews the copy.
  - P15.5: the nightly authorization job is green, and its alarms are wired.
  - P15.8: the runbook is walked once.
- **Done when:** every listed item passes or has a fix merged and re-checked, with results
  recorded.

### P16.9 — Soak

- **Do:** With the whole build on staging sized like production, run a 24-hour soak: the
  cold-start probe (sign in, first screens) every 30 minutes, steady polling at the configured
  intervals, and scheduled actions firing. Watch `AuthorizationFailed`, 5xx, p95, task restarts,
  database connections and the scheduler's lag and dead actions.
- **Done when:** 24 hours with no evaluation failure, no 5xx and no restarts, or each one found
  has a fix and the soak is repeated.

### P16.2 — Load test

- **Do:**
  1. Extend `server/scripts/load-test.mjs` to be event-scoped, and mix captures with dashboard and
     alert polling at the configured intervals.
  2. Run it at 2× the expected peak (volunteers plus dashboards) on staging sized like prod.
  3. Record p50/p95/p99, error rate, decision cache hit rate, DB CPU and connections.
  4. Tune until it meets the budget.
- **Done when:** p95 is under 300 ms and the error rate under 0.1% at 2× peak, with results
  recorded.

### P16.3 — Resilience drills

- **Do:** On staging:
  - AVP unreachable
  - RDS failover or reboot
  - kill tasks
  - booth network loss (outbox recovery, no duplicates)
  - a bad deploy followed by rollback
  - the scheduler worker crashing mid-action

  Record behaviour against expectations.

- **Done when:** every drill matches ADR expectations, or a fix is merged and the drill re-run.

### P16.4 — Restore rehearsal

- **Do:** Time a full restore (RDS PITR and the logical dump path) into a scratch instance, verify
  the totals, and document RPO and RTO.
- **Done when:** the times are recorded and within the targets agreed in ADR-008.

### P16.5 — Documentation

- **Do:** Rewrite:
  - the root `README.md`
  - `ONBOARDING_AND_FEATURES.md`: regenerate it from code
  - `docs/ARCHITECTURE.md`
  - `docs/ADMIN_GUIDE.md`: set up an event, step by step, with screenshots
  - `docs/VOLUNTEER_QUICKSTART.md`
  - `docs/runbooks/`: deploy, rollback, incident, event day, post-event, restore, rotate secrets

  Recover or retire the missing brief and build plan references (PF-11).

- **Done when:** a person unfamiliar with the project sets up a test event using only the admin
  guide.

### P16.6 — Dry-run readiness and go/no-go

- **Do:**
  1. Walk through the readiness checklist with the owner: the event is set up in prod, volunteers
     are invited, training material is ready, and on-call and alarms route to real people.
  2. Record the go/no-go decision (ADR-009 criteria).
- **Done when:** the decision is recorded in `progress.json`.

### P16.7 — Close the programme

- **Do:**
  1. A final metrics snapshot vs baseline: size and complexity debt, coverage, test counts,
     p95, cost.
  2. The programme report, and the remaining backlog handed to normal issues.
  3. Remove the old-path aliases (P09.7) seven days after the event closes (ADR-009 §6), with the
     alias contract test deleted in the same commit.
  4. Delete `release/january` if it was created (Q-P5).
  5. Archive `remediation/`, keeping it in the repo as history.
- **Done when:** the programme report is written, and all phases are `done`.

## Exit criteria

- Load and resilience targets are met, and the restore is rehearsed.
- The docs are complete, go/no-go is recorded, and the programme is closed.

## Phase report

_Fill in on completion._
