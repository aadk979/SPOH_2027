# P09 — Event model and configurable taxonomy

| Field             | Value            |
| ----------------- | ---------------- |
| Gate              | G3               |
| Depends on        | P06, P07         |
| Decisions         | D-02, D-04, D-12 |
| Changes behaviour | **Yes**          |
| Size              | XL               |

## Purpose

Make the event a first-class entity. Every event-owned row belongs to exactly one event, visitor
categories, station types, tags and shift patterns become data, and timezones come from the event.
After this phase a second event can exist beside the first without code, seed or env changes.

## Context for a fresh session

- Design: ADR-001 (model, API scoping), ADR-002 (taxonomy), ADR-009 (migration, outbox
  compatibility).
- Worklist: `findings/F01-hardcoding.md`, the rows classed `event-data` and the timezone list.
- Migrations follow **expand → migrate → contract** across separate deploys. Each is reversible
  until the contract step.
- Invariant tests (three counts, no PII) must stay green throughout. They are the product.

## Steps

### P09.1 — Expand: Event and scoping columns

- **Do:**
  1. Add `Organisation` (per D-02) and `Event` (slug, name, venue, timezone, status, branding JSON,
     dates are derived from days).
  2. Add a nullable `eventId` on every event-owned table (per the ADR-001 list), plus composite
     indexes leading with `eventId`.
  3. Add a Prisma relation, with `Restrict` on delete.
- **Done when:** the migration is applied on staging and the app still works unchanged.

### P09.2 — Expand: taxonomy tables

- **Do:** Add:
  - `CaptureCategory` (eventId, code, label, sortOrder, active)
  - `StationType` (eventId, code, label, capability flags: `acceptsRegistration`, `countsEntry`,
    `issuesStamp`, `redeemsGifts`, …)
  - `StationTag` (replaces CourseCode)
  - `ShiftTemplate` (eventId, name, startLocal, endLocal) and `Shift` (eventDay × template)

  Add nullable FK columns next to the enum columns (`Registration.categoryId`,
  `Station.typeId`, `ShiftAssignment.shiftId`, …).

- **Done when:** the migration is applied, with the old columns still authoritative.

### P09.3 — Expand: Person and EventMembership

- **Do:**
  1. Split `Volunteer` into `Person` (global: identity subject, name, email, phone, active) and
     `EventMembership` (person × event: role, portfolio, reportsTo, active, invitedAt, lastSeenAt).
  2. Point assignments, attendance, swaps and captures at the membership where the row is
     event-specific. Keep `personId` where the row is about the human (sessions, push
     subscriptions, audit actor).
  3. Auth resolves the person from the token and the membership from the event in the path.
- **Covers:** one person can be a Volunteer at one event and Chief at another, and archiving an
  event deactivates memberships without touching identities.
- **Done when:** the migration is applied, and memberships for Event #1 are created in P09.4.

### P09.4 — Migrate existing data into Event #1 (needs D-12)

- **Do:**
  1. A data migration creates "SPOH 2027" from today's values: timezone `Asia/Singapore`, one
     category per enum value, a station type per kind with flags derived per F01.3, a tag per
     course, and shift templates MORNING/AFTERNOON from settings.
  2. Create a `Person` per `Volunteer` (same id and identity subject, so Cognito links hold), and an
     Event #1 `EventMembership` carrying their role, portfolio and reportsTo.
  3. Backfill every `eventId` and new FK.
  4. Verify row counts and per-category/per-station totals are **identical** before and after
     (a script under `reports/P09/`).
- **Done when:** the verification script shows zero differences on a copy of production data
  (restored from backup) and on staging.

### P09.5 — Switch reads and writes to the new model

- **Do:**
  1. Repos read and write the FK columns and filter by `eventId`.
  2. DTOs carry ids plus labels, not enum values.
  3. Station behaviour comes from type capability flags, not `kind === 'SIGNUP_BOOTH'`.
  4. Shift "running now" uses `Shift` rows in the event's timezone.
