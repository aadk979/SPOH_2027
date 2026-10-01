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

Remaining: complete default report/dashboard/export filters and labelled inclusion, explicit
card batch selection, import window selection in the UI, rehearsal shift logic and fixture/banner
updates, then audited lifecycle admission, transitions and close/archive side effects.
