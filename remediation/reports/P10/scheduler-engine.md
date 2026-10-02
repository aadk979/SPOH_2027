# P10.6 — Durable scheduler engine

P10.6 is in progress. P10.5 remains open: archive retention needs the durable engine before
it can be enabled. This is an internal prerequisite, not a completed lifecycle or scheduler gate.

## Claim and lease storage (2026-10-02)

- `claimDueActions` commits a short Read Committed transaction before any event/handler lock.
  The query claims at most five due actions with `FOR UPDATE SKIP LOCKED`, in due-time/id order.
- Only registered handler types are eligible. Existing archive reminders remain pending until their
  handler and worker composition are verified. The API still starts the previous interval jobs.
- Due time is inclusive; crash recovery requires a strictly expired five-minute lease. An injected
  clock controls both boundaries. Each claim increments the version to fence stale attempts,
  including two attempts using the same worker identity.
- Recovery of an exhausted final attempt returns an explicit `exhausted` token. Attempts stay
  within the existing database constraint; the future executor must dead-letter that token without
  running the handler again. No schema migration was needed.
- Seven real-Postgres checks passed on the dedicated localhost:5435 `spoh2027_test` database:
  due/future/unsupported/terminal selection, eight rounds of two concurrent workers, exact lease
  boundary and fencing, skip-lock behaviour under a held row lock, scoped ordered batches,
  empty-catalogue/worker-ID handling and exhausted crash recovery. An initial terminal-row fixture
  lacked the required completion timestamp; it was corrected before the successful run.
- Server typechecks, all 531 server unit tests, lint, architecture, hardcoding and server build
  passed. Changed-file formatting and `git diff --check` passed. No application boot, client,
  database schema or cloud resources changed in this slice.

Next: transactional handler execution, current-authority checks, completion and schedule-source
audit, rollback/retry/dead-letter handling, recurring work, metrics and worker boot composition.
P10.6's complete exit criteria have not passed.
