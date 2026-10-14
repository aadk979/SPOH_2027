# P16 cloud readiness and observer repair — 14 October 2026

P16.10 remains in progress. The live API campaign found that go-live readiness discarded
cloud evidence and that a denied backup lookup suppressed the independently valid running-task
metric. This batch adds server-selected observations and repairs the existing observer. It
retains all lifecycle authority, freshness, unavailable-evidence and owner approval gates.

## Accepted evidence before this batch

The preceding deployment is `7cd5b6de238ff3fb89bf23bd35054f455a6b3053`:
[exact CI, five successful jobs](https://github.com/aadk979/SPOH_2027/actions/runs/38556358478),
[staging release, three successful jobs including smoke](https://github.com/aadk979/SPOH_2027/actions/runs/38559592646).
Its complete 29-step Node 24 local gate exited zero; 6,512 tests passed, with two retained
historical skips. All 73 deployed policies, their schema/statements/name map and the healthy
ARM64 task were verified against the source.

On that deployed image, the reviewed structure corpus completed 556 invalid-field cases,
104 semantic/readback cases and 152 authentication/policy refusals: 812 distinct cases. The
34 new synthetic QA rows were retired and original fixture fields and assignments restored.
Interrupted observations were reconciled without repeating their business writes.

The subsequent owned nonmembership campaign completed at 14:00:37 UTC with actual exit zero.
Seven distinct authenticated controlled accounts each exercised all 194 served event-scoped
routes against an unjoined synthetic event: 1,358 expected 404 refusals without resource/policy
details, plus 77 successful own-event controls. Own standing and assignments stayed unchanged.
The aggregate verified every inventoried method/path and the image, policy, inventory and
harness bindings. This establishes membership-before-validation boundaries; it does not
establish route success, field, station, foreign-object, quota or lifecycle coverage.

## Defects and repair

The real readiness response returned all three cloud items as unavailable. Its application
reader supplied null deployment/database/freshness and no alarm selections. Three fail-first
tests against the shipped reader reproduced discarded fresh observations, discarded post-lock
freshness checks and discarded known alarm failures. An additional shipped-scheduler test
reproduced the absence of preparation before business transactions. All exited one.

The observer's actual logs showed repeated `AccessDeniedException` at its native-resource
AWS Backup listing call. The exact dependent permission behind that generic denial was not
established. Three fail-first tests reproduced suppressed task metrics and accepted future or
malformed backup dates; they exited one. Read-only native RDS metadata confirmed that the
selected database had an available encrypted automated snapshot.

The repair:

- Selects the immutable task image, native regional API origin, exact database and all 20
  existing metric alarms from strict server configuration. No client-supplied evidence is accepted.
- Reads selected RDS/CloudWatch metadata with one bounded SDK attempt. Six native HTTP smoke
  checks each verify the immutable deployment response header. Missing, foreign, malformed
  or expired evidence remains unavailable. An observed current ALARM remains a known failure.
- Coalesces reads in a short process cache and replaces expired passing facts with current
  unavailability when a new read fails. Manual and scheduled callers prepare before business
  locks; current authority, claim fencing and the evaluation clock remain checked under locks.
- Uses native automated RDS snapshot metadata for the existing daily-backup observer, with
  exact identity/type/encryption checks and bounded pagination. Backup failure retains actual
  task observations, publishes conservative backup uncertainty and still fails the invocation.
  Service failure retains independently observed backup age without manufacturing task health.
- Removes the observer's Backup wildcard and grants only selected native snapshot reads.
  The app gains only its selected database and explicit alarm read permissions. Existing services,
  alarm thresholds, metrics, budget, retention and production approval gates are retained.

PITR freshness is limited to the five-minute RPO in ADR-008; a daily snapshot has its separate
26-hour alarm. Neither observation establishes restore rehearsal. The alarm catalogue is checked
against every synthesized metric alarm, and uses named ARNs to avoid a task/service/alarm cycle.
Native IAM scopes follow the official
[RDS authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_rds.html)
and [CloudWatch authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudwatch.html).

## Verification and remaining programme work

The complete 29-step Node 24/npm local gate exited zero at 16:49:50 UTC on 14 October
(15 October in Singapore), without resumed or inherited steps. The frozen 42-file batch
matched its source hashes. Application, policy and infrastructure suites passed 6,607 tests:
server 4,702, client 1,220, shared 348, policies 158 and infrastructure 179. The two historical
server skips remain. Server coverage is 96.69% lines / 88.26% branches; client is
80.23% / 71.80%; shared is 94.38% / 87.40%. All retained coverage floors passed.
Lint, types, deployment-image verification, architecture, dependency audit and history scans
passed. Affected database suites ran serially against only `spoh2027_test`.

The first full attempt passed its test suites but failed the unchanged 96.67% server line
floor at 96.6538%. Four additional runtime-factory regression tests exercise configured
collection, independent copies, cache expiry after provider refusal and clock rollback.
No floor or assertion was lowered. A later interrupted attempt had no terminal result and
was excluded from acceptance. Both attempts and the final coverage archive remain private.

Final staged secret/whitespace review, D-11 delivery, exact-SHA CI, staging deployment,
actual smoke/policy checks and repaired live readiness/observer observations remain required
at this report's source-verification checkpoint. The earlier deployment and its partial API
campaigns remain the latest accepted runtime evidence; the local gate does not accept a release.

P16.10 continues before browser/full regression, deferred acceptance, the real 24-hour soak,
load testing, resilience drills and restore rehearsal. Owner reviews, actual alarm receipt,
independent assurance, production/go approval and programme closure remain pending. No production
deployment, real-person recovery, alarm delivery acceptance or ASVS Level 2 claim is made.

Raw provider/mail identities, credentials, sessions, private API journals and failure proofs remain
in ignored local evidence. They are excluded from public source and delivery artifacts.
