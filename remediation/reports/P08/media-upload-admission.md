# Media upload admission — prerequisite for P08.7

Before enabling private storage, two real-Postgres regressions demonstrated
that the upload producer signed a policy for a revoked membership and for a
DRAFT event. They call the use case behind a previously authorised actor context,
with a fake signer that never calls AWS or uploads an object. Both tests fail
against the preceding implementation and pass with current admission checks.

The producer now owns a bounded ReadCommitted transaction. It takes the Event
SHARE lock, rechecks the current exact event/person/membership and lostFound.log
capability under the membership SHARE lock, then reads the injected clock.
The existing capture-time rule admits new online photos only in LIVE or
REHEARSAL. There is no client timestamp on an upload request, so the pre-close
offline-sync exception cannot create a new photo in CLOSED. Existing signed
photo reads remain available under current membership, including archived reads.

Media size and lifetime resolve through the same transaction, using the locked
event's organisation. The two setting reads are sequential; the previous root
event/settings reads outside the transaction are removed from upload and read
signing. Key generation and signing happen while both authority locks are held.
The event-scoped issuance audit, including rehearsal provenance, commits before
the policy is returned. A failed signer returns no policy and leaves no issuance
receipt. Upload route responses, including validation/authentication/phase
failures, are no-store before the auth middleware runs.

No schema, migration, new write endpoint, client contract or layout changes.
Legacy normally issued keys retain the exact successful event-receipt read and
attachment rules. Existing issued policies and URLs are bounded bearer
credentials until their configured expiry; lifecycle/revocation checks prevent
new issuance, and cannot withdraw an already delivered S3 signature.

## Verification on 4 October 2026

Seventeen new database checks cover inactive membership statuses, lost role and
person mismatch, all four non-capture lifecycle states, valid LIVE/REHEARSAL
issuance, revocation after Event/member lock waits, close after an Event lock
wait, post-wait clock sampling, current scoped size limits, signing failure,
event-bound audit provenance and no-store responses. All 77 affected checks
across five files pass, including prior upload auditing, media ownership, route
contracts and event isolation. Server types/build, 565 backend unit checks,
lint and architecture (1,013 modules, 4,449 dependencies) pass. The full serial
database suite passes 1,423 checks across 97 files with the four existing skips
(462.97 seconds). Source, test and report secret scans pass. Inherited P08 pricing
hashes and historical P05 pricing are unchanged. Exact staging release results
are recorded after completion; unchanged client visuals/export evidence is reused.

## Remaining storage criteria

Media is still disabled in staging. Upload retry/idempotency receipts, stable
client intent, least-privilege task grants and SSM injection, exact storage-origin
client CSP, real presigned browser upload/private-read/public-denial evidence,
content integration and event-aware media retention remain open. This admission
fix alone does not complete P08.7 or authorise production storage creation.
