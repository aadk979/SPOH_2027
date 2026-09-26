# ADR-002 — Configurable taxonomy and per-event product rules

| Field     | Value                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status    | Accepted (G1, 2026-09-26; written in P05.3)                                                                                                                                                                        |
| Decisions | D-04 = configurable per event (owner). D-03 = A (owner). Q-P1, what a merged count may show and which visitor data is allowed: **assumed**. Items marked **assumed** were accepted by the owner's delegation at G1 |
| Resolves  | F02-004 (merges PF-05); F01-015, F01-018, F01-019, F01-020, F01-045; F01-046; F01-050; F01-048, F01-049; F04-016; F03-028 (the lost-card rule); F03-038 (the mirror test)                                          |
| Builds in | P09.2, P09.5, P09.10, P09.12, P09.14                                                                                                                                                                               |

## Context

Four enums hold what an organiser should choose (F01 § Enum audit):

| Enum              | Members today                         | What branches on it                                                                                                      |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `VisitorCategory` | 8 (Sec 1–5, graduated, parent, other) | nothing in code; labels hardcoded three times; the booth assumes 8 buttons                                               |
| `StationKind`     | 6                                     | client only: `SIGNUP_BOOTH` shows registration, `MISSION_COMPLETE` shows redemption; the server never reads it (F01-050) |
| `CourseCode`      | 4 diplomas                            | nothing; the brief keys its course lines by it                                                                           |
| `ShiftBlock`      | `MORNING`, `AFTERNOON`                | "is a shift running" (station scope, attendance, dashboard, check-in), a unique key, the import, the settings form       |

A third shift, a new kind of station or different visitor categories each need a migration and a
deploy (F02-004). Shift labels are already wrong after a settings change, because the client
hardcodes the hours (F01-046).

D-04 made the two structural product rules per-event options: "the three counts never merge" and
"no visitor personal data" (F01-048, F01-049). Neither has a literal to move: both are enforced by
the shape of the schema and the DTOs. So each needs a defined second mode, and a data
classification for events that turn personal data on (F04-016).

## Decision

### 1. Taxonomy tables (event-owned, ADR-001)

| Table             | Columns                                                                                                    | Replaces                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `CaptureCategory` | `eventId`, `code`, `label`, `sortOrder`, `active`                                                          | `VisitorCategory` (the category a registration counts in) |
| `StationType`     | `eventId`, `code`, `label`, capabilities `registersVisitors`, `countsEntry`, `issuesStamp`, `redeemsGifts` | `StationKind`, and `Station.countsEntry`/`issuesStamp`    |
| `StationTag`      | `eventId`, `code`, `label`, `description`; many-to-many with `Station` through `StationTagging`            | `CourseCode` (a course is one kind of tag)                |
| `ShiftTemplate`   | `eventId`, `code`, `label`, `startLocal`, `endLocal` (`HH:MM`), `endsNextDay`, `sortOrder`                 | `ShiftBlock` and the `shiftBlocks` setting                |
| `Shift`           | `eventId`, `eventDayId`, `templateId`, `startsAt`, `endsAt` (`timestamptz`), `overridden`                  | the (day, block) pair                                     |

Rules:

