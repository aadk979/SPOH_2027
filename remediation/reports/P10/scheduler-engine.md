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

## Transactional execution (2026-10-02)

- Module registration requires a payload schema and a current-authority callback. The executor
  loads current stored payload and creator attribution; validation and authority run inside its
  transaction. The registry cannot register the same type twice.
- Execution takes the Event lock before the ScheduledAction lock, then samples the injected
  clock and rechecks scope, type, RUNNING status, worker, attempt, version and lease. Cancelled,
  superseded or expired claims have no effects or outcome writes. Event-first order matches
  reopen/archive cancellation; a reversed-order mutation failed the cancellation regression.
- Handler effects, SUCCEEDED completion, SCHEDULE-source audit and the next recurring occurrence
  commit together. Completion/audit/successor failures roll back the effects. Failures settle in
  a separate transaction that repeats the same locks and fencing. If settlement itself fails,
  the original lease remains recoverable.
- Expected payload/authority/guard/late refusals become FAILED. Unexpected failures retry after
  30 s, 2 min, 10 min and 30 min, then become DEAD. Exhausted crashed leases are dead-lettered
  without executing the handler. Error storage and audits contain only bounded catalogue codes;
  SQL, tokens, descriptions and raw exception messages are excluded. Failed/dead execution audits
  carry failure/denial outcomes and dead actions are CRITICAL.
- The additive `scheduledFor` column preserves the original deadline through retry backoff.
  Existing rows are backfilled from `runAt`; new legacy enqueue rows are initialised on claim.
  Pending rescheduling must set both timestamps. A database check disallows eligibility before
  the original deadline. This preserves ADR-004's late-running and recurrence requirements.
- Recurrence is for system actions with a stable dedupe key. On success the historical occurrence
  releases its key; the one successor receives it in the same transaction. Failed/dead rows keep
  the key to prevent automatic resurrection. Successors keep event scope and payload, including
  JSON null, and use the first original-cadence instant strictly after now, skipping missed work.
- The focused scheduler/storage suite passed 58 checks: seven claim cases, 27 executor cases and
  24 existing storage cases. Executor checks include three rounds of two real workers executing
  ten distinct actions, competing executors, platform/event isolation, role/deactivation/removal,
  all backoff boundaries, dead-letter recovery, injected persistence failures, recurrence and
  deadlines sampled after waiting for the Event lock.
- The migration was applied only to the three dedicated localhost:5435 `_test` databases. A
  read-only schema comparison against `spoh2027_test` found no difference. Real `spoh2027` was
  not migrated, reset or seeded.
- Full integration rerun: 796 passed, four existing skips, 66 files. The initial run passed 795
  and found one existing preparation audit assertion that assumed timestamp ordering selected
  lifecycle version 1. The test now checks all four versions and selects the intended receipt by
  version; preparation/executor 41 checks and then the full rerun passed. No lifecycle behaviour
  was changed by that test repair.
- All workspace typechecks, server 531 unit tests, lint, architecture, hardcoding, settings
  generation, server build, changed-file formatting and `git diff --check` passed. No client UI
  or snapshot changes; no visual baseline changes were needed.

Worker polling, boot-time recurring seeding, production module handlers, scheduler metrics and
P08.8 alarms remain pending. Execution is not activated in the API boot path by this slice.
