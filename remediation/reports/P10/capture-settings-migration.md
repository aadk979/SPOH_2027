# Capture and outbox settings move to the scoped store — 7 October 2026

The second batch of legacy runtime settings moved onto the ADR-003 scoped store:
`captureUndoWindowSeconds`, `captureSendGraceSeconds`, `outboxWarningCount` and
`outboxWarningAgeMinutes`. It used the same two-release fence as the
[thresholds](threshold-settings-migration.md). Only the client reads these four, so
the reader release also replaces the client's settings cache.

`lostPersonPurgeHours` was deliberately left out. It is privacy-classed, so the
catalogue refuses it. Retiring its legacy writer now would leave it with no
editor. It needs a guarded privacy-setting writer first.

## Release A — compatibility (`ec6fc8e`)

The legacy PATCH refuses a body naming any of the four with `VALIDATION_FAILED`
before any write, audit or cache refresh, and rejects a mixed body whole. The
legacy form shows them as pointers to the catalogue, which already edits all four
at event scope.

## Release B — copy and readers (`5b5422f`, released as `2bfae89`)

- Migration `20261007090000_copy_capture_settings` copies the four keys into the
  event scope of `evt_spoh2027` with `MIGRATION` history. It follows the same
  rules as the threshold copy: version 1, original updater, raw value kept,
  never overwrites a row or reset history, fails rather than guess a destination.
- `GET /admin/settings/client` (and `/events/:eventId/admin/settings/client`)
  serves a device its tuning for the caller's own event. The four keys resolve
  event, then default, in one query through the shared numeric resolver now used
  by the thresholds too. The two platform-only poll intervals still come from the
  legacy store until their own migration. The read holds the event row, rechecks
  the membership under that lock, writes nothing, and is `no-store` before
  authentication.
- The client cache belongs to one signed-in volunteer in one event. The event
  provider names the open event. A different person or event drops the old values
  at once, late answers for a previous owner are discarded, a malformed answer
  keeps the defaults and sign-out clears it. The client no longer reads the legacy
  global settings.

## Verification

- Locally:
  - New: 9 migration-harness and 8 endpoint integration tests on `spoh2027_test`,
    6 client ownership tests and one E2E journey. Removing the late-answer guard
    fails exactly the two late-answer tests.
  - Affected integration suites (admin, isolation inventory, threshold copy and
    consumers), full client (679), server unit (761) and shared suites, types,
    lint, architecture, hardcoding and generated-settings checks.
  - E2E on the dedicated database after its migration: capture, settings,
    scoped capture controls, events and the new device-settings journey.
  - The full 100-check visual suite against fresh static exports of A and of B,
    with updates disabled and the frozen markers unchanged.
- CI: full CI passed for A. Staging A, task 140: every single-key refusal and the
  mixed body returned 400, the legacy settings and catalogue were unchanged, the
  form showed eight catalogue pointers, and the session was revoked.
- CI: full CI passed for B. Staging B, task 141: the migration applied; staging
  had no legacy override for these keys, so nothing was copied and all four stay
  default-sourced at version 0. After a normal sign-in the app fetched
  `/events/<id>/admin/settings/client` with 200 and `no-store`, its values matched
  the event catalogue and the legacy poll intervals, and it made no legacy settings
  read. An anonymous read got a private 401. No backend failure; the session was
  revoked.
- [Evidence](staging-capture-settings-evidence-2026-10-07.json).

## Correction to the threshold record

The threshold report says A and B passed the full visual suite. That run finished
at 22:38 on 6 October, before `86d2ec4` was committed, against an older static
build. It never saw the thresholds become catalogue pointers, and the committed
`admin-settings` baselines still showed them as inputs. Release A here refreshed
and reviewed those two baselines. Always rebuild the static export before a
visual acceptance run.

## Remaining

- `lostPersonPurgeHours`: needs a guarded privacy-setting writer before its
  legacy writer can be retired.
- `eventName`: a compatibility row; `Event.name` already holds the name.
- `idempotencyRetentionDays`, `refreshSessionDays`, `dashboardPollSeconds` and
  `alertPollSeconds`: platform scope, for which no writer exists yet.
- The device cache is loaded once per person and event; a catalogue change reaches
  a device on its next page load, as before.
- The `AppSetting` table has not been dropped.
