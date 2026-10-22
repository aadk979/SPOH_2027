# Takeover checkpoint — P14 accepted, P15 source in progress

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


Owner requested a written record, a takeover prompt and completion status on
**12 October 2026, Singapore time**. Feature work stops at this checkpoint; only
handoff documentation and read-only status checks were performed in this turn.
This is the latest continuation record. Earlier handoffs and the opening sections
of older build reports are historical checkpoints, not current status.

## Protect this checkout

- Work **only** in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`.
  The inherited cwd points to sibling `V1`; never inspect or modify it. Set an
  explicit V1-main workdir on every command and absolute V1-main paths on edits.
- Preserve all tracked, untracked and staged work. Do not reset, clean, pull over
  edits, replace the checkout or create a new worktree. Discover unfamiliar paths
  with `rg --files` before reading them.
- Branch `main`. HEAD and local `origin/main` are both
  **`3bff8f868d1c8ac2510bff749d3f205e56ae36cd`**
  (`feat(workspace): finish interlinking, notices and accessible workflows`).
  No P15 commit or push exists.
- Before these handoff edits: **217 tracked modified files, 93 untracked files,
  zero staged files**. No deleted tracked path was found. The exact final handoff
  inventory is [checkpoint-files-2026-10-12.md](P15/checkpoint-files-2026-10-12.md).
- `.local/` is ignored and can contain credentials, personal data and private logs.
  Never stage, upload or publish it. References below identify local evidence;
  they do not authorize publishing its contents.
- No previous feature subagent remains active. Work is saved in files; do not
  wait for old agents to finish. A read-only handoff-status reviewer completed
  during this checkpoint. No known V1-main Node/bash/npm runner was found in the
  process snapshot; inspect processes and actual completion evidence again before
  starting any database suite.

Read this handoff first, then ADR-011, the AWS teardown record, README resume
protocol, DECISIONS, engineering standards, P15 and both P15 build plans. Read
`client/AGENTS.md` before client changes. Read P16 before preparing its campaign.
Earlier detailed P14 handoffs need only be consulted for a particular feature;
do not restart completed foundation/P13/P14 work.

## Exact project completion status

`remediation/tools/progress.mjs status` and `remediation/progress.json` were
reconciled at this checkpoint:

| Area | Current status |
| --- | --- |
| P00–P11 | Phases complete |
| P12 | 7/8 done; P12.8 owner-blocked production/go decision |
| P13 | 10/10 done |
| P14 | 10/10 done; phase explicitly marked done |
| P15 | All ten steps started; **0/10 accepted** |
| P16 | **0/10**, not started |
| Entire tracker | 174 steps: 150 done, 3 historically skipped, 10 in progress, 10 not started, 1 owner-blocked |
| Closed count | 153/174 = **87.9%**, including historical skips; done alone is 86.2% |
| Phases | **14/17 complete** |

These percentages count tasks, not effort, security conformance or production
readiness. P15 has substantial source and test authoring that is deliberately not
counted as accepted. P16 contains real staging acceptance, a real 24-hour soak,
load, failure drills and restore work. Production/cutover is still owner-gated.

G0, G1 and G2 are persisted as passed; G3, G4 and G5 are pending. The CLI derives
G4's prerequisite phases as complete now that P13/P14 are done, but the stored G4
gate remains pending. Reconcile that distinction through the documented tracker
workflow; do not equate its derived display with an owner sign-off or silently
mark production ready. The tracker currently points to P15/P15.10 because all
P15 steps were started together; it does not mean only the report remains.

## P14 completed and delivered

The entire preserved P14 batch, **659 staged files**, was committed directly to
main under D-11 and pushed as `3bff8f868d1c8ac2510bff749d3f205e56ae36cd`.
The latest appended sections of [P14/build-2026-10-11.md](P14/build-2026-10-11.md)
supersede its earlier unverified checkpoint text.

The complete Node **24.19.0** gate `ci-local-20261011T1811Z` ran every step with
no resume/skip arguments and retained **actual exit 0** at
`2026-10-11T18:46:55.4896498Z` (12 October Singapore). Local evidence:
`.local/p14-full-gate-exit.json` and `.local/ci-local-20261011T1811Z.log`.
All 26 steps returned zero, including explicit-test-DB migration, complete suites,
builds, lint/types, architecture, raw coverage, dependency and secret checks.

| Suite | Accepted P14 complete-run results |
| --- | --- |
| Server | 273 files; 3,387 passed; two existing skips |
| Client | 110 files; 1,199 passed |
| Shared | 26 files; 299 passed |
| Policies | 85 passed |
| CDK | 20 files; 104 passed |
| Total passed | **5,074** |

Coverage floors were raised from actual raw counters, without lowering earlier
floors: server **96.67% lines / 87.11% branches**, client **79.77% / 71.39%**,
shared **93.96% / 84.41%**. The two existing skips remain visible. The dependency
result is no unexcepted High/Critical advisories; the documented CDK bundled
brace-expansion exception remains through 31 October. Do not claim zero advisories.

Exact-SHA [CI38243217914](https://github.com/aadk979/SPOH_2027/actions/runs/38243217914)
finished at `2026-10-12T11:44:29Z`. All five jobs succeeded: classification/tracker,
secrets/dependencies, tests, lint/typecheck/build, architecture. This was rechecked
read-only during the handoff. P14.1–P14.10 and P14 phase are closed in the tracker.

P14 delivered the scoped workspace/search/entity/record surfaces; linked homes,
collections and truthful dashboard totals; import undo/redemption void/exact-UUID
salvage; durable notices/preferences/delivery; public approved branding and frozen
export context; feedback/confirmation/accessibility source repairs; and strict
browser campaign fixture/spec authoring. See its build, notification, journey and
policy-review reports for the detailed feature record. The complete gate also
finished prior partial fixture/type/lint repairs. **Browser/visual/keyboard/axe and
owner copy acceptance have not run**; they remain P16.1/P16.8.

## P15 saved implementation — source only, not acceptance

The following source and authored regressions are preserved. Some components have
focused lint/type checks; the assembled source is not yet accepted. No P15 database
suite, migration apply, complete gate, commit/push, browser run or AWS deployment
has occurred. Verify current files instead of treating earlier worker completion
messages or design drafts as final evidence.

### Shared quotas, denial audit and monitoring

- Replaced process-local limit/denial storage with parameterized PostgreSQL
  UNLOGGED counters: tier namespaces, hashed scope/subject, atomic UPSERT windows,
  generation-fenced reset/refund, bounded expiry cleanup and no memory fallback.
- Request-charge AsyncLocalStorage carries the exact charged generation into
  finish callbacks; pending refund and denial work has explicit settle seams.
  Denial counter claim and first security audit are one transaction.
- Central maintenance composes global `quota.prune`; test reset drains pending
  work and removes the new tables in dependency order.
- Authored `quotaCounters`, `quotaAdmissionFailure`, `quotaRequestCharge` tests
  cover independent apps/pools, exact concurrent counts, reset/expiry/prune,
  foreign callback context, database failure and audit rollback. Existing settings
  and enforcement fixtures were adjusted for awaited resets.
- Infra adds scoped main-branch OIDC access, dispatch-only deployed-policy/case
  hash permission-matrix checks, and denial/policy-change monitoring. A source
  workflow is not evidence of a nightly run or delivered alarm.

Key paths: `server/src/platform/http/{quotaCounterRepo,quotaKeys,quotaRequestCharge,
dynamicRateLimitStore,authorizationDenials,rateLimit}.ts`,
`infra/cdk/src/{permissionMatrix,avpDeployed,stagingPermissionMatrixAccess}.ts`,
`.github/workflows/staging-permission-matrix.yml`.

### Static CSP, runtime configuration and HTTP safeguards

- Pure `@spoh/shared/static-client` schemas/policy plus a parse5 Node export
  generator produce adjacent `client/out.csp.json`, manifest version 1: complete
  POSIX HTML inventory, raw document SHA-256 and sorted executable-script hashes.
  Server/Firebase adapters recompute actual bytes and script hashes and fail
  closed on stale/missing/malformed metadata, including 404 documents.
- Per-document enforced CSP has no permissive inline/eval keywords; inline style
  attributes are removed through finite linked CSS classes. Both serialized CSP
  and aggregate headers have explicit budgets, including the project 8 KiB CSP
  maximum. RSC/assets/workers retain their appropriate mappings and cache rules.
- Express selects the final mapped/branding HTML; Firebase request rules account
  for clean URLs, event aliases, pre-rewrite matching and special custom 404.
  Avoid overlapping effective CSP policies. Public branding stays linked CSS.
- Public client configuration is strict **version 2**, with required nullable
  trusted `mediaOrigin`. Producer, parity validator, central fixtures, package,
  Docker and workflow source have been coordinated; whole-build parity is pending.
- Production cookies use `__Secure-` names, Secure/HttpOnly, host-only scope and
  the narrow auth path. Production reads only the new refresh cookie and expires
  legacy names. Cross-site refresh SameSite and same-site OAuth state are explicit.
  Infrastructure requires the cross-site-cookie setting instead of guessing it.
- Mutating auth HTTP accepts an exact allowed Origin or absent Origin with proven
  same-origin Fetch Metadata and JSON; missing/null/evil/safelisted cross-site
  requests refuse. OAuth GET callback retains its separate state/PKCE proof.
  Client sign-out now sends JSON content type.
- Production config requires canonical HTTPS origins, no cookie-domain override,
  distinct overlap signing keys, and validated Cognito provider origin. Hosted
  exchanges use bounded HTTPS fetch with redirect refusal.
- Logging now serializes safe path/method/status and fixed error categories;
  OAuth query, redirect Location, cookies, authorization, provider bodies, nested
  errors and raw Prisma diagnostics must not enter logs. Real final-Pino-sink
  sentinel test source was added, not merely input-object assertions.

Tests include generator/host/Firebase/shared CSP contracts, `authHttpSafeguards`,
`securityLogOutput`, config and static export cases. Browser CSP hydration,
injected-script/style refusal, RSC/reload, 404 and two-origin branding assertions
are authored only. Real headers/HSTS readiness/grade A/Cognito cookies/Firebase
behavior remain P16; no browser execution or baseline refresh is authorized now.

### Credential boundaries, current authority and cards

- Session issuance, refresh, handoff and MFA use Person-first fences and current
  active/unerased identity/membership/MFA checks. New families have fixed absolute
  lifetime at most 30 days, stricter administrator limits, and retained verified
  `authenticatedAt` from provider `auth_time` rather than token `iat`.
- Rotation preserves family boundaries. Legacy NULL absolute expiry now requires
  a retained oldest session with matching successful `session.create` audit proof;
  missing historical roots refuse refresh and require fresh sign-in. Test this
  behavior and describe that history limit; never mint a new sliding 30-day limit.
- MFA completion creates a new full SID and fresh refresh cookie, leaving the old
  restricted SID unusable. Hosted scopes include the MFA SDK's required scope.
- Remote device revoke requires the actual requester SID and verified auth age
  at most five minutes, sampled after lock waits; missing/future/stale values refuse.
- Public `invalidatePersonCredentials(tx, {personId, reason, at})` revokes newly
  live sessions, preserves prior revocation metadata, clears **all** provider
  envelopes including terminal sessions, deletes handoffs and publishes invalidation
  transactionally. Terminal history retention is separately fixed at 30 days.
- Role/profile/provision/import/lifecycle changes use current authority and sorted
  locks. CSV actual role changes require People.AssignRole/granted-rank proof;
  same-organisation identity reuse does not authorize foreign-only adoption or
  arbitrary global profile edits. Provider IO is followed by a fresh authority/CAS
  check before business binding. Lifecycle provider calls carry stored subject proof.
- Central capture admission rechecks the exact action, current Person/Membership,
  own assignments/shifts and station under held locks, retaining late-sync/phase
  semantics. Global audit rows are no longer included in every event audit feed.
- Card generation, issue, group link, print, void and reissue now have current
  authority, sorted card locks and intent-bound minimal durable UUID receipts;
  client retries retain the same intent. Held print/storage versus issue/void/
  replacement/group and standing/archive race test sources are saved.

New test sources: `credentialBoundary`, `rosterIdentityBoundary`,
`cardAuthorityLocks`, `cardMutationReceipts`, `card-correction-retry` and
`requestIntent`; existing auth/lifecycle/handoff/capture/print fixtures are updated.
Their presence is not a passed-race claim.

### Durable provider account and invitation stages

- `IdentityAccountOperation` records CREATE_STARTED before external creation,
  PROVIDER_READY independently after exact provider proof, and BOUND atomically
  with business binding. Pool/email digest advisory locks, planned Person UUID,
  immutable operation marker, profile/subject digests, generation/lease and CAS
  protect resumable work. Same-account BOUND retries require actual current proof.
- Cognito creation is SUPPRESS only, with no forced alias/groups/password grant.
  UsernameExists reconciliation requires the app-owned immutable operation UUID,
  exact normalized email/name, verified email, status, enabled state, subject and
  provider username; unknown/manual/restored accounts are not silently adopted.
  All SDK calls are one attempt with a ten-second abort deadline.
- Resend/MFA/disable/enable require exact stored-subject proof and mutate the
  verified provider Username. Disabled identities are accepted only where needed
  to prove a legitimate enable operation.
- Invitation is a separate durable post-BOUND stage. Current permission/identity,
  pool-wide UTC allowance and STARTED/audit commit **before** delivery. Default
  allowance is 50/day, no SES. ACCEPTED means provider acceptance, not mailbox
  delivery. STARTED/DELIVERY_UNKNOWN never automatically resend/refund; intentional
  resend uses a fresh UUID and consumes another reservation. Retry initial invite
  with the same bound account operation ID.

Key source: `platform/db/identity{Account,Invitation}Repo.ts`,
`platform/identity/{accountProfile,accountOperation,invitationDelivery,deliveryQuota,
cognitoIdentityProvider}.ts`. Strict lifecycle/provision/import/ambiguous-delivery
regressions are authored. Verify every old delivery path uses the staged boundary.

### Identity recovery and production bootstrap

- New public `modules/identityRecovery` separates readonly plan, explicit apply
  and explicit post-BOUND invite. Plans are strict version 1, recent/bounded,
  unique Person IDs and fingerprints, without raw profile/subject data.
- Operator authority comes from a verified API access JWT, current full SID,
  recent verified authentication and actual organisation Cedar ManageAdmins. It
  works for a real organisation with zero events; no invented event bypass.
  Apply holds sorted events/people, rechecks every relevant organisation and
  excludes self-recovery. Target must remain active, unerased and eligible.
- Apply uses the durable account stages; after provider IO it rechecks operator,
  profile and old-subject CAS, then atomically rebinds, invalidates all credentials,
  audits and BOUND-commits. Memberships and operational record IDs remain intact.
  A failed database bind can resume from PROVIDER_READY without another create.
- Import-safe `server/scripts/recover-identities.mjs` defaults to dry-run, requires
  dedicated explicit DB/skip-dotenv/pool/org/operator inputs, stores private plans
  only under `.local/identity-recovery/`, refuses overwrite, and imports compiled
  public services after a server build. Operator token stays in environment, never
  argv/output. Apply/invite require reviewed plan, reason and owner reference.
- Unsafe `sync-cognito-subs.mjs` email-map/direct writer is retired into a safe
  compatibility delegate. It was confirmed unchanged before replacement.
- `identityRecovery`, `recoveryPlan`, `recoveryCli` test sources cover readonly
  planning, zero-event organisation, stale/restricted sessions, preserved record
  IDs, atomic invalidation, post-IO authority/profile refusal, audit-failure resume,
  competing workers and ambiguous/accepted invitation quota behavior.
- Last root authoring added `server/prisma/bootstrapAdmin.ts` and production seed
  routing: explicit organisation/provider identity/owner reference, exact GET
  proof, first new administrator only, exact idempotent existing-admin replay,
  no promotion of an existing ordinary identity and attributed audit. Development
  fixtures remain development-only. **This newest helper is incomplete/unverified**;
  see immediate repairs below. No production seed/recovery command was executed.

### Media, frozen content storage and privacy

- Issued media keeps its original key as external identity but verifies bounded
  HEAD/version/ETag-bound streamed bytes, magic and full Sharp raster decode,
  limits dimensions/frames/concurrency, strips metadata and serves an immutable
  normalized derivative with trusted type. Missing rehearsal issuance proof refuses.
- Deterministic derivative keys reconcile conditional writes and allow retention
  cleanup even when a later SQL rollback left no ValidatedMedia row. Event locks
  serialize validation/read against purge. New hostile byte/decode/deadline/race
  source regressions are saved; original overwrites cannot replace served bytes.
- Content publication/clone pins full validated bytes and a frozen image manifest.
  `ContentStorageIntent` is a durable prewrite plan, including target event UUID
  before clone creation. Preflight commits the intent; execution rechecks current
  authority/review under locks. Scheduled action ID is intent ID; older actions
  without a plan fail safely and require rescheduling.
- Global hourly `content.storage.prune` handles a bounded six exact keys per run,
  protects publication/body/manifest/upload references, uses version-aware deletion,
  retains retry on failure, and needs no ListBucket or new paid service. Intent
  cleanup is at least one hour after the planned run; expired execution refuses.
- Personal export adds safe organisation/attendance/assignment/swap/briefier-slot
  and recovery operation metadata; no peer contact/free text/credential/digest/raw
  provider data. Responses are no-store. There is no invented briefing audience
  relation in the database.
- Repeated explicit erasure and staff retention invalidate every credential,
  remove target-owned invitation rows before account journals, clear mutable
  archived incident/follow-up/holder/swap text and membership notes/lastSeen, and
  retain operational IDs/counts and audit attribution. Other-subject journal actor
  attribution remains. Confirm unbound planned-person journal handling separately.
- Frozen ReportSnapshot free text, immutable audit/scheduled artifacts, Cognito
  provider data and backups remain distinct retention cases. S3 export 90-day
  expiry does not erase the immutable database report; do not claim universal
  erasure or owner approval for indefinite snapshot retention.

New source tests: `imageValidation`, `s3ImageValidation`, `contentStorageIntent`,
`privacyCompletion`, existing media/content/retention fixtures. Contracts/schema
are central and already integrated, but whole-build evidence is pending.

### Infra secrets and security review preparation

- CDK task signing secrets use explicitly persisted current/previous VersionIds
  of the same ARN, with preload/flip/retire overlap; no implicit AWSCURRENT adoption.
  Session-version context tooling and synthesis test sources are saved.
- Cognito has no application API auth flows, refresh rotation grace ten seconds,
  immutable `custom:spoh_operation` excluded from public readable/writable fields.
  App task IAM is own-pool create/get/disable/enable only; no update/delete/list/
  role-group privileges and no unnecessary migration-task identity access.
- Content delete/version-delete IAM is constrained to existing owned prefixes;
  no ListBucket or new service. `verify-cognito.mjs` bounds HTTPS fetching and
  redirects and has expanded mocked regression source.
- Official ASVS **5.0.0** input and an individual-control draft exist locally:
  `.local/asvs-5.0.0-en.flat.json`, SHA-256
  `33ea20d6fe9ca46b4a6336954f480a1d3ffa57af0fc25ab569e4f5788193bb99`, and
  `.local/p15-asvs-matrix-draft-20261012.md`, all **253 L1/L2 controls**
  (70 L1, 183 L2). These are pre-implementation observations, not conformance.
- Local backlog/prereview/authority/privacy/design maps are preparation artifacts
  and often still describe pre-P15 source. Update findings against the saved code
  and actual evidence; do not copy their obsolete pending-P14 statements.
- `/security-review` is not an available capability. No such command ran. An
  independent manual **full diff from baseline
  `d2497b6332bd32758f24fd832a01a4d14524c4f0`**, including untracked source,
  remains required. Record the limitation and repair concrete High findings.

## Central schema and additive migration

`server/prisma/schema.prisma` now defines the following source additions:

- `IdempotencyRecord.requestHash`: nullable SHA-256 for bound HTTP intent;
  completed legacy NULL-hash receipts replay only; unfinished legacy work refuses.
- `RefreshSession.authenticatedAt`: nullable verified authentication time.
- `RateLimitCounter`: UNLOGGED SQL table, namespaces/digests/generation, BigInt
  current/previous counts, fixed window/expiry and pruning/reset indexes.
- `IdentityAccountOperation` and `IdentityInvitationAttempt`, their state enums,
  organisation/person/actor relations and constrained progress/uniqueness.
- Event-owned immutable `ValidatedMedia` and its Person issuer relation.
- `ContentVersion.imageManifest` default array; its existing reject-all-update
  trigger already protects the newly added field.
- Event-owned `ContentStorageIntent` with existing authorized source Event FK,
  planned targetEventId **without FK intentionally before clone creation**,
  planned version ID, exact keys and cleanup deadline.

The authored additive migration is
`server/prisma/migrations/20261012123000_p15_security_boundaries/migration.sql`.
It was generated via read-only Prisma diff from the exact P14 schema, then augmented
with CHECKs, immutable-media and account/invitation transition fences. Terminal
invitation SQL explicitly rejects NULL finishedAt, avoiding CHECK's NULL loophole;
BOUND provider metadata is explicit/nonempty. DELETE remains allowed for privacy
retention. **It has not been applied.** Inspect every SQL constraint/trigger/FK
and add meaningful storage-boundary tests before application to the sole test DB.

Root also added request intent hashing (sorted objects, array order/raw values,
method/path/query/body). The reviewed Event #1 legacy alias canonicalizes to the
resolved scoped path so the same UUID can replay across those two legitimate paths;
other target changes refuse. Reservation/attempt/settle SQL carries the hash fence.
Tests retain exact same-body late-callback races rather than weakening the intent
contract to permit changed bodies. Regenerate event-owned metadata after final
schema review; do not omit it because Prisma generation alone passed.

## Actual P15 checks and tooling interruption

- Node and npm child runtime were verified **24.19.0**.
- Explicit-test-env Prisma generation returned zero, most recently after adding
  planned targetEventId. This is generation, not an applied migration.
- Shared/access-policy emit and generated grants/actions/AVP checks returned zero
  during assembly. Shared emit must be refreshed after final privacy DTO edits.
- Root focused recovery/HTTP/config/test lint returned zero after splitting the
  fresh-operator helper. This predates the latest bootstrap helper.
- Quota/infra lane reported focused lint and infra typecheck zero; auth lane
  reported focused lint zero before its latest fixture changes. No suite ran.
- Latest assembled server source/seed/test typecheck **25018 ended 1**: assignment
  notice fixture Map value type, credentialBoundary Prisma transaction type,
  recovery createStation missing argument, and contentRules missing imageManifest.
  Corresponding saved fixes were made; no final assembled green typecheck has
  been established. Earlier media nullable-rehearsal type failure was fixed too.
- Whole lint/types/architecture/generated checks still need current-run results.
  No P15 coverage result, complete local gate or exact-SHA CI exists.

A worker accidentally invoked **pnpm** instead of npm, altered the local dependency
layout and created a root pnpm lock. Root preserved that generated file by a verified
native move to `.local/p15-accidental-pnpm-lock-20261012.yaml`; no ignored package
files were deleted. `npm install --ignore-scripts --no-audit --no-fund` then finished
**actual zero** (added five, changed eleven packages) to restore npm tooling. Root
package/package-lock already had legitimate dirty source changes; preserve and
review them. Current package-lock is ordinary UTF-8 bytes with no NULs, although Git
numstat rendered it as binary. This restore is not a substitute for the complete
gate's clean npm install or dependency audit. Use npm plus the verified Node24
runtime exclusively from here.

## Immediate unfinished source and verification work

Finish this list before declaring the whole security batch ready or running its
database suites:

1. **Production bootstrap is the newest unfinished root source.** Review/refactor
   `bootstrapAdmin.ts`, run source/seed lint/types, and add meaningful config,
   exact-provider-proof and transaction tests: no ordinary-person promotion,
   collision/deactivated/erased refusals, no second admin, exact replay and rollback.
   The helper currently emits an unchecked
   `pg_notify('spoh_cache_bus', {topic:'membership', eventId:null})` envelope. Remove
   that unnecessary new-person notification or replace it with the verified public
   bus contract; never claim a guessed channel/envelope is valid invalidation.
   Document explicit organisation/owner evidence/bootstrap inputs in the runbook.
2. Review recovery fixtures/negative cases: stale plan, provider pool mismatch,
   unprovisioned/operator JWT proof, cross-organisation standing, generation/subject
   uniqueness, and real category fixtures. `createStation({})` and quota field
   `used` fixes are saved. Keep the service/CLI dry-run split and owner gates.
3. Recheck latest auth/roster/lifecycle boundary source, MFA SID/cookie, legacy
   ancestry refusal and typed fixture helpers. Do not infer race acceptance from
   authored tests. Ensure all permission writers revoke credentials atomically.
4. `isolation.test.ts` now contains every-role event-route foreign/missing, foreign
   event, workspace entity and record-predicate source loops. This is authored,
   not run. Complete the **global person/notice/session/content-ID surfaces** and
   prove inventoried ID inputs and same-event station/person isolation are truly
   covered. Preserve strict valid-token/no-401 and non-disclosure oracles; schema
   validation refusal alone is not IDOR proof. Do not substitute nine representative
   routes for the documented full generated matrix.
5. Add the root global foreign-organisation audit-feed regression for the exact
   event feed fix. Recheck captureStation's exact-action held proofs, historical
   shiftAt semantics, length/complexity and affected callers.
6. Finish media/content/storage/retention integration review, SQL invariants and
   hostile-content/orphan/race test source. Privacy target-journal erasure/export is
   now saved; verify unbound plannedPersonId and actor-only retention cases rather
   than marking the previous worker request simply absent or complete by assertion.
7. Review all central contracts/config-version parity and package/export/Docker/
   workflow seams; generate schema/eventOwned/shared artifacts and whole lint,
   types, architecture and maintained generator checks. Capture huge TypeScript
   diagnostics locally and return the concrete error lines plus actual exit.
8. Complete the independent full-baseline security review and ASVS evidence matrix;
   reconcile BACKLOG/F04 High/Blocker findings with repairs/actual results and
   explicit deferred external evidence. Finish a truthful data map, effective audit
   privilege checks, key/DB rotation and recovery/production/decommission runbooks,
   then P15 report. No blanket L2 or zero-High claim before that review.

## Resume execution in this order

ADR-011/D-23: whole source/test authoring with focused lint/types, then authored/
affected suites, grouped repairs, **one complete every-step local gate actual 0**,
one push, exact pushed-SHA CI. Concrete failures justify repairs/repeats; do not
lower assertions or coverage floors, run browser acceptance early, or call a
partial/resumed run complete acceptance.

1. Confirm status/logs/agents and preserve the whole batch. Finish the source
   checklist above. Disjoint fresh subagents may help; root owns central schema,
   contracts, app composition, package/lockfiles and integration.
2. After whole-source readiness, inspect the additive migration and deploy it
   **only to spoh2027_test**. No competing database suite. Authored/affected server
   DB suites run serially; independent shared/client/CDK checks can parallelize.
   Bypass the legacy broad setup/pretest script until its guards are repaired.
3. Group fixes from meaningful failures. Finish the full local no-resume Node24
   gate and retain actual final exit/completion evidence.
4. Stage the entire coherent preserved P15 source, tests, migration, tracker and
   reports. Secret scan/review the staged diff; immediately inspect
   `git diff --cached --stat`. Include **every** staged file in the D-11 direct-main
   commit. No feature branch, PR or tag. Push once and watch all five required jobs
   on the exact pushed SHA. No `.local` evidence/secrets publication.
5. Reconcile P15.1–P15.10 and explicitly close the P15 phase only after its actual
   required local/exact-CI evidence. Retain deferred staging/production acceptance
   truthfully in P16 and owner gates.
6. Only after all feature build steps are closed, prepare P16: repair the route
   inventory's forbidden `inventory_test`/history-overwrite/composite-chain behavior
   and the browser campaign's legacy setup/database/port assumptions before any
   run. Preserve the sole DB guard and current source-derived inventories.
7. P16 execution order: **authorized staging recreation/deployment → granular API
   P16.10 → full browser/visual regression P16.1 → deferred acceptance P16.8 →
   actual 24-hour soak P16.9 → load P16.2 → drills P16.3 → restore P16.4 →
   documentation/readiness/closure**. Use real HTTPS/Cognito and build/policy/case
   hash attestation; no fake auth, dev-sign-in or truncating staging as proof.
   Owner controls still govern production smoke/cutover and restored real people.

## Runtime, database and private evidence commands

All commands execute in V1-main. Before Node/npm/Prisma work:

```powershell
$env:PATH = "$PWD\.local\node24-bin;C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;" + $env:PATH
$env:DATABASE_URL = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:SPOH_SKIP_DOTENV = '1'
node -v
npm exec --no --call 'node -v'
node remediation/tools/progress.mjs status
```

Every Prisma invocation, including generate/diff, receives that explicit test URL
and skip-dotenv. **Only spoh2027_test on5435 is permitted** for local schema/test
work. Do not create another test/shadow DB, reset or seed real spoh2027, or use
the old `setup-test-db.mjs` broad guard. The integration reset helper already
requires the exact database name and rejects production mode.

Bare `bash` resolves broken WSL. Complete gate, without skip/resume arguments:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' .local/ci-local.sh
exit $LASTEXITCODE
```

