# P10.4/P10.5 rehearsal provenance

The first slice adds storage without opening rehearsal capture. Existing rows remain live
(`rehearsal = false`), and practice gift inventory begins at zero. Provenance is stored on the
seven ADR-004 capture tables and on cards, lost-person summaries, stock adjustments, fallback
windows, imports, attendance and attendance challenges. All fourteen tables have an event/mode
index. Attendance and challenge uniqueness now includes the mode; current callers explicitly
select live presence until the rehearsal behavior is wired.

The migration runs transactionally and does not delete or rewrite operational rows. Its
integration test replays the preceding migration chain into
`spoh2027_rehearsal_migration_test`, seeds live captures, then applies the new migration. It
checks retained footfall quantity, completed cards, stock, summary outcome metrics and attendance,
all fourteen non-null false defaults, and separate practice/live attendance and challenges with
duplicate rejection within each mode. The scratch database is removed after the test.

That storage slice left capture behavior to subsequent verified changes. P10.4 and P10.5 remain
in progress.

Verification on 2026-10-01: server integration 504 passed / 4 previously skipped; server unit
467 passed; server typecheck (including seed and tests), root lint, architecture, hardcoding and
changed-file formatting passed. Prisma migration diff against `spoh2027_test` found no schema
drift (exit 0). No browser behavior changes in this storage slice.

## Capture and import propagation

Capture writes now resolve the event mode under a shared event-row lock held until transaction
commit. Single/group registrations, footfall taps and bulk counts, stamps, redemptions, safety
records, card batches, attendance/challenges, stock adjustments and fallback windows retain
practice provenance. Reissued stamps and purged lost-person summaries retain their source mode.
Practice attendance cannot check the live roster in or supply a live verification code.

Cards from another mode are refused before mutation or redemption. A group count still succeeds
when an optional card belongs to another mode, with an actionable link error. Gift inventory
selects the matching initial stock, adjustments and redemptions; practice stock starts at zero,
and practice low stock does not notify the live stock owner. The report's gift inventory explicitly
reads the live pool pending the complete report filter slice.

New client captures snapshot their mode before sending or queueing. A queued practice request
synced in LIVE is refused rather than relabelled. Import previews return their mode and the client
retains it for commit. Imports may bind an event-owned fallback window to preserve historical
practice provenance after go-live. Foreign windows return 404; the source tier must match.
Practice import keys remain separate from legacy live keys, which are preserved for deduplication.
Binding a window does not create a second idempotency namespace for the same mode and file.

Verification: full server integration **514 passed / 4 existing skips**; server unit **467**;
client unit **233**; browser E2E **31** on a newly created, migrated and seeded dedicated
`spoh2027_rehearsal_e2e_test`. Typecheck (all workspaces, including server seed/tests), root lint,
architecture, hardcoding, formatting and server build passed by exit code. Integration covers
mode mismatches, separate stock, imports, attendance, copied stamps, purge summaries and a
concurrent phase update blocked by the event lock. Client tests use real IndexedDB to prove
queued mode retention and refusal handling. No visible layout changed, so visual baselines were
not modified. A Prisma reset was refused; verification used a fresh test database instead.

## Report filtering and inclusion

Report summaries and CSV/XLSX exports now exclude practice captures by default, independently
of the event's current phase. Filters cover registrations and voids, footfall quantities and
curves, cards and stamps, gift redemptions, safety records and summaries, fallback windows,
imports, source totals and visitor details. Existing reader permissions still govern visitor
exports. Practice attendance never changed the live roster, so practice check-ins cannot inflate
the volunteer report.

The report screen offers an explicit "Show rehearsal data" control. Inclusion combines capture
totals, labels the screen and exports, and adds `-with-rehearsal` to download names. Live and
practice gift stock remain separate rows. Redemption counts respect the requested report range;
remaining stock reflects each pool's current inventory. Query keys include the selection so
cached practice totals cannot appear in the default view.

Verification: full integration **518 passed / 4 existing skips**, server unit **467**, client
unit **233**. Two browser journeys cover phone/laptop inclusion, return to the default view and
labelled CSV downloads. Visual verification passed on **56 unchanged screens**; the two report
baselines were inspected, deliberately updated and re-asserted. All workspace typechecks,
lint, architecture, hardcoding, changed-file formatting and server build passed by exit code.
Database tests cover both LIVE and REHEARSAL phases and the explicit inclusion query, including
visitor exports and XLSX labels. The visual database received only the additive migration;
its original fixture dates were preserved.

