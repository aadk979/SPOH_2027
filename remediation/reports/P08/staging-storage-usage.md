# Staging storage usage — partial P08.7 / P08.10

A read-only inventory at 10:57–10:58 Singapore on 5 October 2026 measures the four
CloudFormation-owned staging buckets in ap-southeast-1. STS verifies the expected
account, and exact stack resource IDs select the buckets. Fully paginated live
object/version/multipart listings are summarised without object keys, version
IDs, signed URLs, log contents or private fixture identifiers.

| Bucket purpose | Current objects | Current object bytes | Listed version bytes | Noncurrent versions |
| -------------- | --------------- | -------------------- | -------------------- | ------------------- |
| Media          | 1               | 68                   | 68                   | 0                   |
| Content        | 0               | 0                    | 0                    | 0                   |
| Exports        | 0               | 0                    | 0                    | 0                   |
| Access logs    | 131             | 608,676              | 608,676              | 0                   |
| Total          | 132             | 608,744              | 608,744              | 0                   |

There are no listed delete markers or outstanding multipart uploads. The
content bucket has versioning enabled; the other three do not. Current media
and access-log objects report STANDARD storage. The media size agrees with the
one legitimate synthetic PNG recorded in the private-media evidence; this
inventory does not fetch that object or create another fixture.

All four request-metric configuration lists are empty. The seven-day regional
CloudWatch query returns no available daily storage sample or request metric
for these buckets. Request totals are therefore unmeasured; access-log object
counts are not request counts. No request metrics, tags, billing controls, bucket
configuration, IAM or existing backups were changed. The inventory only lists
metadata and reads configuration/metrics; S3 can record these requests in its
asynchronous access logs. An initial probe stopped because its JSON parser did
not handle an empty CLI response; the corrected complete run supplies the
[sanitised evidence](staging-storage-usage-evidence-2026-10-05.json).

The lists are sequential live observations rather than one atomic snapshot, and
later requests/log delivery can add objects. Listed body/version bytes exclude
unlisted multipart parts, service overhead and billable requests. These are
staging measurements, not the preserved production storage allowance or a
monthly invoice. Complete usage, billing attribution and budget fit remain
unverified. The inherited P08 pricing artifacts and historical P05 pricing stay
byte-identical; the existing January forecast still exceeds the amended budget
before unmeasured costs. No programme step is closed by this inventory.
