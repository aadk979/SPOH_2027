# P02 — Audit B: admin and role journeys

| Field             | Value |
| ----------------- | ----- |
| Gate              | G0    |
| Depends on        | P00   |
| Decisions         | —     |
| Changes behaviour | No    |
| Size              | L     |

## Purpose

Experience the product the way each role does, and record every place it is clunky, confusing,
disconnected or impossible without the API, SQL, the seed or a redeploy. This turns "it feels
clunky" into a ranked list with screenshots.

## Context for a fresh session

- Run the apps locally with the seed (`npm run db:seed --workspace server && npm run dev`). Sign in
  with the seeded emails listed in the root README.
- Screens are captured with Playwright (Chromium at `/opt/pw-browsers`) at **Pixel 7** and
  **1440×900**. The capture script goes in `remediation/tools/journeys/`.
- Output: `findings/F02-journeys.md` and `findings/F02-screens/`.
- `findings/preliminary.md` PF-09 already lists endpoints with no client caller.

## Scoring each friction point

| Field      | Values                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Type       | dead-end · needs-API/SQL · needs-redeploy · confusing · disconnected · inconsistent · broken · slow |
| Severity   | Blocker · High · Medium · Low (see findings/README.md)                                              |
| Role       | who hits it                                                                                         |
| Screenshot | `F02-screens/<journey>-<nn>-<phone                                                                  | laptop>.png` |

## Steps

### P02.1 — Journey harness

- **Do:**
  1. Write a Playwright script that signs in as a role, walks a named route list and saves screenshots
     at both viewports.
  2. Add helpers to freeze time inside a shift block, so the capture screens are open.
- **Done when:** `node remediation/tools/journeys/run.mjs <journey>` produces screenshots.

### P02.2 — Journey 1: set up a brand-new event from nothing (Admin)

- **Do:** Try to create a second event, "Test Event 2027", with 2 days, 3 shifts, 5 stations,
  6 visitor categories, 2 gifts, 20 volunteers and assignments, using only the UI.
  1. Record every step you cannot do.
  2. Record what you did instead (API call, SQL, seed edit, env edit, redeploy) and how long it took.
- **Covers:** the core complaint: no reuse, no setup flow.
- **Done when:** the step-by-step log is in F02, with each blocker classified.

### P02.3 — Journey 2: event day as Chief and Deputy

- **Do:**
  - live dashboard
  - drilling into a silent station
  - an urgent announcement
  - declaring and closing fallback
  - importing fallback data
  - fixing a roster gap mid-day
  - reading the report
  - TV mode
- **Done when:** the friction list is recorded.

### P02.4 — Journey 3: IC shift

- **Do:**
  - IC console
  - per-device anomaly
  - voiding a mistaken registration (no UI expected)
  - adjusting gift stock
  - approving a swap
  - resolving an incident with a follow-up
  - resolving a lost-person alert
  - issuing attendance codes
- **Done when:** the friction list is recorded.

### P02.5 — Journey 4: volunteer shift

- **Do:**
  - first sign-in
  - attendance by QR and by PIN
  - My shift
  - capture at each station type
  - the offline outbox (DevTools offline), undo, and failed-tap salvage
  - lost person, incident, lost and found
  - inbox
  - guide, map, journey, brief
- **Done when:** the friction list is recorded.

### P02.6 — Journey 5: Lead

- **Do:** reports, export, audit log, volunteer list (read-only), and what Lead sees vs can do.
- **Done when:** the friction list is recorded.

### P02.7 — Journey 6: after the event and the next event

- **Do:**
  - lost-and-found close-out
  - final export
  - lost-person purge visibility
  - deactivating the roster
  - archiving (not possible, expected)
  - starting next year's event from this one (not possible, expected)
- **Done when:** the gaps are recorded as requirements for P09.9 and P13.8.

### P02.8 — Interlinking matrix

