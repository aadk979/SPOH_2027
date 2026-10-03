# Private draft and publication controls — P10.8 continuation

The inbox now gives current staff a collapsed private draft workspace. Authors can
create and edit saved content, schedule the exact saved version on the event clock,
review current action status, edit a pending publication time and cancel a pending
action. Saving remains separate from immediate publication. Existing immediate-send
behavior remains available. Published and archived content is read-only.

The client uses the normal authenticated feature API and runtime-validates strict
private draft/schedule DTOs. Native queries and mutations live only in the feature's
`queries.ts`; API paths live only in `api.ts`. Private query keys include the current
session person, cache retention is zero after unmount, mutation cache retention is
zero, and the workspace unmounts on account changes or hiding. No private outbox,
browser disk persistence, device endpoints or delivery keys were introduced. A
permission denial hides cached private content and the editor.

Content remains tied to its reviewed version while another device changes the saved
draft. Unsaved input survives query refresh and a stale write returns a visible
conflict. Loading the current saved version is explicit. Schedule creation/editing
uses that reviewed content version, separate from the action version. Saved role/day
restrictions and unchanged expiry/due seconds are preserved rather than discarded by
minute-resolution fields. List pagination is bounded, and another create control is
withheld while a listed action is pending/running or more pages need checking.

Publication and expiry input are interpreted in the event's timezone. The shared
clock policy chooses the earlier repeated wall time and moves a skipped time forward.
The publication form explains that policy; the device timezone does not change the
submitted instant. Status errors are bounded catalogue labels, and raw server or
provider failures are not displayed.

Real browser verification caught a missing integration requirement: Express CORS
allowed the existing verbs but omitted `PUT`, so normal cross-origin draft edits
failed before reaching their verified route. Adding `PUT` to the exact-origin policy
fixes both draft and pending-schedule edits. A new real-app preflight test fails
without this fix and still refuses an unapproved origin.

## Verification

- **326 client unit checks in 49 files** pass, including **35 new checks** for event
  time/DST/invalid inputs, preserved target/expiry, retry intent, private API boundaries,
  strict DTOs, reviewed versions, account/cache privacy, permission loss, terminal and
  archived states and active-action controls.
- **Two real-worker browser journeys** pass at phone and laptop widths on the dedicated
  local E2E database: private save/no inbox effect, versioned edit, schedule creation,
  cancellation, a newly created action with edited due time, actual publication, pending
  status across reload, immutable published content, refreshed session and exactly one
  inbox message. No browser page errors were observed.
- **28 affected backend integration checks** pass across security and runtime client
  configuration, including the new authenticated PUT preflight and denied-origin check.
  The preceding management slice's 1,266-pass full DB result remains separately dated;
  this client/CORS slice does not claim a new full DB run.
- Workspace types and root lint pass; architecture reports **957 modules / 4,177
  dependencies** with no violations. Source and screen-test secret scans pass.
- Phone and laptop inbox images were inspected before deliberately updating those two
  baselines for the new collapsed panel. **All 58 serial visual checks pass**; no other
  baseline was changed. The static production export builds **all 32 pages** successfully.

Only local dedicated `_test` databases were migrated to the existing 30 migrations;
they were not reseeded. The real database, sibling `V1`, production and the inherited
pricing artifacts were untouched. Browser suites were serial and the visual API was
restarted before the full run. D-11 source `e9b1be7ccdc6ff48193efb01d008209fd5ef799c`
and tracker `eeb2c264b2167cf18e1fb7db83057240dd080115` were committed/pushed directly
to main. [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37131607882) and
[deploy](https://github.com/aadk979/SPOH_2027/actions/runs/37131985966) succeeded;
staging was `UPDATE_COMPLETE`, with the exact tracker image on app task revision 99
and a healthy completed rollout with zero failed tasks.

At **23:16 Singapore**, installed **Chrome 154.0.8037.97** passed the actual cloud
workflow through normal Cognito sign-in: legitimate synthetic ADMIN-owned INFO draft,
UI PUT edit to saved version two with its ADMIN audience preserved, private `no-store`
reads, no inbox effect before publication, UI schedule/cancel, another schedule with
UI-edited due time, worker publication after that time, exactly one inbox message,
published read-only content, hard reload and sign-out. Collapsed and expanded WCAG
2 A/AA axe checks returned zero violations; there were zero app page errors.
The [sanitized evidence](staging-announcement-ui-evidence-2026-10-03.json) retains no
body, draft/action identifiers or credentials. One synthetic INFO message and two
actions remain as legitimate fixtures; no invitation or urgent push was requested.

General settings/history/revert, event schedule timeline and lifecycle/readiness
UI remain pending, so P10.7/P10.8/P10.9 remain open.
