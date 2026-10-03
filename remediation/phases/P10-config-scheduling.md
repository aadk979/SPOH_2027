# P10 — Live configuration, event lifecycle and scheduling

| Field             | Value      |
| ----------------- | ---------- |
| Gate              | G3         |
| Depends on        | P09        |
| Decisions         | D-09, D-14 |
| Changes behaviour | **Yes**    |
| Size              | L          |

## Purpose

Everything an organiser might want to change is changeable live, can be scheduled, and is recorded.
The env file shrinks to infrastructure and secrets. Events move through a lifecycle that controls
what is allowed when.

## Context for a fresh session

- Design: ADR-003 (settings, cache bus, env reduction), ADR-004 (lifecycle, scheduler).
- Worklist: `findings/F01-hardcoding.md` rows classed `*-setting`, and the env audit (P01.4).
- PF-01 (per-process cache staleness) is fixed here by the cache bus.

## Steps

### P10.1 — Settings registry

- **Do:**
  1. `platform/settings/registry.ts` defines each setting: key, scope (`platform`, `event` or
     `station`), zod schema, default, label, description ("what changing this does"), unit,
     required action, group, and `schedulable` flag.
  2. Generate the types and metadata into `@spoh/shared/generated/settings`.
  3. Migrate the existing `DEFAULT_SETTINGS` keys (shift blocks move to `ShiftTemplate` from P09).
- **Done when:** the registry is the only definition of a setting, and a unit test asserts every
  key has a description and bounds.

### P10.2 — Storage, resolution and history

- **Do:**
  1. `Setting(scope, scopeId, key, value, version)` plus `SettingChange` (who, when, before, after,
     reason, source: user or schedule).
  2. The resolver: station → event → platform → default.
  3. Revert to any previous version.
  4. Audit each write in the same transaction.
- **Done when:** the resolution and history tests pass.

### P10.3 — Cache bus (fixes PF-01)

- **Do:**
  1. `platform/events` on Postgres `LISTEN/NOTIFY`, with channels `settings`, `access`,
     `membership` and `session`.
  2. The auth/membership caches, the settings cache and (later) the decision cache subscribe to it.
  3. Reconnect with backoff, plus a periodic full refresh as the backstop.
- **Done when:** the two-instance test from P03.5 shows deactivation and role changes take effect
  on all instances within 2 s.

### P10.4 — Move operational config out of env

- **Do:**
  - `ATTENDANCE_ROOT_EMAIL` becomes an event setting chosen from the event's members in the UI.
  - `ATTENDANCE_SP_CIDRS` becomes the event setting "trusted networks": a validated CIDR list with
    a "test from my current IP" helper.
  - `SHIFT_HOURS_ALWAYS_OPEN` becomes **rehearsal mode**: a lifecycle state (P10.5) in which capture
    screens open outside shift hours, data is tagged `REHEARSAL`, it is excluded from reports by
    default, and a banner is shown.
  - Rate limits and the access-token TTL become bounded platform settings.
  - The env schema is reduced to infra and secrets only, and the removed keys are documented in the
    migration notes.
- **Done when:** `config/env.ts` contains no operational tunables, and there are
  `.env.example` and SSM parameter updates.

### P10.5 — Event lifecycle

- **Do:**
  1. The state machine `DRAFT → READY → REHEARSAL ⇄ READY → LIVE → CLOSED → ARCHIVED`, as a
     pure domain module with a transition table.
  2. Guards: readiness checks, whose results are shown in P13.6.
  3. Side effects:
     - LIVE opens capture per schedule
     - CLOSED freezes capture and runs close-out (lost and found, fallback windows)
     - ARCHIVED makes the event read-only and starts retention timers
  4. Every transition is audited.
  5. Expose the state to Cedar context (P11).
- **Done when:** the transition table tests pass and illegal transitions are rejected.

### P10.6 — Scheduler engine (D-09)

The durable engine is also a prerequisite for P10.5's archive retention timers. Its internal
storage/execution slices can advance while P10.5 stays open; neither step is complete until its
full criteria pass. Evidence is recorded in [scheduler-engine.md](../reports/P10/scheduler-engine.md).