- **Do:** For each entity (event day, shift, station, volunteer, assignment, registration, footfall,
  card, gift, incident, lost-person alert, lost-found item, announcement, fallback window, import
  batch, audit row), build a matrix. It records where the entity appears (which screens), whether it
  has its own page, and what you can navigate to from it.
- **Covers:** "features aren't interconnected". This is the specification for P14.1–P14.3.
- **Done when:** the matrix is in F02 with the gaps highlighted.

### P02.9 — Permission experience

- **Do:** For each role, compare what the UI offers, what the server allows, and what the role is
  meant to do (from the capability matrix). Record the mismatches: hidden but allowed, shown but
  denied, allowed with no screen, and denials without an explanation.
- **Covers:** the "confusing RBAC" complaint, and input to P11.7/P11.8.
- **Done when:** a per-role table is in F02.

### P02.10 — Rank and write up

- **Do:**
  1. Deduplicate and rank the findings.
  2. Write the top 10 "clunky" items as a short narrative at the top of F02 for the owner.
- **Done when:** F02 is complete and the screenshots are committed. Screenshots are compressed and
  kept under 300 KB each.

## Exit criteria

- All six journeys are walked on both viewports. Every friction point is scored and evidenced, and
  the interlinking matrix and permission table are complete.

## Phase report

**Status: done (2026-09-25).** 10 of 10 steps done. No product code changed:
`git diff 13b19f4..HEAD -- server client packages ops scripts` is empty.

### Summary

`findings/F02-journeys.md` records six role journeys, three denial journeys, the interlinking
matrix and the per-role permission table, with 118 screens per viewport in `findings/F02-screens/`
(236 files, largest 111 KB). It holds **32 findings: 1 Blocker, 8 High, 17 Medium, 6 Low**, a
ranked table and a top-10 narrative for the owner. Headline: no event entity (F02-001); none of the
eight setup tasks is possible in the UI; two numbers on the live dashboard and in the report are
wrong (F02-006, F02-027); nothing links to anything (F02-029). P01's F01-046 and F01-047 and PF-09
are confirmed from the user's side.

| Step   | Status  | Outcome                                                                                                                      |
| ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P02.1  | ✅ done | `tools/journeys/`: `run.mjs` (paced sign-in, saved session per role and viewport, frozen clock, compressed PNGs, event log)  |
| P02.2  | ✅ done | Admin: 0 of 8 setup tasks in the UI; API fallback logged (`api-setup.mjs`); F02-001…005, incl. a 500 in the roster dry run   |
| P02.3  | ✅ done | Chief and Deputy: dashboard, announcement, fallback, import, gaps, report, TV; F02-006…010                                   |
| P02.4  | ✅ done | IC: console, swaps, lost person, incidents, attendance, corrections; F02-011…017 (`fixtures.mjs ic`)                         |
| P02.5  | ✅ done | Volunteer: sign-in, attendance by PIN, all capture types, offline, salvage, safety forms, content; F02-018…023               |
| P02.6  | ✅ done | Lead: reports, export, roster, audit, what shows versus what works; F02-024…026                                              |
| P02.7  | ✅ done | After the event: close-out, purge, deactivation, archive, clone; 7 requirements for P09.9/P13.8; F02-027, F02-028            |
| P02.8  | ✅ done | Interlinking matrix for 16 entities: no dynamic route exists; F02-029                                                        |
| P02.9  | ✅ done | `permissions.mjs`: 95 routes against the matrix, live GET probe per role (server = matrix); per-role table; F02-030, F02-031 |
| P02.10 | ✅ done | Ranked table, top-10 narrative, P01 follow-ups closed, PF-09 status; F02-032 from the harness build                          |

**Exit criteria:** all six journeys walked on both viewports ✅; every friction point scored and
evidenced by screenshot, log or command ✅; interlinking matrix and permission table complete ✅.

### Still open (not blocking P03–P04)

