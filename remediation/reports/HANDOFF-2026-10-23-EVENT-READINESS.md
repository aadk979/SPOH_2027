# Current handoff — event readiness, 23 October 2026

Snapshot: 2026-10-22T18:32:36.822Z (Singapore date: 23 October). D-25 / ADR-012 remains the launch policy. Keep the owner go/no-go on **28 October 2026**. Read [AGENTS.md](../../AGENTS.md), [the plan](../../docs/EVENT_RELEASE_PLAN.md) and [the operator note](../../docs/EVENT_OPERATIONS.md).

## Candidate and actual release

Main/origin and staged application: `d0f107fbad1a69d5d0dff7f453d1f4a7c1d2b2d7`. Full [CI 39820926473](https://github.com/aadk979/SPOH_2027/actions/runs/39820926473) passed all five jobs, including isolated PostgreSQL 17, original fourteen summary-day regressions, ten report-day integration regressions and the new current-posting regression. **9,063 application tests passed; two historical skips**. All sixteen coverage-guard tests passed; existing floors/security checks remain unchanged.

[Staging 39826616693](https://github.com/aadk979/SPOH_2027/actions/runs/39826616693) passed all three jobs and smoke. Actual task revision 178: ARM64, 512 CPU units / 1024 MiB, healthy. Image: `sha256:257743f319a06fd782b480ec75612c4bb6156c044044354e07f07ed6fa746bf8`. Session signing stayed stable. Seven-day RDS backups, deletion protection and available restorable time were observed at 2026-10-22T18:05:57.028Z. Compatible actual C4 rollback and recovery remain backed by `.local/p16-event-staging-rollback-v2-native-20261022.exit.json` (actual 0); later fixes add no schema/signing/infrastructure change.

The complete original eleven-file summary-day repair remains byte-for-byte preserved. Subsequent fixes address the Vite dependency advisory, report/export day filtering, phone sign-out visibility and REHEARSAL choosing an old posting instead of the actually scheduled posting. See [report defect](P16/report-event-day-filter-2026-10-22.md) and [posting defect](P16/rehearsal-current-posting-2026-10-23.md).

## E1–E5 results

| Gate | Actual result and scope                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1   | PASS: exact-candidate full CI and PostgreSQL regressions; original repair retained; known event-blocking defects above fixed.                                                                                                                                                                                                                                |
| E2   | Core browser chain PASS: Chief phone/laptop views and CSV/XLSX downloads; Volunteer registration, offline/reconnect/replay, footfall and first stamp; IC footfall, second stamp, gift and replay. Both received/read actual in-app assignment notices. Manual code entry passed. Operator fallback note was desk-reviewed, not a human paper-backfill drill. |
| E3   | Targeted PASS: absent/expired auth 401, foreign event 404, role/station refusals 403, same-record replay and unchanged totals/stock on retry. Private GET/error cache headers observed. Unchanged auth/write/policy paths are bound to retained results; no exhaustive API acceptance claimed.                                                               |
| E4   | PASS for the moderate scenario below: ten minutes on existing staging size; independent practice/live totals reconciled after same-key replays.                                                                                                                                                                                                              |
| E5   | Staging/smoke/runtime, compatible rollback, basic backup configuration and in-app receipt verified. Operator note available. External push, phone/radio receipt and real-camera scanning remain unverified; do not claim those channels tested.                                                                                                              |

Chief evidence: `.local/p16-event-chief-browser-v6-20261022.json` (native 0): 12 views at 320/390/1440 pixels, actual UI downloads, selected-day API exports and missing-day 404 checks. These client/report paths are unchanged by the current-posting fix. Volunteer successful steps are retained in core V3 (native **1**, stopped at the later IC posting defect); the whole failed run is not relabeled passed. Core V5 (native 0) completes the IC steps on the fixed candidate. Distinct-day live report checks now show 22 October 1 registration/0 room entries versus 23 October 2/1 before IC/load; report and capture summaries agree with their Singapore day windows.

## Actual brief traffic result

Twelve logical capture staff each tap once per fifteen seconds at steady state; two dashboard clients poll at the actual three-second application interval; one alert reader polls every ten seconds. A moderate event operating assumption, not an owner-confirmed roster or capacity ceiling. Two original people implement the logical clients; this does not measure independent identity buckets, a whole staff roster, maximum capacity or an SLA. Sixty-second ramp, eight-minute steady portion and sixty-second cooldown; actual duration 600.003 seconds. Maximum overlapping HTTP requests: 5.

| Operation    | Responses | Actual RPS | p50 ms | p95 ms | p99 ms |
| ------------ | --------: | ---------: | -----: | -----: | -----: |
| registration |       214 |      0.357 |   85.0 |  291.2 |  433.5 |
| footfall     |       214 |      0.357 |   80.4 |  221.2 |  355.1 |
| dashboard    |       321 |      0.535 |  315.0 |  589.3 |  840.1 |
| alerts       |        54 |      0.090 |   44.3 |   93.2 |  221.3 |

Unique accepted traffic captures: 214 registrations and 214 room entries. Four same-key replay requests added zero captures; live-pool totals were unchanged. 803 workload requests plus 14 reconciliation/control requests; cumulative conservative approved-scope count **1951 / 2,300**, including retained failed/browser/provider attempts and explicit extra allowances. Cumulative capture accounting reserves nine earlier accepted card/core captures, remaining below 1,500. See `.local/p16-event-traffic-v5-20261023.json` and its actual native 0.

## Authority, limits and residuals

The owner explicitly approved retained fixture A's 22 October day, then its 23 October day within the **same combined** 1,500-capture/2,300-request bounds. No caps reset. Three day/assignment writes added 23 October; fixture stays REHEARSAL. One retained practice card was reused; live stock/captures were fenced. No new identities, event fixtures, MFA enrollment/reset, SQL, paid resources/resize, production changes or outward messages.

Latest budget observation 2026-10-22T17:06:36.002Z, fresh until 2026-10-22T21:06:36.002Z: lagged gross USD27.7928872654; full reserve USD75.26332; retained allocation USD0.22; cumulative cost-read allowance USD0.03. Envelope USD103.3062072654; planning headroom USD21.6937927346 under USD125; USD50 alert retained.

- On-phone stale feedback can say “Waiting to sync” after the live queue header says “All synced”. Use the queue header and confirmed server total; the observed server count was correct. Dismiss capture toasts when they cover lower controls.
- Headless tests used manual card codes. Physical camera/device/network behavior needs an event-device check if relied on. External push and phone/radio delivery have no new actual receipt; only in-app assignment-notice receipt was exercised.
- Search limit/prefix consistency remains a recorded noncritical residual; no broad search reacceptance is claimed. Use exact name/code or the appropriate direct roster/capture route where available.
- Owner confirmation of actual staff access, chosen communication/fallback channels and the 28 October go/no-go remains. Production creation/cutover is separate and was not performed.

## Continuation and preservation

Core V4 stopped before any IC capture because its event/home navigation assumption timed out. Its fresh session was left to expire normally before V5; no early renewal/forced expiry. The first CI-log extractor failed on ANSI formatting; its native 1/raw log remain, and V2 strips control characters for extraction only. Historical failures and missing native results remain failures/UNKNOWN. Root callback remains UNKNOWN; no Root retry.

Canonical evidence stems under `.local/`: current-posting-ci-v1, current-posting-ci-tests-v2, current-posting-staging-v1, current-posting-runtime-v1; distinct-day-reports-v1; core-browser-v5; traffic-v5; operator-note-review-v1 (all `p16-event-…-20261023`, corresponding native receipts actual 0). Source applicability V4 and final handoff manifest preserve original repair/new source hashes. Session/profile/raw business evidence stays private.

This handoff and pointer updates are local documentation changes, with preimages in `.local/p16-event-handoff-update-v1-20261023.json`. They are not a separate documentation commit/push/deployment. Do not recommit the eleven-file repair or rerun unchanged Docker failures. Older exhaustive API/compliance/drill/restore obligations remain nonblocking and unrun wherever unrun. Continue only concrete residual event work under the same protected boundaries.

## Software follow-up — 23 October

Actual follow-up at 2026-10-23T03:25:39.036Z; the owner deferred physical-phone checks. Application source and deployed candidate remain unchanged. Controller V2 completed with actual native exit 0, bound to the same deployed SHA above. Evidence: `.local/p16-event-camera-fallback-v2-20261023.json` and corresponding native receipt.

- Chrome's controlled 640 × 480 video feed exercised actual getUserMedia, ZXing decoding, the retained printed QR payload lookup and the Volunteer stamp endpoint. No manual code was typed. Lookup and duplicate-stamp responses were 200; stampAdded was false, the card stayed byte-for-byte equivalent, and the video track ended after leaving the screen. This verifies the software pipeline with simulated video; physical optics, phone permissions and real device/network behavior remain deferred.
- Paper registration preview would create three registrations; paper room-entry preview would create one record with quantity four. Both were REHEARSAL with commit false and no import batch. Two unknown category/station rows produced two issues and zero proposed records. Before/after totals stayed 216 practice registrations, 216 practice room entries, zero live registrations and zero live room entries. These are API dry runs, not a committed reconciliation or human paper drill.
- Actual deployed person-level push configuration returned enabled false and no public key. Background push is unavailable in the current deployment. Previously exercised in-app notice receipt remains applicable while the app is open. No push subscription or outward message was created. Choose the event's relied-on alert channel and verify its real receipt before relying on background/external delivery.

The first controller (V1) is preserved as actual native exit 1: Chief normal sign-in and the import page succeeded, but Playwright's click on the visually hidden radio input was intercepted by its styled label. It made no fallback preview or capture write. V2 reused that still-valid Chief token directly without renewal and used the original Volunteer's normal sign-in. It did not repeat the failed UI action, so full UI import preview is not claimed passed.

Conservative combined request accounting is now **2,230 / 2,300**: prior 1,951 + V1's 163 + V2's 116, including twelve un-routed-request allowance per controller. No new capture was appended; cumulative capture accounting remains **437 / 1,500**. Retained failures and unused bounds are not reset.

Fresh existing-runtime/budget/backup read completed 2026-10-23T03:14:29.190Z (native 0). Lagged gross USD28.4643396199 + full reserve USD75.26332 + retained allocations USD0.22 + cumulative cost-read allowance USD0.04 = envelope USD103.9876596199, headroom USD21.0123403801 under USD125. Cost observation freshness ends 2026-10-23T07:14:17.446Z. Existing task 178 was healthy; RDS was available with seven-day retention and deletion protection. No resource or production change was made. Evidence: `.local/p16-event-cloud-preflight-v4-20261023.json`.

Verdict remains conditional event readiness: source/CI, core software flows, targeted correctness, moderate traffic and staging/rollback have evidence. Physical event-phone scan/permissions/network, actual staff access, human fallback rehearsal, chosen communication channel/receipt and the 28 October owner decision remain. No additional exhaustive campaign is required by D-25/ADR-012.
