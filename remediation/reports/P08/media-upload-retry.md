# Media upload retry receipts

P08.7 remains open. This slice makes photo-policy issuance retryable before
application storage access is enabled. Staging media stays disabled; no bucket
grant, infrastructure setting, schema or migration changes in this release.

## Behavior and transaction boundary

`POST /media/uploads` now requires one client UUID for the selected photo intent.
The first request reserves that UUID under its endpoint, actor and event. Inside
one bounded transaction it holds Event SHARE, the exact current member SHARE and
the reservation UPDATE lock, samples time after those waits, admits only
LIVE/REHEARSAL, resolves the owning organisation's current limits and signs a
server-generated key. Its curated event/person issuance audit and `{ key }`
replay receipt commit together before the credential reaches the client.

Concurrent duplicates receive the existing in-progress conflict. Failed fresh
signing rolls back issuance and releases the reservation; abandoned reservations
use the existing bounded takeover protocol. A successful response-bookkeeping
failure cannot lose the transaction's settled identifier receipt. Signed URLs,
policy fields and credentials are never retained in the replay table or audit.

Replay verifies the original endpoint, actor and event, then holds current event
and member authority again. It requires the successful matching issuer audit and
unchanged purpose, type and declared length, preserves rehearsal/live provenance,
and applies current size/lifetime limits before re-signing the same object key.
Revocation, a non-capture phase, mode change or incompatible intent prevents new
issuance. Replay creates no new audit or object identifier. All upload responses,
including authentication, validation and replay failures, are no-store.

The client retains the actual File object and UUID only in memory. “Retry photo”
resends that intent after policy or object-upload failure. A different File,
reset, event/person change or unmount invalidates it; replacing a nonempty token
for the same person preserves it. The synchronous person store also blocks a sign-out response
before React commits the new render. Pending responses cannot start an object upload or attach
a key after that invalidation. New attempts clear any earlier attached key and
release replaced preview URLs. Multipart upload carries signed fields before
the file and no application bearer token.

An already delivered S3 signature is a bounded bearer credential until expiry;
these checks govern new policy issuance. Retrying reissues a policy for the same
key with the current configured lifetime while capture remains admissible.

## Verification on 4 October 2026

The two backend regressions first failed on missing UUID admission and duplicate
issuance; the client regression first failed because retries had no UUID. The
focused real-Postgres suite passes 94 checks, including 27 new retry cases and
the existing admission, ownership, auditing and route contracts. The new cases
cover conflicting intent/actor/event, all non-capture phases, mode changes,
membership statuses, role loss, immutable receipt fields, current limits,
fresh/replay signing failures, concurrent/abandoned requests, atomic receipt
settlement and revocation after Event/member lock waits.

All 417 client checks, 565 server unit checks and 105 shared checks pass. Fourteen
client cases cover stable File identity, both request/upload failures, reset and
preview cleanup, refreshed tokens, changed event/person, sign-out, unmount,
superseded selection, synchronous sign-out before render and stale object-upload completion. Phone and laptop Chrome
journeys pass retry-button accessibility and exact UUID reuse, multipart field
order, absence of application bearer/cookie, and attachment of only the confirmed
key. Their storage adapter is a permitted local cross-origin stub, not real S3.

Server build/types, client types, lint and architecture pass (1,021 modules /
4,488 dependencies). The full serial database suite passes 1,450 checks across
98 files with the four existing skips (495.56 seconds). Source/test/report and
history scans pass with no new exceptions; a random test UUID was replaced by
the standard low-entropy fixture UUID rather than ignored. Inherited P08 pricing
hashes and historical P05 files are unchanged. All 58 frozen visual assertions
pass against unchanged baselines after a fresh visual API start; the final
nonvisual synchronous identity guard is covered by the repeated client suite
and phone/laptop journeys. The final static export passes all 32 pages. Exact
staging release evidence is recorded after deployment finishes.

## Exact staging release

Source `f87f6b7` and tracker image
`8fb7fd68c33805de5a276cb63090083efb45a5c3` passed
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37209262654) and
[staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37209520272).
CloudFormation is UPDATE_COMPLETE. ECS revision 115 runs that exact image with
one desired/running task, one completed deployment and zero failed tasks.

At 22:41 Singapore on 4 October, Chrome 154 completed normal Cognito sign-in,
hard reload and sign-out with no app page errors. The disabled producer returns
503/no-store for a valid UUID request; missing/malformed UUIDs and client-selected
event authority return 400/no-store, and anonymous uploads return 401/no-store.
Compatibility settings and guarded product values/versions were unchanged. The
[sanitised evidence](staging-media-upload-retry-evidence-2026-10-04.json) records
these checks. No policy or object was created; failed-request replay reservations
are released by the existing middleware protocol.

Before storage wiring, two further regressions were confirmed against this
release: the attachment path accepts a photo issued in the other capture mode,
and a temporary expired-token null session changes a retained File's UUID.
Those follow-up guards are closed by the separately verified
[photo capture authority slice](media-capture-authority.md), source `ac6a186`
and staging image `1498a74`. Routine nonempty token replacement and explicit
sign-out checks already passed in this retry release.

## Remaining storage criteria

Least-privilege task grants and SSM wiring, exact S3-origin CSP, real signed
browser upload/private read/public denial, content publishing/proxying and
event-aware media retention remain
open. A bucket foundation and retry receipt do not close P08.7 or authorize
production creation before the owner's 28 October go decision.