- **Before P05:** D-01, D-03 (now also F02-031: the Deputy's roster scope), D-07/D-10, D-08, D-12,
  the fate of `feat/audit-cloudwatch` (PF-14; F02-024 depends on it), and the owner questions in
  F01 § Summary. P02 adds none of its own.
- **For P03:** reproduce F02-032 (refresh reuse across tabs) with a test; confirm the intent of
  `CardStatus.LOST` (F02-013); root-cause F02-010. F02-002, F02-006 and F02-027 are bugs that need
  failing tests first.

### Deviations from plan

- **Environment:** the dev DB was built with `db:deploy` + `db:seed` (not `db:reset`). Attendance
  needs `ATTENDANCE_ROOT_EMAIL`, which the dev `.env` leaves unset (F02-017), so for P02.5 the
  gitignored local `server/.env` was given `ATTENDANCE_ROOT_EMAIL=admin@spoh2027.test` and
  localhost as the campus network, and the dev server restarted. It was restored afterwards.
- **Server time cannot be frozen from the browser.** `freezeInShift` freezes the page clock; the
  server keeps capture open through the dev `.env`'s `SHIFT_HOURS_ALWAYS_OPEN=true`. Screens that
  print server times (TV clock, attendance "present at") show real time.
- **Fixtures through the API.** Things no screen can create (swap request, incident, lost-person
  alert, a Mission Complete assignment, attendance chain, moved shift hours) are made by
  `fixtures.mjs <ic|volunteer|reset>`. That is itself evidence for PF-09.
- **Extra tools the plan did not name:** `api-setup.mjs` (P02.2 log), `fixtures.mjs`,
  `permissions.mjs` (P02.9, so "server allows" is measured rather than read).
- **Not exercised:** attendance by QR (needs a camera). The PIN path on the same screen was walked.
- **Journeys ran against the same dev database in order**, so later screens show earlier journeys'
  data (the Test Event rows, the 2027-dated import). That is deliberate: it is what the product
  does with a second event, and several findings come from it.
- **Checks:** all green: lint (0 errors, the 131 expected guard warnings), typecheck,
  `format:check`, `npm test` (server 521: 233 unit + 288 integration; client 19) and
  `npm run build`. e2e was not re-run: no product code changed.

### Metrics before → after

| Measure                      | End of P01      | End of P02 |
| ---------------------------- | --------------- | ---------- |
| Lint errors / guard warnings | 0 / 131         | 0 / 131    |
| Functions > 50 / files > 300 | 97 / 18         | 97 / 18    |
| Guard counts (`arch:report`) | `P01-arch.json` | identical  |
| Findings                     | F01: 52 items   | F02: 32    |

Snapshots: `reports/metrics/P02.json` and `P02-arch.json` (identical to P01 apart from timestamps).

### Findings added

F02-001…032 in `findings/F02-journeys.md`. PF-09 confirmed (status in `preliminary.md`). F01-046
and F01-047 confirmed; no F01 finding re-filed.

### Follow-ups for later phases

- **P06:** fix F02-002, F02-006, F02-027 with failing tests first (wrong numbers and a 500).
- **P09.9 / P13.8:** the seven close-out and clone requirements in F02 § Journey 6.
- **P11.7 / P11.8:** the per-role table in F02 § P02.9 and the matrix oddities under it.
- **P13 / P14:** the interlinking matrix is the specification for P14.1–P14.3; the "no screen"
  findings (F02-003, 013, 014, 015, 023, 024) are P13.7's list.

### Commits

`b0b5bfa` harness · `a9bb753` journey 1 · `08a91e6` journey 2 · `317d659` journey 3 · `87b37c8`,
`641a156` journey 4 · `c36786c` journey 5 · `32b3f98` journey 6 · `225370e` matrix · `40d44a7`
permissions · `fbcb138` summary, plus the `chore(remediation): P02.x done` tracker commits and the
phase close.
