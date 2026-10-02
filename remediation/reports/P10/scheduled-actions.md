# P10.7 — Schedulable module actions

P10.7 is in progress. Only the verified handlers in the dated sections below are activated.
Archive/fallback reminders, announcement/taxonomy actions, other setting keys/scopes and
remaining retention classes are still pending. P10.6 is complete; P10.5/P10.7 remain open.

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

## Per-event visitor purge (2026-10-03)

- Each event now has one hourly `visitor.purge` occurrence, discovered at boot and on the same
  minute discovery pass. The module owns a strict empty payload and event-system authority
  check. A user creator, platform scope or caller-selected field/cutoff is refused.
- Execution reads the fresh locked Event and current field policy inside the worker's supplied
  transaction. Only CLOSED/ARCHIVED events with a close timestamp are eligible. Reopening,
  a new close time or longer retention committed while the worker waits is seen before deletion.
  Inclusive field deadlines apply to both live and rehearsal values. Empty visitor records and
  records past their last known field deadline are deleted; registrations and their counts stay.
- Deadline synchronization, field scrubbing, count-only receipts, completion and successor share
  one transaction. Failures at each boundary roll values and deadlines back before a clean retry.
  The backstop deletion now has its own count-only receipt. No receipt contains visitor values.
  The manual compatibility entry point reuses the same helper in one transaction per event.
- Field creation and updates acquire the same exclusive Event lock. Duplicate lookup and the
  audit's previous policy are read after that lock, so a concurrent create gets a conflict and
  an update records the latest committed policy. This closes the retention-policy race.
- All four former business prune intervals have been removed. The remaining settings and
  identity cache refreshes are per-instance local maintenance, registered through
  `platform/scheduler` as ADR-004 requires. Other catalogue actions remain unimplemented.

Focused verification: **53 database checks** passed, including 22 new visitor cases. The first
run exposed a test assertion using `status` instead of `statusCode`; typechecking also caught
the fixture's missing sort order and overly narrow JSON type. Those fixture issues were corrected
before the passing run. Full integration: **868 passed/four existing skips, 72 files**.
All workspace typechecks, **538 server units**, lint, architecture, hardcoding, generated
settings, server build, changed formatting and `git diff --check` passed. Seven browser journeys
passed against the rebuilt API across two serial disposable-API runs. No schema, client layout
or visual baseline changed. Only dedicated localhost:5435 `_test` databases were used.

Generic setting consumers, further handlers and lifecycle admission remain open. P08.8's
lag/dead-action filters and detection alarms are deployed and their real triggering/recovery
is verified; notification delivery and the remaining observability criteria are still pending.

## Live count-capture controls (2026-10-03)

`capture.open` now controls count/journey writes before scheduling is exposed. Every registration,
group, footfall tick/bulk capture, stamp and gift redemption resolves its current event/station
policy inside the capture transaction. Card issue has no station in its existing contract, so it
uses the event policy. Import commits check every distinct station in the planned new rows before
inserting any; a mixed-station refusal rolls the whole batch back. Previews stay read-only.

Station overrides retain ADR-003's station → event → default precedence. They cannot bypass
lifecycle admission. LIVE and REHEARSAL both respect the control; invalid stored overrides fall
back through the existing validated resolver. Reset/resume takes effect on the next write without
depending on the compatibility cache. Completed retries replay their committed result after a
pause, while a fresh key is refused. Valid strictly pre-close queued captures retain ADR-004's
CLOSED receipt-grace exception; new/at-close captures remain refused.

Count controls are separate from Safety actions in ADR-005. Pausing counts does not disable
incident, lost-person or found-item reporting; those keep the existing lifecycle admission.
Generic event/station setting writes and resets now take the exclusive Event lock. A previously
admitted capture finishes before its policy changes; an admission waiting behind that change
reads the newly committed value. Concurrent captures can still share the Event lock.

Focused verification: **60 database checks** passed, including 19 new control cases. The initial
HTTP lock probe did not observe the intended admission boundary; the corrected test calls the
admission boundary directly and waits for its actual Event share lock. All workspace types,
538 server units, lint, architecture, hardcoding, generated settings and server build passed.
Full integration: **887 passed/four existing skips, 73 files**. Ten serial browser journeys
passed against the rebuilt API: count capture/undo/offline sync, two-device safety delivery,
pre-close incident sync and phone/laptop close-out labels. Changed formatting and diff checks
passed. No schema/client layout/baseline changed; dedicated local `_test` databases only.

