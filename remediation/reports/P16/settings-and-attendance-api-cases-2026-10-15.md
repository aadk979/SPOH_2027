# P16 attendance and product settings API cases — 15 October 2026

P16.10 remains in progress. This report records the current attendance and product settings
batch, alongside the preserved [event-day cases](event-day-api-cases-2026-10-15.md).
It does not accept all routes, lifecycle states, station scopes, quotas, browser journeys
or any P16 step.

## Runtime and source

Staging still runs `00a114d40c7dc426845f964bdef5b5148de0379e`, with
[all five exact CI jobs](https://github.com/aadk979/SPOH_2027/actions/runs/38610494257)
and [all three release jobs, including Smoke](https://github.com/aadk979/SPOH_2027/actions/runs/38616256967)
accepted. A fresh paced attestation matched all 73 deployed policies, schema and task
policy mappings. Each accepted HTTP result must carry that exact deployment identity.

These additions change tests, reviewed synthetic corpora and documentation. The private
source check admits only the explicitly reviewed test/corpus/document paths and verifies
that all application, contracts, policies, infrastructure, dependencies and configuration
remain at the accepted deployed source. Unknown paths fail closed. Runtime image/task,
exact CI, release and policy checks remain in force. New tests require their own complete
local gate and exact-SHA CI; an unchanged application does not need another deployment
to execute additional cases.

## Controlled scope

The campaign reuses the existing seven synthetic identities and original DRAFT event
fixtures. Normal authentication and deliberate renewal use the established provider
credentials and MFA. Renewal proves that the replaced SID is refused. No invitation,
password reset, repeated MFA enrollment, provider shortcut, staging host SQL or raw
secret read was used.

The successful-setting cases require a never-LIVE DRAFT, original visitor mode `none`,
no declared visitor fields, no active lost-person alerts and complete empty capture
audit windows from before fixture creation. These controls protect the existing synthetic
fixtures. Empty privacy-setting round trips do not accept visitor-data purging or retention
maintenance. Existing organisation session lifetime and receipt retention are unchanged.

## Case evidence

- The shared body corpora contain 72 invalid attendance bindings and 318 invalid product
  bindings, plus 32 and 56 schema-accepted bindings respectively. Both URL forms are
  explicit. Schema acceptance alone is not treated as an HTTP success oracle.
- Forty read/access cases passed on staging: all six primary roles and a real other-event
  member, scoped and legacy alias reads, missing, actually expired and forged access.
  Own-event and alias `/me` controls establish the actual actor/event selection. The eight
  expected permission-denial audits match actor, action, route and request ID; business
  state is preserved. Scoped nonmembership is 404 `NOT_FOUND`; the existing alias
  contract is 403 `NOT_PROVISIONED`.
- Four real attendance-root isolation cases passed: scoped and alias requests refuse a
  same-event active non-admin membership with 400 and an actual foreign-event active
  admin membership with 404. The memberships were read through the authenticated API.
  Current settings, versions and relevant business audits remain unchanged.

All 780 invalid-body bindings passed on staging: 144 attendance and 636 product cases.
Every refusal matched its validation oracle, preserved typed values and current versions,
and left the complete relevant business audit window unchanged. The source-bound aggregate
verified every distinct family, URL form and corpus binding, plus all native batch exits.

All 176 schema-accepted semantic bindings and both owned active-admin root controls passed.
They cover actual missing-resource and CIDR business refusals, stale CAS conflicts,
normalization and accepted bounds, typed stored readbacks, read-only network tests, exact
stale retries and restoration of the original values. Exactly 220 attributed setting-change
audits match those writes, and final versions match the exact per-key write counts.
Together with the 40 access and four real-resource refusals, these are 1,002 distinct
staging cases. Complete audit evidence and advanced versions remain preserved.

Successful CAS writes restore the original **value** through another valid write. They
retain advanced versions, history and attributed audits; restoration is not described as
unchanged state. A stale exact retry must conflict without a second effect. Read-only
network tests must preserve both settings domains. CI additionally checks database
history, receipts, business data and audits directly; staging journals use authenticated
typed readbacks and complete bounded relevant audit windows.

## Local verification and delivery

The original two published modules passed 958 tests against only `spoh2027_test`.
After adding the read/access cases and reason-normalization assertion, a focused run passed
216 tests, comprising 176 semantic bindings and 40 new access cases. The six additional
attendance-root round-trip/isolation cases then passed. Other cases excluded by these
focused filters are not additional historical skips. Final source contains 1,004 tests
across these two modules; the complete gate must establish their combined result.

Affected type and lint checks passed. An initial focused command used the wrong test root
and found no tests; its exit-one observation is retained separately from the corrected
server-root invocation that executed and passed all six cases. A private audit acceptor
initially omitted the normal empty `policies` array from its expected denial payload.
Its failure and original source are preserved; a strict corrected acceptor verified the
same complete recorded audit evidence, without repeating business requests. Neither
observation was an application defect or an accepted test pass.

The owned-root verifier initially expected clear setting values in security-setting audits.
Both changes, stale retries and restorations had already completed correctly. A strict
offline reconciliation verified all recorded typed outcomes and all four exact redacted
audit payloads, including actor, scope and versions. The failed native result and original
twelve frozen sources are preserved. No HTTP request or business write was repeated.
CI assertions now explicitly require redacted attendance audit values alongside the actual
stored values in setting history. The remaining semantic cases use the corrected strict oracle.

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

The early whole-batch staged secret scan found no leaks. D-11 delivery retains final
whole-batch staged secret/whitespace/stat review immediately before one direct-main commit
and one push. Exact-SHA CI acceptance is recorded separately.

## Remaining campaign

Finish the remaining API families and per-field, role, station/person/organisation,
foreign-object, lifecycle, pagination, quota, conflict and receipt obligations. Continue
with full/browser regression, deferred acceptance, load, drills and restore in the
documented order. The owner waived the continuous 24-hour soak; P16.9 is skipped,
without a successful-soak claim. Other owner gates remain unchanged, including actual
alarm receipt, independent assurance, IA/copy/runbook and unfamiliar-person reviews,
real-person recovery, production creation/cutover and go/no-go. No blanket ASVS Level 2,
zero operating High, full readiness or production acceptance is claimed.
