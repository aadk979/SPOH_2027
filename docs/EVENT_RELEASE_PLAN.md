# Event-focused production readiness — current owner-approved plan

Effective 22 October 2026. Decision D-25; [ADR-012](adr/ADR-012-event-focused-release.md).

The owner clarified that this app supports a short open house, 6–9 January 2027, and does not need an industry-compliance, SLA or disaster-durability certification campaign. The owner accepted the practical release plan and requested updated local documents and a continuation prompt. This replaces the exhaustive launch campaign; it does not claim missing tests passed.

## Authority and outcome

For this event's launch gate, this plan supersedes conflicting portions of ADR-009 §2, ADR-010/011 delivery sequencing, P16 verification/deferred lists, P12.8 criteria references, formal assurance sign-offs and older local prompts/checkpoints. Other product rules, code safeguards, financial limits and action permissions remain. Keep 28 October 2026 as the owner go/no-go date unless changed by the owner.

“Ready for this event” means E1–E5 have actual supporting results for the release candidate, with no unresolved defect that blocks a required event flow, compromises access/privacy, duplicates or loses accepted captures, or produces incorrect operational totals. Small noncritical issues can be recorded with concrete workarounds and impact; severity follows actual effect, not checklist count. Creation/cutover and “live” are separate operations requiring existing authority. Event readiness does not claim blanket compliance, contractual SLA, completed long-term programme work or successful unrun tests.

## The five release gates

| Gate                                       | Required evidence                                                                                                                                                                                                                                                                                                                                                       | Current handoff state                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 — Correct candidate and green CI        | Fix known event-critical defects; regression tests; full exact-candidate CI including real PostgreSQL integration, unchanged coverage floors, lint/types/build/policies/architecture/secret/dependency checks.                                                                                                                                                          | OPEN: eleven-file summary-day repair has local unit/static evidence; its14 new integration cases and exact-candidate CI are unrun. Triage search limit/prefix consistency for actual event impact.   |
| E2 — Core browser journeys                 | Actual staged browser checks for relevant staff roles on phone-sized/laptop layouts: normal sign-in/sign-out; registration; footfall; card/stamp/gift redemption; alerts/acknowledgements where used; date-filtered summaries/reports/exports. Check required setup/day/station context. One offline queue → reconnect without duplicates and a usable manual fallback. | OPEN: reuse applicable previous evidence; changed flows need candidate verification. No blanket browser completion claimed.                                                                          |
| E3 — Essential access and data correctness | Representative used-role refusals/successes; cross-event/station isolation; absent/expired auth; retry/idempotency/stock/count correctness; private data not cached/exposed. Existing automated policies/regressions plus targeted staged core checks.                                                                                                                  | OPEN: reuse unchanged evidence after source review. No all-route × all-role × all-field launch prerequisite.                                                                                         |
| E4 — Brief realistic traffic check         | Bounded actual capture/dashboard/alert mix on the intended event configuration. Record expected simultaneous staff, ramp, duration, achieved rate, latency/errors and practical user impact. A10–15minute run is a planning default, not a measured result or availability promise.                                                                                     | NOT RUN under this gate. Record a realistic concurrency assumption from available staffing data; no fixed660real-account/100RPS prerequisite. Do not resize/create accounts to satisfy the old plan. |
| E5 — Operable release and rollback         | One exact-CI-bound staging deployment/smoke and one compatible staging rollback rehearsal; short deployment/rollback/manual-fallback note an operator can follow; confirm existing basic backup/export configuration. Any alert channel relied on during the event needs one actual receipt check.                                                                      | OPEN: candidate not deployed. No new rollback, backup/export or current delivery observation claimed.                                                                                                |

E2/E3 preparation and applicable checks can proceed together once the relevant candidate is available; they do not wait for every API ledger obligation. E4 runs after the core flows it exercises work. E5 preparation can happen in parallel; deployment/rollback execution needs successful exact-SHA CI and a permitted bounded scope. Repeat checks only for changes, failures or unresolved concerns.

## No longer launch blockers

