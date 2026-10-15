# P16 event-day API verification — 15 October 2026

P16.10 remains in progress. This batch adds shared CI bindings for event-day creation,
event-day edits and the legacy template-hour endpoint, plus their read routes. It does not
close a P16 step or establish all-route, all-state, station, quota, browser or go-live acceptance.

## Runtime and source

The controlled staging image is `00a114d40c7dc426845f964bdef5b5148de0379e`:
[all five exact CI jobs](https://github.com/aadk979/SPOH_2027/actions/runs/38610494257) and
[all three release jobs, including migrations, service move and Smoke](https://github.com/aadk979/SPOH_2027/actions/runs/38616256967)
succeeded. The healthy ARM64 task/image digest and all 73 deployed policy statements,
schema and name mappings match that source. Private route inventory reconciliation verifies
the same 423 served routes / 229 canonical routes; the sole global middleware addition is
the immutable deployment response identity.

The readiness repair was verified separately on that image: the four deployed observer files
match Git bytes, app and observer permissions match their selected resources, all 20 selected
alarms were OK, and six native HTTP checks carried the exact image identity. Post-update
scheduled observation recorded 436 invocations without an error and fresh actual task/backup
metrics; the three observer alarms recovered. Authenticated go-live readiness evaluated all
three cloud items as passed, with unchanged DRAFT lifecycle and standing and `no-store`.
Card batch, gift stock, published content, attendance and permission review still blocked LIVE.
These point-in-time observations do not accept human alarm receipt, restore or a 24-hour soak.

## Controlled cases

Existing confirmed synthetic identities and original fixtures were reused. A current-day
fixture was added through the real API because the original event day had become historical.
A real other-event template was added for object isolation; the other event's day already
existed. No staging host SQL, raw secret reads, repeat invite, password reset or MFA enrollment
was used. Only newly created empty QA days were removed; original fixture projections were
restored, while their audits and receipt history were retained.

- 218 invalid-body cases: 109 explicit field bindings across scoped routes and aliases.
  Every refusal had matching validation issues, unchanged business snapshots and unchanged
  relevant business audits. CI additionally checks the receipt table directly.
- 48 schema-accepted semantic cases: defaults, omission, trimming, Unicode, accepted bounds,
  typed stored readback, exact receipt replay and changed-intent conflict. Template-hour edits
  moved following shifts, preserved a controlled override and restored original projections.
- 142 DRAFT role/auth/object cases: all six primary roles plus a real other-event member,
  five methods/routes and both forms, missing/elapsed-expired/forged access, policy reasons,
  authority before body validation, actual foreign objects, absence and overlong identifiers.
  The sixteen intended business audit writes were verified and original business projections
  preserved. Scoped nonmembership is 404 `NOT_FOUND`; the retained legacy alias contract is
  403 `NOT_PROVISIONED`. Neither discloses policy/resource details to a nonmember.
- 26 receipt/domain boundary cases: six replays through the other URL form, sixteen
  actor/event/target reuse refusals and four schema-accepted equal/reversed-hour refusals.
  Correcting each failed hour request under its same UUID succeeded and replayed once, proving
  no orphan reservation remained. Both events' original business projections stayed unchanged;
  the twelve intended business audit writes were verified.

These are 434 distinct staging cases. The shared CI modules contain 439 tests: these bindings,
three consistency checks and two explicit following/overridden-shift round trips.

The source-bound case list separates these cases from earlier structure and nonmembership
campaigns. No totals are added to earlier releases as if they were one current full suite.
Public fixtures contain synthetic bindings only; provider/mail identities, credentials,
sessions and full request/response journals stay in ignored private evidence.

## Verification and delivery

The three shared corpora and CI modules were published after the live campaign closed.
All 439 tests passed against only `spoh2027_test`, with database suites serialized. Whole-repo
lint and type checks passed; a test-only union narrowing correction was rechecked before
the final published suite passed. No application behaviour or dependency changed.

The complete 29-step Node 24/npm gate exited zero at 2026-10-15 04:01:24 UTC, without
resumed or inherited steps. All eight frozen source hashes matched. The suites passed 7,046
tests: server 5,141, client 1,220, shared 348, policies 158 and infrastructure 179. The two
historical server skips remain. Server coverage is 96.70% lines /
88.33% branches; client is 80.23% / 71.80%; shared is
94.38% / 87.40%. All retained floors passed, including the unchanged 96.67% server
line floor. Lint, types, production-image verification, architecture/hardcoding, dependency
audit and secret history checks passed. Final coverage files and their hashes were archived
privately. This measurement precedes the synthetic receipt-example repair below and is retained as
historical proof.

The final staged secret scan then flagged five occurrences of a synthetic UUID used only
as a receipt example. Both CI and the staging harness replace it before every request.
The examples now use a plainly synthetic UUID; all 133 normalized body bindings remain
identical. No credential was present and no scanner rule, exclusion or assertion changed.
The original source, failed staged scan, complete gate and coverage archive were preserved.
All 439 tests passed again against only `spoh2027_test`, and the unchanged staged secret
scanner reported zero findings for the revised whole batch.

The first combined local attempt exited one after a 60-second setup timeout in the
22-test credential-boundary suite. It passed 6,123 server tests; 22 tests were excluded
by that failed setup, in addition to the two historical skips. It is not an accepted
full run. Windows recorded idle Modern Standby during the verification window. A fresh
read of only `spoh2027_test` succeeded in 32 ms, and all 22 affected tests then passed
with unchanged assertions and timeouts. A bounded execution request now keeps active
verification jobs awake without changing the power plan or requiring the display.
The failed result, source and logs are retained. Related visitor-field and permission
cases are included in the fresh whole-batch run; no passed steps are inherited.

The first 23-file recheck was stopped after an observed failure at the default
five-second budget in the nine-card PDF test. Its native exit is one and its logs
remain preserved. All 11 PDF tests passed unchanged in a focused run under coverage.
The multi-page test now uses the same 15-second font-processing budget already used
by neighbouring Unicode tests; every PDF assertion is unchanged. This adds one test
file to the fresh 24-file batch. The load-test latency targets and coverage floors
are unchanged, and no step from either failed full run is inherited.

The combined 29-step Node 24/npm gate exited zero at 2026-10-15T08:42:55.9704466Z, with no resumed or
inherited steps. All 24 frozen source files matched. It passed 8,547 tests: server 6,642,
client 1,220, shared 348, policies 158 and infrastructure 179, with the same two historical
server skips. Server coverage is 96.73% lines / 88.34% branches; client is
80.23% / 71.80%; shared is 94.38% / 87.40%. All unchanged floors passed, including
the 96.67% server line floor. Image/CSP verification, architecture/hardcoding, lint/types,
dependency audit and both secret scans passed. Final coverage and hashes were archived
privately. The bundled CDK advisory exception remains visible through 31 October.
This is local acceptance of the event-day, settings and visitor-field/permission batch;
exact-SHA CI and the unchanged deployed application's earlier acceptance remain separate evidence.

D-11 delivery requires final whole-batch staged secret and whitespace checks, the staged
change summary immediately before the direct-main commit, and one push. Exact-SHA CI and
any subsequent staging release are recorded separately; local passes alone do not accept them.

Local Docker startup was restored by preserving stale runtime IPC directories and checking
the backend, Linux engine and existing test database. Workload disks, volumes, images and
settings were preserved. Failed setup and interrupted/private-verifier attempts remain in
private evidence and are excluded from acceptance. The final case oracles preserve expected
security denial audits and the documented alias distinction; authorized other-event controls
use a normally created event with its default permission grants.

## Remaining order and owner gates

On 15 October the owner waived P16.9’s continuous 24-hour soak. It is recorded as
skipped, without execution or a successful-soak claim. Other acceptance and owner gates
remain required. This documentation amendment updates acceptance scope
and separately passed tracker validation; the six corpus/test files were unchanged.

Finish the remaining granular API routes, field/station/person scopes, lifecycle states,
quotas, pagination, conflicts and receipt cases in CI and staging. Then run full/browser
regression, deferred staging/owner acceptance, load, drills and timed
restore in the documented order. Independent assurance, IA/copy/runbook review, actual alarm
receipt, real-person recovery, production/go and programme closure remain gated. No ASVS
Level 2, zero operating High, full readiness or production acceptance is claimed.
