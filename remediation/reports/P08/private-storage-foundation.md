# Private storage foundation — partial P08.7

The platform definition adds private media, content and exports buckets, plus a
private access-log destination. Staging is released through the existing green
CI path. Production is synthesised for review only and remains subject to the
28 October owner go decision.

Every owned bucket blocks all public access, disables ACLs through
BucketOwnerEnforced, encrypts with S3-managed AES256 keys, denies non-TLS access,
and retains data on stack deletion or replacement. Automatic object deletion is
absent. Each data bucket sends access logs to its own prefix in the private log
bucket; delivery accepts only the S3 logging service, the exact source bucket
ARN and the same account. Log delivery uses bucket policies even under an older
enclosing CDK feature flag, preserving disabled ACLs.

| Bucket      | Versioning / lifecycle                                                                  | Browser access                                                                            |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Media       | Abort incomplete multipart uploads after one day; no upload-age expiration              | Exact staging HTTPS client origin, POST and Content-Type only, 300-second preflight cache |
| Content     | Versioning enabled; abort incomplete multipart uploads after one day; no history expiry | No CORS rule                                                                              |
| Exports     | Abort incomplete multipart uploads after one day; expire objects after 90 days          | No CORS rule                                                                              |
| Access logs | Abort incomplete multipart uploads after one day; expire logs after 30 days             | No CORS rule                                                                              |

Media retention in ADR-003 §8 is 30 days **after Event.CLOSED**, controlled by an
event privacy setting. A 30-day upload-age expiration would delete a photo while
the event is active. The future event-aware purge remains open; this foundation
deliberately does not substitute an age-based lifecycle for that requirement.
Content versions remain available for published-history and rollback work.

AWS list-buckets confirmed `spoh2027-backups-665146708212` as the existing owner
bucket. CDK references its name only: it creates no owned backup bucket,
backup bucket policy, lifecycle rule or task permission. The three data bucket
names and the existing backup name are stack outputs. Application S3 permissions,
environment/SSM injection and upload enablement are separate work; media remains
disabled. Existing database, identity, app tasks and the live Lightsail host are
unaffected by the reviewed infrastructure diff.

## Verification on 4 October 2026

Fifteen new infrastructure checks verify public/ACL/TLS denial, same-account and
exact-source log delivery, data retention/replacement safety, content history,
exact-origin CORS, unsafe origin rejection, reference-only backups and absence of
application S3 grants/configuration. The wildcard-origin test failed against the
initial validator and passed after explicit wildcard rejection. All 56
infrastructure checks across nine files pass, including existing application,
identity and injection boundaries. Infrastructure types and both stage synths
pass with AwsSolutions validation and no new suppressions.

A read-only `cdk diff --no-change-set` used the actual deployed image
`7b4cae5ffd846c6577b02d3c34c0999250dc88c5` for both image contexts. It adds exactly
four S3 buckets, four bucket policies and four outputs. DeployAccess has no
differences; no existing resource is removed or changed. Actual staging resource
verification and exact release CI/deployment evidence are recorded after release.

## Cost and completion boundary

No compute service, customer-managed KMS key, NAT gateway, endpoint, public
domain or extra application metric is added. The existing forecast reserves S3
storage, but S3 requests, version history and access-log volume remain unmeasured
allowances. This release does not establish budget compliance: the preserved
reconciled January protection forecast is $135.13 against about $130, before
unmeasured costs. The three inherited pricing drafts and historical P05 pricing
are preserved byte-for-byte; no budget or protection policy is changed.

P08.7 remains in progress. Its remaining criteria include guarded upload producer
verification, least-privilege task wiring, a real presigned staging upload and
private read with public denial, content publishing/proxy integration, and the
event-aware media retention dependency. Private bucket creation alone does not
complete P08.7 or P08.
