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

_Fill in on completion._
