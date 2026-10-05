# Scoped operational history read — partial P10.8

GET /api/v1/events/:eventId/admin/settings/catalogue/history reads the existing
append-only history for one generated operational key at event scope or at an
owned station. Its strict query accepts only the reviewed target, key, bounded
page size and owned cursor. The selection remains the catalogue's 14 event keys
and three station keys. Product counts/privacy, private attendance settings,
platform settings and the legacy event-name adapter retain their specialised
interfaces.

The read locks Event first and then the exact current active membership before
checking config.manage. Station scope requires current event ownership. Cursor
and row queries bind event, scope, scope ID and key together. Creation-time/ID
keyset bounds retain equal-time rows without duplicates or offsets. The
ReadCommitted transaction has a 30-second bound, and the response clock is
evaluated after authority and station checks. Historical reads remain available
in every supported phase, including archived events. All successes and
authentication, authority, validation and missing-selection responses are
no-store.

Rows expose generated key, version, source, time, bounded reason and whether the
current person authored the change. Actor IDs and private scope metadata stay
internal. Each historical value is validated using its registered key schema;
invalid raw JSON is never forwarded. An invalid previous value becomes null,
while an invalid saved result is unavailable. Stored history is left untouched.

A RESET record describes removal of the selected override and may show its
validated previous value. It contains no after field. Today's inherited value
cannot establish the effective value at a historical reset, so the API does not
invent one. A normal set shows its validated before/after values. Strict shared
contracts enforce source/operation agreement, key/scope restrictions, unique
row IDs, exact collection count and a next cursor matching the last returned row.

The read does not write Setting, history, audit, retry receipts, lifecycle,
product values, visitor data or scheduled work. No database schema or migration
is added, and the client UI and visual baselines are unchanged.

## Local verification on 5 October 2026

The two initial HTTP cases fail with 404 before the route exists and pass after
implementation. Six new shared cases cover strict selections, registered value
bounds, reset semantics, source agreement and collection metadata. All 118
shared checks pass.

The 39 new real-Postgres cases cover owned event/station history, actual set/reset
records, all six sources, boolean/number/normalised-text/array values, malformed
historic JSON, bounded reasons and current-person attribution. Equal-time
pagination and an appended newer row preserve the next older result. Exact
event/key/scope/station ownership rejects foreign and missing cursors. Seventeen
malformed queries are refused with no-store.

Anonymous and non-manager requests are refused; stale role/status contexts and
membership/person/event mismatches cannot read history. All six event phases
are read without effects. Actual Event and membership lock waits verify rows,
station presence, cursor creation, phase, later clock and revoked authority after
waiting. Snapshot checks prove the reader creates no setting/audit/retry or
product/visitor/lifecycle/scheduler effects.

The expanded focused run passes all 171 checks across eight files, including
scoped reads/mutations, guarded product history/reverts, visitor privacy and the
route isolation inventory (49.43 seconds). An initial expanded run had one
fixture error using a retired Station field; it is excluded from accepted
verification. Correcting the fixture to use the owned station type resolves it.

Settings routes register directly on the existing authenticated flat admin
router through separate operational and product groups. This meets the file
and function size rules while preserving middleware, registration order and the
strict flat route inventory. Workspace type checks and lint pass.

The full serial database suite passes 1,540 checks across 101 files, with the
four existing skips (475.72 seconds). All 587 server and 426 client unit checks pass.
Architecture verifies 1,044 modules and 4,612 dependencies without violations.
Generated settings, hardcoding and diff whitespace checks pass. Maintained-file
formatting passes with ignored local evidence and the unchanged byte-preserved
P08 pricing/cost.md excluded. New source/tests and this report are formatted.
Redacted secret scans pass for source, shared contracts, integration fixtures,
P08/P10 reports and all 629 commits. All three preserved P08 pricing fingerprints
and historical P05 pricing remain unchanged. No real local spoh2027 reset, seed
or migration is requested; integration fixtures use spoh2027_test only.

The final shared/server build and 32-page static export pass. Installed headless
Chrome verifies phone/laptop startup and reload under the actual server CSP,
with no evaluation violation or application error; malformed runtime
configuration still refuses startup. Existing reviewed visual evidence is reused
because no client UI or baseline changes. The local preview API is restarted
from the rebuilt server after database verification finishes.

## Exact-image pipeline and staging verification

Source b6a22c1 and tracker image
ccf3921971487b0fb447a122653d3b1f369f03d4 are pushed under D-11.
[CI 37260469999](https://github.com/aadk979/SPOH_2027/actions/runs/37260469999)
and [deployment 37260940702](https://github.com/aadk979/SPOH_2027/actions/runs/37260940702)
succeed. CloudFormation is UPDATE_COMPLETE. ECS revision 121 runs the exact image
with one desired/running task, one completed rollout and zero failed tasks.

At 11:58 Singapore, installed Chrome 154 and normal Cognito Authorization Code
with PKCE verify actual cross-origin browser GETs. The prior legitimate USER set
and RESET are found across two one-row pages with no duplicate IDs. Attribution
and reasons match the original synthetic intent. The set shows its registered
before/after; reset describes removal and contains no invented after value.
Owned station history also reads successfully. Guarded keys, forged queries,
missing owned cursors/stations and anonymous requests are refused. Successes and
rejections are no-store. Private actor fields are absent.

Hard reload preserves history and current catalogue inheritance. Compatibility
settings, guarded product values/versions and READY phase remain unchanged.
Normal sign-out passes with zero application errors or CSP violations. The
[sanitised evidence](staging-scoped-settings-history-evidence-2026-10-05.json)
contains no credentials, actor/event/station IDs, cursor IDs, UUIDs, raw values or
reasons. Only read endpoints are requested; no new setting fixture, audit or
retry receipt is produced by the reader. Normal session receipts are
created/revoked. The complete local history scan also passes across 633 commits,
including the independent P08 observation commits awaiting the next batch push.

Generated event/station edit/history/revert controls, operational schedule
producers, remaining legacy consumers and broad P10 exit criteria
remain open. This bounded read does not complete P10.8 or P10.
