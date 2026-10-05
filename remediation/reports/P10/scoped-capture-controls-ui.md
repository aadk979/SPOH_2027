# Reviewed event and station capture controls — partial P10.8

Event settings now includes a collapsed Capture controls panel for current
config.manage authority. It consumes capture.open from the generated catalogue,
including its label, description, registered value schema and permitted scope.
This is the first operational UI consumer: capture admission already uses this
setting. The other operational keys retain their existing consumers and remain
outside this panel until their migration is verified.

Event and owned-station selections show the effective value, inheritance source,
selected stored version and evaluation time on the event clock. Event wording
explains that station overrides take precedence. Pausing affects new count and
journey capture; safety remains available. Opening still obeys the event schedule
and lifecycle. Invalid stored layers are flagged without exposing malformed JSON.

Pause/open, override removal and owned historical restore each require an
explicit review, bounded reason and confirmation. The shared request schema
validates the full outgoing intent. The reviewed version is the selected stored
version, including zero for inheritance, rather than its parent's source version.
A changed parent also makes the displayed review stale. Re-review clears reason,
confirmation and UUID. Archived settings remain readable; new writes are disabled.

History loads only when requested, pages through an owned keyset cursor and shows
bounded reason, current-person attribution and generated source wording. Invalid
historical values remain unavailable. RESET means override removal using current
inheritance, with no invented historical after value. A RESET restore is disabled
when the selected scope already has no override. Saved results restore through
the existing reviewed, guarded API and append a new history version.

A pending or uncertain request locks scope, collapse and navigation within the
panel. A lost response, processing reservation, rate limit or server failure
retains the exact request and UUID in memory; fields freeze and the explicit retry
uses that intent even after newer reads or a failed refresh. A definite conflict
requires a fresh review. No intent is persisted on the device. Event/person keys
and zero retention after unmount isolate private current/history data. Permission
loss, sign-out and read/write denial hide private controls and cached values.
History denial also hides the controls because it signals loss of their shared
authority. Successful writes refresh scoped private queries; unrelated event
panels are not invalidated.

Feature API boundaries validate strict responses and bind event, scope, owned
station, key, reviewed version, operation and selected history to the request.
Reads and writes request no-store. Product privacy/counts, attendance/security,
platform and legacy setting writers retain their specialised controls. No
server/schema/migration changes are introduced by this UI slice.

## Local verification on 5 October 2026

The initial component suite fails because the new panel module is absent; its
first two interaction checks pass after implementation. The expanded 34 checks
cover reviewed versions, event/station inheritance, parent changes, reset and
restore semantics, pagination, malformed history, archived reads, authority/cache
isolation, strict response binding, conflicts and frozen retries. All 460 client
checks across 56 files pass. An existing startup test checked an asynchronous
bootstrap effect too early; its assertion now waits for that effect. The earlier
race failure is excluded from accepted evidence.

Four real browser journeys cover both scopes at 390×844 and 1440×900. Each applies
a reviewed pause, verifies a real registration is refused, removes the override,
restores the saved pause and then restores the RESET. History, hard reload,
no-store, zero application errors and WCAG A/AA checks pass. Original fixture
values and inheritance are restored through reviewed APIs; immutable test history,
audit and retry receipts remain. The related product-history and real scheduler
journeys also pass: eight serial checks in 54.9 seconds. An earlier combined run
exhausted the normal local rate limit because capture writes invalidated all event
queries. The refresh is narrowed to scoped queries and the corrected run passes
without weakening the limiter.

All workspace types, lint, generated settings and hardcoding checks pass.
Architecture verifies 1,061 modules and 4,719 dependencies. The final shared/server
build and 32-page static export pass. Backend evidence is reused from the verified
set/reset, history and restore slices because this change adds no backend writer.

The fresh frozen API passes all 62 visual comparisons without snapshot updates
(2.3 minutes), including all 58 existing route states and four new capture-panel
states. Only the two settings-layout baselines and four new panel images change,
and each is visually reviewed. Panel crops retain phone/laptop widths and extend
height where needed to show every control; surrounding sticky navigation is
hidden through CSS property assignments with zero CSP violations asserted. An
initial administrator visual session touched its frozen membership last-seen
field. Exactly that known-null synthetic field is restored with a guarded
visual-database script, and the additional states use the existing chief account.
Both roster baselines remain byte-identical and pass. The corrected fixture
primer documentation distinguishes provider tokens from application sessions.

The actual static export also passes phone/laptop startup and reload under the
server CSP with no evaluation violation or application error. Malformed runtime
configuration still refuses startup. Source, tests and all 637 existing commits
pass redacted secret scans. All three preserved P08 pricing fingerprints and
historical P05 pricing remain unchanged. Test fixtures use only the dedicated
E2E and frozen visual databases; real local spoh2027 is not reset, seeded or migrated.

## Actual staging verification on 5 October 2026

Source 5d1e018 and tracker image 00dbc2a9d263f741852c31f1a399f4e2d639fd72
are pushed and verified. [CI 37269277650](https://github.com/aadk979/SPOH_2027/actions/runs/37269277650)
and [staging deployment 37269760650](https://github.com/aadk979/SPOH_2027/actions/runs/37269760650)
succeed. CloudFormation reports UPDATE_COMPLETE and that exact image; ECS has one
completed deployment, one desired/running task and zero failed tasks on task
definition revision 123. The browser evidence is observed at 16:39 Singapore. The browser
probe independently checks those gates before opening a normal Cognito session.

[Sanitised browser evidence](staging-scoped-capture-controls-ui-evidence-2026-10-05.json)
records installed Chrome, phone event writes and laptop event/owned-station reads.
The phone deliberately loses a successful pause response after commit. Fields,
scope and collapse freeze, and the UI retries the identical UUID/body to the same
history row. Reviewed override removal, saved pause restore and historical RESET
restore then pass. Exactly four history rows remain; original inheritance and
selected stored version zero are restored. An old pause intent returns its
original receipt with the freshly restored current values. Compatibility/product
settings and READY lifecycle remain unchanged. Hard reload, history, normal
sign-out, no-store and zero application errors/CSP violations pass. The laptop
station journey is read-only; writes at both scopes are covered locally.

Immutable synthetic history/audit and identifier-only receipts remain. No count,
visitor, lifecycle, schedule, announcement or delivery writes are requested.
P10.8 remains open for complete generated controls, remaining catalogue consumers,
operational scheduling and the broader phase criteria.
