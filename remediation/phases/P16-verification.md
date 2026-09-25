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

## Steps

### P16.1 — Full regression on staging and prod

- **Do:** Run all suites in CI, plus the e2e role journeys (P13.9) against staging, plus a
  read-only smoke against prod.
- **Done when:** everything is green, with results recorded.

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
  3. Archive `remediation/`, keeping it in the repo as history.
- **Done when:** the programme report is written, and all phases are `done`.

## Exit criteria

- Load and resilience targets are met, and the restore is rehearsed.
- The docs are complete, go/no-go is recorded, and the programme is closed.

## Phase report

_Fill in on completion._
