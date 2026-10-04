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
client, database use case, DTO or schema. CI and real enabled-staging browser
upload/read/public-denial evidence are recorded after release.

An incorrect root infrastructure-test invocation was excluded from accepted
verification. The [test-selection note](verification-harness-scope.md) records
the guard refusal, read-only investigation and explicitly isolated test config.

## Remaining programme criteria

Content publishing/proxying, event-aware media retention, measured storage cost
and production routing remain separate work. This adds no compute, KMS key or
network resource. Standard SSM and existing S3 are used, but staging object,
request, version and access-log usage remain unmeasured. The preserved production
S3 allowance does not cover staging, and the reconciled January forecast still
exceeds the amended budget before those costs. No budget compliance is claimed.
Production creation/cutover still requires the owner's 28 October go decision.
