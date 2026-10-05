# Application coverage ratchet — partial P08.9

The Tests job now measures shared contracts, both server projects and the client
under V8 coverage, then runs a package floor check. Server scope includes routers,
app/config/main composition and every maintained source file, excluding generated
Prisma dependencies, tests and declarations. Shared scope includes versioned
generated setting contracts. Client scope includes the CSP startup module, now
imported from test setup rather than registered as a setup file that Vitest
automatically excludes. No application behaviour changes.

reports/metrics/coverage-floor.json holds measured line/branch floors for the
server, client and shared application packages. The checker compares exact
covered/total counters, validates file aggregates, requires complete maintained
source inventory and normalises Windows/POSIX paths. Missing reports/files,
malformed counters, source-scope omissions and rounded regressions fail. CI
compares floors with the PR base or previous main commit and refuses reductions;
initial establishment is allowed only when the previous tree has no floor file.
Phase closure must raise floors to the fresh comparable measurement.

Root npm run test:coverage measures configured workspaces and runs the same
check. CI uses its dedicated PostgreSQL service, explicit local test identity and
shared session configuration; server integration files stay serial. It replaces
separate unit/integration invocations with one instrumented run without skipping
either project. JSON summaries and LCOV artifacts are retained for seven days,
including failed runs, and provide reviewable counters independent of display
rounding. The checker has 16 passing checks, with fail-before-fix proof for its
initial implementation, reduced-floor comparison and whole-source inventory.

## Verification

The existing draft replay test previously selected the second audit by timestamp
position. Its clock is frozen, so both rows tie; an expanded run selected the
creation record and failed the version-two update assertion. The test now selects
exactly one update audit by action and entity while retaining count/version/body/
reason assertions. The focused instrumented suite passes all 24 cases in 17.31
seconds. The failed full measurement is excluded.

The first focused retry cannot reach PostgreSQL because the local Docker engine
pipe and preview listeners disappear. It runs no test cases and is excluded.
Docker startup then reports an inaccessible dockerInference runtime socket.
The two runtime socket directories are moved to new recoverable quarantines,
without deleting data/settings or either earlier recovery. The original
spoh2027-postgres container returns healthy with v1_spoh-pgdata on localhost5435.
No real local database is reset, seeded or migrated.

Fresh shared coverage passes 173 checks in 15 files; client coverage passes 505
checks in 59 files and measures all 413 source files, including the actual CSP
startup line. The fresh full server run passes 2,301 checks with four existing
skips across 158 test files in 629.22 seconds. It measures all 587 maintained
source files, including composition. Shared coverage measures 44 source files.

| Application package | Measured line floor | Measured branch floor |
| ------------------- | ------------------- | --------------------- |
| Server              | 95.20%              | 86.19%                |
| Client              | 71.50%              | 63.84%                |
| Shared contracts    | 51.66%              | 80.92%                |

Floors truncate only the stored percentage to two decimals; comparisons use raw
counters without rounding up. The actual three-package check passes, including
comparison against the previous committed tree where no floor yet exists. The
[sanitised measurement](coverage-ratchet-measurement-2026-10-05.json) retains full
counters and independently reports G5 scope observations. Server module domain/
application measures 96.61% lines and 89.14% branches. Client model/shared-library
measures 83.48% lines and 81.76% branches; its 90% line target is still unmet.

Workspace types, lint and architecture pass (1,099 modules/4,960 dependencies),
with maintained formatting and script/integration/full-history secret scans
clear. All three preserved P08 pricing fingerprints and historical P05 pricing
remain unchanged. Application source is byte-unchanged in this slice, so existing
32-page static export, browser/CSP and staging UI evidence is reusable. Normal
local previews are restored after the runtime recovery. Exact execution of the
new CI ratchet remains pending until its pushed run succeeds.

### First CI execution and deterministic cache-bus coverage

CI run 37314188045 on `75d19b3` executes all three coverage suites successfully:
173 shared checks, 2,301 server checks/four existing skips and 505 client checks.
The actual ratchet correctly fails server branches at 3,070/3,563 (86.1633%)
against the unchanged 86.19% floor. The seven-day `application-coverage` artifact
is retained even though the comparison fails. Every source file and all other
counters match the accepted local measurement. The sole difference is the
pending-reconnect branch in cache-bus stop: the two-instance integration
teardown sometimes stops while its other listener is reconnecting.

Seven deterministic transport tests now exercise stop during a pending retry,
duplicate disconnect callbacks, bounded backoff, stop during connection or
subscriber recovery, malformed notifications and subscriber isolation. Fake
transport/timers assert that stop cancels the timer and never opens another
connection. The focused checks and workspace types/lint pass. No floor is
lowered and no application code changes. The fresh combined run passes 2,308
checks/four existing skips in 159 files (606.83 seconds). It measures 5,455/5,720
lines (95.36%) and 3,079/3,563 branches (86.41%), above the unchanged floors.
The actual package ratchet and committed-base comparison pass. Formatting,
architecture and test/report/full-history secret scans remain clear.
The [CI evidence](coverage-ratchet-ci-evidence-2026-10-05.json) preserves the
first failed comparison and retained measurements. Replacement exact-head CI
execution remains pending.

## Remaining scope

This bounded application ratchet does not close P08.9 or G5. Seeded browser CI,
rollback rehearsal, Dependabot, park/unpark and other pipeline criteria remain
open. Access-policy coverage awaits its P11 package; G5 domain/application and
client model/library targets are reported independently of overall floors.
The completed staging capture scheduling consumer retains its separate P10
evidence. Production approval, event delivery and budget criteria remain open.