- **Codes are stable, labels are free.** `code` is unique per event, cannot change once a row
  references it, and is what CSV imports and content use. `label` can change at any time, and
  every screen, report and export shows the label (F02-026's "written for machines" goes too).
- **Referenced rows are deactivated, never deleted.** A category with registrations can be hidden
  from the booth (`active = false`), and its counts stay in the reports under its label.
- **Capabilities live on the type only.** A station does what its type allows. A station that
  needs different behaviour gets a different type, because types are cheap per-event rows.
  Keeping a second copy of the flags on each station would give two sources of truth. The server
  enforces every capability (F01-050): registration needs `registersVisitors`, redemption needs
  `redeemsGifts`, a footfall tick needs `countsEntry`, and a stamp needs `issuesStamp`. Two of
  these checks are new, so they are a behaviour change, and P09.5 lists them.
- **Shifts are materialised.** A `Shift` row holds real instants, computed from its template, its
  day and the event's timezone (ADR-003 § time). "Is a shift running now" becomes
  `startsAt <= now < endsAt`: no minute-of-day arithmetic and no fixed offset. A DST day is
  handled once, when the shift is created, by the rules in F01 § Time audit (an ambiguous local
  time takes the **earlier** offset, and a skipped one moves forward to the first valid instant).
  Editing a template regenerates the shifts that are not `overridden`, in one audited
  transaction. The exceptions grid (P13.3) sets `overridden` on the shifts it changes.
- **Shifts may cross midnight** (Q-P2, **assumed**). `endsNextDay` lets a template end on the next
  calendar day. Which day a capture belongs to follows the event's `dayBoundaryMinutes`
  (ADR-004).
- **Contracts carry ids and labels.** DTOs send `categoryId` with `categoryCode` and
  `categoryLabel`, never an enum. The shared package's `z.enum`s for the four enums are removed.
  Input is validated by the server against the event's active rows.
- **The booth renders N categories** in `sortOrder`. Its layout is tested with 1, 8 and 12
  categories.

### 2. What stays an enum (the invariants)

An enum stays when the platform's own code gives each member its meaning: a state machine, a
provenance tag, or a protocol.

| Enum                                                                                | Why it stays                                                      | Invariant test that keeps it honest                                                                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CommitteeRole`                                                                     | the fixed role catalogue (D-03 A); labels are per event (ADR-005) | the catalogue in `@spoh/shared` equals the Cedar schema's role list (ADR-005)                                             |
| `DataSource`                                                                        | provenance, which reports must keep apart                         | the report and export suites assert each source is shown separately, and no query sums across sources unlabelled          |
| `SwapStatus`, `IncidentStatus`, `CardStatus`, `LostPersonStatus`, `LostFoundStatus` | state machines                                                    | one transition table per machine in `domain/`. Illegal moves are rejected (F03-024, F03-027), and a test walks every pair |
| `IncidentType`, `IncidentSeverity`                                                  | a generic safety taxonomy; severity drives escalation             | escalation tests (HIGH and CRITICAL push)                                                                                 |
| `AnnouncementPriority`                                                              | delivery behaviour                                                | push and audience tests                                                                                                   |
| `AttendanceMethod`                                                                  | the verification protocol                                         | attendance tests                                                                                                          |

Two tests guard the boundary:

1. **Mirror test** (F03-038, kept from P03): every Prisma enum is mirrored in
   `packages/shared/src/invariants/`, and nothing else is.
2. **No-taxonomy test** (P09.10): `schema.prisma` declares none of `VisitorCategory`,
   `StationKind`, `CourseCode` or `ShiftBlock`, and no `z.enum` in `@spoh/shared` lists their
   members. The no-hardcoding check (P09.11) catches their literals in `src/`.

### 3. The lost-card rule (F03-028, confirmed)

- **Reissuing** a card marks the original **`LOST`**, not `VOIDED`, and links the new card through
  `reissuedFromId`. `VOIDED` is only for a spoiled card that is taken out of use.
- **A journey** is the chain of cards linked by reissues. The funnel counts **journeys**:
  - "issued" counts each chain once;
  - a chain has reached a station if any card in it was stamped there, counted once;
  - "completed" counts a chain whose latest card is `COMPLETED`;
  - `LOST` cards are never counted as voided.
- Only an `ISSUED` or `COMPLETED` card can be reissued (F03-027). One gift per journey: a
  redemption against any card in a chain counts for the chain (F03-003).

### 4. Per-event product rules (D-04)

Two event settings (ADR-003). Their defaults are today's behaviour, so an event that never
touches them runs exactly as SPOH 2027 does.

**`countsMode`: the three counts** (Q-P1, **assumed**)

| Mode                 | What reports, dashboards and exports show                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `separate` (default) | the three counts side by side with their units, and no visitor total anywhere                                                                                                                                                                                 |
| `headline`           | the same, plus one **headline** figure the event chooses from **one** of the three: registrations, footfall at a chosen station, or journeys. It is labelled with its source ("Visitors: from registrations"), and the three counts are always shown under it |

**Adding counts together is never a mode.** A registration, a footfall tick and a Mission Card
count different things (one card can be four people, and one person can pass three counters),
so a sum is wrong, not merely discouraged. "Merge" therefore means one headline from one source,
never arithmetic across sources. The rule that the three tables are never joined into a total
stays an invariant of the code.

**`visitorDataMode`: visitor personal data** (Q-P1, **assumed**)

| Mode             | Behaviour                                                                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none` (default) | today's model: no visitor-scoped table has a name, contact, school or identifier. The one exception is `LostPersonAlert`, which is transient and purged to `LostPersonSummary`                                                                                                           |
| `allowlist`      | the event defines `VisitorField`s: `code`, `label`, `type`, `classification`, `retentionDays` and `readers` (catalogue roles). Values are stored only in `VisitorRecord` (`eventId`, `registrationId`, `data` JSON validated against the event's fields, `purgeAfter`), a separate table |

- **Counts never depend on personal data.** `Registration` has no personal columns in either mode.
  A purge deletes `VisitorRecord` rows and leaves every count untouched.
- **Readers are enforced by policy.** Reading a `VisitorRecord` is its own Cedar action, allowed
  only to the field's reader roles (ADR-005). Exports include visitor data only for a caller with
  that permission, and only as a separate sheet.
- **Changing modes:** `none` → `allowlist` is allowed while the event is `DRAFT`, `READY` or
  `REHEARSAL`. `allowlist` → `none` purges every `VisitorRecord` first, and is audited.

### 5. Data classification (F04-016)

Every column that can hold personal data carries a class. The class decides retention, who may
read it, and whether it may appear in logs, audit `before`/`after` values, push payloads and
exports.

| Class               | Examples                                           | Retention (default, event setting where marked)                                                      | In logs, audit values, push payloads                        |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `operational`       | counts, stations, shifts, gift stock               | kept with the event                                                                                  | yes                                                         |
| `staff-personal`    | person name, email, phone; membership notes        | while a membership is active, then _N_ days after the event is archived (event setting, default 365) | name and id only; never phone                               |
| `visitor-transient` | lost-person description, clothing, approximate age | purged `lostPersonPurgeHours` after resolution (the existing promise)                                | **never**, including the idempotency replay store (F04-013) |
| `visitor-personal`  | `VisitorField` values (allowlist mode only)        | the field's `retentionDays` after the event is `CLOSED`                                              | **never**                                                   |
| `media`             | lost-and-found photos                              | 30 days after the event is `CLOSED` (event setting)                                                  | key only                                                    |

The class is declared in the schema (`/// @class visitor-transient`), and a test fails if a new
column of a personal type has none. Retention runs through the scheduler's purge handlers
(ADR-004). The full schedule, including audit rows and logs, is in ADR-003 § Retention.

## Options considered

| Topic             | Chosen                                                    | Rejected, and why                                                                                                                                 |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Station behaviour | capability flags on `StationType` only                    | flags on each station (F01's first draft): two sources of truth, and no way to say "all course stations"; keeping `kind`: the F01-050 gap stays   |
| Course codes      | generic `StationTag`, many-to-many                        | a `Programme` table: right for SP, but "course" is one event's idea; tags also cover zones and floors                                             |
| Shift model       | template + materialised `Shift` with instants             | template only, computing instants on every check: repeats the DST logic in every query and keeps "is it running" in minute-of-day arithmetic      |
| Merged count      | a headline from one source, labelled                      | a sum of the three counts: arithmetically wrong. A de-duplicated "unique visitors": impossible without the personal data the default mode forbids |
| Visitor data      | an allowlisted, separate table with retention and readers | columns on `Registration`: a purge would touch the counts, and the default mode could not be proven by schema shape                               |
| Lost card         | original `LOST`, count journeys                           | keep `VOIDED`: F03-028's double count stays                                                                                                       |

## Consequences

- A third shift, a new station type or a different set of categories is an admin action, not a
  release.
- Two server checks become enforced (`registersVisitors`, `redeemsGifts`). A station that today
  registers visitors without the flag would start being refused. The Event #1 migration derives
  the flags so that nothing that works today stops working, and P09.4 verifies it.
- The report changes wherever it grouped by enum: it groups by row and shows labels, and the
  numbers for Event #1 stay identical (P09.12).
- D-04's modes multiply the test matrix. Every report, export, dashboard and DTO test runs in both
  `countsMode`s, and the capture and export tests in both `visitorDataMode`s (P09.14).
- The funnel changes for any card that was reissued. The Event #1 numbers change only by the
  double count F03-028 describes, and the report states it.

## How it is tested

- **Domain unit tests:** category and type validation, capability checks per action, shift
  materialisation (including the 12 DST and zone cases in F01 § Time audit, and a shift crossing
  midnight), and the journey funnel over chains of reissues.
- **Invariant tests:** the mirror and no-taxonomy tests (§2), and one transition-table test per
  state machine.
- **Mode tests** (P09.14): with `separate`, no response body contains a total. With `headline`,
  the total always equals the chosen source's count and is always accompanied by all three. With
  `none`, no table or DTO outside `LostPersonAlert` has a field classed `visitor-*`. With
  `allowlist`, a purge leaves every count identical.
- **Migration test** (P09.4): the totals per category, station and day are identical before and
  after.

## Migration

1. **Expand** (P09.2): create the five tables and `StationTagging`, and add nullable
   `Registration.categoryId`, `Station.typeId`, `ShiftAssignment.shiftId`. The enum columns stay
   authoritative.
2. **Backfill Event #1** (P09.4, **D-12 assumed**):
   - one `CaptureCategory` per `VisitorCategory` member, with today's labels (from
     `client/src/lib/format.ts`) and today's order;
   - one `StationType` per distinct (`kind`, `countsEntry`, `issuesStamp`) combination in use.
     `registersVisitors` is set where `kind = SIGNUP_BOOTH`, and `redeemsGifts` where
     `kind = MISSION_COMPLETE`, matching what the client does today;
   - one `StationTag` per `CourseCode` in use, linked to its stations;
   - `ShiftTemplate` rows `MORNING` and `AFTERNOON` from the **current** `shiftBlocks` setting (not
     the schema comment), and one `Shift` per event day and template;
   - the FK columns filled from the enum columns.
3. **Switch** (P09.5): read and write the FK columns, and serve ids and labels. The client renders
   from the rows.
4. **Contract** (P09.10): drop the four enum columns and types, `Station.kind`, `courseCode`,
   `countsEntry` and `issuesStamp`, and the `shiftBlocks` setting.
5. **The lost-card fix** lands earlier, in P06.13, on today's enums. Existing reissued originals
   are corrected from `VOIDED` to `LOST` by a data migration that touches only cards with a
   reissue, and the report notes it.