## Dashboard filtering and inclusion

Chief, IC and TV dashboards default to live captures. Footfall and card summary APIs follow the
same rule. Filters cover counts and source breakdowns, station/device activity timestamps, safety
counts, flagged redemptions and fallback indicators. A recent practice capture cannot conceal
an older live capture in a station's silence or device-staleness warning. Explicit inclusion
combines capture totals and signals while keeping live/practice gift stock in separate labelled
rows. Each screen starts with inclusion switched off; polling and query caches retain the selected
scope. TV inclusion also has a display-sized warning.

Verification: full integration **522 passed / 4 existing skips**, server unit **467**, client
unit **234**, full browser E2E **39**. The four new database cases cover default exclusion in
LIVE and REHEARSAL, explicit inclusion, separate gift pools, safety/fallback flags and practice
activity that cannot hide stale live devices. Browser coverage includes Chief, IC and TV at phone
and laptop sizes; a query test proves cache separation. Visual verification passed on **52
unchanged screens**, with **6 inspected, updated and re-asserted dashboard baselines**. A subsequent
visual sign-in reached the frozen clock's rate bucket; restarting the fixture API cleared it
before the successful baseline runs. Typecheck, lint, architecture, hardcoding, formatting and
server build passed by exit code.

## Capture totals and registration summaries

Registration and footfall capture responses total only the mode of the row just written. The
response cannot switch pools if the event changes phase after commit. Registration summaries
exclude practice across category, hour and day buckets by default, with explicit labelled API
inclusion and matching fallback-window indicators.

Verification on 2026-10-02: full integration **527 passed / 4 existing skips**, server unit
**467**. Five new database cases cover single/group registrations, footfall taps/bulk counts,
phase changes and every summary bucket. All workspace typechecks, root lint, architecture,
hardcoding, formatting and server build passed by exit code. No visible layout changed.

## Rehearsal shift access, fixtures and banner

REHEARSAL permits capture at the volunteer's assigned station on any shift/day of the event.
LIVE keeps actual shift hours. The development-only shift flag and its environment rule are
removed. Station capture writes recheck active membership and station permission under the
event phase lock, closing the gap between middleware and a concurrent go-live. An IC correction
still succeeds and its bypass is audited using the permission at write time.

Scheduled staffing, activity warnings and live roster attendance continue to use actual hours;
the wider practice capture permission cannot inflate those measures. New development fixtures
start in REHEARSAL with practice cards and practice initial stock; live initial stock is zero.
Seed reruns preserve existing phase, cards and stock. The guarded visual conversion preserves
historical fixture dates and refuses non-visual databases, production, existing captures,
issued cards and closed/archived events. It was run twice successfully on the unused visual
fixture, and its wrong-database/production guards refused before connecting.

Every event screen in the app shell shows a persistent practice banner below urgent lost-person
alerts. TV uses a larger banner. Event polling updates it and invalidates that event's cached
postings and operational reads when phase changes; another event's cache stays intact.

Verification on 2026-10-02: full integration **533 passed / 4 existing skips**, server unit
**467**, client unit **243**, full browser E2E **41**. Six new database cases cover outside-hours
practice, LIVE refusal, a posting on another event day, missing assignments, concurrent go-live
and the audited IC bypass; the dashboard regression keeps staffing and warnings on actual hours.
Two browser journeys cover phone/laptop practice captures, stored provenance and automatic
banner/posting updates on go-live. Nine component/cache cases cover every phase, platform pages,
TV labelling and invalidation isolation. All workspace typechecks, root lint, architecture,
hardcoding, formatting and server build passed by exit code.

Visual review covered the 56 changed phone/laptop event baselines; both sign-in images remain
unchanged. It caught staffing being widened to every event shift, which was corrected before
commit and covered by the new database regression. Chief/TV images reflect actual scheduled
staffing and separate live stock. The frozen sign-in bucket was exhausted during the initial
comparison's repeated worker restarts; proposed images were reviewed against saved originals,
then the API restarted for assertion runs. Final full visual assertion: **58 passed**.