- **Do:**
  1. `ScheduledAction(eventId, type, payload, runAt, status, attempts, lastError, createdBy)`.
  2. A worker loop in every instance: claim with `FOR UPDATE SKIP LOCKED`, run the handler inside a
     transaction, retry with backoff, dead-letter after N attempts.
  3. Handlers are registered by modules, idempotent, and audited with `source=schedule`.
  4. Metrics feed the scheduler-lag alarm from P08.8.
- **Done when:** the claim/retry/dead-letter tests pass, including 2 concurrent workers.

### P10.7 — Schedulable actions

The private, versioned announcement draft foundation is verified separately in
[announcement-drafts.md](../reports/P10/announcement-drafts.md). Saving a draft cannot publish
or request delivery; this foundation alone does not complete P10.7.

[Durable delivery storage](../reports/P10/announcement-delivery-storage.md) adds a
frozen per-announcement plan and per-device records without a producer or network worker.
[Timed publication](../reports/P10/scheduled-announcement-publication.md) registers the strict
saved-version handler and commits the attributed message, plan/intents, audit and scheduler
outcome together. The [after-commit worker](../reports/P10/announcement-delivery-worker.md)
adds bounded device claims, current preflight checks, send reservations and fenced outcomes.
Its full suite passes 1,194 checks with four existing skips; D-11 CI/deploy and the exact
`d1cdbee` staging image on task definition revision 95 are verified.
[Private publication schedule creation/status](../reports/P10/announcement-schedule-api.md)
adds the legitimate producer with current authority, saved-version/time guards, atomic
metadata audit/id-only retry receipt and current private status. Its 35 new API cases,
186 focused checks and full 1,229-pass/four-skip suite are green. Exact `2ecabfd` CI/deploy
passed, and normal Cognito/API creation led to a real staging INFO publication observed
in installed Chrome and after hard reload. General list/edit/cancel/timeline and UI remain
pending; no external device receipt is claimed.

[Private schedule management](../reports/P10/announcement-schedule-management.md) adds
owned-draft keyset lists, PENDING-only versioned edits and cancellation. Its 37 new
database cases verify revised due times, current reviewed content, atomic audits,
cancelled actions, stale/concurrent workers and post-wait policy. Full integration passes
1,266 checks with four existing skips in 90 files; D-11 commit/pipeline checks follow.
The general event timeline/UI remains open.

- **Do:** Handlers for:
  - lifecycle transitions
  - publishing an announcement at a time
  - opening or closing capture per station, category or day
  - applying a setting change at a time
  - fallback window reminders
  - generating a report snapshot
  - retention purges

  Migrate the lost-person purge, idempotency prune, refresh-session prune and settings refresh from
  `setInterval` to the engine.

- **Done when:** there is no `setInterval` job left outside `platform/scheduler`.

### P10.8 — Admin UI: settings, schedule and lifecycle

[Private draft and publication controls](../reports/P10/announcement-draft-ui.md)
add private reviewed-content editing, event-clock schedule creation, pending edit/cancel
and live status to the inbox. Client units, phone/laptop real-worker journeys, affected
CORS/configuration integration and 58 reviewed visual checks pass. This is partial
progress: generated settings/history/revert, general event timeline and lifecycle/readiness
controls retain the full criteria below, so the step remains open.

- **Do:**
  1. A settings screen generated from the registry: grouped, scoped (event or station tabs), with
     descriptions, validation, change history and revert.
  2. A schedule timeline per event: list, create, edit, cancel, with status and errors.
  3. Lifecycle controls with the readiness summary.
- **Done when:** e2e covers changing a setting, scheduling it, watching it apply, and reverting it.

### P10.9 — Verify and report

The [actual staging announcement](../reports/P10/announcement-schedule-api.md) subcriterion
passed at 21:39 Singapore on 3 October: normal Cognito/API producer, real worker, one
scheduled synthetic INFO message, private current status/replay and Chrome inbox/hard reload.
The full step remains open for the other phase dependencies and verification criteria.

- **Do:**
  1. Time-travel tests for scheduled actions, the two-instance propagation test, and lifecycle
     guard tests.
  2. Deploy to staging, and schedule a real announcement there.
  3. Write the report.
- **Done when:** the exit criteria hold.

## Exit criteria

- Env holds only infra and secrets, and every operational value is a live, audited, revertible
  setting.
- The lifecycle is enforced, scheduled actions run exactly once across instances, and the cache bus
  propagates in under 2 s.

## Phase report

_Fill in on completion._
