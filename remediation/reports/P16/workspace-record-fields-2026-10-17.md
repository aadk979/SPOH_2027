# P16 workspace record query fields

P16.10 remains in progress. The current privacy repair at `a940cb7e` passed all
five exact-SHA CI jobs (38987001422) and staging release 38989724604, including
Smoke. Selected operating checks accepted 195 workspace cases and 57 entity
supplement cases in separate batches. All their error responses had no-store;
existing event identifiers and operating counters were unchanged. These counts
do not establish complete route coverage.

This test batch freezes 756 malformed query descriptors and 16 valid shape
controls for the 16 workspace record kinds. The fixture covers declared filters
and common cursor/limit fields, including missing, repeated, malformed, unknown
and boundary values where applicable. A small typed helper hydrates synthetic
fixture identifiers and time. It does not regenerate constraints from the live
schema, so weakened validation cannot silently rewrite the expected cases.

The first private HTTP preview failed with an actual 429 after exhausting the
normal request quota. That failure is retained. The corrected preview divides
the corpus into 32 tests, one per record kind and route form, each using its own
fixture and ordinary quota bucket. All 32 passed against the sole approved local
test database. Rate limits and application source were unchanged.

The maintained tests require one successful shape control before each kind's
malformed requests. They assert exact 400/VALIDATION_FAILED, private no-store,
shared response contracts, and unchanged business records and audits. The
nonempty footfall control checks its room-entry total independently. The corpus
runs through both scoped and compatibility routes: 1,512 malformed requests and
32 successful controls. Descriptor counts and per-kind counts are pinned.

All 38 affected tests across three files, focused lint and assembled server/test
types passed. The first typed JSON import exposed a descriptor-shape conversion
error; strict independent transport-descriptor parsing corrected it. The original
type failure is retained. Frozen descriptor and hydrated-case equality passed.

The fresh unchanged 29-step Node 24/npm gate exited zero, with no resumed or
inherited steps. It passed 8,900 tests: server 6,995, client 1,220, shared 348,
policies 158 and infrastructure 179, plus two retained historical server skips.
This batch adds 32 runner tests. Complete coverage was archived privately.

Coverage was server 96.73% lines / 88.52% branches,
client 80.23% / 71.80%, and shared 94.38% / 87.40%.
All unchanged floors, including server 96.67% lines, passed. Image/build/CSP,
architecture, hardcoding, dependency and secret checks passed. Exact-SHA CI
acceptance remains separate and was pending at commit preparation.

This tests-only batch was committed as cd829ff9 and passed all five exact-SHA
CI jobs (39015969932). Runtime build inputs were unchanged, so the staging proof
reused the accepted a940cb7e image with explicit test/application provenance.
No additional deployment was made for the tests-only change.

The expanded scoped corpus passed all 756 malformed queries and 16 valid
controls in four bounded chunks. There were 904 selected GET requests,
13 additional audit diagnostics and two session reconciliation GETs.
The exact recurring maintenance audit deltas were fully paginated and reconciled;
all historical audit rows were identical and no actual alert or visitor purge audit occurred.
Other record-kind summaries, operating counters and first-page IDs were unchanged;
complete paginated business-row equality is not claimed.

The original final-comparison failure, a controller interruption with unknown
native exit, and a later strict recovery timing failure remain preserved.
Saved successful requests were verified and continued without case replay.
The already issued session was admitted by read-only proof; the failed 938 ms
timing witness did not satisfy the unchanged 750 ms bound. Compatibility-route
staging, lifecycle positive caching, production and all-route acceptance remain
separate.

Docker's recurring stale-socket startup failure was recovered locally by preserving
the exact four runtime endpoints after the crashed processes exited. The existing
test container became healthy. Images, volumes and settings were retained; a
permanent vendor fix is not established.

Only P16.9's continuous soak is waived and recorded as skipped. Browser, deferred
acceptance, load, drills, restore, independent assurance, actual alarm receipt,
production/cutover and owner go decisions remain. The original seven-day cost
authorization, USD 100 ceiling and USD 50 alert are unchanged. The CDK advisory
exception remains through 31 October; zero advisories are not claimed.
