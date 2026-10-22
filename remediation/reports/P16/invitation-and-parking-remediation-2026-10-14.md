# P16-010–011 — Invitation delivery and staging parking

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


## Accepted preceding release and partial runtime cases

The preceding restricted-startup/policy/corpus batch was committed directly to
main as `9ace787e5af13852ddaba30fdaca9975e17f6200`.
[Exact-SHA CI38522615518](https://github.com/aadk979/SPOH_2027/actions/runs/38522615518)
passed all five jobs, including the real deployment-image check, at
`2026-10-14T06:54:02Z`. A fresh metadata-only signing check retained the sole
existing AWSCURRENT version. One stable staging dispatch followed;
[release38526050936](https://github.com/aadk979/SPOH_2027/actions/runs/38526050936)
passed all three jobs, migrations, service update and actual Smoke, observed at
`07:16:17.959Z`. Earlier failed observations remain preserved.

A fresh paced read-only attestation returned actual0 at `07:19:37.014Z`.
All73 deployed policy statements, their task policy-ID map and the schema match
source exactly. This proves deployed configuration, not the complete nightly
decision matrix.

The existing controlled initial operator then completed real Cognito login,
first-party recovery and restricted handoff, followed by actual authenticated
TOTP setup and verification. The full session retained the same person with a
new SID; the restricted administration request and replaced SID returned401.
Provider metadata confirms software MFA. No event was created by this proof.
The enrolled identity, authenticator and owned browser profile remain intact;
repeating initial setup would be incorrect.

The shared first-event corpus then passed53 real staging HTTP requests:
44 exact validation bindings, authentication refusals, zero-effect readbacks,
one DRAFT event created with an explicit ADMIN join, exact receipt replay and
changed-intent409. There is now exactly one synthetic event in the initial
organisation. These are partial P16.10 results; the remaining route campaign
has not passed.

## P16-010: unsupported waiter and missing compute drain observation

The AWS CLI parser previously returned actual252 for the nonexistent
`rds wait db-instance-stopped` command. The script also changed ECS desired
count without observing zero running and pending tasks before stopping RDS.
The earlier mocks accepted arbitrary waiter names and missed both faults.

The repaired script observes the exact staging service until desired/running/
pending counts are all zero, then stops the database. It uses bounded
DescribeDBInstances polling for `stopped` and `available`. Each observation
phase has a thirty-minute deadline with thirty-second spacing; missing,
foreign or unsafe metadata refuses. Unpark tolerates the actually observed
`rebooting` startup transition before restoring compute. Start/stop commands
are submitted once per invocation, with no SDK/CLI automatic retry. CLI calls
have connection/read/process timeouts. An ambiguous failure remains a reason
to reconcile, not to repeat the mutation.

The deployment role gains only `ecs:DescribeServices` on the same staging
service ARN pattern already permitted for UpdateService. Production services,
other task mutations and database deletion/restore are outside this change.
The access-stack change still requires a reviewed diff and controlled staging
application before any parking workflow acceptance.

Regressions first returned actual1 at `08:04:18.869Z`:13 parking failures with
four passes. They now require actual drain-before-stop ordering, valid CLI
operations, one start through starting/rebooting, bounded stalled transitions,
metadata refusals and no repeated ambiguous mutation. The separate synthesized
IAM regression failed before the permission change at `08:07:31.604Z`.
After correction, both infrastructure suites passed22 tests with actual0 at
`08:07:56.798Z`.

The earlier idle parking/restoration is preserved separately. Its first unpark
accepted one RDS start, then refused the unexpected rebooting state; fresh
metadata proved AVAILABLE before an explicit reconciliation restored only ECS.
It did not repeat the RDS start. This cost-control pause is neither acceptance
of the repaired workflow nor part of the required continuous24-hour soak.

## P16-011: invitation used Cognito's internal username

The first lower-rank synthetic provisioning request returned503 at
`07:28:58Z`. Read-only shipped audit evidence proves account creation,
provider readiness, binding and membership succeeded, followed by an invitation
recorded DELIVERY_UNKNOWN. The actor was not deleted or recreated, its quota
was not refunded, and no automatic resend occurred. No other lower-rank actor
had been provisioned at this checkpoint.

Scoped existing CloudTrail event history proves the suppressed AdminCreateUser
succeeded and the later RESEND failed with InvalidParameterException,
`Username should be an email.` The owned staging pool uses email as its username
attribute. AdminGetUser returns a generated internal UUID; passing that UUID
to AdminCreateUser RESEND violated this pool's API contract.
[AWS documents the sign-in-attribute username semantics and explicit RESEND behavior](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminCreateUser.html).

The adapter now sends the already subject-proven email sign-in attribute for
RESEND. Exact subject, verified email, enabled standing and temporary-password
checks remain. Disable/enable retain the proven internal username. There is no
alias migration, adoption by email, attribute rewrite, extra retry or change to
the durable invitation journal's handling of an unknown result.

The provider's immutable account-operation marker was separately reconciled
against the shipped account-start and account-bind operation UUID. It matches
both. The HTTP idempotency key is a different identifier and is not ownership
proof. The initial comparison to that HTTP key remains preserved as superseded
evidence.

The adapter regressions first returned actual1 with two failures and53 passes.
After correction all55 pass, actual0 at `08:05:14.396Z`. The new case models an
email-username pool rejecting its generated UUID and accepting the proven email;
existing ownership refusals and canonical disable/enable coverage remain.

## Acceptance boundary and next actions

The complete application gate ran all29 steps without resume arguments, under
Node24.19.0/npm and against only `spoh2027_test`. It returned actual0 at
`08:49:13.207Z`. Server305 files passed3,968 tests with the same two existing
skips; client113 files passed1,220; shared28 files passed348; policy tests
passed158; infrastructure25 files passed150. The total is5,844 passing tests,
plus71 separate delivery/tracker/environment safety checks.

Server coverage is96.67% lines/88.12% branches, client80.23%/71.80%, and
shared94.38%/87.40%; raw summaries and LCOV are retained privately. Existing
floors were unchanged. Lint/types, builds, actual Docker image verification,
architecture/hardcoding, additive migration, audit and both secret scans passed.
The existing documented CDK advisory exception remains; this is not a
zero-advisory claim. All six frozen source hashes still match the gated inputs.

Final staged review/secret scan, one direct-main push, all five exact-SHA CI jobs
and a successful stable staging release with actual Smoke remain required.
There is no corrected real invitation or parking workflow acceptance yet.

A separate unpark readiness gap was found while this batch was frozen:
UpdateService to desired count1 returns before a task is ready, and the workflow
immediately runs the non-retrying Smoke script. The next coherent batch must add
bounded observation of restored compute readiness and a failing regression before
P16.8 workflow acceptance. The present drain/database repair does not close that
additional gap; no unpark workflow was executed or claimed successful here.
Three private regressions demonstrated premature completion, a missing startup
deadline and failure to refuse a failed deployment; all three failed, actual1
at `08:45:41.196Z`, without database or AWS execution. Their source and failed
results remain preserved for promotion with the next repair.

After that release, recover a fresh full session for the existing enrolled
operator, read back the bound first actor, and submit one intentional synthetic
invitation with a fresh receipt through the application. Retain the earlier
DELIVERY_UNKNOWN terminal record and allowance. Then provision the four remaining
lower-rank actors, prove actual controlled mailbox receipts and real provider
sessions, and resume the shared API cases. No host SQL, fake staged JWT, seed,
real-person recovery or second ADMIN grant is permitted for this work.

The current owner alarm subscription is confirmed and matches the approved
endpoint. Actual alarm email receipt remains P16.8. Credentials, inbox messages,
authenticator keys, private operation details and session tokens remain ignored
under `.local/` and are excluded from delivery.

P16.10 remains in progress. Preserve the documented order through P16.1, P16.8,
the real24-hour P16.9 soak, load, drills, restore and handover. Coverage floors,
production/cost/real-person gates, independent assurance and owner reviews remain.
