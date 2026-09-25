# F02 — Admin and role journeys

Output of P02 (Audit B). Each role's journeys walked on the local dev server at Pixel 7 and
1440×900, with every point where the product is clunky, confusing, disconnected or impossible
without the API, SQL, the seed or a redeploy.

- **Walked on:** `main`, product code as of `13b19f4` (unchanged by P02). Local dev server and dev
  database only (D-13): `scripts/dev-db-local.sh start`, `db:deploy` + `db:seed`, `npm run dev`.
- **Harness:** `node remediation/tools/journeys/run.mjs <journey>` (`--list` names them). Each run
  writes `F02-screens/<journey>-<nn>-<phone|laptop>.png` and a log of landed URLs, failed API calls
  and console errors to `reports/P02/journeys/<journey>.json`.
- **Clock:** journeys that capture freeze the page clock an hour into the MORNING block today
  (`freezeInShift`); the dev server keeps capture open with `SHIFT_HOURS_ALWAYS_OPEN=true`.
- **API fallback:** `node remediation/tools/journeys/api-setup.mjs` does what Journey 1 cannot do in
  the UI and logs status and time per call to `reports/P02/setup-via-api.json`.
- F01 findings are referenced by ID, not re-filed. Finding format and severity: `README.md`.

**Scoring.** Type: dead-end · needs-API/SQL · needs-redeploy · confusing · disconnected ·
inconsistent · broken · slow. Severity: Blocker · High · Medium · Low.

## Summary (P02.10)

_Written in P02.10._

---

## Journey 1 — Set up "Test Event 2027" from nothing (Admin) · P02.2

**Target:** a second event with 2 days, 3 shifts, 5 stations, 6 visitor categories, 2 gifts and
20 volunteers with assignments, using only the UI. Journey `admin-setup` (16 screens per
viewport); API fallback `api-setup.mjs`.

**Result:** none of the eight setup tasks can be done in the UI. Five can be done through the
API by someone who reads the source; three cannot be done without a migration and a deploy.
Whatever is created through the API joins the SPOH 2027 data, because there is no event to put
it in.

### Step log

| #   | Task                   | In the UI                                                                                                                                                          | What I did instead                                                                                                                                                          | Took                                | Blocker class                               |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
| 1   | Create the event       | **No.** There is no event entity. Operations offers Volunteers and Event settings only (`admin-setup-02`). Guessing `/admin` gives a 404 (`admin-setup-11`).       | Nothing possible. The only event-level field is the `eventName` setting, which renames SPOH 2027 itself (`admin-setup-07`).                                                 | —                                   | needs-redeploy (schema: P09.1)              |
| 2   | Rename it              | Yes, Event settings → Event name → Save (`admin-setup-07`).                                                                                                        | —                                                                                                                                                                           | 1 min                               | broken: the name is shown nowhere (F01-047) |
| 3   | Two event days         | **No** screen. `/admin/event-days` is a 404 (`admin-setup-13`).                                                                                                    | `POST /admin/event-days` ×2 → 201.                                                                                                                                          | ~0.1 s per call; ~5 min to find DTO | needs-API (PF-09)                           |
| 4   | Three shifts           | **No.** Settings show exactly two blocks, Morning and Afternoon (`admin-setup-06`).                                                                                | `PATCH /admin/settings` with an `EVENING` block → 400 _Invalid request body_. `ShiftBlock` is a Postgres enum (F01-020).                                                    | —                                   | needs-redeploy (migration)                  |
| 5   | Five stations          | **No** screen. `/admin/stations` is a 404 (`admin-setup-12`).                                                                                                      | `POST /admin/stations` ×5 → 201. A station of a new kind (`CAFE`) → 400: `StationKind` is an enum (F01-019).                                                                | ~0.1 s per call; ~5 min to find DTO | needs-API (PF-09); new kinds need-redeploy  |
| 6   | Six visitor categories | **No.** Categories appear only as capture buttons.                                                                                                                 | Nothing possible: `VisitorCategory` is a Postgres enum of 8 fixed school levels (F01-018).                                                                                  | —                                   | needs-redeploy (migration)                  |
| 7   | Two gifts              | **No** screen. `/admin/gifts` is a 404 (`admin-setup-14`).                                                                                                         | `POST /admin/gift-types` ×2 → 201.                                                                                                                                          | ~0.1 s per call                     | needs-API (PF-09)                           |
| 8   | 20 volunteers + shifts | **No** add, import or assign. Volunteers lists people and edits role, phone, portfolio and access only (`admin-setup-03…05`); "14 shifts" is a number, not a link. | `POST /roster/import` dry run → **500** (F02-002). The same rows with `commit: true` → 200, 20 volunteers and 20 assignments. Manual assignment: `POST /admin/assignments`. | ~0.3 s; ~10 min to write the rows   | needs-API (PF-09); dry run broken           |

