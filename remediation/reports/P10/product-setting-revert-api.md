# Guarded product setting reverts — partial P10.8

An event configuration manager can restore a reviewed historical value of
`product.countsMode` or `product.visitorDataMode` through
`POST /api/v1/events/:eventId/admin/event-settings/revert`. The strict request names
an immutable history row, the current stored version, a written reason and a
stable UUID retry key. It accepts no arbitrary value, actor, source or other key.

Reverting appends a new REVERT history version and an attributed metadata audit;
it never edits an earlier history entry. Ordinary product changes and reverts
share the existing lifecycle, headline source, reviewed-version and visitor-data
guards. Both acquire Event FOR UPDATE before the current membership SHARE lock,
and recheck config.manage inside the transaction. Event/scope/key filters are
explicit on stored overrides and history lookups. A removed legacy override still
gets a version greater than its last history entry.

Restoring visitor collection to none purges VisitorRecord rows atomically with the
setting, history, audit and successful retry receipt, preserving registrations.
Turning collection on remains limited to pre-live phases. Historical footfall
headlines must still name a current counting station of this event. Invalid legacy
JSON cannot become a write. Foreign, other-key, station and missing targets return
404 without forwarding their contents.

The no-store replay receipt contains only new/target history identifiers, the key
and reviewed version. Successful retries recheck current authority and reconstruct
the response from current rows, including any later setting change. Reusing a
completed key for another target/key/reviewed version is rejected. The receipt is
settled inside the effect transaction before the response bookkeeping wrapper;
failed transactions release their unsuccessful reservation.

## Verification on 4 October 2026

- All 23 new revert database checks and 69 affected history/product/visitor/route
  checks pass serially on guarded spoh2027_test. They verify append-only versions,
  attributed audits, bounded receipts, replay after a later change, stale and
  concurrent reviews, actual purge with registrations preserved, and rollback of
  every effect under a real PostgreSQL audit failure trigger.
- Privacy phase guards, missing/non-counting/foreign headline stations, unavailable
  historical JSON, target isolation, legacy RESET monotonicity, ordinary-write
  authority and current replay authority are covered. Real Event lock waits verify
  committed demotion and phase changes in the application transaction. The test
  reserves its key before holding Event, avoiding an earlier reservation foreign
  key wait. HTTP attribution, rejection and receipt behaviour remain covered.
- The synthetic frozen-clock test fixture uses an organisation-scoped admin limit
  of 500 for this file. Production rate limits are unchanged. The non-counting
  station assertion uses the existing 422 domain response.
- All 1,356 full integration checks pass across 94 files with four existing skips.
  The run is serial on spoh2027_test; no build or Prisma generation overlapped it.
- All 92 shared checks (including three new revert contracts) and 562 server units
  pass. Server/client types, shared/server builds, root lint, architecture (995
  modules, 4,362 dependencies), generated settings and hardcoding checks pass.
  Source, shared, test and evidence scans find no leaks. The synthetic contract
  UUID uses an obvious repeated-digit value without a scanner exception.

CI [37144887297](https://github.com/aadk979/SPOH_2027/actions/runs/37144887297)
and deployment
[37145271865](https://github.com/aadk979/SPOH_2027/actions/runs/37145271865)
succeeded for tracker `4b9993fdcf5b0d1989f7f71f3fcb0491fb0ef07f`
(source `7f32c69`). CloudFormation is UPDATE_COMPLETE. Actual ECS revision 106
uses that exact image, with desired/running 1, one completed deployment and zero
failed tasks. Production remains unchanged. A populated staging revert will be
verified through the forthcoming UI consumer, avoiding an extra synthetic write
sequence here.

This slice adds no schema or migration. The corresponding history/revert UI and
full generated event/station controls remain open; it does not close P10.8 or P10.