`gh` is absent. Read-only exact CI helper:
`node .local/github-exact-ci-status.mjs <full-sha> --jobs`.
Never print credentials. Durable background helpers must be hidden and retain
actual exit JSON; launching a process does not prove completion. Correct tracker
CLI is **`remediation/tools/progress.mjs`**, not `remediation/progress.mjs`.

## Owner gates and dates remain intact

- AWS stays torn down while features are built. Deployment/infra/browser workflows
  are dispatch-only; no new AWS/browser action occurred during this continuation.
- Production creation, cutover, live Lightsail rebuilding/change, irreversible real
  data actions and restored-real-person recovery/reinvite require the existing
  owner approval. P12.8 and **28 October 2026 go/no-go** remain blocked/held.
- Production pool is retained/deletion-protected in CDK at its approved creation;
  no pool or production was created now. Do not execute recovery because its
  source now exists or because an approval-reference field can be typed.
- D-08: default Cognito sender, no SES, pool-wide default UTC allowance50/day.
  Firebase/first-party recovery must work with third-party cookies blocked.
- D-10: lean no-WAF baseline; January exception does not authorize present extras.
  Paid CloudTrail/GuardDuty/SecurityHub questions remain unanswered/disabled until
  owner choice. No new paid service was enabled.
- ADR-008 internal Cloud Map HTTP and ADR-006 MFA exceptions remain architecture
  facts to assess honestly in ASVS; they are not automatic compliance waivers.
- Training4Nov, Dry Run#1 18Nov, Dry Run#2 4Jan2027, event6–9Jan2027. Legacy aliases
  are removed seven days **after event closure**, not during this source batch.
- Keep updates short. Ask only for genuinely unresolved owner-gated decisions;
  progress autonomously on authorized source/verification work.

## Handoff artifacts saved now

- This latest handoff and the full file inventory.
- `TAKEOVER-PROMPT-2026-10-12.md`: ready-to-copy next-agent instructions.
- Existing `TAKEOVER-PROMPT-2026-10-11.md` refreshed to the same current entry
  point, replacing its obsolete pending-P14 prompt. Older handoffs remain history.
- README latest-handoff link updated. No tracker step was newly completed by this
  documentation turn, and no feature source was changed to hide an unfinished item.

These documents remain part of the preserved, uncommitted P15 batch. A documentation
handoff is not a P15 application commit/push or acceptance run.