- **Done when:** all suites pass against the new columns, with fixtures updated to create events
  through the same factory as production.

### P09.6 — Event timezone everywhere

- **Do:**
  1. `platform/time` gains `EventClock`/`zonedTime` helpers on the ADR-007 tz library.
  2. Replace the fixed offset in `time.ts`, `AT TIME ZONE 'Asia/Singapore'` (parameterised with the
     event tz), the +8h in export, and the client's `format.ts` TZ constant (the tz comes from the
     event).
  3. Add DST tests with a `Europe/London` event: day boundary, a shift across the transition, and
     the report's hourly buckets.
- **Done when:** no `Asia/Singapore`, `SGT` or `+8` remains outside fixtures, and the DST suite passes.

### P09.7 — Event-scoped API

- **Do:**
  1. Mount the domain routers under `/api/v1/events/:eventId/…` (per ADR-001).
  2. Event-context middleware resolves the event and the caller's membership, rejecting unknown or
     inaccessible events.
  3. Keep old paths as thin redirects to Event #1 for one release, for queued outbox items and old
     clients.
  4. Add a **cross-event isolation suite**: for every route, a caller in event A using ids from
     event B gets 404.
- **Done when:** the isolation suite passes for 100% of routes, generated from the route inventory.

### P09.8 — Client event context

- **Do:**
  1. An event route segment (per ADR-001), an event switcher for multi-membership users, and query
     keys prefixed by `eventId`.
  2. Outbox entries record `eventId`. Migrate stored pre-upgrade entries to Event #1's paths on
     first load, with a test covering a queued item from the old build.
- **Done when:** e2e passes on two events at once, and the outbox upgrade test passes.

### P09.9 — Event cloning

- **Do:** A "create from event" use case copies structure: days shifted by an offset, shift
  templates, station types and stations, categories, tags, gift types (stock reset), content,
  settings, and role permissions. It copies **no** operational data or memberships, unless the
  option "invite the same people" is chosen.
- **Done when:** cloning "SPOH 2027" into "SPOH 2028" gives a working empty event, tested.

### P09.10 — Contract: remove the enums and legacy columns

- **Do:**
  1. After a release runs on the new columns, drop the enum columns and enum types that became data.
  2. Keep the invariant enums (DataSource, etc.).
  3. Remove the redirects added in P09.7 once the outbox upgrade window has passed (ADR-009).
- **Done when:** the schema has no event taxonomy enums.

### P09.11 — Seed and no-hardcoding guard

- **Do:**
  1. `prisma/seed.ts` becomes a **dev fixture generator**: an event created relative to today, with no
     literal dates.
  2. Add the CI check `npm run check:hardcoding`, which fails on the F01 patterns in `src/`
     (dates, venue and brand names, course codes, timezone names) outside fixtures and tests.
- **Done when:** the check is in CI and passes.

### P09.12 — Reports and dashboards on taxonomy

- **Do:** Reports and dashboards group by category and station labels from the database, keep the
  `unit` discriminators, and state rehearsal/fallback provenance.
- **Done when:** the report and dashboard suites pass for Event #1 (same numbers as baseline) and
  for a cloned event.

### P09.13 — Verify and report

- **Do:** Run the full suites, the isolation suite, DST suite, visual snapshots (updated only where
  labels changed) and staging deploy, and write the report.
- **Done when:** the exit criteria hold.

## Exit criteria

- Two events coexist on staging with zero cross-event leakage.
- Event #1's numbers are identical to baseline, there are no taxonomy enums, the timezone is per
  event, and the hardcoding check is green.

## Risks

- **Silent count drift during migration.** Mitigation: the P09.4 totals script runs against a
  restored production backup before staging, and again after the contract step.
- **Queued offline captures from old clients.** Mitigation: the redirects plus the outbox upgrade
  (P09.7/P09.8), with the window set in ADR-009.

## Phase report

_Fill in on completion._
