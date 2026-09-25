# P14 — Interlinking and UX polish

| Field             | Value   |
| ----------------- | ------- |
| Gate              | G4      |
| Depends on        | P13     |
| Decisions         | —       |
| Changes behaviour | **Yes** |
| Size              | L       |

## Purpose

Make the product feel like one system. Every entity has a home, every number leads somewhere,
states are consistent, and the event's identity (name, branding) appears throughout. This answers
"features aren't interconnected".

## Context for a fresh session

- The spec is the **interlinking matrix** in `findings/F02-journeys.md` (P02.8) and the friction
  list.
- The design language is `docs/design.md`, with the documented capture-screen overrides (≥ 88px
  targets, contrast). Keep both.

## Steps

### P14.1 — Entity pages

- **Do:** Build a detail page for each of: station, person (membership), event day, shift, card,
  incident, lost-person alert, lost-found item, announcement, fallback window, and import batch.
  Each page shows:
  - the entity's own data
  - **related entities as links**: for example, station → staff on shift now, today's counts per
    unit, open incidents, recent alerts, config, audit
  - the actions the viewer is allowed (from P11.8)
- **Done when:** every row of the matrix has a page, and every "related" cell is a link.

### P14.2 — Dashboard drill-downs

- **Do:**
  1. Every tile and figure on the live, IC, station and TV dashboards links to the filtered list
     or entity behind it (TV mode excepted, because it is non-interactive).
  2. The attention panel items link to where each problem is fixed.
- **Done when:** a test clicks every tile and lands on a non-empty, correctly filtered view.

### P14.3 — Search and quick actions

- **Do:**
  1. A global search (person, station, card code, incident number, announcement) scoped to the
     event and filtered by permission.
  2. A command palette on laptop, and a search tab on phone.
  3. Quick actions ("raise lost person", "report incident") from anywhere.
- **Done when:** e2e finds and opens each entity type.

### P14.4 — Consistent states

- **Do:**
  1. Shared components for loading, empty, error (with retry and request id), offline,
     permission-denied (with the reason from policy) and not-found.
  2. Confirmation and undo patterns, and toasts.
  3. Replace every ad-hoc variant.
- **Done when:** lint or a review checklist shows no ad-hoc state rendering. Visual snapshots are
  updated.

### P14.5 — Notification centre

- **Do:**
  1. One place for announcements, lost-person alerts, assignment changes and swap decisions,
     with read state.
  2. Per-person push preferences within the rules (only URGENT pushes by default).
- **Done when:** e2e covers the receive → read → act cycle.

### P14.6 — Event branding

- **Do:**
  1. Event name, logo and accent colour from event settings, applied to the shell, sign-in, TV
     mode and exports.
  2. A dynamic PWA manifest per event (name, icons from S3).
  3. `layout.tsx` metadata comes from the event.
- **Done when:** a cloned event with different branding renders correctly, and there is no "SPOH
  2027" literal left in the client (the P09 hardcoding check).

### P14.7 — Accessibility

- **Do:**
  1. axe on every route in e2e, at both viewports and in both themes.
  2. Keyboard-only walkthrough of the admin workspace.
  3. Screen-reader labels for icon buttons and live regions for counters and alerts.
- **Done when:** there are zero axe violations at `serious` or above.

### P14.8 — Copy and help

- **Do:**
  1. Inline help on every admin control ("what changing this does").
  2. A glossary including **the three counts**, linked wherever counts appear.
  3. Error messages rewritten to be actionable.
  4. Owner review of the copy.
- **Done when:** the owner signs off the copy.

### P14.9 — Visual regression

- **Do:** Refresh the P07 visual snapshots for the new screens, at phone and laptop sizes, in both
  themes, and run them in CI.
- **Done when:** the snapshot suite is green in CI.

### P14.10 — Report

- **Do:** Re-run the F02 journeys and interlinking matrix and record before/after, then write the
  report.
- **Done when:** the exit criteria hold.

## Exit criteria

- Every entity has a page with related links, and every dashboard figure drills down.
- States are consistent, branding comes from the event, and there are zero serious accessibility
  violations.

## Phase report

_Fill in on completion._
