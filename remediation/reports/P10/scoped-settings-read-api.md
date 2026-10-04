# Scoped operational settings read — partial P10.8

GET /api/v1/events/:eventId/admin/settings/catalogue returns the registered
operational settings permitted at event scope, or at an explicitly selected
station in that event. It reports validated values, their inherited source and
source version, the selected scope's stored version, bounded invalid-layer
warnings, current event status and the evaluation time. Event reads contain 14
keys; station reads contain the three station-capable keys.

The shared contract derives its key selection from generated registry metadata
and validates each value against its registered schema. It requires each selected
key exactly once and rejects private fields, arbitrary JSON, irrelevant layers
and inconsistent selected versions. Product counts, visitor privacy, attendance
security, platform-only controls and the legacy event-name adapter retain their
existing specialised routes.

The use case takes the Event SHARE lock, rechecks the current active membership
under a membership SHARE lock, and verifies the selected station by exact
event/ID before reading values. The clock is sampled after these waits. The
ReadCommitted transaction has a 30-second bound. At most three bounded settings
queries load exact organisation/platform, event/event and event/station layers.
The existing pure resolver supplies precedence and registered defaults. Malformed
stored JSON is omitted rather than forwarded; its selected stored version remains
available for a subsequent reviewed change. A current manager can inspect archived
settings without changing lifecycle state. Success and route-level authentication,
authorization, validation and missing-station responses are no-store.

## Verification on 4 October 2026

- Nine new shared checks cover generated selection, strict scope queries, schema
  bounds, complete responses, selected versions, invalid warnings and exclusion of
  station layers from event reads. All 101 shared checks pass.
- All 29 new database checks verify defaults, inheritance, exact ownership,
  malformed JSON omission without stored-row changes, supported value types,
  anonymous/non-manager denial, current membership and post-lock reads. They
  include revocation while waiting for the membership lock and committed values,
  authority and station deletion after the Event lock wait. The focused run also
  verifies route inventory. The foreign-organisation fixture reuses its slug
  because the database reset intentionally preserves organisations; repeat runs
  pass without changing the reset policy.
- The full serial database rerun passes 1,385 checks across 95 files, with the
  four existing skips (484.04 seconds). Cross-instance/cache tests remain green.
- The server build, server/client types, 565 server units, lint, architecture,
  generated settings, hardcoding and source/test/report secret scans pass. Full
  Git-history scanning covers 602 commits without leaks. The inherited P08 pricing
  hashes and historical P05 files remain unchanged. No client source, schema,
  migration, timer, audit/write producer or generic setting write is introduced.

Full-suite, D-11 exact-image CI/deployment and normal-Cognito read evidence are
recorded after completion. The real local spoh2027 database is not reset, seeded
or migrated. All database fixture changes use the dedicated spoh2027_test database.

The catalogue resolves the scoped Setting store. It does not replace or claim to
represent remaining platform-wide legacy AppSetting consumers. Their migration,
complete generated edit/history/revert UI and general schedule management remain
open. This read foundation does not complete P10.8 or P10.
