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

## Idempotency pruning (2026-10-02)

- Every API instance now seeds both daily system actions. The legacy idempotency interval is
  removed; the handler accepts only an empty payload and a platform-system principal.
- The worker transaction reads the current existing global `AppSetting` compatibility policy,
  validates it through the sole registry definition and defaults missing/invalid values to seven
  days. This slice preserves the operative global policy; it does not claim migration of the
  generic organisation-scoped setting consumers. That integration remains part of P10.
- Only records strictly older than the cutoff are deleted, including both event and platform
  replays. Equality survives. A policy changed after enqueue takes effect even if this API's
  compatibility cache is stale. Client-selected keys, cutoffs and retention are refused.
- Deletion, count-only `idempotency.prune` audit, completion and recurring successor share the
  worker transaction. Audit/completion failure rolls deletion back before retry. Receipts contain
  only removed count and applied retention, with no replay keys, subjects, endpoints or bodies.
  A no-op gets only the completion receipt. The manual entry point uses the same prune helper
  inside its own system transaction.

Verification: 11 new handler checks and the existing session/manual-prune tests passed (21
focused database checks); full integration **827 passed/four existing skips, 69 files**; all
workspace types, 538 server units, lint, architecture, hardcoding, settings generation, server
build and changed formatting passed. Seven serial browser journeys
passed against the rebuilt API across two disposable-API runs, without changing default limits.
No schema, client layout, visual baseline or infrastructure definition changed.

## Per-event lost-person purge and event discovery (2026-10-02)

- Every API instance discovers events at boot and, on its existing serial worker tick, once per
  minute. Each event gets one recurring `lostPerson.purge` occurrence at a fifteen-minute cadence.
  Concurrent boots and later discovery preserve the existing due time and terminal/dead work;
  successful completion creates its successor atomically. Events created after boot are included
  without a new timer. Failed discovery is retried on the next tick before claiming work.
- The old lost-person interval is removed. Its module owns a strict empty payload and event-system
  authority check. User-created, platform-scoped and payload-selected event/cutoff requests are
  refused before touching descriptions. Other business handlers remain pending.
- The helper takes the worker transaction, holds the Event first, reads current validated event
  retention (with the existing global compatibility policy as fallback), locks due alerts in ID
  order and reads only summary inputs. Active, unresolved, already-purged and exact-cutoff rows
  survive. Live and practice summaries keep their provenance; purge timestamps use the worker
  clock. An event retention change committed while execution waits is seen under Read Committed.
- Each event's descriptive scrubbing, anonymised summaries, legacy replay redaction, per-alert
  audit, completion and successor share one transaction. There are no nested purge transactions.
  Faults after summary, replay, module audit, completion or successor roll all effects back; a
  clean retry produces each summary once. Concurrent executions for one event serialize.
- Replay scrubbing covers the same event and pre-tenancy null-scoped replays for the globally
  unique alert ID; a different event's row is not rewritten. Neither summaries nor purge receipts
  contain descriptions, clothing, ages or identity-provider subjects. The manual compatibility
  entry point uses the same helper, one atomic transaction per event. Archived data still receives
  privacy maintenance.

Focused verification: **75 database checks** passed after correcting the new fixture's missing
setting version, including 13 module cases and six real worker/discovery cases. All workspace
types, 538 server units, lint, architecture, hardcoding, settings generation, server build and
changed formatting passed. Full integration **846 passed/four existing skips, 71 files**.
Seven browser journeys passed across two serial, rate-isolated
disposable API runs. No schema, client layout or visual baseline changed.

Next module dependency: migrate visitor-field purging with fresh locked lifecycle/field policy
and atomic receipts. Generic setting consumers, further handlers and lifecycle admission remain
open. P08.8's lag/dead-action filters and detection alarms are deployed; notification delivery
and the remaining observability criteria are still pending.