Totals: the API calls took 0.43 s together. Writing them took about 30 minutes with the source
open; a non-developer admin cannot do any of it.

**Afterwards** (`admin-setup-15`): the Chief's live dashboard for today lists `TE Registration`
among SPOH's silent stations, and the Mission Card funnel lists `TE Lab A`. `GET /stations` returns
13 stations and `GET /admin/event-days` 9 days in one list, both events mixed. The imported
volunteers show "Never signed in" with no sign of which event they belong to (`admin-setup-04`).

### Findings

### F02-001 — There is no way to create or hold a second event

- **Severity:** Blocker (for the programme's goal; not for January on the baseline)
- **Type:** needs-redeploy · Role: Admin
- **Area:** `server/prisma/schema.prisma` (no `Event`), `client/src/lib/navigation.ts:1–60`
- **Evidence:** `admin-setup-02`, `admin-setup-11…15`; `reports/P02/setup-via-api.json`.
- **Impact:** Every day, station, gift and volunteer is global. A second event's rows appear on
  the live event's dashboard, funnel and station lists, and the only way to "start fresh" is a new
  database. Confirms F01-014 and F01-015 from the user's side.
- **Fix:** The `Event` entity with scoped days, stations, gifts and memberships; an admin setup
  flow with clone (D-02 A).
- **Phase:** P09.1, P09.9, P13.1, P13.8
- **Status:** open

### F02-002 — Roster import dry run fails with 500 when the file has two or more new people

- **Severity:** High
- **Type:** broken · Role: Admin, Chief, Deputy
- **Area:** `server/src/modules/roster/service.ts:132,143` (placeholder sub), `roster/repo.ts:64`
- **Evidence:** `api-setup.mjs` → `POST /roster/import` with 20 new emails and `commit: false`
  returns 500. Server log: `P2002 Unique constraint failed on Volunteer_cognitoSub_key`. The dry
  run gives every new row the same placeholder `cognitoSub: 'pending'`, so the second create
  collides inside the rolled-back transaction.
- **Impact:** The preview that exists "to see the diff before it happens" cannot be used for the
  normal case, a first import. The commit path works, so an admin either imports blind or gives up.
  (There is no import screen on `main`; the audit branch adds one, which would hit this.)
- **Fix:** A unique placeholder per row in the dry run (for example `pending:<email>`), with an
  integration test importing two new people with `commit: false`.
- **Phase:** P06 (bug fix with test, before the roster import screen in P13)
- **Status:** open

### F02-003 — Setup entities have endpoints but no screens

- **Severity:** High
- **Type:** needs-API/SQL · Role: Admin
- **Area:** `modules/admin/router.ts:144–287` (assignments, stations, event days, gift types),
  `modules/roster/router.ts:58–90` (provision, import)
- **Evidence:** `admin-setup-12…14` (404s); Operations links (`admin-setup-02`); no client caller
  (PF-09).
- **Impact:** Adding a station, a day, a gift or a person, or assigning a shift, needs someone
  with API access and the DTOs. Before a dry run, that person is a developer.
- **Fix:** Setup screens per entity, reachable from one "Event setup" hub.
- **Phase:** P13.2, P13.7
- **Status:** open

### F02-004 — Taxonomy cannot change without a migration

- **Severity:** High
- **Type:** needs-redeploy · Role: Admin
- **Area:** `ShiftBlock`, `StationKind`, `VisitorCategory` enums (F01-018, F01-019, F01-020)
- **Evidence:** `PATCH /admin/settings` with a third block → 400; a station with `kind: 'CAFE'` →
  400; no endpoint for categories.
- **Impact:** Three shifts, a new station type or a different audience (for example adult
  learners instead of secondary school levels) needs a developer, a migration and a deploy.
- **Fix:** Taxonomy as event data (F01 § Enums).
- **Phase:** P09.2, P09.3
- **Status:** open

### F02-005 — Saving settings marks every field as "changed from default", with no way back

- **Severity:** Low
- **Type:** confusing · Role: Admin
- **Area:** `client/src/app/admin/settings/page.tsx:196–240` (`onSave` sends every field),
  `server/src/lib/settings.ts:89` (`overriddenKeys` = every stored key)
- **Evidence:** `admin-setup-07` (after renaming only the event, "Station silence 15 minutes
  (changed from default)", and the default is 15). Afterwards all 15 keys are rows in `AppSetting`.
- **Impact:** The bold "changed" marker, meant to show what differs from what shipped, flags
  everything after the first save, and there is no "reset to default".
- **Fix:** Send only edited fields; compare to the default when flagging; add per-field reset
  (P10.1 settings history and revert).
- **Phase:** P10.1
- **Status:** open

Also seen in this journey, recorded elsewhere: **F01-047** confirmed (`admin-setup-08`: the header
and home still say "SPOH 2027" after the rename to "Test Event 2027"); the settings copy fixes the
zone as "Singapore time" (`admin-setup-06`, F01-027).

---

## Journey 2 — Event day as Chief and Deputy · P02.3

Journeys `chief-day` (15 screens) and `deputy-day` (10 screens), client clock frozen at 10:30 in
the MORNING block. The dev database still holds the Journey 1 rows, which is realistic: nothing
lets an admin separate them.

| Task                        | Chief                                                                                                                                                                                              | Deputy                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Live dashboard              | Works (`chief-day-03`). Needs-attention list, three separate counts, funnel, gifts, staffing.                                                                                                      | Same screen (`deputy-day-03`).                                                           |
| Drill into a silent station | **Dead end.** The warnings and station rows are plain text (`chief-day-04`). The IC console is the only per-station view, and it starts from an empty "Choose a station" (`chief-day-05`). F02-007 | Same.                                                                                    |
| Urgent announcement         | Works in two taps (`chief-day-06…07`), but with no station chosen and "whole event" unticked it went to everyone. F02-009                                                                          | Same form (`deputy-day-05`).                                                             |
| Declare and close fallback  | Works (`chief-day-08…09`). The report then flags both windows (`deputy-day-09`).                                                                                                                   | Works; Deputy holds `fallback.declare`.                                                  |
| Import fallback data        | Works: template, preview, commit (`chief-day-10…11`); re-running is refused as "already imported" (laptop run). The imported rows then inflate **today's** dashboard. F02-006                      | Not in the Deputy's menu, but the page opens by URL and only fails on submit. See P02.9. |
| Fix a roster gap mid-day    | **Impossible.** The gap list names stations without their block and links nowhere (`chief-day-12`); there is no assignment screen (F02-003). `/roster` is a 404 (`chief-day-13`). F02-008          | Same, and the Volunteers screen tells the Deputy it is read-only (`deputy-day-08`).      |
| Read the report             | Works (`chief-day-14`); fallback caveat shown.                                                                                                                                                     | Works (`deputy-day-09`).                                                                 |
| TV mode                     | Works (`chief-day-15`). Clock is the server's `asOf`, not the device's.                                                                                                                            | Works.                                                                                   |

### F02-006 — Future-dated records count in today's dashboard

- **Severity:** High
- **Type:** broken · Role: Chief, Deputy, anyone reading the dashboard or TV
- **Area:** `server/src/modules/dashboard/repo.ts:13,21,32` (`recordedAt: { gte: since }` with no
  upper bound); `modules/fallback/service.ts:317–343` (accepts any `timeBlockStart`)
- **Evidence:** importing the screen's own template (rows dated `2027-01-07T03:30Z`) on
  2026-09-25 moved today's "Registered" from 12 to 29 and "in the last hour" from 9 to 26
  (`chief-day-03` → `chief-day-12`, `chief-day-15`). The rows are stored with `recordedAt`
  2027-01-07 (`source = FALLBACK_SHEET`).
- **Impact:** A typo in a fallback sheet's date (a wrong year, a wrong day) silently inflates the
  live numbers, and "last hour" stops meaning the last hour. The template ships a fixed date
  (F01-008), so copying it unedited on a dry run does exactly this.
- **Fix:** Bound every "today" and "since" window above by now or the end of the day; reject import
  rows outside the event day being reconciled (or outside any event day), with a row-level issue.
- **Phase:** P06 (bug fix with test); import validation in P09.4
- **Status:** open

### F02-007 — The live dashboard does not drill down

- **Severity:** Medium
- **Type:** disconnected · Role: Chief, Deputy
- **Area:** `client/src/app/chief/page.tsx:71–160` (no links); `app/ic/page.tsx:210`
- **Evidence:** `chief-day-04` (clicking "DAAA Station has recorded nothing at all today" does
  nothing); `chief-day-05`.
- **Impact:** The one question the needs-attention list raises, "who is on that station and what
  have they done", takes a trip to Operations → IC console → pick the station again.
- **Fix:** Every station, count and warning links to the station page with the filter applied.
- **Phase:** P14.1, P14.2
- **Status:** open

### F02-008 — Staffing gaps omit the shift block and cannot be acted on

- **Severity:** Medium
- **Type:** confusing · Role: Chief, Deputy
- **Area:** `client/src/app/chief/page.tsx:176–193` (renders `stationName` and severity; the DTO's
  `block` is dropped)
- **Evidence:** `chief-day-12` (laptop): 26 gaps, each station twice ("TE Registration nobody
  rostered" ×2) with nothing saying which is Morning and which Afternoon, including stations of
  the other event and stations nobody works today.
- **Impact:** The Chief cannot tell whether a gap is now or this afternoon, and cannot fix it from
  the list (no assignment screen, F02-003).
- **Fix:** Show the block, sort current block first, link each gap to "assign someone".
- **Phase:** P13.7, P14.1
- **Status:** open

### F02-009 — An announcement with no audience chosen goes to the whole event

- **Severity:** Medium
- **Type:** confusing · Role: Chief, Deputy, IC
- **Area:** `client/src/app/inbox/page.tsx:152–154` (`stationId || me?.currentAssignment?.station.id
|| null`); `modules/announcement/service.ts:199` (`null` station and role = everyone)
- **Evidence:** `chief-day-06…07`: Urgent, "Send to the whole event" unticked, "Send to" left on
  "Choose a station…". The stored row has no target; it reached every volunteer as an urgent push.
- **Impact:** The checkbox suggests event-wide is opt-in, but for anyone without a current station
  (Chief, Deputy, Admin) the default is everyone. Urgent is the priority that pushes to phones.
- **Fix:** Require an explicit audience; show "Sends to: …" with the resolved audience and count
  before Send.
- **Phase:** P14.4
- **Status:** open

### F02-010 — Every page load sends a settings request before the session is ready

- **Severity:** Low
- **Type:** broken · Role: all
- **Area:** `client/src/app/providers.tsx:54`, `client/src/lib/runtimeSettings.ts:80–105`
- **Evidence:** every step of every journey logs `401 /api/v1/admin/settings`
  (`reports/P02/journeys/*.json`). Request order on a reload: `POST /auth/refresh` and
  `GET /admin/settings` (no `Authorization`) leave together; the settings call 401s, then succeeds
  after the refresh.
- **Impact:** One failed request and one retry per page load for every user; 401s in the server log
  that are not attacks, which will hide real ones once P15 alarms on them.
- **Fix:** Load settings only after the session is ready; move the endpoint out of `/admin` since
  every role reads it (P03 to root-cause the ordering).
- **Phase:** P07
- **Status:** open

---

## Journey 3 — IC shift · P02.4

Journey `ic-shift` (13 screens), clock frozen in the MORNING block. `fixtures.mjs` first raised,
as the booth volunteer and through the API, a swap request, an incident and a lost-person alert,
because no volunteer screen can request a swap (PF-09) and the IC needs something to act on.

| Task                         | Result                                                                                                                                                                                                                                                                                                                                | Finding |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| IC console                   | Works once a station is picked (`ic-shift-03…04`). Opens empty every time, even for an IC rostered on one station. "Who is here" lists each person once per block, unlabelled (Ivan IC ×2, Bea Booth ×2), and React warns about duplicate keys (the dev overlay's "4 Issues").                                                        | F02-011 |
| Per-device anomaly           | "Registrations per device" shows **Chen Chief 17**: the fallback import from Journey 2 is attributed to the Chief as if tapped on a device at this booth (`ic-shift-04`).                                                                                                                                                             | F02-012 |
| Void a mistaken registration | **No UI** (expected). Only the 10-second undo on the capture screen (`ic-shift-11`); after that, `POST /registrations/:id/void` by API.                                                                                                                                                                                               | F02-013 |
| Adjust gift stock            | **No UI.** The IC can open Redeem a gift at a booth that gives no gifts (`ic-shift-12`, F01-050) but cannot correct a count; `POST /gifts/:id/adjust` by API.                                                                                                                                                                         | F02-013 |
| Approve a swap               | Works in one tap (`ic-shift-05`); the assignment moves to the target. But volunteers have no screen to _request_ a swap, so the queue only fills through the API. `SwapStatus.CANCELLED` is never written: nothing can withdraw a request.                                                                                            | F02-014 |
| Resolve an incident          | **Impossible.** Safety offers "Report an incident" only (`ic-shift-08`); `/safety/incident` is a 404 (`ic-shift-09`). Incidents exist in the UI only as counts on the Chief dashboard. No list, detail, follow-up or status screen. `IncidentStatus.ACKNOWLEDGED` is reachable only by calling `POST /incidents/:id/status` directly. | F02-015 |
| Resolve a lost-person alert  | Works from the banner on any screen: Acknowledge, then "Found — clear this alert" (`ic-shift-06…07`). The banner stacks one full-width red card per alert above the app bar, so two alerts push the page off a phone screen (`ic-shift-01`).                                                                                          | F02-016 |
| Issue attendance codes       | **Dead end.** "The root attendance admin has not been configured yet. Contact the event administrator." (`ic-shift-10`). The root is `ATTENDANCE_ROOT_EMAIL` (F01-009), which the dev `.env` leaves commented out, so fixing it needs an env edit and a restart.                                                                      | F02-017 |

### F02-011 — The IC console repeats people per block and forgets the IC's station

- **Severity:** Medium
- **Type:** confusing · Role: IC
- **Area:** `client/src/app/ic/page.tsx:69–82` (no default station), `:158` (`key={person.volunteerId}`,
  no block shown)
- **Evidence:** `ic-shift-03…04`; console "Encountered two children with the same key" on every
  load of `/ic` (`reports/P02/journeys/ic-shift.json`).
- **Impact:** An IC rostered on both blocks sees each person twice with the same "Not arrived", and
  must pick their own station on every visit. Duplicate keys can make React drop or repeat rows.
- **Fix:** Default to the IC's current station; group "Who is here" by block; key by assignment.
- **Phase:** P07 (key), P14.1 (defaults and grouping)
- **Status:** open

### F02-012 — Imported fallback rows appear as a person's device taps

- **Severity:** Medium
- **Type:** confusing · Role: IC, Chief
- **Area:** "Registrations per device" on `app/ic/page.tsx:105`; fallback import records
  `recordedById` = the importer
- **Evidence:** `ic-shift-04`: "Chen Chief 17" beside "Bea Booth 12" at Sign-Up Booth. The Chief
  never tapped at the booth; the 17 rows are the Journey 2 import, dated 2027-01-07 (F02-006).
- **Impact:** The per-device view exists to spot a device that is mis-tapping; paper counts listed
  as a person's device make the Chief look like the anomaly.
- **Fix:** Show imported rows as their own line, labelled with the source, or exclude them.
- **Phase:** P14.2
- **Status:** open

### F02-013 — Corrections (void, stock adjust) have no screen

- **Severity:** High
- **Type:** needs-API/SQL · Role: IC, Chief
- **Area:** `POST /registrations/:id/void`, `/footfall/ticks/:id/void`, `/gifts/:id/adjust`,
  `/cards/:code/void|reissue` (PF-09)
- **Evidence:** `ic-shift-11…12`; no client caller.
- **Impact:** A mistaken tap noticed after 10 seconds, a miscounted gift box or a spoiled card stays
  in the event's numbers unless a developer calls the API. The server features (reason, audit,
  idempotency) are already built.
- **Fix:** Recent-records list per station with void (reason required); stock adjust on the gift
  tile; card void and reissue on a card page.
- **Phase:** P13.7, P14.2
- **Status:** open

### F02-014 — Volunteers cannot request or withdraw a swap

- **Severity:** Medium
- **Type:** needs-API/SQL · Role: Volunteer, IC
- **Area:** `POST /roster/swaps` (no caller); `SwapStatus.CANCELLED` (no writer)
- **Evidence:** the approval half works (`ic-shift-05`); the request half needed `fixtures.mjs`.
- **Impact:** Swaps happen over chat and the roster drifts from reality; the IC queue stays empty.
- **Fix:** "Ask to swap" on each shift card, with withdraw; decide whether CANCELLED is kept.
- **Phase:** P13.7, P14.3
- **Status:** open

### F02-015 — Incidents cannot be seen or worked after they are reported

- **Severity:** High
- **Type:** dead-end · Role: IC, Deputy, Chief
- **Area:** `GET /incidents`, `POST /incidents/:id/follow-ups`, `POST /incidents/:id/status`
  (no caller); `app/chief/page.tsx:262,289` (counts only)
- **Evidence:** `ic-shift-08…09`; the Chief's "2 incidents open" is plain text.
- **Impact:** An injury reported at the booth is recorded and counted, but nobody can read it,
  add the follow-up, acknowledge or close it. The open count only grows, so it stops meaning
  anything by midday.
- **Fix:** Incident list and detail with follow-ups and status (including ACKNOWLEDGED, or drop it),
  linked from the dashboard count and from the reporter's station.
- **Phase:** P13.7, P14.1
- **Status:** open

### F02-016 — Lost-person alerts stack above the app on phones

- **Severity:** Low
- **Type:** confusing · Role: all
- **Area:** `client/src/components/LostPersonBanner.tsx`
- **Evidence:** `ic-shift-01` (phone): two alerts take the first 380 px, above the app bar.
- **Impact:** With two or three alerts active the screen a volunteer needs is below the fold. The
  prominence is right for one alert; it does not scale.
- **Fix:** One banner with a count and the newest alert, expanding to the list.
- **Phase:** P14.4
- **Status:** open

### F02-017 — Attendance is dead until an env var is set and the server restarted

- **Severity:** Medium
- **Type:** needs-redeploy · Role: IC, all volunteers
- **Area:** `modules/attendance/service.ts:26,76,178` (`env.ATTENDANCE_ROOT_EMAIL`);
  `app/attendance/page.tsx:89–92`; inventory item F01-009
- **Evidence:** `ic-shift-10`: the dev setup (`.env.example`, seed) leaves it unset, so no one can
  take or verify attendance.
- **Impact:** The message sends people to "the event administrator", who has no screen to fix it.
  A new event or a new environment starts with attendance broken.
- **Fix:** The attendance root becomes an event setting chosen from the roster (F01-009), with a
  setup checklist item.
- **Phase:** P10.1, P13.1
- **Status:** open
