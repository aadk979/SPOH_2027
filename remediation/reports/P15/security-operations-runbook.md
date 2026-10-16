# Security operations and release controls

Source procedure, 12 October 2026. These procedures have not been executed on
AWS. P16 must record synthetic rehearsals, exact image/policy hashes and actual
results. Production creation, cutover, restored identities, live-site changes,
paid detection services and irreversible real-data actions retain owner approval.

## Secrets and cryptography inventory

| Material                        | Purpose, location and lifecycle                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session signing secret          | Secrets Manager, explicit VersionId in app tasks only. HS256 API JWTs pin issuer/audience/algorithm and carry subject/SID; the backend resolves current authority. SHA256-derived key ID selects at most current and previous.                                                             |
| Temporary provider envelopes    | AES-256-GCM, fresh 96-bit nonce and authentication tag. A SHA256-derived session key encrypts only short-lived backend MFA credentials; key ID permits bounded overlap. Never export or log envelopes. Expiry/invalidation clears them; inspect surviving envelopes before key retirement. |
| Refresh credentials             | Initial 32-byte random secret, SHA256 digest in PostgreSQL. Successors use HMAC-SHA256 with the distinct `refresh-successor:` purpose string and session ID. Overlap can reproduce a committed retry under either explicit key; stored digest must match.                                  |
| OAuth/PKCE and handoff          | Cryptographic random state/verifier and one-use handoff; short expiry, fixed origin/return-path rules and no-store/no-referrer responses. Protocol query credentials must never enter logs or public evidence.                                                                             |
| Attendance signing              | Independent Secrets Manager secret, app task only. Coordinate challenge expiry and a maintenance restart separately from API session rotation.                                                                                                                                             |
| Push/VAPID                      | Private key injected only into app tasks; public key reaches subscription clients. Replacement requires renewed subscriptions, confirmed synthetic receipt and operator coordination.                                                                                                      |
| DB app/migrator/admin passwords | Separate Secrets Manager credentials and SQL roles. App cannot migrate or directly mutate audit history. Operator rotation uses the one-off migration task under the existing lean network topology.                                                                                       |
| TLS/service credentials         | Managed certificates at the public edge; ECS task-role temporary AWS credentials. Internal Cloud Map HTTP is the recorded ADR-008 architecture exception, requiring P16 network-boundary proof. No application IAM user keys are injected.                                                 |

The deployment operator owns secret generation, selectors, access and retirement;
the programme owner approves production and compromise decisions. Use generated
high-entropy values, private environment/secret injection and least privilege.
Never store values in argv, reports, workflow outputs or Git. Keep non-secret
VersionIds, task/image identities, start/end times and actual outcomes as evidence.
This inventory describes implemented algorithms; it is not NIST certification.

## Rotation and rollback

