# Lifecycle readiness and reviewed controls — P10.8

Implemented on 4 October 2026, continuing from the verified `46a73d7` staging image.
This is a bounded P10.8 slice; it does not close P10.8 or P10.

## Result

Event configuration managers can expand **Lifecycle and readiness** in event settings.
The panel shows the reviewed event phase/version, readiness check time, legal next
states and bounded explanations of unavailable transitions. A closed event also shows
its reopening deadline on the event clock. Choosing an available transition requires
explicit confirmation; reopening requires a written reason.

The client sends the reviewed version to the existing audited lifecycle mutation.
Background refreshes preserve the local review and reason; a changed version or guard
result disables submission until **Review current state** loads fresh evidence and
clears confirmation. A lost-response retry retains the same idempotency key for the
same intent. Editing the intent creates a new key. Successful transitions refresh
event queries and the event list, including phase banners and capture availability.

Readiness is advisory: `GET /lifecycle/readiness` has no effects and uses the same
domain guard table as the mutation. Its transaction locks Event first in SHARE mode,
checks current event membership/capability, reads the clock after any lock wait and
uses current same-organisation authority for reopening. Reads use `ReadCommitted`
and `Cache-Control: no-store`. Strict shared contracts bound the result and the
client rejects an unexpected event ID. Query keys include event and person; permission
loss or a failed read hides cached controls. Raw server errors and unknown blocker
codes are not exposed in the UI.

The existing DRAFT/READY/rehearsal, close-out and privileged reopening effects remain
the mutation authority. First go-live stays unavailable because the P13 checklist is
not implemented. Public archiving stays unavailable pending read-only access,
retention/backup prerequisites and later authorization work. The UI does not supply
go-live overrides. No schema change or production operation is part of this slice.

## Verification

- Server unit suite: 562 passed; shared contracts: 80 passed.
- Client suite: 346 passed in 50 files, including 20 new lifecycle checks. The 20
  affected checks passed again after the final component extraction/copy adjustment.
- Guarded integration database `spoh2027_test`: 63 passed across lifecycle readiness,
  preparation, reopening and route isolation; 18 new readiness checks include real
  lock waits, current authority/structure, clock/deadline boundaries and no effects.
  This is a focused run, not a repeat of the inherited full integration evidence.
- Guarded worker E2E database `spoh2027_rehearsal_shift_e2e_test`: both phone and laptop
  journeys passed. They use normal local sign-in/UI transitions, verify practice
  fallback closure, phase banners, frozen FINAL reports, required reopen reasons,
  superseded snapshots and cancelled reminders. Fixture preparation uses only that
  test database and restores the original event phase and temporary membership.
- Frozen visual database `spoh2027_visual_test`: 56 unchanged screens passed in the
  full 58-screen run. The two settings baselines were visually reviewed, updated for
  the new collapsed panel and both reasserted successfully. The expanded phone
  lifecycle view was also inspected; no overflow or page errors were observed.
- Workspace typechecking, lint, architecture boundaries, hardcoding and generated
  settings checks passed. Source/test directory secret scans and the 579-commit
  Git history scan found no leaks. The three inherited P08 pricing artifacts and
  historical P05 pricing were not changed.

The client production build passed with all 32 static pages exported. Exact D-11
CI/deployment/staging UI evidence is recorded in the continuation report once verified.
Staging checks must use the restricted synthetic
identity without recording credentials or raw session responses.

## Remaining scope

Generated settings controls/history/revert and the general event schedule timeline
remain open in P10.8. P10.5 still needs public archive/read-only/retention and Cedar
context; P10.7/P10.9 retain their remaining handlers and phase-wide criteria. External
device delivery and production Firebase sessions are not verified by this UI slice.
