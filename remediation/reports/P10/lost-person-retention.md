# Lost-person retention becomes an event setting — 7 October 2026

`lostPersonPurgeHours` decides how long a resolved lost-person alert keeps its
description, clothing and approximate age. ADR-003 §8 promises families that a
description is removed 24 hours after the case is resolved, and the archive
snapshot schedule assumes it. The legacy screen let a Chief or Admin set anything
from 1 to 720 hours, globally.

**Owner decision D-16:** an event may only shorten the promise. The value is
1–24 hours per event. A longer retention needs a code change.

## Release A — guarded editor (`56287ee`)

- The registry bound is now 1–24. Any stored value outside it, legacy or scoped,
  falls through to the 24-hour default, so the cap applied as soon as A ran.
- The key joins the guarded event settings (`PATCH /admin/event-settings`)
  beside counts and visitor data: one key at a time, at the version read, with
  history, audit and restore, and only with `config.manage`.
- The form under "Counts and visitor data" saves a longer value at once. A shorter
  one asks first: older descriptions are removed at the next purge and cannot be
  recovered. A restore that would shorten carries the same warning.
- The legacy PATCH refuses the key with `VALIDATION_FAILED`, naming
  `/admin/event-settings`, and the legacy form points to the new field.

## Release B — copy and reader (`879336a`)

- Migration `20261007110000_copy_lost_person_retention` copies the legacy row to
  the event scope of `evt_spoh2027`, with the same rules as the earlier copies. A
  legacy value above 24 is kept as evidence and resolves to 24.
- The purge reads only the event's value or the 24-hour default.

## Verification

- Locally:
  - New: four event-settings integration cases (version, history and audit; 25,
    720, 0, 1.5 and text refused; `config.manage` only; legacy cap), seven
    migration-harness cases, six client cases and one E2E journey (confirmation
    before shortening, history, a 25-hour write refused, fixture restored).
  - Affected suites: admin, event settings, history and revert, lost person,
    scheduled purge, scoped settings and the isolation inventory; full client
    (686), server unit (762) and shared (252); types, lint, architecture,
    hardcoding and generated-settings checks.
  - Accessibility, admin, product history, visitor allowlist, settings and
    device-settings browser specs.
  - All 100 visual checks on a fresh static export, after reviewing the two
    `admin-settings` baselines: the new field and the legacy pointer only.
- CI: full CI passed for both releases.
- Staging A, task 142: the legacy PATCH was refused naming `/admin/event-settings`,
  a 25-hour event value was refused, nothing changed, and the form showed the
  field at 24 and the legacy pointer. Retention was not shortened on staging.
- Staging B, task 143: the migration applied. Staging had no legacy override, so
  nothing was copied; the event value stays the 24-hour default at version 0 with
  no history. No error-level application log in the hour after release.
- [Evidence](staging-lost-person-retention-evidence-2026-10-07.json).

## Remaining

- `eventName` and the four platform-only keys are still legacy.
- The `AppSetting` table has not been dropped.