## Safety records and practice interruptions

Safety response contracts expose the stored rehearsal provenance. Practice lost-person alerts
interrupt the active feed only during REHEARSAL; real searches remain visible in every phase.
The phase predicate is part of the database query, so cached event state cannot keep a practice
search active after go-live. Historical incident/item reads and close-out responses retain
their labels. The client labels practice alerts and found items from the record itself.

Lost-person raise/stand-down and severe-incident pushes identify practice on the lock screen,
using the saved row's provenance. They continue to carry no personal description. Resolving a
practice alert after go-live still sends a labelled practice stand-down. Resolution checks,
the update and its provenance audit now share a row lock and transaction: two responders produce
one successful resolution and one audit. Poll and resolution times use an injected Clock.

Verification on 2026-10-02: targeted integration runs **27** and **28** passed, including five new
cases for phase changes, real-search visibility, labelled historical records and concurrent
resolution; server unit **469**, client unit **247**. Four browser journeys passed, including
phone/laptop practice-alert removal on go-live and the two-device acknowledgement/resolution
flow. All workspace typechecks, root lint, architecture, hardcoding and server build passed.
Full visual assertion **58 passed** against the existing baselines; no images changed.

## Explicit card print mode and durable retries

Batch generation requires a chosen `rehearsal` boolean and UUID retry key. Printing is preparation,
so the chosen mode is independent of the current event phase: live cards can be printed before
go-live. Every new card, batch response, audit and print-file row retains that choice. The CSV
labels rows LIVE or REHEARSAL, quotes labels with commas/quotes and prevents formula labels from
executing in a spreadsheet. Card/stamp response contracts expose provenance, and the card summary
labels practice cards from the record.

Print generation locks its retry reservation before minting. The cards, audit and replay response
commit in one transaction, so lost response bookkeeping or a stale-reservation takeover cannot
mint a second batch. The shared retry middleware also checks event ownership before replay or
takeover; another event's administrator receives a key-reuse refusal, even when the same person
administers both events. Unscoped legacy keys fail closed. The old takeover regression fixture
now names its event and uses rawDb for direct access.

Verification on 2026-10-02: full integration **547 passed / 4 existing skips**, server unit **475**, client unit **249**,
full browser E2E **41**, and the phone/laptop stamp visual assertions **2** passed; no images
changed. Nine new database cases cover preparation in different phases, stored/printed labels,
required inputs, cross-event replay, normal retries, lost bookkeeping and reservation locking.
Two component cases cover stored card labels; unit cases cover both print modes, CSV labels and
foreign/unscoped takeover refusal. All workspace typechecks, root lint, architecture, hardcoding,
formatting and server build passed by exit code. The initial full run exposed an abandoned-key
fixture missing event ownership; the corrected fixture passed in the final full run.
Batch printing UI is built with the card administration screen in P13.3.

## Import source windows and reviewed previews

Importers can select an open or closed fallback window from their event. The selector shows
its stored LIVE or REHEARSAL label, scope and event-local start time, and offers only the tier
matching the sheet/paper source. Preview and commit keep the window's provenance even after
go-live. Without a window, a mode change between preview and commit is refused rather than
reclassifying the sheet. Window and import response contracts now require the stored flag.

Preview and completion label practice imports explicitly. Every editable value, including
filename and notes, invalidates the preview; switching source clears the incompatible window.
Fields stay disabled while a request is pending, so a returned preview cannot describe changed
inputs. Historical practice windows remain labelled after closing.

Verification on 2026-10-02: targeted server integration **33** and isolation **10** passed,
server unit **475**, client unit **256**, full browser E2E **43**, and full visual assertions
**58** passed. Seven new component cases cover historical mode selection, phase changes,
source/metadata invalidation and pending inputs. Phone/laptop journeys declare and close a
practice window, import its sheet after go-live, verify stored batch/row flags and default
report exclusion, then prove an unbound preview is refused after a mode change. A final targeted
browser run **2** passed, including selected-window overflow checks, after restarting the test
API to clear counters exhausted by successive runs. Initial browser failures were corrected
test locators for custom radio labels and Next's route-announcer alert, and a stopped test API.
All workspace typechecks, root lint, architecture, hardcoding, formatting and server build
passed by exit code. The two changed phone/laptop import baselines were inspected and
re-asserted; the other 56 images remain unchanged.