- All5,043 remaining API field obligations, every229-route combination or every historical phase/deferred-acceptance item. Preserve them as regression/backlog evidence, not the launch denominator.
- Formal ASVS conformance, independent full-baseline certification, exhaustive unfamiliar-person/device-fleet review or named UX/copy sign-offs. Concrete security defects and a usable operator note still matter.
- A660-person real identity/invitation load cohort, the associated at-least14UTC-day invite schedule, and the old fixed100RPS/20capture/20dashboard/60alerts and2×1vCPU/2GiB+RDSsmall prescription. Real staff still need legitimate working access; provider limits and approval boundaries remain.
- Six infrastructure resilience drills, both timed PITR/logical restores, RPO/RTO targets or a durability/SLA assurance programme. Retain basic backup/export protection and practical rollback/fallback; do not disable existing protection.
- A continuous24-hour soak (already waived15October).
- A full local Whole29 before pushing a coherent candidate when Docker is unavailable. Full online exact-SHA CI remains mandatory before staging.

These are owner-deferred/nonblocking for this event, not successful tests. Historical tracker steps, failures, partials and native-null outcomes keep their actual states. Event readiness does not automatically close P12/P16/G5 or the whole remediation programme.

## Fast path: CI supplies PostgreSQL

`.github/workflows/ci.yml` already supplies PostgreSQL17 in a job-isolated `spoh2027_test` service and runs server unit/integration coverage. Local Docker failure is a workstation issue, not an indefinite release prerequisite.

1. Verify the exact frozen eleven-file repair, its regressions and accepted focused local evidence. Review this explicit owner-authorized document delta; preserve candidate blobs. Run newly affected cheap checks; avoid unchanged-suite/report repetition.
2. Prepare one coherent direct-main commit/push containing the complete candidate and intended reviewed documentation. No branch/PR, partial source commit or omitted tests. This CI-first exception replaces “local integration + local Whole29 must pass before commit/push”. Pushing source is not acceptance or deployment permission.
3. Watch all exact-SHA CI jobs. CI must actually run the new14 integration cases and existing affected regressions. Failed/unknown CI blocks deployment; fix forward with appropriate regression tests and required CI. Preserve failures.
4. After exact-SHA CI succeeds, check current cloud budget/standing and prepare the smallest eligible staging deployment/core-journey scope. Existing staging/identity permissions still apply; stale observations and this document are not unlimited cloud authority.
5. Complete E2–E5, report actual results/material residuals and present event go/no-go. Do not substitute compliance-matrix closure or repeated ledger bookkeeping for these tests.

CI's localhost5432/spoh2027_test is isolated. Local tests remain localhost5435/spoh2027_test with SPOH_SKIP_DOTENV=1. Never point test setup/truncation at dev/staging/production. Existing CI/coverage/auth/lifecycle safeguards remain.

If an in-app READY/LIVE check still demands an optional old assurance artifact, inspect/report that runtime dependency. A documentation amendment does not bypass server checks; any necessary behavior change needs a narrow reviewed fix and regression test.

## Protected boundaries

- Correct separate registration/footfall/card units, event-day/timezone behavior, stock/retries and applicable privacy rules.
- Auth, event/station boundaries and identity ownership. Original seven profiles/five fixtures remain available; no new identities/invites/resets/MFA or fixture/lifecycle mutations beyond explicit authority.
- If existing data is actually migrated, counts/totals/ownership must survive. Dropping recovery certification does not authorize data corruption or silent omissions.
- USD125 ceiling, fullUSD75.26332 reserve, USD0.22 allocations, USD50 alert. No implied paid resources, resize, quota changes or real source SQL.
- Production/cutover and outward messages retain explicit authority. Never invent human evidence or send notifications to people merely because this plan mentions delivery.

## Reporting

Use a compact E1–E5 result table, defects and next executable action. Record actual native outcomes, exact source/deployment bindings and material limits. Historical ledger1,029accepted/5,043pending,487axes,1/229whole routes is an evidence inventory, not the release score.

Read [the current handoff](../remediation/reports/HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) and [continuation prompt](../remediation/reports/TAKEOVER-PROMPT-2026-10-22.md). This documentation revision ran no application/database/browser/load/cloud/production test.
