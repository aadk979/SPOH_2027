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
progress: generated settings/history/revert and the general event timeline retain the
full criteria below, so the step remains open.

[Lifecycle readiness and reviewed controls](../reports/P10/lifecycle-readiness-ui.md)
add authoritative no-store readiness, event-clock reopening deadlines and deliberate
versioned preparation/rehearsal/close/reopen controls. Current authority and post-wait
guard evidence, stable retry intent, phone/laptop worker journeys and reviewed settings
visuals pass. First go-live and public archive remain unavailable behind their existing
prerequisites. This completes the bounded lifecycle UI subcriterion, not the full step.

[The event schedule metadata API](../reports/P10/schedule-timeline-api.md) supplies a
current-authority, no-store, status-filtered foundation for the general timeline.
It omits private payloads and uses creation-time/ID keyset bounds that retain the next
row when a cursor action changes status. Its 24 database and four new shared checks
pass. [The metadata view](../reports/P10/schedule-timeline-ui.md) adds a collapsed
event-settings list, all status filters, event-clock dates, bounded outcome wording,
pagination and current-person/cache protection. Its client and phone/laptop checks
and reviewed visual baselines pass. General create/edit/cancel consumers and
generated settings/history/revert remain open.

[The product setting history read](../reports/P10/product-setting-history-api.md)
adds current-authority, no-store, strictly validated history for the two existing
product settings. Invalid historical JSON is omitted, and exact event/scope/key
cursor isolation and post-wait clock/authority are verified. The corresponding
history/revert UI and complete generated event/station controls remain open.

[Guarded product reverts](../reports/P10/product-setting-revert-api.md) restore a
reviewed historical value through the existing counts/privacy guards, appending a
new version and attributed audit. Event/current-member lock ordering, exact scope
filters, monotonic legacy RESET versions, atomic purge/rollback and id-only replay
are verified. The history/revert UI and full generated event/station criteria
remain open; this bounded API does not complete the step.

[Product history and reviewed restore](../reports/P10/product-setting-history-ui.md)
adds the collapsed two-key consumer, required reason/confirmation, event/person/key
cache isolation and stable retry intent through ambiguous responses. Phone/laptop
count change/history/restore/hard-reload journeys and reviewed settings visuals
pass. Complete generated event/station controls and general schedule management
remain open.

[Changed-key compatibility settings saves](../reports/P10/settings-changed-keys.md)
correct the F02-005 client payload and the legacy refresh race found by its real
browser journey. Complete generated scopes, history and reviewed-version controls
remain open; this bounded fix does not complete the step.

[The scoped operational settings read](../reports/P10/scoped-settings-read-api.md)
adds strict, current-authority event/station values with validated inheritance and
stored versions. It excludes private and guarded keys, preserves malformed stored
rows while omitting their JSON, and verifies exact event/organisation/station
ownership. Legacy consumer migration and generated edit/history/schedule/revert
controls remain open.

[Scoped operational set/reset](../reports/P10/scoped-settings-mutation-api.md)
adds the bounded event/station producer through the existing setting guards,
with reviewed stored versions, atomic history/audit and identifier-only retries.
Replay rechecks current authority and rebuilds current values. Local and staging
verification are recorded in its report; this producer does not complete the
generated UI, history/revert, scheduling or consumer migration criteria.

[Scoped operational history](../reports/P10/scoped-settings-history-api.md)
adds exact event/station/key cursor isolation, current authority and validated
historical values. Reset records describe override removal without inventing
an inherited after value. The reader writes no settings, audit or retry data;
generated history/revert controls and full phase criteria remain open.

[Scoped operational history restore](../reports/P10/scoped-settings-revert-api.md)
adds reviewed owned-history restores through the same guarded set/reset writer,
selected-history audit provenance and identifier-only current-value retries.
Historical reset restores removal using current inheritance. The generated UI,
operational schedules, legacy consumers and broad step criteria remain open.

[Reviewed capture controls](../reports/P10/scoped-capture-controls-ui.md) consume
the generated capture.open catalogue at event and station scope, with inherited
values, reviewed set/reset/history/restore and a frozen retry intent. The broader
generated catalogue, operational scheduling and phase criteria remain open.

[Reviewed capture schedule creation/status](../reports/P10/capture-schedule-api.md)
adds a bounded future producer for the existing event/station setting.apply worker,
current-authority private status, immutable creation intent and identifier-only
retries. Schedule list/edit/cancel/UI and broader phase criteria remain open.

[Reviewed capture schedule management](../reports/P10/capture-schedule-management-api.md)
adds exact-target private list, creator-owned pending edit and current-manager
cancellation, with reviewed versions, immutable retry intent and worker/action
lock guards. Its exact staging image and normal Cognito management probe pass;
broader phase criteria remain open.

[Reviewed capture scheduling controls](../reports/P10/capture-schedule-controls-ui.md)
add event/station lists, event-clock future creation, creator edit and manager
cancellation with separate reviewed versions and frozen retry intent. Client,
real-worker browser, 70 reviewed visual checks, D-11 CI/deployment and the normal
Cognito Chrome UI journey pass. Broader generated consumers and phase criteria
remain open.

[The generated operational catalogue reader](../reports/P10/operational-catalogue-ui.md)
adds grouped metadata, event/station scoped values, inheritance/versions and owned
private history for all supported keys. Client, real-browser, static/CSP and 76
reviewed visual checks pass. Actual CI/coverage artifacts, exact staging revision
129 and the normal Cognito Chrome reader journey also pass. Generated editing/
revert/scheduling and legacy consumer migration remain open.

[Reviewed catalogue history restores](../reports/P10/operational-catalogue-restore-ui.md)
add generated event/station historical value/removal reviews through the existing
guarded writer. Stable retry intent, scope/collapse locks, typed values, current
authority/cache protection and structural array comparisons pass local checks,
including 80 reviewed visual checks. Actual CI/coverage artifacts, exact healthy
staging revision 131 and the normal Cognito restore/identical retry/owned public
cleanup journey pass. Generated editing, broader schedules, legacy consumers and
the full step criteria remain open.

[Reviewed generated catalogue editing](../reports/P10/operational-catalogue-edit-ui.md)
adds typed event/station set and override-removal reviews from the existing registry.
All 20 affected browser journeys pass at unchanged rate limits after diagnosing
the combined run's shared-subject read pressure. Twelve new reviewed editor images,
four changed catalogue images, all 92 full visual checks and the current static/CSP
export pass. Full application CI and exact-image staging acceptance gate publication;
broader operational schedules, legacy consumers and full phase criteria remain open.

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
