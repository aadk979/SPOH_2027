# F01 — Hardcoding and configuration inventory

Output of P01 (Audit A). Every value that ties the system to SPOH 2027, to Singapore, to one venue
or to one deployment, with the place it moves to.

- **Swept commit:** `1e81e6f` on `main`. Product code is unchanged since then.
- **Raw hits:** `reports/P01/raw/`, produced by `bash remediation/reports/P01/sweep.sh`
  (patterns, scope and exclusions are in the script and in `reports/P01/README.md`).
- **Classification:** `node remediation/reports/P01/classify.mjs` assigns every raw hit to one item
  below or to one false-positive reason, writes `raw/CLASSIFIED.tsv` (one row per hit) and exits 1
  if any hit is left over. `--where` prints each item's locations. It exits 0: **1271 of 1271 hits
  are classified.**

## Decisions this audit applies

- **D-02 = A** (one organisation, many events). Organisation identity (name, app name, campus) is a
  `platform-setting` held on the `Organisation` row. Everything about one event is `event-data`,
  `event-setting` or `event-content`.
- **D-04 = configurable per event.** "The three counts never merge" and "no visitor personal data"
  are **not** `invariant`s. Neither has a literal in the code: both are enforced by structure (three
  separate tables and DTOs; no personal-data columns; lost-person descriptions purged after
  `lostPersonPurgeHours`). They become per-event options, designed in P05 and built in P09/P10. See
  [D-04 items](#d-04-items-no-literal-hit).
- **D-03 is open.** `CommitteeRole` is classed `invariant` on the recommended answer (A: a fixed
  catalogue, renameable per event). If D-03 is B, F01-021 becomes `event-data`.

## Hits per class

| Class              | Hits | Items                                                              |
| ------------------ | ---: | ------------------------------------------------------------------ |
| `event-data`       |  169 | F01-001, 002, 006, 008, 014, 015, 018–020, 023–028, 045            |
| `event-setting`    |   14 | F01-009, 037, 039 (and F01-048, 049, which have no literal hit)    |
| `station-setting`  |    0 | none from the sweep (P01.5 assigns settings to this scope)         |
| `platform-setting` |   13 | F01-003, 004, 038                                                  |
| `event-content`    |   28 | F01-005, 007, 010, 012, 013                                        |
| `infra-config`     |   69 | F01-029–033                                                        |
| `secret`           |    0 | no secret value is committed; P01.4 classifies the secret env keys |
| `invariant`        |  159 | F01-021, 022                                                       |
| `fixture`          |  526 | F01-011, 016, 017, 034, 042–044                                    |
| `legit-constant`   |  201 | F01-035, 036, 040, 041                                             |
| false positive     |   92 | FP-comment, FP-meta, FP-match                                      |
| **Total**          | 1271 |                                                                    |

## Inventory (P01.2)

Locations are `file:lines`; `raw/CLASSIFIED.tsv` has every hit. Paths drop the `server/src/`,
`client/src/` and `packages/shared/src/` prefixes where the package is obvious from the file
(`modules/…`, `lib/…` and `middleware/…` are server; `app/…`, `components/…` and `features/…` are
client; `dto/…` is shared).

### Event identity and branding

| ID      | file:line                                                                                                                                                                                                                            | Literal                                                             | Meaning                                                   | Class              | Target home                                                         | Phase         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- | ------------- |
| F01-001 | `app/layout.tsx:8`, `app/home/page.tsx:21`, `app/sign-in/page.tsx:110`, `app/tv/page.tsx:98`, `components/GlobalNav.tsx:61`, `components/SectionNav.tsx:57`, `app/admin/settings/page.tsx:292`, `modules/report/export.ts:47,73,363` | `SPOH 2027`, `Open House 2027`                                      | Event name in the page title, nav, TV header, report copy | `event-data`       | `Event.name`; UI and exports read the current event                 | P09.1, P14.6  |
| F01-002 | `lib/settings.ts:44`, `client/src/lib/runtimeSettings.ts:46`                                                                                                                                                                         | `eventName: 'SPOH 2027'`                                            | Admin-editable name that nothing displays (F01-047)       | `event-data`       | `Event.name`; retire the setting                                    | P09.1, P10.1  |
| F01-003 | `app/sign-in/page.tsx:112`, `components/SectionNav.tsx:56`                                                                                                                                                                           | `School of Computing`                                               | Organisation name                                         | `platform-setting` | `Organisation.name` (D-02)                                          | P09.1, P14.6  |
| F01-004 | `client/public/manifest.json:3`, `client/public/sw.js:91`, `app/layout.tsx:11`, `modules/{announcement,incident,lostPerson}/service.ts:194,187,254`                                                                                  | `SPOH Ops`                                                          | App short name in PWA metadata and push titles and bodies | `platform-setting` | `Organisation.appName`                                              | P14.6         |
| F01-005 | `client/public/manifest.json:2,4`, `app/layout.tsx:9`                                                                                                                                                                                | `SPOH 2027 Operations`, `…Open House, 6-9 January 2027.`            | App name and description with the event's dates           | `event-content`    | Manifest and metadata generated from Organisation and current Event | P13.4, P14.6  |
| F01-006 | `modules/report/router.ts:46,56`, `app/reports/page.tsx:72`                                                                                                                                                                          | `spoh2027-report-…`                                                 | Report download file name                                 | `event-data`       | `Event.slug`                                                        | P09.1, P09.12 |
| F01-007 | `app/safety/incident/new/page.tsx:161`, `app/inbox/page.tsx:177`                                                                                                                                                                     | `T19, level 2 walkway`, `DCDF at capacity, ushers hold at Welcome…` | Placeholders naming this venue and its stations           | `event-content`    | Event-neutral placeholder copy (not a ContentDocument)              | P14.8         |
| F01-008 | `app/chief/imports/page.tsx:44–49`                                                                                                                                                                                                   | `SEC_4,SIGNUP_BOOTH,2027-01-07T03:30…`, `DCDF_STATION,42,…`         | Sample CSV on the import screen                           | `event-data`       | Generated from the event's categories, stations and days            | P13.3         |
| F01-009 | `app/attendance/page.tsx:138,142,147`, `features/attendance/VerifierCode.tsx:70`, `modules/attendance/service.ts:315`, `server/.env.example:74`                                                                                      | `SP Wi-Fi`, `SP network`, `from SP IT`                              | Name of the venue network that QR attendance requires     | `event-setting`    | `attendance.campusNetworkLabel`, next to the CIDR list (P01.4)      | P10.1, P10.4  |
| F01-010 | `dto/shift.ts:96` (and lines 92–100)                                                                                                                                                                                                 | `MANDATORY_BRIEF_POINTS`                                            | The four points every briefing must cover                 | `event-content`    | ContentDocument, briefing section                                   | P13.3         |
| F01-011 | `app/sign-in/page.tsx:86`                                                                                                                                                                                                            | `you@spoh2027.test`                                                 | Dev seed domain shown as the production sign-in hint      | `fixture`          | Neutral placeholder                                                 | P14.8         |
| F01-012 | `client/src/content/brief.ts` (13 hits: 11–150)                                                                                                                                                                                      | course codes, `T19`, route, safety points, training date            | The volunteer brief (courses, route, FAQs, map levels)    | `event-content`    | ContentDocument (schema drafted in P01.6)                           | P13.3, P13.4  |
| F01-013 | `app/map/page.tsx:15,28`                                                                                                                                                                                                             | `T19, School of Computing`                                          | Map page copy                                             | `event-content`    | ContentDocument, map section                                        | P13.3         |

### Schedule and taxonomy

| ID      | file:line                                                                                                                                                                                                                                                                              | Literal                                                                  | Meaning                                                   | Class                | Target home                                                         | Phase         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- | ------------- |
| F01-014 | `server/prisma/seed.ts:46–63,205,206`                                                                                                                                                                                                                                                  | `2027-01-06…09`, `2026-11-18`, `2027-01-04`, `Sec 4 Tour Day 1`, …       | The real event's days and dry runs, in the dev seed       | `event-data`         | `EventDay` rows under `Event`: admin UI or D-12 migration           | P09.4, P13.3  |
| F01-015 | `server/prisma/seed.ts:76–144`                                                                                                                                                                                                                                                         | `SIGNUP_BOOTH`, `DAAA Station`, `courseCode: 'DCS'`, `T19 Foyer`, …      | The real event's stations and course codes                | `event-data`         | `Station` rows per event; seed gets a generic fixture event         | P09.2, P09.11 |
| F01-018 | `app/capture/registration/page.tsx:24–31`, `…/group/page.tsx:25–32`, `client/src/lib/format.ts:82–89`                                                                                                                                                                                  | `SEC_1`…`SEC_5`, `GRADUATED_AWAITING_RESULTS`, `PARENT_GUARDIAN`, labels | Visitor categories and their labels, repeated three times | `event-data`         | `VisitorCategory` table per event (P01.3)                           | P09.2         |
| F01-019 | `components/ShiftOverview.tsx:149,173`                                                                                                                                                                                                                                                 | `kind === 'SIGNUP_BOOTH'`, `kind === 'MISSION_COMPLETE'`                 | Station kind decides which capture actions a shift shows  | `event-data`         | Station capability flags (P01.3)                                    | P09.2         |
| F01-020 | `lib/settings.ts:46–50`, `lib/time.ts:33,60,64`, `server/prisma/schema.prisma:90,91`, `client/src/lib/format.ts:60,71`, `app/admin/settings/page.tsx:243`, `config/env.ts:90`, `server/.env.example:67`                                                                                | `MORNING 09:30–14:00`, `AFTERNOON 13:30–18:00`                           | Two fixed shift blocks and their hours                    | `event-data`         | Shift-block table per event; labels from data (F01-046)             | P09.2, P10.1  |
| F01-045 | `server/prisma/schema.prisma:66–69`, `packages/shared/src/enums.ts:34`                                                                                                                                                                                                                 | `DAAA`, `DCDF`, `DCS`, `DCITP`                                           | The school's four diplomas as an enum                     | `event-data`         | Course (or programme) table per event (P01.3)                       | P09.2         |
| F01-021 | `packages/shared/src/capabilities.ts:49–54`, `dto/roster.ts:23,64`, `features/admin/useVolunteers.ts:121–126`, `middleware/rbac.ts:97`, `middleware/auth/cognitoProvider.ts:57–62`, `modules/identity/provider.ts:54–59`, `modules/{announcement,attendance,gift,incident}/service.ts` | `'VOLUNTEER'`…`'ADMIN'`, `roleMeets(…, 'IC')`                            | Role catalogue, role checks and Cognito group names       | `invariant` (D-03 A) | Fixed catalogue with per-event labels; checks become Cedar policies | P11.2, P11.5  |
| F01-022 | 34 files; `raw/CLASSIFIED.tsv`                                                                                                                                                                                                                                                         | `'VOIDED'`, `'URGENT'`, `'HELD'`, `'REQUESTED'`, `'APP'`, `'QR'`, …      | Workflow states, severities, provenance, methods          | `invariant`          | Stay in code as enums, documented (P01.3 verdict per enum)          | P01.3         |

### Time and time zone

| ID      | file:line                                                                                 | Literal                                                             | Meaning                                                             | Class        | Target home                                            | Phase        |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------ | ------------------------------------------------------ | ------------ |
| F01-023 | `lib/time.ts:4,7,19,21,22`                                                                | `EVENT_TIME_ZONE = 'Asia/Singapore'`, `SGT_OFFSET_MINUTES = 8 * 60` | Every server wall-clock computation uses a fixed +8 offset          | `event-data` | `Event.timeZone` (IANA) through `platform/time`        | P09.6        |
| F01-024 | `modules/report/repo.ts:48,50,54,75,81,153,159,183`                                       | `AT TIME ZONE 'Asia/Singapore'`, UTC `date_trunc('hour')`           | Report day grouping; hour buckets assume a whole-hour offset        | `event-data` | Event tz as a query parameter; bucket in local time    | P09.6        |
| F01-025 | `modules/report/export.ts:21,29,30,147,231,297,324,373,393,415`                           | `+ 8 * 60 * 60_000`, `(SGT)`                                        | Export shifts timestamps by 8 h and labels columns SGT              | `event-data` | Format in the event tz; label from the tz              | P09.6        |
| F01-026 | `client/src/lib/format.ts:10,14,24,38`                                                    | `const TZ = 'Asia/Singapore'`                                       | Every client time is rendered in Singapore time                     | `event-data` | Event tz from the client's event context               | P09.6, P09.8 |
| F01-027 | `dto/common.ts:25`, `dto/settings.ts:24`                                                  | `interpreted in Asia/Singapore`                                     | Contract docs fix the zone of dates and `HH:MM` settings            | `event-data` | "the event's time zone"                                | P09.6        |
| F01-028 | `ops/backup/spoh-backup.sh:86` (code 88–92), `ops/backup/spoh-backup-check.sh:34` (38–43) | `minute_of_day >= 90 && < 600`                                      | Backup cadence and staleness use 09:30–18:00 SGT as 01:30–10:00 UTC | `event-data` | Superseded by RDS backups (P08.3); else read the event | P08.3        |

### Infrastructure and deployment identity

| ID      | file:line                                                                                                                                                             | Literal                                                                             | Meaning                                                | Class            | Target home                                                   | Phase        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------- | ------------------------------------------------------------- | ------------ |
| F01-029 | `server/.env.example:26,29,30`, `client/.env.example:11,13,14`, `config/env.ts:56`                                                                                    | `ap-southeast-1_9bwl2nGF7`, `23uft7mvtnrno1uunsc5lp0h2v`, `spoh2027-livetest.auth…` | The live Cognito pool, app client and hosted-UI domain | `infra-config`   | SSM from CDK outputs; example files hold placeholders         | P08.6, P12.1 |
| F01-030 | `config/env.ts:53,114`, `server/.env.example:28,63`, `client/.env.example:15`, `server/scripts/{sync-cognito-subs,verify-cognito}.mjs:39,43`                          | `ap-southeast-1`                                                                    | Default region                                         | `infra-config`   | CDK context and SSM; no default in app code                   | P08.1, P08.6 |
| F01-031 | `ops/backup/*` (44 hits)                                                                                                                                              | `spoh2027-backups-665146708212`, `/etc/spoh/backup.env`, unit names                 | Backup bucket, account id, IAM policy, host paths      | `infra-config`   | CDK storage and RDS automated backups replace the host daemon | P08.3, P08.7 |
| F01-032 | `client/src/lib/env.ts:21`, `client/next.config.ts:11`, `config/env.ts:62`, `server/.env.example:40`, `client/.env.example:6`, `server/scripts/verify-cognito.mjs:44` | `http://localhost:4010`, `http://localhost:3000`                                    | Dev API base and CORS origin defaults                  | `infra-config`   | Dev-only defaults; production from SSM, guarded               | P08.6        |
| F01-033 | `modules/auth/tokens.ts:28,29`, `middleware/auth/localProvider.ts:24,25`, `server/scripts/load-test.mjs:80,81`                                                        | `spoh2027-api`, `spoh2027-local-dev`                                                | JWT issuer and audience                                | `infra-config`   | Derived from the deployment's base URL (SSM)                  | P08.6, P12.5 |
| F01-034 | `server/.env.example:14`, `scripts/dev-db-local.sh:14–80`, `server/scripts/setup-test-db.mjs:16`                                                                      | `spoh2027`, `spoh2027_test`, `5435`                                                 | Dev and test database names and port                   | `fixture`        | Stays (dev only)                                              | —            |
| F01-035 | `client/src/lib/outbox.ts:21`, `client/public/sw.js:16`                                                                                                               | `DB_NAME = 'spoh2027'`, `spoh2027-shell-v1`                                         | IndexedDB outbox and service-worker cache names        | `legit-constant` | Stays; a rename needs an outbox migration                     | P07          |
| F01-036 | `lib/shortCode.ts:58`, `app/capture/stamp/page.tsx:83`                                                                                                                | `spoh2027:<uuid>`                                                                   | QR payload prefix, printed on physical cards           | `legit-constant` | Stays; printed cards must keep scanning                       | P09.2        |
| F01-037 | `server/.env.example:71`                                                                                                                                              | `ATTENDANCE_ROOT_EMAIL=event-root@example.com`                                      | The one person who can mark attendance unverified      | `event-setting`  | An event-membership flag (P01.4)                              | P09.3, P10.4 |

### Numbers in `server/src/modules`

| ID      | file:line                                                               | Literal                                                                          | Meaning                                                                                                                  | Class              | Target home                       | Phase |
| ------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------- | ----- |
| F01-038 | `modules/notification/service.ts:73–77`                                 | `600`, `900`, `1800`                                                             | Push TTL per notification kind, in seconds                                                                               | `platform-setting` | Settings registry, platform scope | P10.1 |
| F01-039 | `modules/report/repo.ts:104,111`, `export.ts:135,146`, `service.ts:217` | `/ 1800) * 1800`, `30-minute curve`                                              | Report peak and curve bucket fixed at 30 minutes                                                                         | `event-setting`    | Settings registry, event scope    | P10.1 |
| F01-040 | 36 files; `raw/CLASSIFIED.tsv`                                          | `res.status(201)`, `new AppError(409, …)`, `status === 410`                      | HTTP status codes                                                                                                        | `legit-constant`   | Stays                             | —     |
| F01-041 | 25 files; `raw/CLASSIFIED.tsv`                                          | `randomBytes(32)`, `.slice(0, 10)`, `/ 1000`, `.max(64)`, column widths, `> 300` | Crypto sizes, ISO slicing, unit conversion, input bounds, export layout, token max age, 10-digit PIN, "last hour" window | `legit-constant`   | Stays, named where it is not      | P06   |

### Fixtures

| ID      | file:line                                                                                                 | Literal                                                     | Meaning                                         | Class     | Target home                                   | Phase         |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | --------- | --------------------------------------------- | ------------- |
| F01-016 | `server/prisma/seed.ts:163–459` (25 lines)                                                                | `admin@spoh2027.test`, `spoh2027:dev-0001`, …               | Dev people, assignments, reporting lines, cards | `fixture` | Dev seed only                                 | P09.11        |
| F01-017 | `server/prisma/seed.ts:42,217,218,389`                                                                    | `Date.now() + 8 * 60 * 60 * 1000`, `09:30 to 12:30 SGT`     | Seed computes "today" and footfall in SGT       | `fixture` | Seed uses the event-tz helpers                | P09.6, P09.11 |
| F01-042 | `modules/devAuth/router.ts:61`                                                                            | `12 * 60 * 60`                                              | Dev sign-in token lifetime                      | `fixture` | Stays (dev only)                              | —             |
| F01-043 | `server/tests/**`, `client/tests/**`, `server/vitest.config.ts`, `client/playwright.config.ts` (450 hits) | `FROZEN_NOW = 2027-01-07T03:30Z`, `@spoh.test`, enum values | Test data and the frozen clock                  | `fixture` | Stays; P09.6 adds non-Singapore and DST cases | P09.6         |
| F01-044 | `server/scripts/load-test.mjs`, `server/scripts/verify-cognito.mjs:102` (14 hits)                         | `SIGNUP_BOOTH`, `loadtest.spoh2027.test`, `['IC', 40]`      | Load-test and verification sample data          | `fixture` | Stays; station and role come from arguments   | P16           |

### False positives

| Reason     | Hits | What they are                                                                                                                                       |
| ---------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| FP-comment |   70 | Narrative comments ("at 09:25 on the day", "slide 39", "PRODUCT_BRIEF §10"), example hosts in comments, and one neutral placeholder (`since 11:15`) |
| FP-meta    |   15 | `SPOH 2027` in `package.json` descriptions and `.env.example` headers; `SPOH_*` variable names; empty `NEXT_PUBLIC_COGNITO_*_ID=` keys              |
| FP-match   |    7 | `OTHER` of another enum, `CRITICAL:` in backup-check output, `DCS: 120` in a comment, `${CHECKSUM:0:16}`                                            |

### D-04 items (no literal hit)

| ID      | Rule                         | Where it is enforced today                                                                                                                                                  | Class           | Target home                                                 | Phase           |
| ------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- | --------------- |
| F01-048 | The three counts never merge | Separate `Registration`, `FootfallTick` and `MissionCard` tables and DTOs (`dto/common.ts:43`); reports and tiles keep units apart (`components/dashboard/StatTile.tsx:10`) | `event-setting` | Per-event option (D-04); P05 defines what "merged" may show | P05, P09.12     |
| F01-049 | No visitor personal data     | DTO shapes (`dto/registration.ts:10`, `dto/lostFound.ts:15`); lost-person descriptions purged after `lostPersonPurgeHours`                                                  | `event-setting` | Per-event option (D-04) with retention and access rules     | P05, P09, P15.7 |

## Enum audit (P01.3)

Fifteen Prisma enums; fourteen are mirrored in `packages/shared/src/enums.ts`. `AttendanceMethod`
is not: `dto/attendance.ts:13` redeclares it, although `enums.ts:3–9` says every Prisma enum is
mirrored there. Subset enums in DTOs (`ImportSource`, footfall `source`, lost-person `outcome`,
swap `decision`) follow their parent's verdict.

**Verdict rule.** An enum stays an `invariant` when the platform's own code gives each member its
meaning (a state machine, a provenance tag). It becomes `event-data` when an event's organisers
choose the members. Branches on an `event-data` member become capability flags on the new row.

### Becomes data (P09.2)

| Enum              | Members                                                                                          | Code that branches on a member                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Becomes                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VisitorCategory` | `SEC_1`…`SEC_5`, `GRADUATED_AWAITING_RESULTS`, `PARENT_GUARDIAN`, `OTHER`                        | None on a member. Labels are hardcoded three times (`app/capture/registration/page.tsx:23–32`, `…/group/page.tsx:24–33`, `client/src/lib/format.ts:81–90`); dashboard and report group by the raw value (`modules/dashboard/repo.ts:20–26`); the booth layout assumes eight buttons (`components/AppShell.tsx:26`).                                                                                                                                                                                                                                          | `VisitorCategory` table per event: `code`, `label`, `sortOrder`, `active`. No flags. The booth grid renders N rows. Registrations keep a foreign key, never a label.                               |
| `StationKind`     | `SIGNUP_BOOTH`, `WELCOME_LOUNGE`, `COURSE_STATION`, `MISSION_COMPLETE`, `WELCOME_PARTY`, `OTHER` | Client only: `components/ShiftOverview.tsx:149` (`SIGNUP_BOOTH` shows registration) and `:173` (`MISSION_COMPLETE` shows gift redemption). The server never reads `kind` (F01-050). The other four members change nothing. `countsEntry` and `issuesStamp` are already flags and are enforced server-side (`modules/station/service.ts:41`, `modules/missionCard/service.ts:134`).                                                                                                                                                                           | Drop the enum. Add flags `registersVisitors` and `redeemsGifts` beside `countsEntry` and `issuesStamp`, enforced by the server. A free-text or template "type" label may stay for display.         |
| `CourseCode`      | `DAAA`, `DCDF`, `DCS`, `DCITP`                                                                   | None. Stored as `Station.courseCode` (nullable) and echoed by the station DTOs; the brief (`content/brief.ts:22–69`) keys its course one-liners by it.                                                                                                                                                                                                                                                                                                                                                                                                       | An optional `Programme` table per event (`code`, `name`, `summary`) referenced by stations and by the brief content (P01.6). No flags.                                                             |
| `ShiftBlock`      | `MORNING`, `AFTERNOON`                                                                           | `lib/time.ts:36–66,121` (ranges keyed by the two members, from the `shiftBlocks` setting); `middleware/rbac.ts:123` (station scope needs a running block); `modules/attendance/service.ts:129`; `modules/me/service.ts:33,37,104`; `modules/dashboard/service.ts:54,142`; `modules/shift/service.ts:253`; unique `(volunteer, day, block)`; roster import `block` column; settings DTO `z.record(ShiftBlock, …)` (`dto/settings.ts:47`); the settings form edits exactly two blocks (`app/admin/settings/page.tsx:243`); `blockLabel`/`blockWord` (F01-046). | `ShiftBlock` table per event: `code`, `label`, local `start`/`end`, `sortOrder`. `ShiftAssignment.blockId` replaces the enum column; the `shiftBlocks` setting is retired. DST rules are in P01.7. |

### Stays in code

| Enum                   | Verdict                     | Why                                                  | Code that branches on a member                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Notes                                                                                                                                                           |
| ---------------------- | --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommitteeRole`        | `invariant` (**D-03 open**) | D-03 A keeps a fixed catalogue, renameable per event | Capability matrix `capabilities.ts:49–…` behind 83 `requireCapability` calls; rank checks `modules/admin/service.ts:57`, `app/admin/users/page.tsx:195`, `modules/notification/service.ts:109–111`, `modules/announcement/service.ts:45`, `middleware/rbac.ts:97`; `modules/attendance/service.ts:25,78,180,311`; Cognito groups `middleware/auth/cognitoProvider.ts:57–62`, `modules/identity/provider.ts:54–59`, `middleware/auth/index.ts:201`; audiences `modules/gift/service.ts:243`, `modules/incident/service.ts:191` | Under D-03 A: labels become per-event data; the matrix and rank checks become Cedar policies (P11.2). Under D-03 B: a `Role` table per event with rank as data. |
| `DataSource`           | `invariant`                 | Provenance that reports must keep apart              | Capture writes `APP` (`modules/{footfall,gift,missionCard,registration}/service.ts`); imports take `FALLBACK_SHEET`/`PAPER` (`dto/fallback.ts:69`); IC bulk entry takes `MANUAL_ADJUSTMENT` (`dto/footfall.ts:27`)                                                                                                                                                                                                                                                                                                            | Independent of the D-04 "never merge" option: that option is about the three counts, not sources.                                                               |
| `SwapStatus`           | `invariant`                 | Swap state machine                                   | `modules/shift/service.ts:107,131,139,187`, `modules/shift/repo.ts:81,92`, `app/ic/page.tsx:232–277`                                                                                                                                                                                                                                                                                                                                                                                                                          | `CANCELLED` is never written: no cancel path (P02).                                                                                                             |
| `IncidentType`         | `invariant`                 | Generic safety taxonomy; reports count near misses   | `modules/report/service.ts:285` (`NEAR_MISS`); labels `app/safety/incident/new/page.tsx:33–39`                                                                                                                                                                                                                                                                                                                                                                                                                                | Labels could move to content in P14.8.                                                                                                                          |
| `IncidentSeverity`     | `invariant`                 | Drives escalation                                    | `modules/incident/service.ts:173` (`HIGH`/`CRITICAL` push), `modules/dashboard/repo.ts:41` (open `CRITICAL`); hints `app/safety/incident/new/page.tsx:43–46`                                                                                                                                                                                                                                                                                                                                                                  | Which severities push could become an event setting (P01.5).                                                                                                    |
| `IncidentStatus`       | `invariant`                 | Incident state machine                               | `modules/dashboard/repo.ts:40,41` (not `RESOLVED`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `ACKNOWLEDGED` is never written: no acknowledge path (P02).                                                                                                     |
| `LostPersonStatus`     | `invariant`                 | Alert state machine; the purge keys off resolution   | `modules/lostPerson/service.ts:144,195,196`, `modules/lostPerson/repo.ts:53,90,103,117`, `modules/dashboard/repo.ts:47`, `modules/report/repo.ts:246`                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                 |
| `LostFoundStatus`      | `invariant`                 | Item state machine                                   | `modules/lostFound/service.ts:125,136,167,168` (end-of-event sweep `HELD` → `UNCLAIMED_AT_CLOSE`), `modules/report/repo.ts:265,266`, `app/safety/lost-found/page.tsx:54–194`                                                                                                                                                                                                                                                                                                                                                  | The sweep is an event-lifecycle action (P10.5). `DISPOSED` is only displayed, never written (P02).                                                              |
| `CardStatus`           | `invariant`                 | Mission Card state machine                           | `modules/missionCard/service.ts:77–395` (16 lines), `modules/missionCard/repo.ts:99,123`, `modules/gift/service.ts:90,95`, `modules/registration/service.ts:122,128`, `modules/report/repo.ts:131,134`, `app/capture/stamp/page.tsx:156`                                                                                                                                                                                                                                                                                      | `LOST` is never written (P02).                                                                                                                                  |
| `AnnouncementPriority` | `invariant`                 | Delivery behaviour                                   | `modules/announcement/service.ts:79` (`URGENT` pushes), `modules/notification/service.ts:203` (push urgency), `client/public/sw.js:98,99`, `app/inbox/page.tsx:35–194`                                                                                                                                                                                                                                                                                                                                                        |                                                                                                                                                                 |
| `AttendanceMethod`     | `invariant`                 | Verification protocol                                | `modules/attendance/service.ts:164,182,292,296,313`, `app/attendance/page.tsx:110–169`                                                                                                                                                                                                                                                                                                                                                                                                                                        | Not mirrored in `enums.ts` (see above).                                                                                                                         |

## Env audit (P01.4)

`server/src/config/env.ts` parses `process.env` once at boot and refuses to start on a bad value.
No other server file reads `process.env`, apart from `SPOH_SKIP_DOTENV` (`env.ts:20`, a test
harness switch). **Every server key therefore needs a restart to change today**, and every client
key needs a rebuild, because Next inlines `NEXT_PUBLIC_*` into the bundle.

Classes: **infra** (where things run), **secret**, **setting** (behaviour an admin might change,
which moves to the settings registry with the scope given). Targets: **SSM** (Parameter Store, from
CDK outputs in P08.6), **SM** (Secrets Manager), **registry** (P10.1), **env** (stays a plain
variable in the task definition or on the developer's machine).

### Server (`server/src/config/env.ts`, 34 keys)

| Key                         | Purpose                                           | Default                                                        | Production guard                                  | Class   | Target                                                       |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | ------- | ------------------------------------------------------------ |
| `NODE_ENV`                  | Runtime mode; switches every guard below          | `development`                                                  | —                                                 | infra   | env                                                          |
| `PORT`                      | API listen port                                   | `4000`                                                         | —                                                 | infra   | env (note: `.env.example` and the client default use `4010`) |
| `LOG_LEVEL`                 | Pino level                                        | `info`                                                         | —                                                 | infra   | SSM                                                          |
| `DATABASE_URL`              | Postgres connection, including the password       | required                                                       | must contain `sslmode=require`                    | secret  | SM (RDS-managed secret)                                      |
| `DATABASE_POOL_MAX`         | Pool size per instance                            | `25`                                                           | 1–100                                             | infra   | SSM, sized with the task count                               |
| `AUTH_PROVIDER`             | `cognito` or the dev `local` bypass               | `cognito`                                                      | `local` refused                                   | infra   | env                                                          |
| `LOCAL_AUTH_SECRET`         | HS256 key of the dev provider                     | none                                                           | unusable (provider refused)                       | secret  | dev only; never in AWS                                       |
| `COGNITO_REGION`            | Region of the user pool                           | `ap-southeast-1`                                               | —                                                 | infra   | SSM                                                          |
| `COGNITO_USER_POOL_ID`      | User pool                                         | none                                                           | required with `cognito`                           | infra   | SSM                                                          |
| `COGNITO_CLIENT_ID`         | App client                                        | none                                                           | required with `cognito`                           | infra   | SSM                                                          |
| `COGNITO_DOMAIN`            | Hosted UI base URL                                | none                                                           | required with `cognito`                           | infra   | SSM                                                          |
| `APP_BASE_URL`              | Public origin, for the OAuth `redirect_uri`       | none                                                           | required with `cognito`                           | infra   | SSM                                                          |
| `CORS_ALLOWED_ORIGINS`      | Exact allowed origins                             | `http://localhost:3000`                                        | no `*`; all `https` when the cookie is cross-site | infra   | SSM                                                          |
| `TRUST_PROXY_HOPS`          | Proxies in front of the API (for client IPs)      | `0`                                                            | 0–5                                               | infra   | SSM (1 behind an ALB)                                        |
| `SESSION_SIGNING_SECRET`    | Key for the API's own access tokens               | ephemeral per boot                                             | required                                          | secret  | SM, with rotation (P15.6)                                    |
| `ACCESS_TOKEN_TTL_SECONDS`  | Access-token lifetime                             | `900`                                                          | 60–86400                                          | setting | registry, platform scope                                     |
| `SESSION_COOKIE_DOMAIN`     | Refresh-cookie domain                             | host-only                                                      | —                                                 | infra   | SSM                                                          |
| `SESSION_COOKIE_CROSS_SITE` | `SameSite=None` refresh cookie                    | `false`                                                        | needs `https` origins                             | infra   | SSM                                                          |
| `RATE_LIMIT_WINDOW_MS`      | Rate-limit window                                 | `60000`                                                        | ≥ 1000                                            | setting | registry, platform scope (P15.2)                             |
| `RATE_LIMIT_MAX_DEFAULT`    | Requests per window, default routes               | `300`                                                          | ≥ 1                                               | setting | registry, platform scope (P15.2)                             |
| `RATE_LIMIT_MAX_CAPTURE`    | Requests per window, capture routes               | `1200`                                                         | ≥ 1                                               | setting | registry, platform scope (P15.2)                             |
| `RATE_LIMIT_MAX_SENSITIVE`  | Requests per window, sign-in and provisioning     | `20`                                                           | ≥ 1                                               | setting | registry, platform scope, with a floor (P15.2)               |
| `RATE_LIMIT_MAX_ADMIN`      | Requests per window, admin routes                 | `60`                                                           | ≥ 1                                               | setting | registry, platform scope (P15.2)                             |
| `ATTENDANCE_ROOT_EMAIL`     | The one person who may mark attendance unverified | none (feature off)                                             | —                                                 | setting | an event-membership flag (P09.3), not a setting              |
| `ATTENDANCE_SIGNING_SECRET` | Key for attendance QR tokens                      | derived from `SESSION_SIGNING_SECRET`, else random per process | none of its own (the session key is required)     | secret  | SM                                                           |
| `ATTENDANCE_SP_CIDRS`       | Venue egress CIDRs that QR attendance requires    | `[]` (QR off)                                                  | each value parsed as a CIDR                       | setting | registry, event scope, with F01-009's label                  |
| `SHIFT_HOURS_ALWAYS_OPEN`   | Treat every hour as shift hours                   | `false`                                                        | refused                                           | infra   | env, dev only; P10.5 capture windows replace it              |
| `S3_MEDIA_BUCKET`           | Bucket for incident and lost-and-found photos     | none (uploads off)                                             | —                                                 | infra   | SSM                                                          |
| `AWS_REGION`                | SDK region                                        | `ap-southeast-1`                                               | —                                                 | infra   | env (set by the ECS runtime)                                 |
| `S3_UPLOAD_TTL_SECONDS`     | Presigned upload lifetime                         | `300`                                                          | 30–3600                                           | setting | registry, platform scope                                     |
| `S3_MAX_UPLOAD_BYTES`       | Upload size ceiling                               | 10 MiB                                                         | 1 KiB–50 MiB                                      | setting | registry, platform scope                                     |
| `VAPID_PUBLIC_KEY`          | Web Push public key                               | none (push off)                                                | all three VAPID keys or none                      | infra   | SSM                                                          |
| `VAPID_PRIVATE_KEY`         | Web Push private key                              | none                                                           | as above                                          | secret  | SM                                                           |
| `VAPID_SUBJECT`             | Push contact (`mailto:`)                          | none                                                           | as above                                          | infra   | SSM                                                          |

Totals: 19 infra, 5 secret, 10 setting (9 to the registry, one to membership). The settings match
PF-07 and are the env-reduction list for P10.4.

### Client (`client/.env.example`, `client/src/lib/env.ts`, `client/next.config.ts`)

| Key                                | Purpose                                                       | Default                 | Guard                                                                         | Class | Target                                                 |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- | ----- | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_BASE_URL`         | API origin for fetches and the CSP `connect-src`              | `http://localhost:4010` | must parse as a URL                                                           | infra | SSM → build argument (P08.9)                           |
| `NEXT_PUBLIC_ENV_LABEL`            | Environment badge                                             | `development`           | —                                                                             | infra | build argument                                         |
| `NEXT_PUBLIC_COGNITO_REGION`       | Region of the pool                                            | none                    | —                                                                             | infra | SSM → build argument                                   |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Pool; **blank switches the client to the dev sign-in screen** | blank                   | none: a production build without it shows dev sign-in (the server refuses it) | infra | SSM → build argument; P08.9 fails the build when blank |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID`    | App client                                                    | blank                   | —                                                                             | infra | SSM → build argument                                   |

All five are infra and all need a rebuild. `NODE_ENV` also gates the service worker
(`components/ServiceWorkerRegistration.tsx:15`) and the dev CSP (`next.config.ts:12`); Next sets it.
Serving these from the API at runtime instead of inlining them would let one image run in staging
and production; P05 decides.

## Runtime settings audit (P01.5)

**How settings work today.** 16 keys (`dto/settings.ts:53–91`, defaults `lib/settings.ts:43–69`)
are stored as JSON rows in `AppSetting`. Each key is validated on its own, and an invalid row falls
back to the compiled default. The server caches them and reloads every 60 s
(`jobs/scheduler.ts:31`), so other instances converge within a minute. The client fetches them once
per page load (`client/src/lib/runtimeSettings.ts:80–104`), so a volunteer sees a change only after
reloading. Everyone can read them (`own.read`). Only `config.manage` (Chief Coordinator, Admin) can
write them. A write records one `settings.update` audit row with before and after. There is no
per-key history, no revert and no scheduling.

**Proposed permissions.** `event.settings.manage` for event-scope keys (Chief Coordinator and above
for their event), `platform.settings.manage` for platform-scope keys (Admin only). Privacy and
security keys are Admin only whatever their scope. P11 turns these into Cedar actions.

### Existing keys

| Key                        | Default                  | Bounds today         | Scope                   | Who changes      | Schedule              | History | What changing this does (UI copy)                                                                                                                |
| -------------------------- | ------------------------ | -------------------- | ----------------------- | ---------------- | --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eventName`                | `SPOH 2027`              | 1–80 chars           | —                       | —                | —                     | —       | Retired: becomes `Event.name` (F01-001, F01-002, F01-047).                                                                                       |
| `shiftBlocks`              | 09:30–14:00, 13:30–18:00 | `HH:MM`, end > start | —                       | —                | —                     | —       | Retired: shift blocks become rows with local start and end (P01.3). Editing a block is a data change with its own audit.                         |
| `silentStationMinutes`     | 15                       | 1–1440               | event, station override | event admin      | no                    | yes     | "A counted room with no entries for this long during shift hours is flagged on the dashboard." A talk room may need a longer value than a booth. |
| `staleDeviceMinutes`       | 15                       | 1–1440               | event                   | event admin      | no                    | yes     | "A device that has captured nothing for this long is flagged in the IC console."                                                                 |
| `implausibleTapsPerMinute` | 20                       | 1–600                | event, station override | event admin      | no                    | yes     | "Registrations per minute above which the IC console flags a device." Plausible rates differ per booth.                                          |
| `longShiftMinutes`         | 180                      | 1–1440               | event                   | event admin      | no                    | yes     | "Time on station without a break before somebody appears on the welfare list."                                                                   |
| `lostPersonPurgeHours`     | 24                       | 1–720                | event                   | Admin (privacy)  | no                    | yes     | "How long a resolved lost-person alert keeps its description." Tied to the D-04 personal-data option (F01-049).                                  |
| `idempotencyRetentionDays` | 7                        | 1–90                 | platform                | Admin            | no                    | yes     | "How long a settled request is remembered, so a retried tap is not counted twice." Shorter than the longest offline outbox would double count.   |
| `refreshSessionDays`       | 30                       | 1–90                 | platform                | Admin (security) | no                    | yes     | "How long a volunteer stays signed in on a device." Applies to sessions created after the change.                                                |
| `dashboardPollSeconds`     | 3                        | 1–3600               | platform                | Admin            | via lifecycle (P10.5) | yes     | "How often the live dashboard and the ops-room display reload." Lower costs server load.                                                         |
| `alertPollSeconds`         | 10                       | 1–3600 (too loose)   | platform                | Admin            | no                    | yes     | "How often every device checks for a lost-person alert. This is the delivery guarantee." Bound should be 5–30 (F01-052).                         |
| `captureUndoWindowSeconds` | 10                       | 1–3600               | event                   | event admin      | no                    | yes     | "How long a volunteer can undo a tap. After this only an IC can void it."                                                                        |
| `captureSendGraceSeconds`  | 2                        | 1–3600               | event                   | event admin      | no                    | yes     | "How long a tap waits before its first send, so undo can cancel it outright."                                                                    |
| `outboxWarningCount`       | 20                       | 1–1000               | event                   | event admin      | no                    | yes     | "Unsent captures on one device before the volunteer is told to find their IC."                                                                   |
| `outboxWarningAgeMinutes`  | 5                        | 1–1440               | event                   | event admin      | no                    | yes     | "Age of the oldest unsent capture that triggers the same warning."                                                                               |

### New keys from P01.2 and P01.4

| Key (proposed)                                    | Today                                                          | Default            | Bounds                | Scope    | Who changes      | Schedule | UI copy                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------- | ------------------ | --------------------- | -------- | ---------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `attendance.campusCidrs`                          | env `ATTENDANCE_SP_CIDRS`                                      | `[]` (QR off)      | valid CIDRs, ≤ 20     | event    | Admin (security) | no       | "Public IP ranges of the venue network. QR attendance only works from inside them."                   |
| `attendance.campusNetworkLabel`                   | literal `SP Wi-Fi` (F01-009)                                   | `venue Wi-Fi`      | 1–40 chars            | event    | event admin      | no       | "What volunteers call the venue network, shown when QR attendance is refused."                        |
| `auth.accessTokenTtlSeconds`                      | env `ACCESS_TOKEN_TTL_SECONDS`                                 | 900                | 60–3600               | platform | Admin (security) | no       | "How long an access token lives before the app silently renews it."                                   |
| `rateLimit.windowSeconds`                         | env `RATE_LIMIT_WINDOW_MS`                                     | 60                 | 10–600                | platform | Admin (security) | no       | "The window the request limits below are counted over."                                               |
| `rateLimit.max.{default,capture,sensitive,admin}` | env `RATE_LIMIT_MAX_*`                                         | 300, 1200, 20, 60  | ≥ 1; `sensitive` ≤ 60 | platform | Admin (security) | no       | "Requests one client may make per window on this route group." Needs the shared store of P15.2 first. |
| `media.uploadTtlSeconds`                          | env `S3_UPLOAD_TTL_SECONDS`                                    | 300                | 30–3600               | platform | Admin            | no       | "How long a photo upload link stays valid."                                                           |
| `media.maxUploadBytes`                            | env `S3_MAX_UPLOAD_BYTES`                                      | 10 MiB             | 1 KiB–50 MiB          | platform | Admin            | no       | "Largest photo a volunteer can attach."                                                               |
| `push.ttlSeconds.<kind>`                          | literal map (F01-038)                                          | 600/900/1800       | 60–3600               | platform | Admin            | no       | "How long a push service keeps trying to deliver this kind of alert to an offline phone."             |
| `report.curveBucketMinutes`                       | literal 30 (F01-039)                                           | 30                 | 15, 30 or 60          | event    | event admin      | no       | "Bucket size of the footfall curve and the peak-period answer in the post-event report."              |
| `incident.pushSeverities`                         | literal `HIGH`, `CRITICAL` (`modules/incident/service.ts:173`) | `HIGH`, `CRITICAL` | subset of severities  | event    | event admin      | no       | "Incident severities that push an alert to ICs as well as appearing in the inbox."                    |
| `product.countsMayMerge`                          | structural (F01-048, D-04)                                     | `false`            | boolean               | event    | Admin            | no       | Wording decided in P05.                                                                               |
| `product.visitorPersonalData`                     | structural (F01-049, D-04)                                     | `false`            | boolean               | event    | Admin            | no       | Wording decided in P05; with retention and access rules.                                              |

**Design input for P10.** Settings changes must reach clients without a reload (P10.3 cache bus,
plus a client refresh), and cross-instance convergence must be faster than 60 s for the security
keys. No existing key needs its own schedule; poll cadence can follow the event lifecycle (P10.5).
Every key needs per-key history and revert (P10.2).

## Content audit (P01.6)

Everything a volunteer reads that belongs to one event. All of it is compiled into the client
bundle today, so changing a word needs a build and a deploy.

| Item                       | Where                                                                                     | Structure today                                                                             | Read on                                | Notes                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Course one-liners and FAQs | `content/brief.ts:15–69` (`COURSES`)                                                      | 4 × `{ code, name, oneLiner, askedOften: { question, answer }[] }`                          | `/brief`                               | Placeholder, pending sign-off. Keyed by `CourseCode` (P01.3).                                                                |
| Escalation script          | `content/brief.ts:71–72`                                                                  | one string, read aloud                                                                      | `/brief` (leads the page)              |                                                                                                                              |
| The five things            | `content/brief.ts:74–81` (`FIVE_THINGS`)                                                  | 5 strings                                                                                   | `/brief`                               | Its comment says "personalised per role at render time"; the page renders the same list for everyone.                        |
| Visitor journey            | `content/brief.ts:83–111` (`VISITOR_JOURNEY`), `app/journey/page.tsx:45–48`               | 6 × `{ step, title, detail }`, plus one closing note                                        | `/journey`                             | The note ("nobody should add them together") states the D-04 counts rule, so it depends on that option.                      |
| Floor map                  | `content/brief.ts:113–156` (`FLOOR_MAP`), `app/map/page.tsx:28`                           | 3 levels × `{ label, kind: station \| facility \| safety }`, plus an intro line             | `/map`                                 | Placeholder. Floor-plan images are planned (`app/map/page.tsx:15`) but absent. Station points are free text, not links.      |
| Mandatory briefing points  | `dto/shift.ts:90–100` (`MANDATORY_BRIEF_POINTS`)                                          | 4 strings                                                                                   | nothing                                | Placeholder. Exported from the shared package but rendered nowhere: no screen shows it (briefing slots are API-only, PF-09). |
| Draft notice               | `app/brief/page.tsx:70–71`                                                                | literal: "pending sign-off … before the 4 November training"                                | `/brief`                               | Missed by the sweep (no year). Becomes the document's draft/published status.                                                |
| App identity               | `app/layout.tsx:8–11,20`; `client/public/manifest.json`; `client/public/icons/*` (3 PNGs) | title, description with dates, short name, `#0066cc` theme, `#ffffff` background, 3 icons   | install prompt, home screen, tab title | F01-001, F01-004, F01-005. Organisation branding plus event name and dates.                                                  |
| Push default title         | `client/public/sw.js:91`                                                                  | `SPOH Ops`                                                                                  | notifications                          | F01-004.                                                                                                                     |
| Offline precache           | `client/public/sw.js:16,18`                                                               | cache `spoh2027-shell-v1`; `['/', '/home', '/map', '/journey', '/brief', '/manifest.json']` | offline                                | Content is inside JS chunks, cached network-first on first visit. A page never opened online is not available offline.       |
| Product vocabulary         | "Mission Card", "Mission Complete", "Welcome Lounge" across `app/**`                      | literals in copy                                                                            | everywhere                             | "Mission Complete" and "Welcome Lounge" are station names (data). Whether "Mission Card" is renameable is a P14.8 question.  |

### ContentDocument schema (draft for P13.3)

One document per event, versioned, with a `draft` or `published` status. Every text field is plain
text with a length limit (line breaks allowed, no markup), so nothing renders HTML and every screen
keeps its layout. References point at event rows, so renaming a station updates the map and the
journey.

```ts
type Text<Max extends number> = string; // plain text, trimmed, 1..Max characters
type Ref<T> = string; // id of a row in this event

interface EventContent {
  schemaVersion: 1;
  brief: {
    escalationScript: Text<400>;
    fiveThings: Array<{ text: Text<160>; roles?: RoleKey[] }>; // 1–7 items; roles narrows who sees one
    programmes: Array<{
      programmeId: Ref<Programme>; // code and name come from the Programme row (P01.3)
      oneLiner: Text<200>;
      faqs: Array<{ question: Text<120>; answer: Text<300> }>; // 0–5
    }>;
  };
  journey: {
    steps: Array<{ title: Text<40>; detail: Text<200>; stationIds?: Ref<Station>[] }>; // 1–10
    note?: Text<300>; // the counts note; its default wording follows the D-04 option
  };
  map: {
    intro: Text<200>;
    levels: Array<{
      label: Text<40>;
      image?: { mediaKey: string; alt: Text<200> }; // S3 object, served same-origin
      points: Array<{
        label: Text<80>;
        kind: 'station' | 'facility' | 'safety';
        stationId?: Ref<Station>;
      }>;
    }>;
  };
  briefing: { mandatoryPoints: Text<160>[] }; // 1–8
}
```

Branding is not in the document. It is `Organisation` data (`name`, `appName`, `shortName`,
`themeColor`, `backgroundColor`, three icon media keys) plus `Event` data (`name`, `slug`, dates,
`timeZone`). The web manifest and page metadata are generated from those two rows (P14.6).

### Offline requirement (P13.4)

- The published document and its map images must work with no network, like the compiled content
  today. The service worker's rule "never cache `/api/`" (`sw.js:9–13,45`) would otherwise make
  content disappear offline.
- Serve each published version at an immutable same-origin URL (for example
  `/content/<eventId>/<version>.json`), precache it at install and again when a new version is
  published, and keep the previous version until the new one is stored.
- Precache `/brief`, `/journey` and `/map` with their content, rather than relying on a first
  online visit.
- Budget: the document plus images under 2 MB, so a first load on a congested network finishes.

## Defects found during P01

### F01-046 — Shift labels ignore the configured shift hours

- **Severity:** Medium
- **Area:** `client/src/lib/format.ts:59–61` (`blockLabel`), used by `components/ShiftOverview.tsx:67`
  and `app/shift/page.tsx:69`
- **Evidence:** `shiftBlocks` is an admin-editable setting (`app/admin/settings/page.tsx:243`,
  `server/src/lib/settings.ts:49–50`) and the server uses it for "within shift hours". The client
  never reads it outside the settings screen: `blockLabel` returns the literal `09:30–14:00` or
  `13:30–18:00`.
- **Impact:** After an admin changes the hours, volunteers' shift cards show the old times while
  attendance and capture follow the new ones.
- **Fix:** Render labels from the configured blocks (P09.2 makes blocks data).
- **Phase:** P09.2
- **Status:** open

### F01-047 — The `eventName` setting is never displayed

- **Severity:** Low
- **Area:** `client/src/lib/runtimeSettings.ts:46,97`; `app/admin/settings/page.tsx:171–208`
- **Evidence:** Admins can edit `eventName` (validated, audited, 80 characters), and the client
  loads it, but no screen reads it. Every visible name is the literal of F01-001.
- **Impact:** Renaming the event in settings has no visible effect.
- **Fix:** Replaced by `Event.name` (F01-001, F01-002).
- **Phase:** P09.1
- **Status:** open

### F01-050 — The server does not enforce which stations register visitors or redeem gifts

- **Severity:** Low
- **Area:** `server/src/modules/registration/router.ts:46–63`, `server/src/modules/gift/router.ts:42–44`
- **Evidence:** Only the client limits registration to `SIGNUP_BOOTH` and redemption to
  `MISSION_COMPLETE` (`components/ShiftOverview.tsx:149,173`). The routes check the capability and
  the station scope, never the station's kind. Stamps and footfall do check their flags
  (`modules/missionCard/service.ts:134`, `modules/station/service.ts:41`).
- **Impact:** A volunteer with `registration.create` rostered at a course station can register
  visitors against that station through the API. Counts stay correct but land on the wrong station.
- **Fix:** The `registersVisitors` and `redeemsGifts` flags of P01.3, enforced by the server.
- **Phase:** P09.2
- **Status:** open

### F01-051 — `server/.env.example` omits nine keys, one of them required in production

- **Severity:** Low
- **Area:** `server/.env.example`
- **Evidence:** `ACCESS_TOKEN_TTL_SECONDS`, `S3_MAX_UPLOAD_BYTES`, `S3_UPLOAD_TTL_SECONDS`,
  `SESSION_COOKIE_CROSS_SITE`, `SESSION_COOKIE_DOMAIN`, `SESSION_SIGNING_SECRET` and the three
  `VAPID_*` keys are in the schema but not in the example. `SESSION_SIGNING_SECRET` is required when
  `NODE_ENV=production`. The server's `PORT` default is `4000`, while the example and the client
  default use `4010`.
- **Impact:** A deploy built from the example fails at boot, or runs without push or cookies set
  for its topology.
- **Fix:** P08.6 generates the parameter and secret list from the schema; until then, the example
  lists every key.
- **Phase:** P08.6
- **Status:** open

### F01-052 — `alertPollSeconds` accepts values that break the alert guarantee

- **Severity:** Low
- **Area:** `packages/shared/src/dto/settings.ts:51,78,80` (`Seconds`: 1–3600)
- **Evidence:** The lost-person poll is documented as the delivery guarantee
  (`modules/lostPerson/service.ts:91`, `modules/lostPerson/router.ts:35`), yet an admin can set it
  to an hour. `dashboardPollSeconds` has the same bound, so 1 s is also accepted for every device.
- **Impact:** One mistyped value delays lost-person alerts on every phone by up to an hour, or
  multiplies server load.
- **Fix:** Per-key bounds in the registry (5–30 s for alerts, 2–60 s for the dashboard).
- **Phase:** P10.1
- **Status:** open
