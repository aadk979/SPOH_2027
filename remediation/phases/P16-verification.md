# P16 — Verification, load, dry-run readiness and handover

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../reports/HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


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

Owner amendment 22 October 2026 (D-25/ADR-012): use [the event release plan](../../docs/EVENT_RELEASE_PLAN.md).
Launch uses E1 correct candidate/green CI → core E2/E3 browser/access/data checks → E4 brief realistic traffic. Prepare E5 deployment/rollback/fallback in parallel; execute under existing authority. Core browser work does not wait for every API field/route combination.

CI-first replaces local Docker/Whole29-before-commit. Full exact-SHA CI/coverage, core correctness/privacy and action permissions remain. Formal assurance, exhaustive API/deferred lists, fixed660-real-account/100RPS/sizing, six drills and timed dual restores are nonblocking for this event. Unrun tests remain unpassed.

Dates remain owner go/no-go28October2026, training4November, DryRun#1 18November, DryRun#2 4January2027, event6–9January2027. Read [the current handoff](../reports/HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md).

The steps below preserve the original programme structure. Old “Done when” clauses are not extra launch requirements. P16.10 remains the historical API record; release status uses E1–E5.

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

  Additional acceptance for the 10 October build is listed below (its batch passed CI
  38056722817 at `6755db3`). Missing setup or security implementation remains in its build step.

  - P08.5 / P12.5: in Chrome with third-party cookies blocked, exercise the first-party recovery
    handoff, reload, explicit active-tab renewal and sign-out. Renewal must preserve forms until
    deliberately started; an expired thin token must still be usable only to revoke its own
    session family, never to obtain authenticated data or a new session.
  - P08.6: exercise the documented operator DB credential rotation/rollback path and scoped task
    access, provision VAPID privately and prove push receipt. Do not infer rotation from generated
    secrets or create a paid rotation/network service without the owner's cost decision.
  - P08.7 / P13.4: prove exact-origin/type/size signed uploads, refused direct public access,
    reviewed immutable publication, frozen historical floor plans and private versioned assets.
    After one online load, turn the network off and read the published guide/map after thin-access
    expiry. Drafts and operational API data must not come from the content cache; a real HTTP
    refusal must not fall back to an older cached guide.
  - P08.7 / P13.8: generate/download the current final XLSX pack from private exports, verify its
    counting notes and exclusion of visitor values/transient lost-person descriptions, and show
    archive refuses a missing/stale pack. Prove event-relative photo deletion and export lifecycle
    behaviour; this does not defer the missing printable-card PDF/ZIP feature.
  - P08.8: trigger/recover the new storage/connection/observer signals, verify desired-versus-running
    task observations while parked, backup metadata freshness and confirmed SNS email delivery.
    Reconcile the existing account budget before enabling its managed definition. Paid SMS stays
    behind the owner's cost approval; a retained audit log group does not prove audit shipping.
  - P08.9 / P08.10: execute manual park/unpark, readiness smoke and the three-day cost comparison
    including added alarms, dashboards, metrics and observer invocations. Keep deploy/infra
    workflows dispatch-only until the authorised campaign.
  - P10.5: exercise READY/LIVE with current server-selected smoke/backup/alarm evidence, refusal
    of unavailable evidence, CLOSED capture/close-out/final-report effects and guarded ARCHIVED
    membership/retention effects. Missing feature screens are still build work.
  - P10.7 / P10.8: schedule/review/edit/cancel supported event/station operational keys, category
    activity, announcement/content publication and report snapshots; prove exact targets, current
    execution-time authority, reviewed-version conflicts, cancellation fencing and immutable
    report/publication provenance. From the Schedule screen, schedule a lifecycle change and a
    report snapshot, watch each run and cancel a third (`schedule-producers.spec.ts`).
  - P10.7: a declared fallback window reminds its declarer and the coordinators on a real device
    at `fallback.reminderMinutes` until it is closed; the archive reminder reaches the platform
    admins once the late-sync grace has passed, and a reopen silences it.
  - P12.1 / P12.2: observe the recreated synthetic pool's configured policy/lifetimes and actual
    default-sender invite/resend receipt with thirty-day temporary-password validity. Confirm the
    pool-wide application delivery allowance and actionable quota refusal; no SES/DKIM criterion
    remains under amended D-08. Managed login (version 2) renders with its branding style; at
    production creation, deletion protection and the retained pool are observed (D-24).
  - P12.3: prove invite acceptance, role-change session revocation, event deactivation without
    disabling other active-event access, global disable/reactivate and under-two-second effects
    across instances. Verify archive ends event memberships and refuses subsequent writes.
  - P12.4 / P12.5 / P12.7: exercise provider-backed single/CSV/bulk provisioning, resend,
    platform membership detail, device revoke, forced sign-out and admin MFA enrolment/promotion.
    Run the implemented `server/scripts/verify-cognito.mjs` configuration checks and its explicit
    short-lived synthetic provider-token exchange path. It has not contacted AWS; its two unit
    checks and mocked UI specifications do not prove real Cognito/MFA/browser behaviour.
  - P12.6: run group cleanup in dry-run mode against recreated synthetic staging, inspect its
    plan and then exercise the approved cleanup path; verify permissions continue to come from
    memberships and Cedar rather than Cognito groups.
  - P13.2: create a fresh event and clone selected source structure/published content into an
    unreviewed target-owned draft, land on Setup and verify source/target isolation. The missing
    Audit section and other setup features remain P13 build work.
  - P15.7: observe implemented retention maintenance on synthetic archived/closed data and
    authorised person export/erasure, preserving operational counts/audit identifiers and refusing
    erasure while any membership remains active. Verify the separately stated provider/backup
    retention limitations.
  - P08.8 / P15.7: audit rows written on staging reach `/spoh/staging/audit` within ten minutes,
    the `AuditShipment` cursor advances, and the task role cannot read, delete or re-tension the
    group. Include CloudWatch ingestion in the cost reconciliation.
  - P08.9: dispatch `browser.yml` once the browser fixtures are reconciled (P16.1).
  - P13.3: exercise station/type/tag/category/day/template setup and the exceptions grid,
    including retirement/reactivation and refused changes after go-live. Generate/download
    private A4 card PDF and ZIP exports, scan the printed QR codes and refuse unauthenticated
    or foreign-event downloads. Reopen saved exports after navigation and archive;
    verify their selected codes and Unicode event/batch/station labels remain frozen
    after structure edits, and that generation permission is not needed for authorised
    historical reads. Exercise gifts, derived stock and correction receipts.
  - P13.5 / P13.7: staff an empty day through the assignment board to zero gaps, preview/apply
    CSV changes, edit escalation, request/withdraw/decide swaps, schedule/complete briefings,
    select and void recent counts, record a paper total, work incidents and explore the audit.
  - P13.8: walk CLOSED through lost-and-found/fallback closure, final report, private export,
    ARCHIVED and the authorised clone wizard. Recheck stale or missing export refusal.

- **Done when:** every listed item passes or has a fix merged and re-checked, with results
  recorded.

### P16.9 — Soak

- **Owner decision, 15 October 2026 (D-23 amendment):** the continuous 24-hour soak is
  waived. Record this step as **skipped**; no execution or successful soak is claimed.
- **Remaining order:** after P16.8, continue to P16.2 load, P16.3 drills and P16.4 restore.
  Their measurements, monitoring and failure checks remain required, as do all other
  owner and production/go approvals.

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
