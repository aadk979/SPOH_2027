# Product setting history and reviewed restore — partial P10.8

The existing Counts and visitor data card now has a collapsed **Setting history
and restore** control for event configuration managers. It reads the two guarded
P09 product keys and presents bounded pages of validated before/after values,
versions, human-readable sources, event-clock timestamps, reasons and positive
"changed by you" attribution. Invalid legacy values remain unavailable. Known
headline stations use their names; missing station identifiers are not displayed.

A restore starts with the current stored version and selected immutable history
entry. It requires a written reason and explicit confirmation. It explains that a
restore appends a new history version. Visitor collection warnings distinguish
irreversible record deletion when restoring none from enabling declared fields
before go-live. The API retains all existing lifecycle, headline, privacy purge,
current-authority and reviewed-version guards; this UI exposes no generic writes.

An unchanged review retains the exact in-memory UUID/request across lost responses,
including after current-value polling advances. A conflict requires a fresh review,
which clears reason, confirmation and retry intent. Denied reads hide cached pages,
current values and controls; denied writes hide the review. The workspace remounts
on event, person or key changes. Collapse, permission loss and sign-out unmount its
queries; their cache retention is zero. Foreground polling uses the registered
dashboard interval. Both review reads explicitly bypass the browser HTTP cache,
including through a transparent session refresh. No intent is stored offline.

## Verification on 4 October 2026

- The 25 new history/revert client checks cover strict event/key/response binding,
  bounded cursor encoding, all six sources, invalid values, event-clock output,
  reason/confirmation, lost-response replay after a polling update, conflict
  review, denial, collapse and sign-out/person isolation. A prepopulated second
  event check verifies that a reviewed target does not cross an event switch.
  One additional API-wrapper check verifies no-store through session refresh.
- All 390 client checks pass across 52 files after the final cache guard.
- Two serial installed-Chrome headless phone/laptop journeys on the dedicated
  spoh2027_rehearsal_shift_e2e_test database change counts through the existing UI,
  review a historical value, restore it as a new REVERT version, and verify its
  persisted history after a hard reload. The original effective counts value is
  restored. Both review hover states have zero WCAG 2A/2AA violations and zero
  application page errors. No visitor collection or delivery writes are needed.
- The full frozen visual run passes 56 unchanged pages. Only the phone/laptop
  admin settings pages have the expected additional collapsed control. Both
  actual screenshots were inspected, only those two baselines updated, and both
  assertions pass. The visual API was restarted before the full run and the normal
  E2E API restored afterward. The browser selector was corrected to account for a
  radio name containing its help text; no production code was changed for that.
- The 32-page static export, client types, lint, architecture, generated settings,
  hardcoding and source/test scans pass. Final build and CI/deployment evidence
  will be attached to the exact source/tracker image.

The guarded revert API's full 1,356 database checks (four existing skips), 92 shared
and 562 server units remain valid: this consumer adds no server, schema or migration
change. General generated event/station controls and schedule create/edit/cancel
consumers remain open. This bounded product UI does not close P10.8 or P10.
