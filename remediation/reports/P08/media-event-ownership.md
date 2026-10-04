# Media event ownership — prerequisite for P08.7

Before enabling staging media storage, two database regressions demonstrate that
the existing API signs another event's upload key (200) and accepts that key on a
new found-item record (201). Both cases use a normally issued upload policy and a
caller with active memberships in both events. The S3 adapter is fake and never
uploads an object or calls AWS.

Media reads now require a successful media.upload audit receipt with the exact
path event, MediaObject type and object key. The read holds the Event SHARE lock
and rechecks the current active membership under its SHARE lock before minting
the URL. The bounded ReadCommitted transaction keeps those locks through signing.
Route-level read responses, including authentication/validation/ownership failures,
are no-store. The existing query DTO now lives in the shared media contract with
the same key bounds and strict query fields.

The found-item use case checks that same issuance receipt inside its existing
capture/item/audit transaction before storing a photo key. A foreign or unissued
key creates neither an item nor its audit. Logging without a photo and linking an
event's own normally issued photo remain supported. No new setting, schema,
migration, S3 resource or write producer is introduced.

## Verification on 4 October 2026

The two regressions fail against the original implementation and pass after the
fix. Twenty-one ownership checks cover own-event legacy-format receipts, foreign
and unissued keys, rejected receipt outcomes/types/actions, atomic attachments,
current membership, revocation behind Event and membership lock waits, archived
read-only access, strict queries and no-store failures. Seventy-two affected
database checks pass, including existing upload auditing, route contracts,
isolation inventory and capture admission. Server/client types, the server build,
103 shared checks, lint and architecture (1,013 modules, 4,447 dependencies) pass.
The full serial database suite passes 1,406 checks across 96 files with the four
existing skips (533.82 seconds). Source, test, shared-contract and report secret
scans pass. The three inherited P08 pricing hashes and historical P05 files are
unchanged. Exact-image CI/deployment results are recorded after completion.

Existing legacy-format keys remain readable when their successful issuance receipt
names the event. Historical keys without that provenance are denied; there is no
prefix-only fallback or automatic reassignment. Any later provenance repair must
establish actual event ownership. A URL already issued remains a short-lived bearer
credential until its configured expiry; this change prevents new issuance after
current membership revocation.

Storage remains disabled until its infrastructure and real private-upload criteria
are verified. This application prerequisite does not complete P08.7 or P08. No
production storage, existing backup bucket or live Lightsail deployment is changed.