## Derived records and compatible capture locks

Incident follow-ups, lost-person acknowledgements and visitor values now store their parent's
rehearsal flag. The migration backfills existing children from the same event's parent, makes
the flag required without a false default, and enforces matching event, parent and mode through
foreign keys. Insert triggers derive an omitted flag for older API writers during a rolling
deployment; explicitly incorrect flags are refused. This uses PostgreSQL's
[transactional BEFORE INSERT semantics](https://www.postgresql.org/docs/17/trigger-definition.html).

Follow-up and acknowledgement responses retain their stored mode. Visitor CSV and workbook
exports label every included row LIVE or REHEARSAL; default visitor reads still exclude practice.
Incident status decisions and derived writes lock their parent inside the audit transaction.
Concurrent resolution produces one successful update and one note/audit, and repeated alert
acknowledgements produce one row/audit even across phase changes.

Verification exposed visitor captures upgrading an already-held event share lock to an exclusive
lock, which blocked compatible captures and could deadlock. Captures now keep a share lock while
collection changes retain their exclusive lock. A deterministic database regression failed
before the fix and passed afterward; this follows PostgreSQL's
[row lock compatibility rules](https://www.postgresql.org/docs/17/explicit-locking.html).

Verification on 2026-10-02: full integration **570 passed / 4 existing skips**, server unit
**476**, client unit **256**, and targeted browser E2E **10** passed. New database cases cover
historical derived modes, concurrent safety writes, compatible visitor capture locks, exports,
and a scratch migration from old rows with legacy writers and invalid ownership/mode updates.
All workspace typechecks, root lint, architecture, hardcoding, formatting and server build
passed by exit code. The integration, visual and E2E dedicated `_test` databases received the
migration; a read-only Prisma schema comparison found no drift. No client layout changed in
this slice.

## Capture admission and bounded late sync

New registration/group, footfall/bulk, card issue/stamp, gift redemption, incident, lost-person
and found-item captures are refused in DRAFT, READY and ARCHIVED. Import commits use the same
event lock and admission check, including imports bound to a historical source window; previews
remain read-only. Preparation and operational reads retain their separate provenance helper.

CLOSED accepts a capture only with a strictly pre-close `clientRecordedAt`, received within
`capture.lateSyncHours` (default 24, resolved from the event's stored setting). Station captures
recheck active membership and the assignment at that historical instant in the transaction;
the existing IC bypass remains audited. Practice captures cannot become live late-sync rows.
Mutation audits include the original device timestamp, close time, receipt time and grace used.
Online-only new lost-person alerts and found-item entries, and new import commits, are refused
after close.

Incident requests now carry the device timestamp into their existing offline queue. A real
browser regression exposed React Query pausing the incident mutation before the queue wrapper
could save it. The incident mutation now uses `networkMode: 'always'` so the failed offline
attempt reaches that wrapper, consistent with the library's
[network-mode semantics](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode).
The browser journey failed before that fix and passed afterward: a report is saved offline,
the event closes, and reconnecting writes one live incident with an audited pre-close timestamp.

Verification on 2026-10-02: full integration **582 passed / 4 existing skips**, server unit
**491**, client unit **257**, and targeted browser E2E **13** passed. Twelve new database cases
cover all capture surfaces, close boundaries, configured grace, historical assignments,
practice refusal, retries and a concurrent archive waiting for the capture lock. Fifteen pure
cases cover phase and time boundaries. Visitor fixtures now enter LIVE after configuring the
allowlist; the first full run correctly refused their former READY captures, and the corrected
fixtures passed in the final full run. All workspace typechecks, root lint, architecture,
hardcoding, formatting and server build passed by exit code. No client layout or visual baseline
changed in this slice.

## Audited preparation transitions

The event lifecycle API now supports DRAFT → READY, READY → DRAFT, READY → REHEARSAL and
REHEARSAL → READY. Structure guards use current server-owned days, active templates and
station types, the event timezone and registration categories. Requests carry the expected
version; competing or stale decisions are refused. LIVE, CLOSED and ARCHIVED targets remain
unavailable until their guards and close-out effects are implemented.

The additive migration records sticky observed live history and a lifecycle version. Existing
LIVE/CLOSED/ARCHIVED events are backfilled as having been live. A trigger preserves that history
and increments the version on actual phase changes, including writes from an older API during
a rolling deployment; unrelated edits and repeated phase values do not increment it.

Each transition locks the event, rechecks the actor's current event permission under a membership
lock, evaluates guards, writes its audit and retry response, and publishes the saved state/version
in one transaction. Ending rehearsal closes only open practice fallback windows and retains
their rows and captured data. New fallback declarations hold the capture phase lock, preventing
a practice window from opening after rehearsal ends. Event and identity caches subscribe to the
post-commit `event.state` channel and refresh on reconnect.

Verification on 2026-10-02: full integration **607 passed / 4 existing skips**, server unit
**491**, client unit **257**, and targeted browser E2E **7** passed. Fourteen new API cases cover
all preparation edges, structure guards, invalid and stale decisions, sticky history, concurrent
transitions, rollback, durable replay, changed permissions and post-commit notification. Eleven
scratch migration cases cover all existing phases, legacy writers, protected history/version and
required/default columns. Phone/laptop journeys verify window closure, audited versions and
banner updates without a page reload. All workspace typechecks, root lint, architecture,
hardcoding, formatting and server build passed by exit code. The three dedicated `_test`
databases received the migration; a read-only Prisma comparison found no drift. No client layout
or visual baseline changed in this slice.

## Report transaction foundation for close-out

All report sections now read through the same supplied database transaction, including event
metadata, station/declarer names, counts settings, gift stock and fallback windows. Ordinary
report generation opens a repeatable-read transaction; close-out can supply its own transaction
through the report module's public API. Reads run sequentially on that connection. Visitor
personal values remain outside the report document and are loaded separately for authorised
exports under their existing retention rules.

A deterministic concurrency regression commits footfall, stock and incident changes between
section reads. It failed with read-committed isolation (a mixed report included the later
footfall) and passed with repeatable-read restored. This uses PostgreSQL's
[repeatable-read snapshot semantics](https://www.postgresql.org/docs/17/transaction-iso.html).
A second database case verifies uncommitted changes across all sections and supporting data,
explicit practice inclusion, and complete rollback. This is the transaction foundation; a
persistent final snapshot and its lifecycle close/reopen use cases are still pending.

Verification on 2026-10-02: full integration **609 passed / 4 existing skips**, server unit
**491**, and report/dashboard/import/preparation browser E2E **12** passed. Server typechecks,
root lint, architecture, hardcoding, formatting and server build passed by exit code. The
two new cases use direct access through the raw test client and a dedicated `_test` database.
No schema, request contract, client layout or visual baseline changed.

## Close-out storage foundation

The additive migration provides event-owned report snapshots and the platform scheduler queue.
Final snapshots exclude rehearsal data, deduplicate by event and lifecycle version, and cannot
be edited or revived after being superseded. Daily snapshots use separate occurrence keys.
The stored report document contains no visitor allowlist values or lost-person descriptions;
its staff names and operational notes retain the report's existing access boundary.

Scheduled actions store bounded attempts, leases, recurrence intervals and completion state.
Database checks refuse inconsistent leases, impossible terminal states and unbounded errors.
The action's event scope is immutable. Scheduled audit and setting-history rows must reference
an existing action in exactly the same event or platform scope. Creator references are retained,
so removing a person cannot turn their scheduled action into a system action. Existing human
and system audit payloads and setting history are preserved; the migration creates no jobs or
reports. Older audit writers may omit the new source metadata during a rolling deployment.

Verification on 2026-10-02: full integration **633 passed / 4 existing skips**, server unit
**493**, and preparation/late-sync/report browser E2E **5** passed. Twenty-four new scratch
migration cases cover existing rows, legacy writers, retry/lease bounds, frozen documents,
deduplication, ownership and schedule-history references. All workspace typechecks, root lint,
architecture, hardcoding, generated settings, formatting and server build passed by exit code.
Only the three dedicated `_test` databases received the migration. No client layout or visual
baseline changed. This is storage only; no scheduler worker or close-out API was enabled.

Remaining: go-live guards and overrides, close/archive side effects, including the general
archived-write forbid and its Cedar context in P11. P10.4/P10.5 remain in progress; P10.6 has
not started beyond its shared storage prerequisite.
