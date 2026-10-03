# Announcement publication schedule creation/status — 3 October 2026

This P10.7 slice exposes authenticated one-off creation and private status reads for an
author's saved draft. `POST /events/:eventId/announcements/drafts/:id/schedules` accepts
only `expectedVersion`, future `runAt` and a UUID retry key. Its GET status route binds
the action to that exact event, author and draft. Existing announcement aliases share
the same actor/event retry context. Both routes use the normal authenticated capability
floor, rate limit and `no-store` draft middleware.

Creation acquires the existing Event lock, then rechecks active membership, current
role/station/day authority, owned saved version, expiry and archived/published guards.
The clock is sampled after lock waits. Publication must be strictly in the future and
strictly before any saved expiry. The payload contains only draft ID and reviewed
version, validated through the registered publication handler. The creator comes from
verified authentication; recurrence, arbitrary job types, content and infrastructure
fields cannot be injected.

Action, metadata-only `schedule.create` audit and id-only retry receipt commit together.
The audit is a USER creation receipt linked by entity ID. `scheduledActionId` remains
reserved for execution receipts with `source=SCHEDULE`; the database constraint is
unchanged. No message, delivery plan or external request is created before execution.

Retries retain only action/draft IDs and rebuild the current status, including completion
after worker execution. A key reused against another draft, actor or event is refused.
As in the existing framework, a changed time under the same key replays the original
action; callers need a new key for a new scheduling intent. This slice does not introduce
request-body hashing. Public status omits payload and lease fields and exposes only fixed
error codes; unexpected stored exception text becomes `EXECUTION_FAILED`.

## Verification

- **35 new real-database API cases** pass: exact creator attribution, private status,
  current capability/IC station scope, reviewed versions and time/expiry boundaries,
  foreign-event/member privacy, strict input, safe errors, atomic fault rollback,
  HTTP-bookkeeping failure, concurrent retries, aliases and current-status replay.
- Six real Event-lock waits observe archive, deactivation, demotion, edited content,
  elapsed due time and expiry. No action or creation receipt survives a refused mutation.
- The normal API producer executes through actual root worker composition: no pre-due
  publication, one INFO message at the inclusive due instant, completed status/read/replay,
  and refusal of another publication intent from the now-published draft.
- **186 distinct focused database checks in seven files**, **73 shared checks**, **562
  server units**, workspace types, shared/server builds, lint, architecture (**939 modules /
  4,078 dependencies**), hardcoding and generated settings pass. Changed formatting/diff and
  announcement source/shared/new-fixture/full committed-history secret scans pass.

- Full integration passes **1,229 checks / four existing skips in 89 files** (444.42 seconds).
  The temporary awake hold was restored in `finally`.

D-11 commit/push and exact pipeline verification follow; no deployment or actual staging
schedule is claimed yet. Dedicated `spoh2027_test` only is used locally, with the existing
30 migrations and no new migration. General list/edit/cancel/timeline and UI remain open.
P10.7 and P10.9 are not complete.
