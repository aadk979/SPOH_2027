# Initial administrator and reviewed identity recovery

Source procedure, 12 October 2026. No production bootstrap, restored-person
recovery or invitation has been executed. Production creation/cutover and
restored real identities retain P12.8 and the owner's explicit approval.

## Initial administrator

Use only for the first administrator of an explicitly selected existing
organisation. The ordinary UI/recovery workflow manages subsequent people.
Create/verify the provider identity through the owner-approved operator process
before bootstrap; the seed does not create Cognito accounts or send mail.

Privately record the approval, target environment/organisation/pool, exact enabled
provider Username, `sub`, verified normalized email, display name and account
status. Only CONFIRMED or FORCE_CHANGE_PASSWORD is accepted. A local subject,
unverified email, different pool region, disabled provider, profile mismatch,
deactivated/erased Person or collision refuses. An existing ordinary Person is
never promoted. A second initial administrator refuses; an exact existing active
administrator is a replay with no additional business/audit writes.

Required environment, supplied privately to the compiled production seed:

| Variable | Evidence |
| --- | --- |
| `NODE_ENV` | `production` |
| `SPOH_SKIP_DOTENV` | `1` |
| `DATABASE_URL` | Explicit authorized database; never infer from a local file |
| `SEED_ADMIN_ORGANISATION_ID` | Reviewed existing organisation ID |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_SUB` | Exact reviewed provider identity |
| `COGNITO_USER_POOL_ID`, `COGNITO_REGION` | Exact environment-owned pool and matching region |
| `SEED_BOOTSTRAP_OWNER_APPROVAL_REFERENCE` | Actual recorded owner decision; typing a reference is not authorization |

Build server and seed before execution. In the deployed image the command is
`node dist/seed/prisma/seed.js` from `/app/server`. The `seed` entrypoint assembles
the app database URL from ECS secret injections. Use an explicitly approved
one-off **app task definition**, identified from the accepted ECS service; its
own-pool AdminGetUser permission and Cognito configuration support the proof.
Override its app container command to `seed` and supply the reviewed bootstrap
inputs privately. The migration task intentionally lacks Cognito privileges and
is not the production bootstrap runner. Retain actual task exit and exact image
SHA; inspect the created Person, PLATFORM_ADMIN membership and attributed
`user.provision` audit under authorized read access. The owner reference is
hashed in the audit. Audit failure rolls the new Person/membership back.

Before the first event exists, the administrator signs in with real organisation
standing and organisation-scoped session settings. No placeholder Event or
EventMembership is created, and attributed session audit rows remain global.
Required fresh MFA replaces the restricted SID before the event wizard can
create and optionally join the first real event. Renewal preserves the original
family/authentication boundary; withdrawn organisation/global standing refuses.
Local backend regressions cover this flow with verified test-provider exchange
and mocked AWS transport. Real hosted login/MFA and the owner walkthrough remain
P16 evidence.

Staging's `seed-fixture` remains explicitly synthetic and staging-only. It is not
production bootstrap or evidence of real Cognito sign-in. Local verification
uses only spoh2027_test on 5435 with mocked provider transport.

## Recovery plan

### Establish the restored operator first

A restored database can contain only subjects from the deleted pool. Ordinary
initial bootstrap intentionally refuses replacing those subjects or adding a
second administrator; a pre-existing unrestricted SID cannot then be assumed.
Use the separate **owner-approved offline** `seed-restored-operator` app-task
command to establish one existing platform administrator. It never creates a
Person, membership, provider account or invitation and never promotes a member.

Privately verify the administrator's retained Person ID, exact old subject,
organisation and profile against the approved restore. Create/verify the new
provider account through the owner-approved operator process. Supply the initial
bootstrap identity/pool/owner variables above, plus:

| Variable | Evidence |
| --- | --- |
| `SEED_BOOTSTRAP_MODE` | Exactly `restored-operator`; `NODE_ENV=production` |
| `SEED_RECOVERY_OPERATOR_PERSON_ID` | Exact existing active, unerased PLATFORM_ADMIN Person |
| `SEED_RECOVERY_OPERATOR_EXPECTED_SUBJECT` | Exact retained old Cognito subject, privately reviewed |
| `SEED_RECOVERY_OPERATOR_OPERATION_ID` | Fresh reviewed UUID; preserve for exact retry |
| `SEED_RECOVERY_OPERATOR_REASON` | Bounded actual restore reason |

The compiled command is `node dist/seed/prisma/seed.js restored-operator`.
Wrong/implicit mode refuses. The exact bounded provider GET proof is followed by
held current standing, profile and old-subject checks. Foreign organisation
standing refuses and needs coordinated owner review; no additional authority is
inferred. Subject uniqueness, credential/handoff invalidation and a global
attributed `user.reprovision` audit commit atomically. A failed audit leaves the
old subject and credentials unchanged. The audit stores intent/approval digests,
not subjects or profiles. Exact committed retries preserve newly created sessions;
changed intent or missing committed proof refuses.
Only one offline operator bootstrap is permitted per organisation/new pool;
after that, remaining accounts use the ordinary authorized recovery workflow.

After bootstrap, fresh hosted sign-in and required MFA establish the real full
SID for the ordinary recovery plan below. The operator remains excluded from
its own plan. Bootstrap and cohort recovery are separate owner-approved actions;
typing either approval reference is not permission. Synthetic backend tests do
not establish a real restored-person or provider rehearsal.

Build the server. Set the full Cognito runtime configuration for the reviewed
target; place the database connection and a recently authenticated API access
token in dedicated `SPOH_RECOVERY_DATABASE_URL` and
`SPOH_RECOVERY_OPERATOR_TOKEN` environment variables. Never put either in argv,
reports or terminal output. Set `SPOH_SKIP_DOTENV=1` explicitly.

The operator must already be provisioned, have a current unrestricted SID,
verified authentication within five minutes, and actual Cedar ManageAdmins
authority in every organisation affected. Organisation authority works with
zero events. The operator cannot recover their own account.

From the repository root, the readonly command shape is:

```text
node server/scripts/recover-identities.mjs --database-env SPOH_RECOVERY_DATABASE_URL --operator-token-env SPOH_RECOVERY_OPERATOR_TOKEN --organisation REVIEWED_ORGANISATION --pool REVIEWED_POOL --plan-out reviewed-plan.json
```

Plans are newly created under `.local/identity-recovery/`; existing files are
never overwritten. Review IDs/counts/fingerprints against the approved cohort
privately. Plans contain no raw emails, names, subjects or credentials and expire
after seven days. Dry-run creates no account/invitation journals, quota or mail.

## Explicit apply and invitation

After actual owner approval, replace `--plan-out` with `--plan`, add `--apply`,
`--reason` and `--owner-approval-reference`. Reauthenticate when needed. The
provider must match the reviewed pool exactly. CREATE_STARTED commits before
suppressed provider creation. Reconciliation requires the immutable operation
UUID and exact enabled provider identity. PROVIDER_READY survives a failed
database bind; retry the same plan/input rather than making another provider
account. BOUND commits subject rebinding, audit and complete credential/handoff
invalidation atomically. Operational Person/membership/record IDs remain intact.

Invitation is another approved command with `--invite` instead of `--apply`.
It requires BOUND/current identity and current operator authority. STARTED and a
pool-wide UTC allowance reservation commit before one bounded provider send.
Default allowance is 50/day; no SES. ACCEPTED means provider acceptance, not
mailbox receipt. STARTED/DELIVERY_UNKNOWN never automatically resend or refund.
An intentional reviewed resend uses a fresh `--resend-key` UUID and another
reservation. Do not clear journals to bypass a refusal or ambiguous delivery.

Keep private failure context locally; the CLI deliberately emits a generic
failure. The old sync-cognito-subs command delegates to this safe workflow and
no longer performs an email-map subject rewrite.

## History limitation and rollback

Legacy refresh families with NULL absolute expiry require their oldest retained
issuance row and matching successful session.create audit. Missing roots require
fresh sign-in; recovery never starts a new sliding 30-day lifetime for them.
Invalidation clears provider envelopes from terminal sessions as well as live
ones, preserves prior revocation metadata and deletes all associated handoffs.

Provider creation cannot be rolled back with SQL. Preserve its durable progress
and investigate mismatches; never automatically delete or adopt a manual account.
Database transactions roll back business binding/invalidation/audit together.
Rollback of a production release uses an accepted earlier image and compatible
additive schema, with an actual owner-approved recovery plan for real data.
