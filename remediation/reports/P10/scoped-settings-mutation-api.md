# Scoped operational settings set/reset — partial P10.8

POST /api/v1/events/:eventId/admin/settings/catalogue changes one generated
operational setting at explicit event scope or at an owned station. The strict
request carries set/reset, a permitted key, the selected stored version, a bounded
reason and a retry UUID. Set values use the generated registered schema and its
normalisation. Reset accepts no value. The selection remains the read catalogue's
14 event keys and three station keys.

Product counts, visitor privacy, attendance security, platform-only settings and
the legacy event-name adapter retain their existing specialised producers. The
request cannot supply actor, source, event ID or arbitrary JSON. All route
successes and authentication, authority, validation and conflict responses are
no-store.

The writer locks Event first, then the exact current active membership, the
selected owned station and the retry reservation. Current config.manage authority
is checked after lock waits. New changes to an archived event are refused. The
30-second ReadCommitted transaction reuses the existing registered setting
writer/reset logic. Setting, append-only history, attributed audit, commit-only
cache notification and identifier-only retry receipt succeed or roll back
together. Existing privacy, counts-mode, attendance-root and phase guards remain.

An inherited selection is reviewed at stored version zero. Setting creates an
override; reset removes only the selected override and appends a higher history
version. A later set advances beyond the reset history. An inherited first write
records the actual resolved value before the write, including an event value
inherited by a station. Malformed stored JSON stays internal to historical
storage and is replaced by a bounded marker in the operational audit; it cannot
be copied into a validated response or retry receipt.

The response contains the applied change ID/key/operation/version, reviewed
version and a fresh complete scoped read. The receipt stores only the history ID,
key, target and reviewed version. Replay takes current Event/membership authority
locks and rebuilds current values. Owned immutable history binds the original
actor, target, operation, normalised reason and value. A different intent using
the same UUID is refused; a successful historical retry can be read after archive
without performing another mutation.

## Local verification on 5 October 2026

Seven new shared contract cases cover strict targets, key/scope restrictions,
registered value bounds and normalisation, reset without value, reviewed/applied
versions and private-field rejection. All 112 shared checks pass. All 587 server
and 426 client unit checks pass; every workspace type check passes.

The 33 new real-Postgres cases cover owned event/station writes, inherited values,
monotonic set/reset history, current replay after later changes, normalised retry
intent, foreign scope/actor refusal, concurrent edits and duplicate requests,
malformed stored values, all supported event phases and archived read-only
behaviour. Real PostgreSQL audit/receipt failures prove transaction rollback.
Event/member lock waits verify post-wait authority, phase, station presence,
versions and clock. Count capture admission observes the station pause and reset;
safety capture remains independent. The route inventory includes the new producer.

The fresh focused run passes all 109 checks in five files (55.38 seconds). An
earlier run crossed an approximately nine-hour runtime interruption and ended
with scheduler/reset failures; it is excluded from accepted verification. Docker
restart reproduced the previously documented stale inference socket. Verified
Docker processes were stopped, only docker-desktop WSL was terminated, and the
two runtime directories were reversibly quarantined with suffix
recovery-20261005-1030. The original sole Postgres container is healthy on
localhost:5435 with its original v1_spoh-pgdata volume. No database data, container,
image, volume or settings were deleted during recovery.

The full serial database suite passes 1,501 checks across 100 files, with the four
existing skips (492.26 seconds). Extracting the unchanged receipt comparison into
a helper satisfies the complexity rule; the subsequent final focused run passes
all 109 checks (36.81 seconds), and lint passes. Architecture verifies 1,037
modules and 4,574 dependencies without violations. Generated settings, hardcoding
and diff whitespace checks pass. Source, shared contracts, integration fixtures
and reports pass redacted secret scans; full history covers 626 commits without
leaks. The three preserved P08 pricing fingerprints and historical P05 pricing
remain unchanged.

The broad root formatting command also scans ignored local evidence and reports
the owner's byte-preserved P08 pricing/cost.md. Maintained files are checked with
local evidence and that unchanged report excluded; no preserved artifact is
reformatted. The final server build and 32-page static export pass. Installed
headless Chrome verifies phone/laptop static load and reload under the actual
server CSP with no evaluation violation or application error; malformed runtime
configuration still refuses startup. No client UI or visual baseline is changed.
Pipeline/staging checks are pending. The real local spoh2027 database has not been
reset, seeded or migrated; database fixtures use spoh2027_test only. No schema or
migration is added.

Generated edit/history/revert UI, the operational schedule producer, remaining
legacy AppSetting consumers and broad P10 exit criteria remain open. This API
foundation does not complete P10.8 or P10.
