# Changed-key settings saves — partial P10.8, F02-005

The existing runtime settings form validates its complete draft with the shared
schema, then PATCHes only values that differ from its original loaded values.
Unchanged and loading forms send nothing. Trimmed names and equivalent numeric
formatting are unchanged. Invalid edits stay eligible for validation and show the
existing field messages. A failed current read or disabled session blocks saving.

A refresh keeps an edited draft and its original comparison values, so another
administrator's unrelated setting change is not submitted by this save. A new
event seeds independently, including when its query is already populated. Inputs
and repeated saves are disabled while the request runs. Success adopts the returned
settings as the next baseline; a failed save keeps the edited draft retryable.

The real browser journey exposed a second defect in the compatibility cache:
starting a notification refresh during the post-write read invalidated that read's
generation and returned the old cache. A deterministic unit regression returns 15
after a committed write of 16 without the fix. Runtime settings refreshes now run
serially, so the post-write read follows older reads and publishes its own result.
The valid-cache fallback after a database read failure remains recoverable. No new
queries, timers, generic setting keys, schema or migration are introduced.

## Verification on 4 October 2026

- The original client regression submits all 14 legacy keys after editing only the
  name. Nine new form checks and four model checks cover changed-key requests,
  untouched overrides, no-op normalization, validation, refresh/draft ownership,
  pending and failed requests, event switches and failed reads. All 403 client
  checks pass across 53 files.
- Three new server refresh checks cover ordered reads, the committed write response
  under a competing notification and recovery after a failed read. All 565 server
  units pass across 52 files. Server/client types, lint and architecture pass.
- Installed-Chrome headless phone/laptop journeys on the dedicated
  spoh2027_rehearsal_shift_e2e_test database pass. Each sends only
  staleDeviceMinutes, verifies the effective response and persisted value after
  hard reload, keeps unrelated override keys unchanged and restores all original
  effective settings through the ordinary UI. Both save hover states have zero
  WCAG 2A/2AA violations and application page errors. The test tracks the current
  browser authorization after reload for bounded cleanup.
- The full serial database suite passes 1,356 checks across 94 files, with the four
  existing skips. Cross-instance settings/cache invalidation checks remain green.
  The server build, all server/client types and 32-page static export pass. Lint,
  architecture (1,004 modules, 4,407 dependencies), generated settings, hardcoding
  and source/test/report secret scans pass. The inherited P08 pricing hashes and
  historical P05 files are unchanged.
- The visual API is restarted before the full frozen run. All 56 unchanged pages
  pass; only the phone/laptop settings screenshots differ at the now-disabled
  Save button. Both actual images and the diff are inspected, only those two
  baselines updated, and both assertions pass. The normal API is restored afterward.

Source `8357ec8` and tracker image `c5b9e88` are pushed directly to main under D-11.
Exact-image [CI 37196456461](https://github.com/aadk979/SPOH_2027/actions/runs/37196456461)
passes, including server integration, architecture, lint/type/build and security
jobs. [Staging deployment 37196788580](https://github.com/aadk979/SPOH_2027/actions/runs/37196788580)
passes. Actual CloudFormation reaches UPDATE_COMPLETE and ECS task revision 109
runs the exact tracker image, with one desired/running task, one COMPLETED rollout
and zero failed tasks.

At 19:01 Singapore, normal Cognito Authorization Code + PKCE and installed Chrome
154 verify the deployed form. Untouched and whitespace-only forms send nothing.
Both successful UI PATCHes name only staleDeviceMinutes; the committed response,
persisted change after hard reload, ordinary UI restore and restored value after
another reload all match. Untouched settings/overrides and guarded product values
and versions are unchanged. Sign-out succeeds, with zero application page errors
and save-hover WCAG 2A/2AA violations. The original effective threshold is restored;
an ordinary restore may retain this changed key's stored override at that original
value. No unrelated setting, visitor, lifecycle, schedule, announcement or delivery
writes are requested. Sanitised [staging evidence](staging-settings-changed-keys-evidence-2026-10-04.json)
records bounded outcomes and request keys without credentials, actor/event IDs or
raw setting values.

This is a bounded correction to the existing compatibility form and cache. The
legacy platform-wide AppSetting adapter remains; complete generated event/station
settings, per-key reviewed-version controls and general schedule management are
still required. This slice does not complete P10.8 or P10.
