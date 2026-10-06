# SPOH continuation handoff — 6 October 2026

The owner requested documentation and a next-agent takeover prompt at the end
of this run. Feature implementation is deliberately handed over unfinished;
that request is not an owner-controlled product blocker or acceptance waiver.
Read [the process handoff](HANDOFF-2026-10-06-PROCESS.md) and
[ADR-010](../../docs/adr/ADR-010-delivery-process.md) first, then this checkpoint.
The companion [takeover prompt](TAKEOVER-2026-10-06-MILESTONES.md) is copyable.

## Workspace, Git and programme state

Work only in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main` and explicitly
set every command workdir. The chat's original cwd is sibling `V1`; it was not
used for edits. Preserve all drafts. No reset, clean, forced completion, floor
reduction or scope deletion. D-11 authorizes Conventional Commits on main,
pushes and Remediation-Step trailers, without branches, PRs or tags.

Immediately before this documentation commit, main/origin/main match
`6c3bb6c2436c8659b84e9e0745b3f6bd51570d0a`. A later docs-only handoff commit may
advance those refs without changing the accepted application image. Verify
actual refs/status before editing. The original requested `a0d0c3a` checkpoint
was verified before this run's implementation; the inherited editor was
preserved and then released through the accepted milestone below.

Tracker: **107/171 steps closed** (104 done, three skipped), **9/17 phases
closed**. P00–P07 and P09 are done. Current pointer remains P10.8. P11.1 and
P11.2 are now done on observed acceptance; P11.3 remains in progress. P08,
P10, P11, P13.6 and G3–G5 retain their unfinished criteria.

## Accepted generated settings editor

- Source editor commit `97c76e502c4c3ff2a5032489a1d3c8be90d0199e` and narrow
  dependency repair `041c3caf9971a9c5b4ee09421845c6600e9e6d29` are pushed.
  Initial source CI failed the required audit and was excluded. Compatible
  proxy-addr 2.0.8 / source-map-js 1.2.2 repairs passed
  [full CI 37401120384](https://github.com/aadk979/SPOH_2027/actions/runs/37401120384)
  and [deployment 37401795434](https://github.com/aadk979/SPOH_2027/actions/runs/37401795434).
- The existing phone/station restore trace showed twelve real HTTP 429s from
  combined reads exceeding the unchanged Chief 300/minute bucket. Serial paced
  affected checks passed: four restores, eight editor journeys and eight
  retained reader/capture journeys. Stable retries and fixture restoration were
  verified; no rate-limit change was used. Original trace evidence was retained.
- All 92 visual checks passed after reviewing four changed existing images and
  twelve new form images. Static/CSP startup, types, lint, generated outputs,
  delivery checks, audit and unchanged coverage floors passed.
- Normal Cognito acceptance passed on exact image 041c3ca / task revision 134
  at 10:27 Singapore: phone reviewed SET, deliberately lost committed receipt,
  identical retry, provenance-checked public RESET, hard reload, laptop owned
  station reads and sign-out 204. READY and original values were restored.
  Across two excluded selector-failure probes and the accepted probe, six
  attributed SET/RESET history/audit records and id-only receipts remain;
  no override remains. Scoping a duplicate-text assertion fixed the harness.
- Full detail and source-bound evidence:
  [editor report](P10/operational-catalogue-edit-ui.md),
  [staging evidence](P10/staging-operational-catalogue-edit-ui-evidence-2026-10-06.json).
  Evidence commit d8048d3 passed documentation CI/release checks without another
  application deployment. The historical intermittent immediate-reload/session
  symptom is still not claimed fixed. Full P10.8 remains open.

## Accepted P08 / P11 / P13 prerequisite release

Application source `1063eeca4465eeb34fea02ad989efc9a0b5b5b5d` passed
[full CI 37405030559](https://github.com/aadk979/SPOH_2027/actions/runs/37405030559),
[read-only infrastructure diff 37405030437](https://github.com/aadk979/SPOH_2027/actions/runs/37405030437)
and [deployment 37405740146](https://github.com/aadk979/SPOH_2027/actions/runs/37405740146).
All five application jobs passed: server **2,419 + four existing skips**,
client **595**, shared **193**, infrastructure **69**, Cedar **80**; unchanged
coverage floors, audit and secret scan were retained.

The last accepted staging source is that exact 1063 image on healthy task
revision **135**, digest
`sha256:4708a247394f54e60a0912664ea7b1e5f9af677e71f0e7f21ac7b31fd6da690d`.
CloudFormation was UPDATE_COMPLETE; one desired/running task, zero pending.
Normal Cognito phone/laptop catalogue/history/reload/sign-out acceptance and
network-disabled exact-image compiled public metadata inspection passed at
10:57 Singapore. No admin write or changed original state was needed.
Recheck current cloud facts on resume; these are observations, not perpetual
claims. [Sanitized evidence](P11/staging-policy-prerequisite-runtime-evidence-2026-10-06.json).

- **P11:** new access-policies workspace preserves accepted P05 schema,
  policies, defaults and CHANGES.md byte-for-byte. Strict Cedar WASM 4.13.0
  checks include all 156 matrix cells and explicit C8 Card.GenerateBatch across
  all six roles. Generator/public shared export provides 65 unique actions,
  ten groups, 46 Editable actions, 45 approved floors, 19 locked entries and
  one unresolved visitor entry. Docker/lockfile/required CI integrate the
  package without introducing runtime enforcement or AWS policy calls.
  P11.1/.2 completion is supported by observed release criteria.
- **P11.3 stays open:** actual CI duration was **10,413.599067 ms**, over the
  explicit under-ten-second criterion. An uncommitted test-only optimization
  retains all 80 checks and 156 cells, exercises output boundaries using the
  production helpers, and retains real CLI smoke/floor validation. Latest local
  run passed 80 in **4,888.5269 ms**. Only a subsequent actual CI measurement
  can close P11.3. [Policy report](P11/policy-prerequisites.md).
- **P13.6:** pure readiness contracts/evaluators add 110 checks with focused
  141/141 lines and 138/138 branches. Strict complete-grid, snapshot and
  contradictory/stale/foreign evidence checks fail unavailable, nonwaivable.
  No fake Person.active, RolePermission versions or cloud evidence is supplied.
  Runtime checklist/lifecycle wiring remains absent; first LIVE stays guarded.
  [Readiness report](P13/readiness-prerequisites.md).
- **P08.8:** five native monitoring resources add an exact service/account/
  region/cluster STOPPED selector for EssentialContainerExited/TaskFailedToStart,
  a bounded privacy-preserving log message, retained 30-day log, fixed-cardinality
  Count filter and sparse alarm. No Lambda, new task grants or email actions.
  Scope is failure observations, not exact restarts or availability. Broader
  unhealthy replacements, placement/deployment failures, running-below-desired,
  notifications and measured D-10 cost remain open.

The actual P08 detector acceptance completed at **16:58 Singapore**: seven AWS
event-pattern and four filter probes, then one uniquely owned no-secret,
no-task-role standalone Node exit42 fixture. Exactly one real bounded log/count
was observed; OK→ALARM at 16:51:50 and ALARM→OK at 16:57:50. Exact original
rule/targets were restored, fixture definition deregistered, original application
task/image/count unchanged. EventBridge has no atomic ETag CAS: the harness used
serial read/compare/write/verify with durable intent/ownership and refused drift.
No spoofed event, metric injection, forced alarm or application interruption.
[Detector report](P08/task-failure-monitoring.md) and
[sanitized evidence](P08/staging-task-failure-monitoring-evidence-2026-10-06.json).
Ignored `.local/task-failure-monitoring-attempt-20261006.json` is completed with
all cleanup true and empty failure codes. Never delete/reuse an attempt ledger.

Evidence/docs commit **6c3bb6c** passed
[documentation CI 37440273704](https://github.com/aadk979/SPOH_2027/actions/runs/37440273704)
and [release check 37440357200](https://github.com/aadk979/SPOH_2027/actions/runs/37440357200).
Expensive application checks, image build and migration/deployment were skipped.
The accepted 1063 image was not redeployed just to match a documentation SHA.

## Uncommitted next milestone: category schedules and retry fencing

All current drafts are intentional and must be preserved. The
[category report](P10/category-schedule-controls.md) describes the source and
verification boundaries. Inventory:

- New shared `contracts/taxonomy/**` and root export; new server
  `modules/taxonomy/**`, admin categoryScheduleRoutes.ts and route registration;
  category creation/management/provenance/real-lock integration files and
  seven new isolation routes.
- New client `features/taxonomy/**`, four category screen test files and
  AdminSettingsScreen integration; two E2E files and category-schedules visual
  spec. All eight new phone/laptop visual baselines are still absent.
- Shared idempotency index/HTTP middleware changes, new attempt.ts and
  transaction.ts, new unit/integration idempotencyAttempt tests.
- Policy generationOutput.test.mjs optimization; P10 phase/report notes.
  No schema, migration, worker payload, grant or existing capture admission
  behavior changes.

The private producer reviews current activity/updatedAt and future event-clock
instant; edits/cancels independently review the schedule version. Creator-only
edit, current-manager cancellation, Event UPDATE first, fresh post-wait authority
and clock, id-only transactional receipts, immutable definition audits, no-store
and foreign/unsupported provenance fencing are retained. The worker still applies
absolute activity as ADR-004 requires; expectedUpdatedAt is a producer review
token, not a new category version or due-time CAS rule.

Independent review repaired an inherited idempotency edge: reserve can commit
before its response stalls; an abandoned takeover can finish before the original
handler enters. AsyncLocalStorage now carries immutable HTTP key/event/endpoint/
actor/timestamp ownership. Transactional lock/completion requires a real scoped
unfinished reservation and that attempt; response settle/release is conditional,
preserving a winner and a transaction's original private mutation receipt.
A second same-millisecond start/delayed conflict-read edge required a fresh
decision-time takeover context that strictly advances past the observed token
before CAS/dispatch. Both defects have failing-before regressions. The final
independent review found no remaining actionable issue in that branch.

Transient `/me` errors retain a matched owner's hidden/inert uncertain review
while blocking reads/writes; recovery retries the exact body/UUID. Confirmed
401/403, capability/person/event/clock loss purges it. Missing compatibility
metadata safely denies scheduling without crashing the existing settings screen.

Latest verification:

| Check                                | Observed result / limit                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| New shared/category producer         | 48 shared; 125 DB including 23 real races; 130 affected isolation/routes/RBAC/worker passed                                   |
| Retry core                           | 10 focused units; 16 real-DB cases; 712 complete server units / 60 files passed                                               |
| Affected DB replay suites            | 509 / 16 files passed before final fresh takeover branch; final rerun is incomplete and must be repeated                      |
| Client                               | 78 affected (68 category + 10 operations); full 663 / 67 files, 18.48s passed                                                 |
| Shared                               | Full 241 / 18 files, 1.85s passed                                                                                             |
| Policy                               | 80 pure checks, 4.889s local; actual new CI not yet run                                                                       |
| Lint / architecture                  | Passed during iteration; 1,185 modules / 5,384 deps, no violations; rerun affected final inputs                               |
| Generators / hardcoding              | Both generators fresh; no hardcoded source event values                                                                       |
| Application build                    | Shared/server/static 32-page client passed before final takeover and compatibility repair; rebuild changed server/client      |
| Workspace types                      | Complete workspace type check passes; `.local/handoff-category-types-20261006.log`; two test-only Prisma type errors repaired |
| Dependency audit                     | **FAIL**, newly reported bundled CDK brace-expansion high advisories; repair required, no exception added                     |
| Browser / visual / exact-image stage | **Not run for category milestone**; no release or broad completion claim                                                      |

The required audit log `.local/category-dependency-audit-20261006.log` names
GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 and GHSA-6j4f-fj2g-mc7p at
`node_modules/aws-cdk-lib/node_modules/brace-expansion` (affected 4.0.0–5.0.11).
Inspect the actual installed/lock dependency and upstream bundled fix; use a
compatible verified repair, not an automatic broad audit fix or a new exemption.
Root package/lock are unchanged by this new failure so far. Keep the existing
separately approved, path/advisory-bound CDK exception and expiry unchanged.

## Runtime and exact next actions

Node 24.19.0: prepend
`C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`
and repository `.local/node24-bin`. System npm wrappers otherwise launch their
adjacent Node 25. Every command needs this workspace's explicit workdir.

At **17:31 Singapore**, Docker/PG and ports 4012/4013/4014/3001/3002/5435 are
not listening; no workspace Node test/preview process was observed. This is a
runtime interruption, not accepted final DB verification. The final affected
rerun log contains only its RUN header. Do not assume a lost exec session passed.
Inspect processes/logs again before recovery or suite execution.

Docker had previously been recovered by moving only dead IPC runtime directories
to recoverable `.recovery-20261006-1710` paths after verifying no Docker process
was active. The original container **spoh2027-postgres**, mount
**v1_spoh-pgdata** and localhost5435 were confirmed healthy afterward. Prior
recoverable editor/1031 quarantines remain. Never reset Docker factory data,
delete these recoveries, create a replacement volume or migrate/reset/seed real
local `spoh2027`. Database roles stay exact: integration `spoh2027_test`, E2E
`spoh2027_rehearsal_shift_e2e_test`, visual frozen `spoh2027_visual_test`.

1. Verify Git/draft inventory, runtime and outstanding process state. Recover the
   existing Docker/container/volume if needed. Complete the final affected DB
   rerun; repair the dependency audit with focused affected infra checks.
2. Rebuild shared/server and static client after source is stable and the DB
   slot is free. No build or Prisma generation beside DB/browser suites.
3. Use root-owned ignored `.local/category-e2e-isolated-20261006.ps1` for an owned
   normal entrypoint/API plus static client on **4014**. Avoid another Next dev
   instance/lock. Set E2E_BASE_URL and E2E_API_ORIGIN to http://localhost:4014 and
   exact E2E_DATABASE_URL. Four prepared category journeys prove phone/laptop
   lost committed receipt→identical retry→edit/cancel and actual worker
   inactive→fresh restore→open booth/API admission. Public CAS/provenance cleanup
   restores owned effects; immutable synthetic receipts/audits remain.
4. Close the owned E2E process; build nothing during browsers. Start fresh frozen
   visual API **4013** with `.local/category-visual-isolated-20261006.ps1`.
   Target new eight screenshots; inspect them and any existing settings page
   differences before accepting baselines. Fresh full suite should total **100**
   (previous accepted 92 + eight new). Preserve nine membership rows/eight person
   markers using `.local/verify-capture-visual-markers.mjs`. Frozen priming/rate
   counters need a fresh API between baseline iteration and full acceptance.
5. Complete static/CSP, final types/lint/architecture/generators/audit/secrets and
   appropriate full coverage checks. Batch coherent feature/tracker source commit,
   push main, retain full CI and exact-image staging release. P11.3 closes only
   if the actual 80-check CI measurement is under ten seconds.
6. Root-owned prepared staging harness:
   `.local/check-staging-category-schedules-20261006.mjs <40-char-source-sha>`.
   Helpers `.local/category-staging-acceptance-20261006/**` have 13 pure guard
   checks and syntax/format checks. It is **unexecuted**: no category attempt
   ledger or staging evidence exists. Review before use. Normal Cognito, exact
   healthy source/digest preflight, exclusive durable ledger, 600ms API pacing,
   phone lost-response retry/edit/cancel, actual phone inactive/laptop fresh
   restore worker effects, unchanged unrelated baselines and own sign-out204.
   READY stays fixed; stage capture writes are excluded. Evidence is written
   only after actual checks and owned cleanup. Never reuse an existing attempt.
7. Publish later sanitized evidence through docs-only CI, preserving the accepted
   source/image. Then continue verified milestones for remaining P08, concrete
   P11/P13 prerequisites and broader P10/admin work under ADR-010. Follow-up
   legacy-consumer and observability analysis reports were not completed before
   this handoff; no additional implementation or acceptance is implied.

## Persistent owner and safety boundaries

The owner explicitly approved lowest-default floors for **45** actions. That
does not answer **D-15**, visitor-record permission eligibility: it remains
pending and default grants remain off. It blocks only the visitor portion of
P11.5/.7. Do not reinterpret “proceed” as choosing a visitor floor, or block all
independent work on it. P11 adapters/enforcement require actual current grants,
identity and lifecycle contracts; RolePermission storage/versioning is absent.

Production creation/cutover still requires the **28 October go decision**.
Real Cognito-pool changes, scaling, alarm/budget email, external device delivery
and production Firebase/session approvals remain protected. No Route53/ACM/SES;
no live Lightsail changes. Production sessions must work without third-party
refresh cookies. Installed Chrome is accepted for staging viewport checks;
actual iOS Safari evidence is waived only for that staging criterion.

An earlier automatic approval review rejected stopping an inherited preview
process. That action was not retried: separately owned terminal preview processes
were used and closed. On resume, inspect exact ownership and prefer an owned
isolated runtime; do not repeat a previously rejected kill command.
