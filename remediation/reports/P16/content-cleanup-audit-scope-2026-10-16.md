# P16 content cleanup audit scope and workspace query regressions

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


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

Application `c1f7fa0d` subsequently passed all five exact CI jobs in run
38904399858 and all three staging jobs plus Smoke in run 38907521645. Its ARM64
task image and all 73 deployed policies matched source. The original controlled
Root authenticated normally. Five actual task-role prefix simulations passed.

One newly reviewed plan matched the original DEAD global job at version 22.
One apply queued version 23; the normal worker succeeded on its first attempt.
Read-only verification retained the original DEAD and failed-retry audits,
confirmed the global scheduled scope and owner/target provenance, and observed
the dead gauge return to zero and the alarm naturally return to OK. The storage
intent completed with zero keys acknowledged; no physical deletion count is
claimed. The normal hourly successor later succeeded on its first attempt.

The existing multiday event passed all 11 fresh readiness checks, moved from
DRAFT through READY to LIVE, and retained its original people and assignments.
All 245 capture requests passed. The writer's final audit oracle failed because
it excluded the Root's actual off-station captures; a separate read-only
reconciliation verified the complete raw request and exact audit sets, without
repeating business writes. Six warmed-session proofs passed with genuine 302
recovery responses and old-session 401s within the unchanged 750 ms bound.
Earlier inconclusive timing observations and native failures are retained.

The following 438 selected import, scoped safety, role/query/pagination and
lost-and-found cases passed with their expected audits. The subsequent workspace
read batch stopped at a cross-event 404 missing `no-store`; its failure and the
[new privacy regression](workspace-privacy-error-headers-2026-10-16.md) are
tracked separately. These results do not close P16.10 or establish all-route
acceptance. No readiness, alarm, clock or authentication override was used.

The refreshed conservative cost estimate remains USD 93.44, including the entire
original seven-day allocation. The USD 100 ceiling and USD 50 alert remain.
Only P16.9's continuous soak is waived and recorded as skipped. Browser, deferred
acceptance, load, drills, restore, independent assurance, production and owner
go/no-go gates remain. The existing CDK advisory exception expires on 31 October.

References: [original repair report](role-safety-and-cleanup-regressions-2026-10-16.md),
[operator procedure](../P15/security-operations-runbook.md#staging-content-cleanup-retry),
[remaining P16 acceptance](../../phases/P16-verification.md).
