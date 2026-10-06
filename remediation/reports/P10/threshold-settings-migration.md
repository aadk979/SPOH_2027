# Operational thresholds move to the scoped store — 6 October 2026

Four operational thresholds were the first legacy runtime settings moved onto
the ADR-003 scoped store: `silentStationMinutes`, `implausibleTapsPerMinute`,
`staleDeviceMinutes` and `longShiftMinutes`. The plan's open question was the
migration fence. The legacy `PATCH /admin/settings` still wrote `AppSetting`, so
copying first would let a running instance write a value the readers no longer
see. The move was therefore made in two releases, the second pushed only once the
first was the single running task.

## Release A — compatibility (`86d2ec4`)

The legacy PATCH refuses any body naming one of the four keys with
`VALIDATION_FAILED`, before any write, audit or cache refresh. A mixed body is
rejected whole and other legacy keys are unchanged. The legacy thresholds form
shows the four keys read-only and points to the settings catalogue above it. The
catalogue already edits them at event scope, and the two station-capable keys
at station scope, with CAS, history and audit.

## Release B — copy and readers (`92ad10c`, released as `a81f36b`)

Migration `20261006090000_copy_threshold_settings` copies only these four keys
from `AppSetting` into the event scope of `evt_spoh2027`. Each copy is version 1
and keeps the original updater. It carries a `MIGRATION` history entry with a
null `before`. The copy is additive and idempotent. It never overwrites a scoped
row or reset history, and it fails rather than guess a destination when rows
exist but that event does not. The other ten legacy keys stay put until their
writers move.

`prepareThresholds` reads the event's organisation, then every permitted layer
in one query. It resolves station, then event, then platform, then the compiled
default, with the registry deciding which scopes count. Invalid stored values
fall through. Live footfall, the station dashboard, data health and long shifts
use it, and the live dashboard shares one snapshot across its panels. Units,
windows, injected clocks and response schemas are unchanged.

## Verification

- Locally (A and B):
  - 23 new and 450 affected real-database integration tests on `spoh2027_test`.
  - Unit, type, lint, architecture, generator and hardcoding checks.
  - Fourteen E2E specs on the dedicated E2E database, after its migration copied
    its one legacy override, plus the category journeys on the same-origin
    runtime.
  - The full 100-check visual suite with updates disabled and unchanged frozen
    markers.
  - Two E2E failures traced to fixture overrides left by rate-limited, interrupted
    runs. They were reset through the public catalogue API at their current
    versions before the specs passed.
- CI: both releases passed full CI. The first push of B failed only the
  dependency audit. GHSA-pqg4-j6r4-53mv (shell-quote, critical) and
  GHSA-wq5f-xc86-pv6w (sharp, high) had been published since A's run. A
  lockfile-only bump within the dependents' ranges repaired it (`a81f36b`) with no
  exception added.
- Staging A, task 138: both refusals returned 400. Legacy settings and the
  catalogue were unchanged, and the form showed four catalogue pointers.
- Staging B, task 139: staging's single legacy override, `staleDeviceMinutes`,
  is now catalogue version 1 with matching value and `MIGRATION` history. The
  other three keys stay unset. All four consumers return schema-valid responses,
  with no backend failure.
- [Evidence](staging-threshold-settings-evidence-2026-10-06.json).

## Remaining

- The ten other legacy keys still need their writers moved before being copied.
- The client `runtimeSettings` cache and session readers still read the frozen
  legacy values.
- The `AppSetting` table has not been dropped.
- No endpoint edits the platform scope that the registry allows for the two
  station-capable keys.
- The reader does not yet take the Event SHARE and membership recheck that the
  plan proposes; existing authority checks are unchanged.
