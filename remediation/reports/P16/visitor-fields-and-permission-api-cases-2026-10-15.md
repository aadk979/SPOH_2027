# P16 visitor fields and permissions API cases — 15 October 2026

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


This is partial P16.10 evidence. The campaign uses the seven existing synthetic staging
actors, normal provider authentication and real HTTP against application SHA
`00a114d40c7dc426845f964bdef5b5148de0379e`. Its previously accepted
[exact-SHA CI](https://github.com/aadk979/SPOH_2027/actions/runs/38610494257) and
[staging release](https://github.com/aadk979/SPOH_2027/actions/runs/38616256967) remain
separate from acceptance of these new tests. No application or dependency bytes changed.
Private source bindings, native exits, raw HTTP and complete relevant audit windows are
retained under the ignored root `.local/` directory.

## Completed staging checks

All 402 invalid-body bindings passed: 201 explicit schema/case bindings through each
event-scoped and legacy alias form. Each response matched the precise validation issues.
Typed visitor-field, permission and review state, versions and the complete relevant
business audit window remained unchanged after each refusal. The corpus covers five
visitor-field and permission request variants; it also records 55 schema-accepted
semantic bindings whose business outcomes remain pending.

All 80 read/access cases passed across four canonical methods, both URL forms, the
six event roles and the actual foreign-event member. Missing, actually expired and
forged authentication were exercised separately. Exact denial payloads and all 24
expected policy-denial audits were verified; membership refusals did not create false
policy-denial rows. Read controls preserved grants, review state and visitor fields.
The permissions simulation POST was a read-only probe.

An idle Modern Standby interruption left the first invalid-body batch without a native
terminal status. Its original timeout and journal remain preserved. Strict reconciliation
accepted the 15 already-observed validation refusals, verified the missing read controls
and complete audit window, and continued with only the 387 unrun cases. No invalid
request or business write was replayed. All resumed batches exited zero. The sole empty
QA field used by those checks was retired, with its metadata and both attributed lifecycle
audits preserved. Visitor capture remained disabled and no visitor personal values were
created. A temporary execution request prevents idle sleep only while finite verification
jobs run; it changes no power plan.

All 14 actual foreign-field cases passed on staging through both URL forms. The legitimate
administrator positively read the other event and its real field. Each refusal preserved
both events' typed fields and the original grants/review state. Exactly eight policy-denial
audits and two attributed field lifecycle audits matched. The new empty field was retired;
its metadata and audits remain, alongside the earlier retired validation field. These checks
bring this partial visitor-field/permission family to 496 distinct real staging cases.
The 55 schema-accepted semantic bindings remain pending.

The foreign-field campaign must use an actual field in the other event, positive reads
from its legitimate administrator and both URL forms for all seven actors. It must check
every refusal against unchanged fields and permissions, verify exact denial audits and
retire only its newly created empty QA field while preserving metadata and audits.

## Published CI cases and verification

The published body/access module contains 483 tests: 402 invalid bindings, 80 access
cases and one corpus-integrity case. The foreign-field module adds 14 actual-object
isolation cases. Matched private previews passed all 497 against only `spoh2027_test`,
with strict type and lint checks. Publication preserves the prepared assertions and
literal corpus bindings; comments and import locations are the only source presentation
differences. The fresh whole-batch gate must verify the published files.

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

The earlier 19-file full-gate attempt failed a 60-second setup hook in the credential
boundary suite during the idle-standby window. Its result remains a failure. All 22
affected tests subsequently passed with unchanged assertions and timeout. These related
visitor-field and permission tests join the event-day and settings work in one 23-file
batch for a fresh complete gate, coverage archive, final whole-batch staged secret and
whitespace review, one direct-main commit/push and all five exact-SHA CI jobs. No passed
step is inherited from the failed run.

## Remaining obligations

The 55 schema-accepted semantic bindings and remaining role, lifecycle, receipt,
foreign-object, station/person/organisation, quota and conflict obligations remain open.
This report does not accept the whole API surface, browser regression, P16 or production.
Continue the documented API, full/browser, deferred acceptance, load, drills, restore and
handover order. The owner waived the continuous 24-hour soak; P16.9 is skipped without a
successful-soak claim. Actual owner alarm receipt, independent assurance, IA/copy/runbook
and unfamiliar-person reviews, real-person recovery and production/go approvals retain
their existing gates.
