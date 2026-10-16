# P16 content cleanup audit scope and workspace query regressions

P16.10 remains in progress. Application `e1dae8d6` passed all five exact CI jobs
in run 38868830891 and all three staging jobs plus Smoke in run 38876134722.
Its ARM64 task image and all 73 deployed policy statements matched source, and
the original controlled Root authenticated normally. Those results accept that
release; they do not establish cleanup recovery or complete API coverage.

## Actual cleanup recovery failure

Five read-only task-role simulations confirmed that content-bucket listing is
allowed only beneath the owned draft and content prefixes. Outside, bare and
omitted prefixes were denied. One operator dry run matched the original exhausted
global cleanup occurrence at version 11. One reviewed apply exited zero and queued
version 12 with attempt zero, using the existing app task definition and role.

The normal worker exhausted five further attempts with `EXECUTION_FAILED`.
The existing alarm briefly returned to OK while the action was pending; that
was not successful recovery. No first-live or downstream capture, import,
safety, lost-and-found or workspace staging batch was admitted from that signal.
No second operator apply was issued for this failed release.

Read-only RDS native logs identified the database refusal: “Scheduled record must
name its action scope”. The cleanup audit replaced its global scheduled action's
scope with the storage intent's owning event. The existing audit trigger correctly
rejected that cross-scope scheduled-action reference, rolling back database
cleanup and completion. The retained RDS log at the original terminal failure on
15 October contains the same refusal. This establishes that terminal failure's
cause; the earlier missing-object S3 explanation was an inference. The separately
reproduced S3 absence-handling repair and narrow permission remain covered by their
existing regressions.

The first read-only recovery observer also rejected a CloudWatch continuation
token. Its failure is retained. A versioned reader followed bounded pages and
exposed the real worker failures without changing the completion oracle or
repeating the operator apply. Original DEAD audits and native failures are retained.

## Source repair and regressions

Cleanup now preserves its caller's audit scope and scheduled-action attribution.
The owning and target event IDs are recorded as audit provenance. The database
trigger, storage ownership and publication fences remain unchanged.

Three real Postgres scheduler tests cover successful global cleanup with matching
audits and one recurring successor, transactional audit rollback followed by safe
retry of already absent bytes, and continued database refusal of a mismatched
event/global scheduled-action reference. Against the original source, both
success regressions failed with PENDING instead of SUCCEEDED; the SQL refusal
control passed. Their failing source and native result are retained privately.

The same coherent source batch promotes the previously private workspace query
corpus into maintained HTTP regressions. Two tests exercise both URL forms, each
with 133 malformed queries and 13 successful controls, then verify unchanged
stations, assignments, footfall, gifts, incidents and business audits. These are
266 malformed-query cases and 26 controls inside two tests, not 292 additional
test-runner passes. Earlier private-only proof is not attributed to the delivered
8,849-test release or its public CI.

Full-gate preflight also found four historical migration suites that still created
additional databases. They now replay the same historical migrations and retain
their original assertions in randomly named owned schemas within the sole
`spoh2027_test` database. The shared test URL guard runs before constructing a
client. Qualified migration functions are relocated to the owned schema;
database/schema creation and search-path overrides in migration input are refused.
Teardown checks that public columns, functions, constraints and triggers are
unchanged, then removes only its owned schema. Ten unit cases exercise namespace
relocation and unsafe identifier/DDL refusals. No additional database, administrative
database connection, lowered assertion or new skip is required.

## Verification and remaining acceptance

All 102 affected tests passed across nine files, including the four migration
suites and ten namespace safety cases. Focused lint and assembled server/test
types passed. The 146 promoted workspace descriptors exactly match the retained
private canonical corpus. Complete-source and exact-CI acceptance remain separate.

The fresh 29-step Node 24/npm gate exited zero with all 15 frozen files unchanged
and no inherited or resumed steps. It passed 8,864 tests: server 6,959, client 1,220,
shared 348, policies 158 and infrastructure 179, plus the two retained historical
server skips. The 15 additional runner tests comprise three cleanup-scope tests,
two workspace HTTP tests and ten migration-namespace cases.

Server coverage was 96.72% lines / 88.49% branches;
client 80.23% / 71.80%; shared 94.38% / 87.40%. All unchanged floors passed,
including the 96.67% server line floor. Types, lint, image/build/CSP, architecture,
hardcoding, dependency audit and both secret scans passed. Complete coverage was
archived privately. This establishes local acceptance; exact CI and repaired-image
operating evidence are separate.

A repaired release still needs exact-SHA CI, one guarded staging deployment,
current image/policy/provider proof, a newly reviewed concrete cleanup plan and
normal worker/audit/alarm recovery before first-live verification. Natural hourly
successor execution and the prepared API families remain operating acceptance.
No readiness, alarm, clock or authentication override is permitted.

The refreshed conservative cost estimate remains USD 93.44, including the entire
original seven-day allocation. The USD 100 ceiling and USD 50 alert remain.
Only P16.9's continuous soak is waived and recorded as skipped. Browser, deferred
acceptance, load, drills, restore, independent assurance, production and owner
go/no-go gates remain. The existing CDK advisory exception expires on 31 October.

References: [original repair report](role-safety-and-cleanup-regressions-2026-10-16.md),
[operator procedure](../P15/security-operations-runbook.md#staging-content-cleanup-retry),
[remaining P16 acceptance](../../phases/P16-verification.md).
