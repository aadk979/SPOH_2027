# P16 role, safety, session renewal and cleanup verification

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P16.10 remains in progress. Application `abfdd7ab` passed the complete 29-step
local gate, all five exact CI jobs in run 38782258226 and all three staging jobs
plus Smoke in run 38787089743. The deployed image and 73 policies were verified.
This report records the next coherent repair and regression batch; it does not
close the API inventory or accept browser, load, drills, restore or production.

## Accepted staging evidence

The original five role identities now have ACTIVE memberships and one assignment
each in synthetic event D. Selective reconciliation preserved successful writes
and created only the missing memberships and assignments. No invitation was sent,
no identity was recreated and the seventh, foreign-event actor remained outside D.
The native metrics reconciliation verified the original four unaskable refusals,
zero evaluator failures and the real OK alarm without replaying the requests.

All 80 visitor-field and permission read cases passed on the deployed image,
including missing, genuinely expired and invalid-signature access, both URL forms,
all six roles, foreign membership refusals and 24 matching denial audit records.
The original grants, unreviewed standing and 22 retired visitor fields were retained.

Separate event E covers 16–18 October with two stations. Existing accounts joined
through normal provisioning, actual credential revocation, provider authentication
and membership selection before assignments. Its five acceptance audits and 15
assignment audits were reconciled, with the original partial success preserved.
All eight local readiness facts passed. Setup failures caused by comparing an
unordered export and by treating assignment upserts as additional rows were
retained and corrected in the harness, without changing application contracts.

The first-live attempt failed safely after its bounded nine-minute observation:
the scheduler-dead alarm remained ALARM. E stayed DRAFT. The 245 capture role cases
and subsequent import, safety and lost-and-found staging batches have not run.
No readiness override, synthetic healthy metric or forced alarm state was used.

## Session renewal repair

A real controlled account's old access SID was accepted immediately after cookie
recovery had rotated its refresh session. The successful rotation path did not
evict its warmed local liveness entry. Two real HTTP integration regressions
reproduced the defect for refresh and first-party recovery: both returned 200 for
the old SID when 401 was required. The repair evicts that SID after commit, before
issuing the replacement. Both regressions and all 51 affected authentication tests
passed with the candidate repair. Retry grace, original family expiry and unrelated
sessions remain governed by their existing tests.

## Content cleanup and operator recovery

The shipped audit identified global `content.storage.prune` as DEAD after five
execution failures. Current worker logs continued reporting one dead action.
Read-only policy simulation confirmed exact-key reads/version deletion were
allowed while bucket listing was denied. The cleanup adapter treated only 404 as
absence. AWS documents that HEAD of an absent object returns 403 when the caller
lacks bucket listing. This explains a cleanup failure mode; the failed occurrence's
sanitized audit alone does not prove its underlying S3 response.

The repaired adapter checks an exact key with a one-result, prefix-constrained
list only after HEAD returns 403. An existing exact key preserves the original
denial; a failed list still fails cleanup. Exact immutable version deletion and
publication/reference fences remain intact. IAM permits these existence checks
only beneath `drafts/*` and `content/*` in the same private content bucket. Root
listing, version listing, ACL access and migration-role S3 access remain denied.
Five new storage regressions failed against the original adapter and passed with
the repair; the revised policy regression also failed before the IAM repair.

The new operator command is staging-only, defaults to a read-only plan and targets
only the exact global recurring content-cleanup action. Apply requires its reviewed
version, a reason and an operator reference. It locks and rechecks eligibility,
queues one explicit retry and records the exhausted attempt in a transactional
`schedule.retry` audit. Existing failure audits are preserved. It exposes no HTTP
route and cannot retry user/event actions, active leases or other job kinds. Startup
does not silently reset dead work. See the linked operations procedure below.

The five role/safety candidate files include 160 previously passing local tests
and matched malformed-request corpora. Their staging coverage remains pending.
The two session regressions, cleanup tests and operator-command tests are part of
this batch's required fresh whole-source verification.

## Verification and delivery

The fresh 29-step Node 24/npm gate exited zero at 2026-10-16T07:41:17.7444840Z, with all 20 frozen
source files unchanged and no inherited steps. It passed 8,849 tests: server 6,944,
client 1,220, shared 348, policies 158 and infrastructure 179, plus the two retained
historical server skips. Server coverage was 96.72% lines / 88.47% branches;
client 80.23% / 71.80%; shared 94.38% / 87.40%. All unchanged floors passed,
including the 96.67% server line floor. Types, lint, image/build/CSP, architecture,
hardcoding, dependency audit and both secret scans passed. Complete coverage was
archived privately. The bundled-CDK advisory exception still expires on 31 October.
This establishes local acceptance only; exact CI, staging and provider rechecks are separate.

Keep original failing native results, raw HTTP receipts, code/corpus hashes and
complete coverage privately under `.local`. No private tokens, browser profiles,
mailboxes, provider secrets or raw logs are published. Docker interruptions were
recovered without deleting images, volumes or settings; a permanent vendor fix is
not established.

After exact CI, review the pinned CDK permission diff, deploy the repaired staging
image/policy, run the operator dry run and reviewed retry, then verify the real
worker outcome and natural alarm recovery before another go-live attempt. Recheck
the warmed old SID on that image. No current repaired-image acceptance is claimed.

The fresh cost observation retained the entire original seven-day allocation:
lagged gross charges excluding credits/refunds plus that allocation totalled
USD 93.44 under the USD 100 ceiling. The USD 50 alert and all cost/production,
identity, assurance and owner gates remain. Only the 24-hour soak is waived and
recorded as skipped. The existing CDK advisory exception expires on 31 October.

References: [AWS HEAD semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html),
[operations procedure](../P15/security-operations-runbook.md#staging-content-cleanup-retry),
[P16 remaining acceptance](../../phases/P16-verification.md).

## Later native outcome on 16 October

Exact CI 38868830891 and staging deployment 38876134722 subsequently passed on
`e1dae8d6`, including Smoke, exact deployed policy bytes and original Root sign-in.
The one reviewed cleanup retry then exhausted five worker attempts. RDS native
logs identified a scheduled-audit scope mismatch, including at the original
15 October terminal failure. The S3 cause above was an inference; the database
refusal now establishes that terminal failure's cause. Cleanup recovery and
first-live remain unaccepted. See the [audit-scope repair and regression report](content-cleanup-audit-scope-2026-10-16.md)
for the next coherent batch and retained failure evidence.