The timed `setting.apply` handler, scheduling endpoints/timeline and client pause controls are
still pending. This slice establishes the actual capture consumer and its transaction ordering.

## Timed capture setting changes (2026-10-03)

The real API composition now registers `setting.apply` for **`capture.open` at event/station
scope only**. A strict payload requires the target, registry-validated boolean and expected
setting version, with an optional bounded reason. Other keys/platform scope remain unavailable
until their consumer/authority dependencies pass. No public scheduling CRUD/UI is exposed yet.

Execution uses the stored action's current payload and the creator's current active membership
and `config.manage` capability. Demotion/deactivation/end committed after scheduling or while
the worker waits is refused. System creators, platform actions, foreign event/station targets
and ARCHIVED events cannot apply this user action. Cedar integration remains P11.

`changeSettingInTransaction` extracts the existing validated/versioned mutation so the worker
never opens a nested setting transaction. Setting value, monotonic history, attributed SCHEDULE
audit, transactional cache notification and completion commit together. The manual wrapper
keeps its post-commit local rate-policy invalidation and now uses explicit Read Committed/30 s.
An intervening manual version or a competing action refuses the stale expected version instead
of silently overwriting it. No endpoint/path or raw exception is copied into queue errors.

Verification: **62 focused database checks**, including 27 new handler checks; full integration
**914 passed/four existing skips, 74 files**; all workspace types, **538 server units**, lint,
architecture, hardcoding, generated settings, server build, changed formatting and diff checks
passed. Time travel covers inclusive pause/resume due boundaries and current capture effects.
Five fault boundaries roll values/history/receipts back before a single clean retry.

Twelve serial browser journeys passed against the rebuilt API, including phone/laptop tests
that enqueue synthetic local actions and wait for the actual polling worker to pause/resume
capture. The first browser fixture named a nonexistent queue column; it was corrected after
inspecting the failure output/screenshot. Lint then caught a cleanup throw inside `finally`;
cleanup was extracted, lint/types passed, and the two timed cases plus two reopen cases passed
again on a fresh disposable API. Fourteen distinct journeys passed across these runs.
The guarded tests restore policy/count fixtures, cancel leftover pending work with Event-first
locking, and retain immutable synthetic receipts in the dedicated E2E `_test` database.

No schema, client layout, visual baseline or infrastructure definition changed. P10.5/P10.7
remain open for the rest of their exit criteria. Next: lifecycle handler transaction/authority
integration and the reminder delivery dependencies, while advancing independent P08 work.

## Timed lifecycle transitions (2026-10-03)

`event.transition` is registered in the actual API worker. The strict shared input requires
the target state and expected lifecycle version, permits bounded reasons and per-item go-live
overrides, and refuses event selectors, client readiness evidence and HTTP retry keys. Its
creator must currently have an active membership with `config.manage`. System/platform actions
and user recurrence cannot perform a user transition. Schedule CRUD/UI and Cedar remain pending.

Manual transitions keep their reservation/settlement wrapper. Both paths use the extracted
provided-transaction core for current guards, side effects, audit and cache publication. The
worker's Event-before-action order and post-wait clock are preserved; it opens no nested lifecycle
transaction and invents no retry reservation. Changed lifecycle versions, structure, event
permission or same-organisation platform authority are observed before any effect. Late execution
uses these guards rather than a new generic timeout. First go-live still refuses unavailable
checklist evidence, and public/scheduled ARCHIVED remains unsupported.

Close-out's windows, held items, live-only FINAL report and reminder storage commit with the
scheduled completion. Reopen retains its written reason, current same-organisation platform-admin
permission and inclusive 48-hour bound; immutable snapshot supersession and reminder cancellation
share that completion. Faults after snapshot, reminder, audit, publication or completion roll all
effects back, before a clean retry. Claimed reminders are cancelled under the same Event-first
order. Archive reminder delivery remains pending.

