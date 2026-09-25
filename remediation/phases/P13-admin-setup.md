# P13 — Admin and event setup experience

| Field             | Value         |
| ----------------- | ------------- |
| Gate              | G4            |
| Depends on        | P10, P11, P12 |
| Decisions         | —             |
| Changes behaviour | **Yes**       |
| Size              | XL            |

## Purpose

An organiser can take an event from nothing to LIVE, and from CLOSED to ARCHIVED to next year's
clone, entirely in the app, guided by a checklist, with every server capability reachable from
a screen.

## Context for a fresh session

- Input: `findings/F02-journeys.md` (Journey 1 and Journey 6 logs, the missing screens list), and
  PF-09.
- Settings, schedule and lifecycle screens exist from P10.8. The permissions UI is from P11.7, and
  people is from P12.4. This phase puts them in one workspace and fills every gap.
- Standards: every screen is built in the P07 feature structure, with forms from the shared form
  pattern.

## Steps

### P13.1 — Information architecture

- **Do:**
  1. **Events home**: the list, with status chips, create, and clone.
  2. **Event workspace** sections: Overview · Setup · People · Operations · Reports · Settings ·
     Schedule · Permissions · Audit.
  3. Breadcrumbs, and a section nav from the navigation registry.
  4. Test the IA with the owner as a clickable walkthrough before building the details.
- **Done when:** the owner approves the IA walkthrough.

### P13.2 — Create and clone wizard

- **Do:** A wizard for:
  - basics: name, slug, venue, timezone, dates
  - the source to clone from, if any
  - which parts to copy

  It lands on the Setup checklist.

- **Done when:** e2e creates one event from scratch and one by cloning.

### P13.3 — Setup sections

- **Do:** Full CRUD screens, each with validation and inline help:
  - **Days and shifts**: days, shift templates, and an exceptions grid
  - **Stations**: type, capabilities, tags, location, active
  - **Visitor categories**: order, labels, active
  - **Mission cards**: which stations stamp, and batch generation that produces a printable
    PDF/ZIP in S3 `exports`, plus lookup, void and reissue
  - **Gifts**: types, stock, thresholds, adjustments with reasons
  - **Content**: the guide, "What do I say", journey, map and floor-plan images uploaded to S3
    `content`, with draft/published versions and a preview
  - **Attendance**: the root member, trusted networks, and a test
- **Done when:** every event-data class from F01 has a screen.

### P13.4 — Offline content delivery

- **Do:**
  1. A versioned content endpoint (`/events/:id/content?v=`) with `ETag`.
  2. The service worker caches **published content only**, by version. API data still never
     comes from cache (the existing rule).
  3. The floor plans are precached.
- **Done when:** an offline e2e test shows the map and guide with the network off, after one load.

### P13.5 — People and assignments

- **Do:**
  1. Integrate P12.4.
  2. An **assignment board**: days × shifts × stations, with coverage counts, gaps highlighted,
     assign/unassign, and CSV import.
  3. The swap queue, briefing slots (schedule and mark complete), and escalation chain editing.
- **Done when:** e2e staffs a day from empty to zero gaps.

### P13.6 — Go-live readiness

- **Do:** The Overview shows an automated checklist. Each item has a pass/fail and a deep link to
  fix it. Items include:
  - every shift × station staffed
  - categories defined
  - card batch generated
  - gifts stocked
  - content published
  - attendance root and networks set
  - role permissions reviewed
  - notifications configured
  - staging smoke green, backups fresh, alarms OK (from CloudWatch)

  The lifecycle transitions READY and LIVE are guarded by it (P10.5).

- **Done when:** the checklist is computed server-side and unit-tested per item.

### P13.7 — Screens for every API-only feature

- **Do:** From F02 and PF-09:
  - void a registration or footfall tick
  - footfall bulk entry
  - gift stock adjust
  - incident follow-ups and status
  - lost-and-found close-out
  - swap request creation (volunteer)
  - briefing complete
  - audit log explorer (from the audit branch, refactored)
  - device sessions (P12.5)
  - card void/reissue (P13.3)
- **Done when:** a test over the route inventory shows every non-internal route has a client
  caller. The exceptions are listed with reasons.

### P13.8 — After the event

- **Do:** A close-out flow:
  1. CLOSED transition
  2. lost-and-found close-out
  3. fallback windows closed
  4. final report
  5. export pack to S3
  6. ARCHIVED with retention timers
  7. "Start next year's event from this one"
- **Done when:** e2e walks close-out to archive to clone.

### P13.9 — End-to-end journeys

- **Do:** Playwright suites for each role journey from F02, rewritten against the new product.
  The Journey 1 time-to-set-up is measured again for comparison.
- **Done when:** all the journeys pass on staging, and Journey 1 needs zero API, SQL, seed or env
  steps.

### P13.10 — Report

- **Do:** Write the phase report, with before/after for the F02 journeys.
- **Done when:** the exit criteria hold.

## Exit criteria

- An event can be created, set up, run, closed, archived and cloned only through the UI.
- Every server feature has a screen, and the readiness checklist guards go-live.

## Phase report

_Fill in on completion._
