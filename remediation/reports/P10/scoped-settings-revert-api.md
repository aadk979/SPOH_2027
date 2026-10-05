# Scoped operational history restore — partial P10.8

POST /api/v1/events/:eventId/admin/settings/catalogue/revert restores one owned
operational history record at explicit event or station scope. The strict request
contains generated key, owned history ID, reviewed selected stored version,
bounded reason and retry UUID. It accepts no value, operation, actor, source,
event ID or caller-authored provenance. The selection remains the catalogue's
14 event keys and three station keys; specialised product privacy/counts,
attendance security, platform settings and legacy adapters retain their guards.

The writer locks Event, then the exact current active membership and config.manage
authority, the owned station and retry reservation. Historical selection binds
event, scope, scope ID, key and ID together after waiting. Its saved result must
validate against the generated registered schema. A saved value appends a REVERT
through the existing setting writer. Restoring RESET uses the exact reset writer
and appends RESET, preserving the meaning of override removal. Both record the
selected immutable history ID/version in their attributed audit. Stored history
is never rewritten.

RESET uses current inheritance; it does not reconstruct an unknown historical
inherited value. Its response has no invented after field. An already inherited
scope has no override to remove and remains a reviewed-version conflict. All
new writes to archived events are refused. Existing setting bounds, phase,
attendance-root, privacy/counts producers and count/safety admission rules remain.

Setting, new history, audit, commit-only cache notification and identifier-only
receipt settle together in one 30-second ReadCommitted transaction. The response
contains validated applied history, selected-history provenance, reviewed version
and a fresh complete scoped read. It exposes current-person attribution rather
than actor IDs. Malformed historic results are unavailable and cannot be restored;
invalid previous/current JSON is omitted from responses and bounded in audit.

Receipts retain applied/selected history IDs, key, target and reviewed version
only. Retry reads lock current Event/membership authority and rebuild current
values. Exact selected ID/scope/key/review and normalised reason bind the original
intent through owned history, including its operation, applied source/value and
actor. Different intent using the same UUID is refused. A successful historical
retry after archive performs no new write when current authority still permits
the read. No schema or migration is added.

## Local verification on 5 October 2026

Two initial real HTTP event/station cases fail with the expected missing-route
404, then pass after implementation. Six new shared cases cover strict target,
key, reason/review and identifier constraints, private/forged-field refusal,
source/operation agreement and new attributed versions. All 124 shared checks pass.

The 53 new PostgreSQL cases exercise owned event/station restores, other-source
history without adopting its actor, registered fractional/text/array values,
normalisation and actual inherited before values. Reset history removes a
reviewed override with current inheritance and selected-history audit provenance.
Malformed/foreign/mixed event/scope/key/station records are refused or sanitised
without changing their original storage. Actual count admission observes a
restored station pause and removal; safety capture remains available.

Concurrent reviews produce one new change and one conflict; duplicate retry
copies settle once. Historical retries rebuild values after later edits/removal,
while changed history, key, target, review or reason is refused. Anonymous and
non-manager calls, guarded keys and forged request fields are rejected with
no-store. Current demotion/deactivation/ended membership blocks writes and reads.
Every supported writable phase is exercised, with archived fresh-write refusal
and permitted current-authority historical replay.

Real PostgreSQL audit and receipt failures roll back both saved-value and reset
restores. Actual Event/member waits verify fresh authority, phase, station,
selected version/history presence, current retry values and later clock. The
expanded focused run passes all 261 checks across 11 files (100.67 seconds),
including product history/reverts, visitor privacy, route isolation, the setting
store and scheduled-setting execution. An earlier run had an incorrect test
source enum and capture-admission arguments, and omitted intended files through
wrong patterns; it is excluded from accepted evidence. The corrected run uses
the confirmed paths and fixtures.

Workspace types and lint pass. Architecture verifies 1,052 modules and 4,670
dependencies without violations; generated settings and hardcoding checks pass.
Reset audit payload construction is extracted into a helper to satisfy the
function-size rule. The full serial suite passes 1,593 checks across 102 files,
with four existing skips (520.73 seconds); its machine-readable result confirms
all 53 new restore cases pass. All 587 server and 426 client unit checks pass. Maintained-file
formatting and new-file formatting pass with ignored local evidence and the
unchanged byte-preserved P08 pricing/cost.md excluded. Source, shared contracts,
integration fixtures and P08/P10 reports pass redacted secret scans; full history
passes across 634 commits. All three preserved P08 pricing fingerprints and
historical P05 pricing remain unchanged. Fixtures use spoh2027_test only;
the real local spoh2027 database is not reset, seeded or migrated.

The final shared/server build and 32-page static export pass. Installed headless
Chrome verifies phone/laptop startup and reload under the actual server CSP with
zero evaluation violations or application errors; malformed runtime configuration
still refuses startup. No client UI or visual baseline changes, so existing
reviewed visual evidence is reused. The preview API is restarted from the final
server build after database verification completes.

Generated event/station controls/history/revert UI, operational scheduling,
remaining legacy consumers and broad P10 criteria remain open. This bounded
restore producer does not complete P10.8 or P10.
