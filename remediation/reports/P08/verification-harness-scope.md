# Infrastructure test selection correction — 4 October 2026

During private-media verification, Vitest was invoked from the repository root
with the infrastructure config, which previously specified only a timeout. Its
default file selection included unrelated server/client tests. The invalid run
is excluded from verification evidence.

The database reset guard refused real local `spoh2027` before its first DELETE.
A read-only snapshot and inspection were taken in the ignored local recovery
directory. A timestamp query initially included old January fixture audits;
their PostgreSQL transaction ages established that they were pre-existing.
All 32 public tables were inspected with SELECTs: every existing row version
predated the attempted run by over three million transactions. No recent row
writes were found. No real-database reset, seed, migration, cleanup, row deletion
or audit edit was performed. The snapshot remains recoverable and Git-ignored.

The infrastructure config now resolves its root from its own file and explicitly
includes only `test/**/*.test.ts`. The same root-directory command subsequently
selected exactly ten infrastructure files and passed all 61 checks. Correctly
scoped real-Postgres media checks used `spoh2027_test` and passed separately.