Focused verification: **101 database checks**, including **47 new timed lifecycle cases**.
Ten serial browser journeys passed across two rebuilt, fresh disposable-API runs, including
phone/laptop proof that the actual polling worker closes a practice window, updates the banner,
refuses READY capture and admits a labelled practice capture after returning to REHEARSAL.
The browser fixtures cancel leftover synthetic work under Event-first locking and retain immutable
schedule/audit receipts in the dedicated local E2E `_test` database. Full integration:
**961 passed/four existing skips, 77 files**. All workspace types, **538 server units**,
**23 shared units**, lint, architecture, hardcoding, generated settings, shared/server build,
changed formatting and diff checks passed. The first typecheck corrected two fixture-schema
mistakes. The first full run then exposed a retained-organisation slug collision; an idempotent
fixture upsert fixed it, and the complete rerun passed. No schema, client layout, visual baseline
or infrastructure definition changed. P10.5/P10.7 stay open for their remaining exit criteria.

## Timed daily report snapshots (2026-10-03)

`report.snapshot` is registered in the real API worker for **one-off user DAILY snapshots**.
Its strict payload requires the event day; practice inclusion is an optional boolean, default
false. Event identity comes from the stored action. Current active `report.generate` authority
is checked under a membership lock. System/platform creators, user recurrence, foreign/missing
days, arbitrary date bounds, FINAL requests and ARCHIVED writes are refused.

The worker's exclusive Event lock keeps captures, corrections and configuration stable while
the existing transaction-aware report generator runs. The day range uses the current event's
timezone/day boundary, includes its start, excludes its end and can run at the exact completion
instant. Spring/fall DST days remain 23/25 hours. A late execution includes committed corrections
without moving the selected day. The provided transaction owns generation, DAILY document
storage, metadata-only SCHEDULE audit and completion. A five-boundary failure rollback permits
one clean retry; competing executors of a single claim produce one document and one outcome.

Documents retain their range, generation time, practice label and lifecycle version. Existing
database immutability protects them. A later occurrence can freeze new data without editing its
predecessor. DAILY never replaces or supersedes the FINAL document or frozen default reads;
FINAL remains owned by close-out. The public report schema excludes visitor values and transient
lost-person descriptions. At this generation checkpoint, snapshot listing/reads/UI and automatic
recurrence declarations were pending; the later read slice below adds APIs. No new public scheduler
endpoint is implied.

Focused verification: **81 database checks** passed after correcting new fixture/schema/date
mistakes, including 36 new cases; the additional waiting-capture concurrency check passed in the
full suite, for 37 new cases. **Ten serial browser journeys** passed across two fresh rebuilt disposable API runs,
including phone/laptop actual-worker generation of live-only and explicitly practice-inclusive
daily documents. The local guarded fixtures cancel leftovers Event-first, restore synthetic
capture/day fixtures and retain immutable document/audit receipts. Types/static/settings/server
build, changed formatting/diff checks and **538 server units** pass. Full integration:
**998 passed/four existing skips, 80 files**. All workspace types passed after fixing the
fixture/schema errors; server types, lint and architecture passed again after the added concurrency
test. The new audit action is explicitly catalogued. Snapshot stored bodies and outcome errors
contain no transient descriptions or private exception text.
No schema, client layout, visual baseline or infrastructure definition changed.

## Stored report reads and exports (2026-10-03)

The event-scoped snapshot list/detail/export APIs require the existing report permission and
return immutable DAILY/FINAL documents with explicit practice and supersession provenance.
Metadata-only keyset paging never loads full bodies for the list. Stored exports include no
current visitor sheet; default whole-event frozen FINAL reads are unchanged. See the
[read/export evidence](report-snapshot-reads.md). Snapshot selection UI and automatic scheduling
declarations remain pending; this read API does not expose schedule creation.

## Category capture consumer (2026-10-03)

Single/group registration enforces category activity under Event admission; group card
issuance rolls back with a refused member. Import planning filters inactive categories,
and commit rechecks planned ids under the same shared Event lock. Completed replay,
historical report labels/counts and valid CLOSED pre-close offline receipts remain intact.
Timed category activity writes remain the next slice. See the
[admission evidence](category-capture-controls.md). P10.5/P10.7 stay open.

## Timed category activity (2026-10-03)

The real worker registers category-only `taxonomy.setActive`, with strict payload and current
creator `config.manage` permission. Supplied-transaction activity changes take Event UPDATE,
preserve historical counts, refuse ARCHIVED writes and share their fate with attributed audit
and completion. A matching absolute desired value completes without fabricating a change.
Open booth category queries use the existing live polling cadence. See the
[timed category evidence](scheduled-category.md). Station/type kinds, schedule CRUD and other
catalogue/retention dependencies remain open.
