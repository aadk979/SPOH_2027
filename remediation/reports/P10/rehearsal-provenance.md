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

Remaining: explicit card batch selection, import window selection in the UI, derived safety
acknowledgement/follow-up provenance, then audited lifecycle admission, transitions and
close/archive side effects. P10.4/P10.5 remain in progress.
