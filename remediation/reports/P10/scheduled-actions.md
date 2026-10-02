# P10.7 — Schedulable module actions

P10.7 is in progress. Only the verified handlers listed here are activated. Lifecycle,
archive reminders, announcement/taxonomy/setting/report actions, remaining prunes and retention
are still pending; P10.5/P10.6 also remain open.

## Refresh-session pruning and worker activation (2026-10-02)

- Every API instance seeds the cluster-wide daily `session.prune` action and starts the durable
  worker. Concurrent/repeated boot retains its existing occurrence and cadence. The corresponding
  legacy refresh-session interval was removed; other business intervals remain for their own
  transaction migrations. Archive reminders are excluded until their handler is registered.
- The module owns its empty strict payload schema and platform-system authority check. A user
  creator, event scope, session selector or caller-selected retention cutoff is refused before
  deletion. Maintenance is not exposed as a user scheduling endpoint.
- Existing rules are preserved: expiry strictly before now, or revocation strictly before the
  seven-day cutoff. Equality at either boundary is retained. The injected worker clock controls
  the cutoff. Live sessions and recent revocations are untouched.
- Deletion, a count-only `session.prune` audit, session-cache notification, job completion and
  recurring successor commit together. Module/engine audit, publication or completion failure
  rolls deletion back; a clean retry removes the due rows once. Audit contains no token hashes,
  session family IDs or raw exception text. Empty runs have a completion receipt without a
  fictitious deletion audit. The previous manual/system entry point uses the same transaction
  boundary and preserves its post-commit identity-cache invalidation.
- Shutdown drains the current worker transaction before closing cache bus/database connections;
  duplicate signals are ignored. Drain failures log only a fixed code. The existing ten-second
  forced-exit limit remains, with uncommitted effects rolled back and leases recoverable.

Verification: dedicated localhost:5435 test databases only; focused module/auth/jobs/boot 39
checks passed; full integration **816 passed, four existing skips, 68 files**; server units
**538 passed**, including three shutdown cases. All workspace typechecks, lint, architecture,
hardcoding, settings generation, server build, changed formatting and `git diff --check` passed.

The rebuilt API booted on the dedicated E2E database. Five serial preparation/close/offline
journeys passed; the following reopen cases hit the shared admin-tier limit. The trace showed
429 report responses and the screenshot was inspected. After restarting only the disposable
API, both phone/laptop reopen journeys passed with unchanged default limits: seven successful
journeys across those runs. No client layout, visual baseline, schema or infrastructure definition
changed in this slice. The real `spoh2027` database and live production were untouched.

Next module dependency: move idempotency pruning into the handler transaction, then migrate
the per-event privacy purges without nested transactions. P08.8 still needs log metric filters
and alarm/notification verification for the engine's gauges.