Follow the [CDK rotation procedure](../../../infra/cdk/README.md#rotation-under-the-lean-network-topology).
For DB rotation, verify a recoverable current backup, retain the prior version,
change the selected stage credential, run the one-off migration task, replace app
tasks and prove new connections plus smoke. On failure restore the prior selector
and password through the same task, then the accepted image. No DB reset/recreate.
Automatic Secrets Manager rotation and a paid network/rotation service are absent.

For API signing: preload the new verifier while the old writer stays current;
wait for every task to use the pair; flip writers and record when the last old
writer stopped; retire only after the longest configured access-token, pending
MFA, handoff and encrypted refresh-retry lifetime plus clock skew. Inspect pending
envelopes rather than using the 30-day refresh-family lifetime as the overlap.
The release validator refuses skipped phases and a routine deploy dropping an
overlap. Rehearse both old/new verification and rollback before retirement.
No general bulk envelope re-encryption tool is claimed: let bounded envelopes
expire/clear, or require fresh enrollment after an approved compromise response.

A suspected signing-key leak needs current incident assessment, explicit
credential invalidation and accelerated retirement; a rolling overlap alone
does not revoke stolen credentials. Retain forensic audit while clearing secret
material. Never resurrect revoked families when rolling back an image/key.

## Authentication policy and residuals

Hosted code/PKCE is the supported deployed sign-in. Cognito API ExplicitAuthFlows
is pinned empty; configured refresh rotation is distinct from API rotation.
Local email sign-in is test/development only and fails production configuration.
API families preserve their original absolute deadline: at most 30 days for
ordinary members, stricter configured administrator absolute/idle limits.
Refresh iat is not fresh-factor evidence. Recovery needs a full current SID and
verified authentication within five minutes, sampled after locks.

Concurrent device families have no finite account cap in the implemented design;
device management and forced sign-out provide control. Shared-phone ordinary
sessions have no separate inactivity timeout beyond the bounded family deadline;
admin idle protection is stricter. These are explicit assurance residuals for
owner review, not new approved ASVS exceptions. API sessions are independent of
provider logout/password reset: until a coordinated operator invalidation or
their deadline, provider reset alone does not prove API termination.

Lost-factor recovery requires the owner/operator to independently establish the
requester's identity through the recorded roster and an already trusted contact
channel, a second authorized administrator to review the request, and private
case attribution. Email possession or matching a display name alone is
insufficient. Suspend/invalidate affected API credentials before an approved
provider-factor reset; record provider action and require fresh enrollment.
No automated provider-factor-reset command or proofing service is asserted.
Restored-pool rebind uses the separate [identity runbook](identity-recovery-runbook.md)
and cannot substitute for identity proofing.

## Log and event inventory

| Layer                               | Format, purpose, retention and access                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application HTTP/auth/authorization | Pino JSON stdout to `/spoh/<stage>/app`, one month. Known route template, method, request ID, status and bounded categories; no raw URL/query/private path IDs, headers, bodies, Location, provider errors, SQL or credentials.                                              |
| PostgreSQL warnings/errors          | Fixed category/message through the same app stream; raw Prisma events/query text are omitted. Database operational logs are a separate AWS operator boundary.                                                                                                                |
| Business/security audit             | PostgreSQL attributed append-only rows, transactionally paired with effects. Owner-only cleanup requires at least 400-day row age and, for event rows, 400-day archive age. Post-commit batches/cursor append to `/spoh/<stage>/audit`, thirteen-month CloudWatch retention. |
| API edge access                     | Fixed structured API Gateway fields to its CDK log group, one month. Request/status/integration correlation; no credential-bearing request URL logging.                                                                                                                      |
| Rejected VPC flows                  | Managed flow records, one month. Network refusal investigation; operator IAM controls read/delete.                                                                                                                                                                           |
| Observer/task failure               | CDK-managed observer and `/spoh/<stage>/task-failures` logs, one month. Desired/running tasks, backups, health and bounded failure observations.                                                                                                                             |
| Provider/CloudTrail/detection       | Provider/account boundaries; complete deployed inventory, access, export and receipt proof is P16. Paid CloudTrail/GuardDuty/Security Hub choices remain owner-held. No enabled service or comprehensive authentication-factor event coverage is claimed.                    |

Audit covers successful session creation, logout/reuse, MFA replacement,
provision/recovery/invitation, role/grant changes, privacy and retention effects.
Refused HTTP requests retain safe error/status correlation; authorization denial
metrics/audit are coordinated across instances. Validation, quota and unexpected
errors retain stable codes/categories. Comprehensive provider failed-factor
events, multi-layer ingestion/UTC clock correlation, denied log-admin access and
actual alarm receipt need P16 evidence. Sanitization intentionally discards raw
error detail; investigate using correlation and safe categories, not secret dumps.

## Production release and old deployment

Before the owner-approved production window, identify accepted main/image SHA,
CDK diff, backup/restore proof, budget/alarms, operator roles, signing selectors,
explicit initial-admin proof and approved restoration cohort. Create production
only through the same reviewed stacks, retaining its deletion-protected pool.
Deploy/migrate additive schema, verify synthetic smoke and read-only counts, then
use the approved recovery plan for real identities. Record exact tasks/exits,
count comparisons, alarms and owner walkthrough. A typed approval reference is
not an owner decision. Roll back to the accepted compatible image and reviewed
secret selectors; external account creation/mail cannot be undone by SQL.

The [AWS teardown record](../P08/aws-teardown-2026-10-10.md) is the prior actual
execution record. The host/pools/DuckDNS deployment were deleted; the final
staging snapshot, IAM users/account budget and private local backups were kept.
No cutover or new host exists from this source work. Before retiring old IAM
users/keys, the old Cognito client or any recreated no-go host, inventory actual
remaining resources, privately verify final recoverable backups and obtain the
owner's approval. Do not delete the retained snapshot or private backups merely
because source/runbooks are ready. The 28 October go/no-go and real January
fallback choice remain held; neither source CI nor staging grants production go.

## Staging content cleanup retry

The 16 October P16 repair adds an operator application command for one exhausted
global `content.storage.prune` occurrence. This is a staging recovery procedure;
the command refuses production. It grants no production approval and does not
reset dead work on startup.

First identify the exact action from its shipped `schedule.execute` failure audit,
review the underlying storage/permission repair, the complete local gate, exact
CI/image and CDK diff, and verify the existing campaign budget. Deploy that accepted
image and its prefix-constrained content-bucket policy before retrying. Use the
existing app task definition, task role, private networking and protected secret
injection; keep operator IAM authorization and the resulting task ARN in private
evidence. Do not pass database credentials or tokens in command arguments, use a
migration/admin database role, issue ad hoc SQL, or create a new paid service.

Run one bounded task with command `retry-content-cleanup --id ACTION_ID`. Its
default read-only output contains only the matched action's type, terminal status,
version, attempts and dates. Review that concrete plan, then run:

```text
retry-content-cleanup --id ACTION_ID --apply --expected-version VERSION --reason "Verified repair and retained failure evidence" --operator-reference "Incident or campaign evidence reference"
```

An operator reference is attribution, not proof of owner approval. The command
rechecks the exact global recurring kind, dedupe key, exhausted budget, terminal
error, cleared lease and version under a lock. It preserves payload, creator,
recurrence and original schedule; the transactional retry audit retains the old
status, attempts, error and completion time before a new attempt is queued. A
duplicate/stale apply refuses. Audit failure rolls back the queued retry.

The global cleanup action's audits must retain the global scheduled-action scope.
The storage intent's owning and target event IDs are provenance, not replacements
for that scope. The database rejects a scheduled record naming another scope;
keep that constraint intact. The 16 October native failure and regression repair
are recorded in [the audit-scope report](../P16/content-cleanup-audit-scope-2026-10-16.md).

Retain each task's actual exit and private plan. Observe the normal worker's new
`schedule.execute` result and successor, unchanged historical failure audits,
actual zero dead-action gauge and natural alarm recovery. A successful command
exit means queued, not completed. If execution fails again, preserve it and fix
the cause before another reviewed retry. Never force a healthy alarm or bypass
go-live readiness. The missing-object check may list only the exact generated
content/draft prefix with one result; actual permission errors remain failures.

## Dependency response

Maintain npm lockfile/native/runtime/container inventory and exact deployed image
digest. Critical reachable credential/RCE findings require immediate triage and
containment before further release; High findings block application delivery
unless a narrow, dated, recorded exception already applies. Assess lower severity
by reachability/exposure in the next maintenance review. CI audit and automated
updates support this policy but do not replace operator review. Existing CDK
advisory exception through 31 October stays visible; no zero-advisory claim.
Retain a component inventory and its exact hash with the release. npm's native
SBOM command currently rejects the reviewed deepmerge-ts/mysql2/uuid overrides
as invalid dependencies; it produced no SBOM. The lockfile-derived inventory
contains 851 versioned components, integrity/resolved/license and dev/optional
metadata. Its SHA256 is
`6279b45f4c8115091d141d583665fed073383327254af02fe8eae5388c47f70c`,
for package-lock SHA256
`4965715c552964af2ab98849a759c5d1b422ae4bd2e2ec9c8634eefdbe065969`.
This fallback inventory is not labelled an npm SBOM or a deployed image
attestation. Container/provider versions and provenance remain P16 evidence.
