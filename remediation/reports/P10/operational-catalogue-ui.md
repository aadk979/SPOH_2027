# Generated operational catalogue reader — partial P10.8

The settings screen now has a collapsed, read-only catalogue for all 14 registered
event keys and the three supported station keys. Groups, labels, descriptions and
units come from generated registry metadata. Each row shows its scoped value,
inheritance source, selected stored version and source version. Invalid stored
layers remain omitted and are explained without exposing their JSON.

This is a reader for the existing scoped API. Some operational consumers still
read legacy global settings, so the interface calls these **scoped values** and
does not claim that every runtime consumer uses them. Existing reviewed capture
and product controls retain their guarded writers. This slice adds no setting,
schedule, restore or lifecycle producer and changes no backend/shared source.

Private history belongs to the current event, person, exact target and key. It
shows event-clock dates, current-person attribution, source, reason and validated
before/after values. RESET explains override removal without inventing the
historical inherited value. Unavailable historical values are described without
rendering their raw content. Cursor pagination preserves the API's ownership.

Changing event/person remounts the collapsed owner; changing scope remounts the
contents. The queries have zero cache retention after unmount. A current or
history 401/403 makes denial sticky above the query observer and removes the
owner's private scoped data. A disabled observer can recreate an empty query
slot, but cannot retain values. Other current-read errors hide stale values until
a successful reload. Typed API validation refuses cross-scope responses and
malformed historical values. The existing capture query helpers are generalised
inside the feature's query boundary without broad event invalidation.

## Local verification on 5 October 2026

Twenty-one new client checks cover generated metadata/groups, all value types,
event/station inheritance, invalid layers, archive, empty and unavailable history,
RESET wording, bounded pagination, key/scope isolation, owner remounts, authority
loss, private-data removal and malformed responses. The accepted focused run
passes 74 checks with existing capture/schedule UI checks. The final complete
client coverage run passes 526 checks across 60 files in 15.45 seconds.

Early failing runs are excluded: the harness initially supplies a station-only
inheritance row as an event response, uses an unavailable assertion matcher, and
expects cache removal to prevent a disabled observer's empty slot. These fixtures
and assertions are corrected without weakening API validation or privacy checks.
Testing Library does not support Playwright's `exact` option; the test types are
corrected. Lint also identifies query-key access outside the query boundary; the
cache operation moves into feature queries without an exemption.

The final client package measures 2,736/3,798 covered executable lines (72.03%)
and 1,999/3,095 branches (64.58%), passing the unchanged coverage ratchet against
the previous main commit. Existing server/shared reports are reusable because
their source is unchanged: server 2,308 passes/four existing skips and shared 173
passes. This package measurement does not claim the separate G5 model target.

Workspace types, lint, generated-settings consistency, hardcoding and architecture
checks pass. Architecture checks 1,104 modules and 4,990 dependencies. The final
32-page static export and compiled phone/laptop startup/reload under CSP pass;
malformed runtime configuration still refuses startup. Source/test secret scans
pass. Preserved P08 pricing fingerprints and historical P05 pricing are checked
again before publication.

Four serial headless browser journeys use only
spoh2027_rehearsal_shift_e2e_test. Phone/laptop event and station reads validate
the real typed API, all 14/three keys, private no-store history, cursor ownership,
hard reload, unchanged values, normal sign-out and accessibility. All four pass
in 17.0 seconds, with no catalogue writes, 429/5xx, page errors or CSP violations.
No real local spoh2027 database is reset, seeded or migrated.

The fresh serial visual suite passes all 76 checks in 3.2 minutes after restarting
the frozen API. Six new phone/laptop event-values, station-values and history
images and the two changed collapsed settings-page images are inspected. Existing
capture and roster baselines are unchanged. A read-only database comparison after
the full run confirms all nine frozen membership rows and eight person last-seen
markers are unchanged. History images use typed read-only fixtures; real private
reads are verified by the separate browser suite.

## Staging acceptance

The local slice is verified. D-11 CI, exact deployed image and a normal Cognito
Chrome catalogue/history journey are pending; no staging acceptance is claimed
by this initial report.

## Remaining scope

Generated editing/validation/revert controls beyond the existing capture consumer,
broader operational scheduling, legacy runtime consumer migration and the full
phase criteria remain open. P10.8 remains in progress. The separately observed
intermittent immediate reload/session symptom remains unresolved. Production
creation/cutover and post-event programme closure retain their owner boundaries.
