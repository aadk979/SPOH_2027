# Event schedule timeline metadata — P10.8

The bounded `GET /schedules` foundation lets current event configuration managers read
event-owned scheduled-work metadata. It returns catalogue kind, original due and next
attempt times, status, version, attempts, recurrence, whether the current person created
it, creation/completion times and bounded failure codes. Unknown stored handler names
become **OTHER**; unknown errors become **EXECUTION_FAILED**. No action payload, private
draft text/ID, audience, actor identity, dedupe key or lease token is returned. The
database selection does not load payloads, dedupe keys or lease tokens.

Each no-store page locks Event first in SHARE mode, checks current membership/capability
under lock and reads the evaluation clock after any wait. It uses a ReadCommitted
transaction. Platform and foreign-event actions are excluded; foreign/missing cursors
both return 404. Strict shared query/result contracts bound pages at 200 records and
reject mismatched events, duplicate result IDs and incorrect counts. An optional status
filter covers every scheduler state. Pages are newest-created first, using immutable
creation-time/ID keyset bounds; an action changing status between pages does not drop
the next eligible row. Historical null original due times fall back to the stored runAt.

The public failure catalogue is now shared with the unchanged private announcement
schedule contract. This read does not create, edit, cancel, execute or audit work, and
does not add a migration. Private announcement management and execution stay in their
existing authorised paths.

## Verification on 4 October 2026

- All 84 shared checks pass, including four new strict metadata/pagination/privacy
  checks and compatibility with the announcement failure schema.
- All 24 new database checks pass on guarded `spoh2027_test`. They cover all statuses
  and error codes, missing/foreign/platform records, private-data omission, no effects,
  tied timestamps, a changed-status cursor, current authority and real Event lock waits
  with committed rows/permission changes and the post-wait clock.
- The 47 affected existing route-isolation/private schedule-management checks passed
  in the preceding combined run. Initial synthetic lease/completion fields were corrected
  to satisfy the actual scheduler constraints; no database guard was relaxed. The
  changed-status pagination failure was fixed with explicit keyset bounds before the
  final 24-check pass.
- Server/client types and the server build, root lint/architecture/hardcoding and
  generated settings checks pass. Source/shared/test/evidence scans find no leaks.
  No client journey is claimed for this API foundation.

CI [37140098344](https://github.com/aadk979/SPOH_2027/actions/runs/37140098344)
and staging deployment
[37140455639](https://github.com/aadk979/SPOH_2027/actions/runs/37140455639)
succeeded for tracker commit `9bd7af51543ca6cc5b4bae048c0a4c6bb167f2d7`
(API source `a25970d`). CloudFormation reached UPDATE_COMPLETE; ECS revision 103
runs that exact image with desired/running 1, completed rollout and zero failed
tasks. Installed Chrome 154 verified normal Cognito sign-in, every status-filtered
metadata response, no-store headers, strict event contracts, rejected unknown query
and missing cursor, and normal sign-out with no page errors at 01:37 Singapore on
4 October. [Sanitised evidence](staging-schedule-timeline-api-evidence-2026-10-04.json)
contains only bounded counts/statuses and runtime references. This probe made no
schedule, lifecycle, announcement or delivery writes.

The [metadata UI](schedule-timeline-ui.md) is a separate bounded slice. Authorised
general create/edit/cancel consumers remain open in P10.8. The full schedule catalogue,
generated settings/history/revert and later phase criteria remain unchanged.
This foundation alone does not close P10.8 or P10.
