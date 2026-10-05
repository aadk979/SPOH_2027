# Private photo task wiring

P08.7 remains open. This slice connects the existing retained private media
bucket to the staging application after the separately verified ownership,
upload admission, retry and attachment guards. No schema or migration changes.

## Application boundary

The app task receives `S3_MEDIA_BUCKET` from one standard non-secret SSM
parameter. Its task role permits exactly `s3:GetObject` and `s3:PutObject` on
the owned media bucket's `lost-found/*` object prefix. It receives no bucket
listing, object deletion, ACL, content, export or backup permission. Migration
tasks receive neither storage parameters nor S3 grants. Production media stays
disabled while its approved exact client origin is absent.

The only new nag acknowledgement names this exact bucket ARN and object-prefix
wildcard. Unpredictable server-generated object keys require the prefix wildcard;
the grant contains no action wildcard or other bucket. Tests assert the complete
allow statement and refuse broader task/execution-role access.

## Browser boundary

The static client's CSP derives one regional HTTPS bucket origin from the
injected bucket/region. Undotted DNS bucket names and commercial AWS regions are
validated before forming it; arbitrary URLs, wildcard destinations and directive
injection are refused. Only `connect-src` and `img-src` gain this destination.
API, script and form policies retain their prior boundaries. Existing S3 CORS
allows the exact staging client origin to POST. Public access remains blocked.

Private GET signatures include S3's authenticated `response-cache-control`
override with `no-store`. The URL producer itself remains `no-store`; signed
credentials are never stored in an audit or replay receipt. Existing upload
size, MIME type, key, lifetime and current-authority checks remain unchanged.

## Verification

The new parameter/grant, CSP and private-read cache assertions first failed
against the preceding release. All 61 infrastructure checks across ten files
pass, including migration separation, production disabled state, backup
reference safety, full grant comparison and nag validation. Both stage synths
pass with the actual deployed image `1498a74` in both image contexts.

The read-only staging diff adds one SSM parameter and one app task-role policy,
adds the exact parameter to the execution role and task injection, and adds IAM
dependencies to the existing service/Cloud Map resource. Buckets, database,
identity, migration task and existing backups have no resource change.

All 587 server unit checks across 54 files pass, including 40 focused signing,
origin and static-client checks. The installed SDK's local synthetic signing
probe confirms POST/read origins in Singapore and US East and the signed cache
override without a network request or credential output. All 112 affected real
Postgres integration checks pass (83 admission/ownership/retry/attachment and 29
contract/audit). Server build/types, infrastructure types, lint, architecture
(1,025 modules / 4,506 dependencies) and hardcoding checks pass.
Formatting and source/test/report scans pass without new exceptions; the
621-commit history scan is clean. Inherited pricing artifacts are unchanged.

The preceding capture-authority full database suite passed 1,468 checks with four
existing skips. Its 426 client checks, two retry/a11y journeys, fresh 58 unchanged
visual baselines and 32-page static export are reused: this slice changes no
client, database use case, DTO or schema.

Source `e5a2a1c` and tracker image
`a7118ed515bc7b267d092bef45d06a715bec18aa` are pushed under D-11.
[CI 37214810096](https://github.com/aadk979/SPOH_2027/actions/runs/37214810096),
[infrastructure 37214810104](https://github.com/aadk979/SPOH_2027/actions/runs/37214810104)
and [deployment 37215221440](https://github.com/aadk979/SPOH_2027/actions/runs/37215221440)
succeed. CloudFormation is UPDATE_COMPLETE. Actual ECS revision 118 runs the exact
image with desired/running one, one completed rollout and zero failed tasks.

Normal Cognito and Chrome 154 verify the actual task's two-action photo-prefix
grant, standard bucket injection, migration separation, all public-access blocks,
exact CSP destinations and eight unchanged backup configuration hashes. A guarded
synthetic rehearsal permits a real 68-byte PNG browser POST (204), matching preview,
same-intent/same-key policy replay and practice found-item UI creation (201).
The event returns to READY. Signed historical reads still work in READY and return
the exact bytes with no-store; unsigned S3 access returns 403, unissued keys 404
and anonymous API requests 401. S3 receives no bearer token or cookie. Phone/laptop
list visibility, hard reload, unchanged settings values/versions and normal
sign-out pass without application page errors.

The upload run stopped at a probe text locator that omitted the label's camera
symbol. Its guarded finally restored READY. Read-only inventory and the corrected
continuation verify the same one item/object, without another fixture write.
[Combined staging evidence](staging-private-media-evidence-2026-10-05.json)
describes both executions rather than claiming an uninterrupted pass. It also
records one caught Zod evaluation probe blocked by script-src. The
[CSP-safe validation follow-up](csp-safe-validation.md) addresses that separately;
this evidence does not claim a clean CSP event list or an implemented image viewer.

An incorrect root infrastructure-test invocation was excluded from accepted
verification. The [test-selection note](verification-harness-scope.md) records
the guard refusal, read-only investigation and explicitly isolated test config.

## Remaining programme criteria

Content publishing/proxying, event-aware media retention, measured storage cost
and production routing remain separate work. This adds no compute, KMS key or
network resource. Standard SSM and existing S3 are used, but staging object,
request, version and access-log usage were unmeasured at that checkpoint. The
subsequent [staging storage inventory](staging-storage-usage.md) measures live
object/version bodies and access-log storage on 5 October; request totals,
complete billing and monthly cost remain unverified. The preserved production
S3 allowance does not cover staging, and the reconciled January forecast still
exceeds the amended budget before those costs. No budget compliance is claimed.
Production creation/cutover still requires the owner's 28 October go decision.
