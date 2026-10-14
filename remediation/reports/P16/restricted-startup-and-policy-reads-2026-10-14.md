# P16-008–009 — Restricted startup and policy snapshot pacing

The preceding corrective batch was delivered directly to main as
`8b730c3af28a8cefd0f3ce97e2652b4c440b0419`.
[Exact-SHA CI38512594365](https://github.com/aadk979/SPOH_2027/actions/runs/38512594365)
completed with all five jobs green at `2026-10-14T05:05:46Z`.
The fresh metadata-only signing check retained the sole existing AWSCURRENT
selector, with no overlap, rotation or secret-value read.
[Staging release38514912738](https://github.com/aadk979/SPOH_2027/actions/runs/38514912738)
then passed image build, migrations, service update and all six pipeline smoke
checks. Its successful completion was observed at `05:18:29.802Z`.
The preceding failed release remains preserved.

At release acceptance, the stable service ran one ARM64 task, task definition revision159,
with the immutable8b image and matching ECR/runtime digest
`sha256:56a7fd1ebd3802456dd39b8ba808d75743063dad1d423c7751b85cf65db4eba3`.
DNS and normal HTTPS were verified on the owner-updated staging addresses.
No production or retained real snapshot was touched.

## P16-008: management reads exceeded the AVP quota

The initial read-only policy snapshot failed with an actual AWS
`ThrottlingException`, HTTP429, one SDK attempt and no retry. The shared reader
issued sequential GetPolicy calls without pacing; fast responses still allowed
more than the operation's default quota.
[AWS documents ten GetPolicy requests per second per store](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/quotas.html).

The failed snapshot, actual exit1 and original private controller were preserved.
A new private observation paced reads at a minimum250ms interval, with one SDK
attempt and no automatic quota retry. It passed actual0 at `05:21:08.931Z`:
all73 deployed statements and the schema match source exactly, including raw
digests. The running task names this exact policy store and its complete policy
ID/name map matches the deployed descriptions. This is configuration and policy
attestation; it does not prove all provider decisions or the nightly matrix.

The source reader now applies the same bounded pacing before every ListPolicies,
GetPolicy and GetSchema request. A deterministic regression first demonstrated
six unpaced starts at time0; after correction they occur at
0/250/500/750/1000/1250ms, retaining all paginated policies and schema. Throttling
still propagates without a partial snapshot or automatic retry, and duplicate
policy descriptions still refuse. Permissions, quotas and policies are unchanged.

## P16-009: the root page consumed a restricted MFA session

The controlled real browser successfully completed Cognito login, callback,
first-party recovery and handoff200. The returned session explicitly required
MFA. The browser then reached sign-in instead of the MFA screen; the guarded
attempt ended actual1 at `05:22:56.825Z`. No setup or verification request was
submitted, no authenticator was enrolled, and no event was created.

The local component regression confirms the cause: root event queries treated
the restricted session as ordinary access. The resulting401/refresh refusal
discarded it before MFA navigation. The root now recognises the MFA state, and
business hooks withhold restricted sessions while the MFA screen retains the
proof through the raw session hook. Existing server authentication and protected
read refusals remain strict; setup and verification retain authenticated access.

Before correction, the new client regressions had three failures and one pass;
the infrastructure regressions had one failure and two passes, both actual1 at
`05:29:25.202Z`. After correction, five affected client suites passed37 tests and
two infrastructure suites passed12, both actual0 at `05:30:16.783Z`. The positive
MFA component case still exercises authenticated setup and verification before
admitting the completed full session. These local fixtures are not real Cognito
enrollment proof. The controlled operator and its completed password challenge
remain intact; the failed action journal prevents blind enrollment repeats.

## Shared partial API case corpora

The new reviewed fixtures are shared by CI HTTP tests and the private guarded
staging controllers:

- 44 first-event validation bindings cover every required body field's omission,
  wrong type and null, plus length/range/calendar/timezone/slug/receipt/unknown-key
  cases. They require exact validation issues and zero event/membership effects.
  Related cases require authentication, effective signature refusal, explicit
  joining, exact receipt replay and changed-intent refusal.
- Five canonical read routes and their five legacy aliases cover all six roles,
  actual stored API SIDs, typed responses and exact refusal actions.23 reviewed
  roster-query bindings run against both path forms. Case outcomes are pinned
  to the committed route-role matrix; expected actor IDs and roles are read back.

The two authored integration suites passed164 tests with actual0 at
`05:38:20.634Z`, against only `spoh2027_test`. Their declared local provider opens
real stored API sessions; it is not a staged provider credential. These are
partial corpora. All remaining423-served/229-canonical route obligations,
station/foreign-organisation fixtures, lifecycle, expiry/refresh, pagination,
quota and other edge cases still require complete coverage and real staging runs.

## Current acceptance boundary

The complete new-batch gate ran every one of its29 steps, without resume or skip
arguments, under Node24.19.0/npm against only `spoh2027_test`. It returned actual0
at `2026-10-14T06:27:53.067Z`. The accepted local results are:

| Suite          |    Passed | Existing skips |
| -------------- | --------: | -------------: |
| Server         |     3,967 |              2 |
| Client         |     1,220 |              0 |
| Shared         |       348 |              0 |
| Policies       |       158 |              0 |
| Infrastructure |       136 |              0 |
| Total          | **5,829** |          **2** |

The separate tracker, delivery and environment safety checks passed71. Builds,
actual Docker image/CSP verification, lint/types, architecture, additive migration,
dependency audit and secret checks also passed. Raw coverage and LCOV were retained
privately: server96.67% lines/88.12% branches, client80.23%/71.80%, shared94.38%/
87.40%. Existing floors and skips were not lowered or removed. The documented CDK
dependency advisory exception remains; this is not a zero-advisory claim. A fresh
read-only mounted-inventory comparison passed actual0 with all423 routes unchanged.

Staged review/secret scan, direct-main push, exact-SHA CI and the corrected staging
release remain required. Real MFA and granular staging cases remain unaccepted.
After the owner's successful confirmation page, read-only AWS metadata at
`05:56:41.340Z` proves the current subscription is confirmed and matches the
returned subscription ARN and approved endpoint. Actual alarm receipt remains
P16.8; no personal inbox or unsubscribe link was accessed.

## Additional parking workflow finding

An offline AWS CLI parser observation returned actual252 at `06:09:47.010Z`:
`db-instance-stopped` is not a supported RDS waiter. The current parking script
requests that waiter after stopping the database; its mocked tests did not catch
the unsupported command. No parking workflow was dispatched. Its source repair
and meaningful regression remain for the next coherent batch, outside this frozen
MFA/policy/corpus batch.

For idle cost control under the existing staging plan, a private bounded metadata
controller verified the account, exact CloudFormation-owned staging resources,
private encrypted database and absence of an active deployment. It drained compute
before stopping RDS, then observed zero running/pending tasks and RDS `stopped`.
The operation returned actual0 at `06:12:42.352Z`. No deletion, restore, snapshot,
SQL or secret-value read occurred. Staging must be restored before deployment or
API execution. This idle pause is not acceptance of the faulty workflow or any
part of the required24-hour soak.

Private controller updates retain earlier sources and observations. Credentials,
messages, setup keys and session tokens remain under ignored `.local/` and are
excluded from delivery. P16.10 stays in progress, followed in order by P16.1,
P16.8, the actual24-hour P16.9 soak, load, drills, restore and handover. Production,
real-person recovery/reinvite, new-cost decisions, independent assurance, owner
reviews and go/no-go gates remain intact.
