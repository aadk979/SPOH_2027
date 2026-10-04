# Photo attachment provenance and retry ownership

P08.7 stays open. This follow-up closes two verified gaps before S3 application
access is enabled: a same-event photo could cross rehearsal/live mode at item
creation, and token expiry could replace the retry UUID for the same retained
File. Media remains disabled in staging. No schema, migration, bucket policy,
application grant or storage configuration changes in this slice.

## Capture admission and photo provenance

Found-item creation holds Event SHARE, then the exact current member SHARE, and
rechecks `lostFound.log` before sampling admission time. Phase/grace admission,
photo validation, item creation and its audit remain in the same transaction.
A role/status/person change observed after either lock wait prevents the write.

A new attachment requires the successful issuance audit for this event and an
explicit boolean rehearsal marker. Its marker must match the admitted item
mode. Missing/nonboolean legacy provenance returns the same unavailable-object
failure; it is never inferred from the key, issuance date, caller or current
phase. Existing issued-key historical reads retain their successful event-receipt
rules. Older receipts with a valid mode marker do not need newer retry metadata.
The capture event lock prevents a phase change between the comparison and item
commit. Refusal creates neither an item nor an item audit.

## In-memory client ownership

The hook follows the synchronous person identity retained by the existing session
store when a token expires. A temporarily missing token cannot discard the File
or UUID while the same hook/person remains active. Explicit sign-out and person
changes still clear that identity and invalidate pending credentials immediately.
The camera is offered only with a current session in LIVE/REHEARSAL.

Lifecycle status joins the intent owner. A mode/phase change clears completed
keys, previews and retry files; pending responses cannot start an object upload
or attach a stale key. Reset and unmount still discard the File. This does not
persist files across navigation/reload or change global session refresh behavior.
The server remains authoritative if a client's event snapshot is stale.

## Verification

Both cross-mode attachment regressions first returned 201 instead of 409. The
expired-token regression used the real in-memory session store and first observed
two UUIDs for one File. They pass after the fix.

All 110 focused real-Postgres checks across five files pass, including 18 new
cases for both mode directions, same-mode attachments, missing/nonboolean
provenance with preserved historical reads, older valid markers, current member
statuses/role/person, revocation after Event/member waits, post-wait phase and
clock sampling. All 426 client checks across 55 files pass; nine new cases cover
the real expiry gap, pending phase changes, completed practice-photo clearing and
all non-capture lifecycle states. The full serial database suite passes 1,468
checks across 99 files, with the four existing skips (496.89 seconds). The 565
server unit checks, server build/types and client types pass. Lint and
architecture pass (1,024 modules / 4,505 dependencies), as do hardcoding,
generated settings and formatting checks. Source/test/report and 618-commit
history scans are clean without new exceptions. Inherited P08 artifacts and
historical P05 pricing are unchanged.

The phone/laptop retry journeys both pass, including axe checks and no bearer
token/cookie on the permitted local cross-origin object adapter. These journeys
do not claim real S3 evidence. After restarting the visual API with this build,
all 58 visual checks match unchanged baselines. The static export passes all 32
pages. Exact staging release evidence is recorded after deployment finishes.

## Remaining storage work

P08.7 still needs task IAM/SSM and exact S3 CSP wiring, real browser upload/private
read/public denial, content publication/proxying and event-aware media retention.
Previously delivered signatures remain usable until their bounded expiry; these
guards control issuance and new item attachment. Production creation/cutover
still requires the owner's 28 October go decision.
