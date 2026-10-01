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

Capture tagging, import and summary propagation, card validation, separate stock calculations,
default report filters, labelled inclusion, the banner and lifecycle wiring remain outstanding.
P10.4 and P10.5 remain in progress.

Verification on 2026-10-01: server integration 504 passed / 4 previously skipped; server unit
467 passed; server typecheck (including seed and tests), root lint, architecture, hardcoding and
changed-file formatting passed. Prisma migration diff against `spoh2027_test` found no schema
drift (exit 0). No browser behavior changes in this storage slice.
