# P14.5 notification build plan — 11 October 2026

Planning only, from a read-only review of the current source. The foundation/P13
print batch is entering its final full local CI run. Do not include this plan in
that commit and do not start P14 source edits until its application push is green
on GitHub. No P14 implementation, database operation, push, AWS operation or
browser verification is claimed here.

The requirements are P14.5 and F02-019: one persistent place for announcements,
lost-person alerts, assignment changes and swap decisions; notice read state;
per-person push preferences; receive → read → act. The main P14 build plan also
requires current source visibility, transactional producers and personal-data
retention/export/erasure. Browser execution remains in P16 under ADR-011.

## Ownership and current implementation

The notification lane owns its module, source-module producer/facade patches,
client notification feature and affected tests. Root owns Prisma/schema/migrations,
shared export barrels, app mounts/scheduler composition, navigation, action/audit
catalogues, route inventories/matrices and package files. Request those patches
before editing central files.

- `server/src/modules/notification/application/dispatch.ts` resolves recipients
  and sends best-effort pushes. It has no persistent notice or preference store.
  Named recipients are currently accepted without an active-membership query.
- Scheduled announcements already have durable `AnnouncementDeliveryPlan` and
  `AnnouncementPushDelivery` rows, leases/retries and current audience/device
  checks. Direct `sendAnnouncement.ts` still sends after commit through `dispatch`.
- Lost-person raise/resolve and severe incidents dispatch after source commit.
  `fallbackReminder.ts` and `remindArchive.ts` dispatch from inside scheduler
  transactions. Those reminder pushes can currently happen before SQL commit.
- Assignment create/move/delete, roster import and swap decisions do not insert
  notification-centre records. Assignment removal physically deletes its row.
- `notificationRouter` uses event `requireAuth`. A person with no EventMembership
  is rejected even if they are an own-organisation PLATFORM_ADMIN.
- `findArchiveReminderTarget` deliberately names active own-organisation platform
  admins, including people without an event membership. Preserve this audience.
- Client `AlertDelivery` controls the current device's subscription; it is not a
  per-person preference or a notification centre.

## Central schema and contract requests

Use dedicated notice rows, not announcement rows pretending to be system messages.
Store source identifiers and small typed context; do not duplicate free text or
recipient contact information into another retention surface.

| Model | Required fields and invariants |
| --- | --- |
| `NotificationNotice` | `id`, `eventId`, `recipientPersonId`, optional `recipientMembershipId`, kind, priority, source kind/id, immutable `transitionKey`, strictly typed minimal context, `createdAt`, optional source deadline `expiresAt`, nullable `readAt`. `@eventOwned`; event FK; scoped optional membership FK; person FK. Unique `(eventId, recipientPersonId, transitionKey)`; composite `(eventId,id)` for delivery FK; list index `(eventId,recipientPersonId,createdAt,id)`. Read state/context are staff-personal; source IDs and fixed operational codes are operational. |
| `NotificationPreference` | Person-owned unique `personId`; `urgentPush` defaults true and `operationalPush` defaults false; updated timestamp. INFO never pushes. Existing device unsubscribe still disables that device. The preference is global to the person so changing events cannot silently change the meaning of the setting. |
| `NotificationPushDelivery` | Scoped notice FK; recipient person, optional membership and subscription FK; retained opaque `deviceKey`; fixed status/error enums; attempts/maxAttempts, version, runAt, lease owner/deadline, completedAt, immutable delivery deadline. Unique `(noticeId,deviceKey)`; due-work index `(status,runAt)`. Do not store endpoints, credentials, source message bodies or raw exception text. |

Root should add strict shared schemas in the notification contract package for:

- notice kinds/source references/context, list query and paged list response;
- notice detail and typed destination/action references, with no arbitrary href;
- own notice read mutation, preferences read/update and fixed delivery outcomes;
- additional operational push kinds/TTLs, without making INFO eligible.

Notice read is personal state, separate from `AnnouncementAck` and `LostPersonAck`.
Marking a notice read must not create either source acknowledgement. Repeated
mark-read is naturally idempotent; preserve the original read instant. Personal
read/preference operations can remain usable for a legitimate archive reader;
they do not reopen event business writes.

## Transaction boundary and public interfaces

Expose one storage-only producer from the notification module's public index:

```ts
queueNotices(tx, scope, {
  kind, priority, source, transitionKey, context, recipientPersonIds,
  createdAt, expiresAt,
}): Promise<{ created: number }>
```

The caller's source transaction owns the mutation, transition identifier,
audience resolution and source audit. This function must never open a nested
transaction, perform external I/O or upgrade an already-held event SHARE lock
to UPDATE. Insert notices and eligible device-work rows in that transaction.
Failure rolls back the source and its notice together. Do not wrap the durable
insertion in a catch-and-continue path.

Use stable source transitions, not a wall-clock bucket or a collapse tag, for
deduplication. A collapse tag replaces an OS notification; it is not the SQL
delivery identity. A completed scheduler action/replayed receipt cannot produce
a second notice. Manual assignment operations without a retry receipt can mint
one transition UUID inside the committed change transaction, but only for an
actual persisted change. A rollback commits none of its transition rows.

For source reading, use source-module public facades. A recommended port is:

```ts
type NoticeSourceReader = (tx, {
  eventId, recipientPersonId, source, context, transitionKey, now,
}) => Promise<VisibleNoticeSource | null>;
```

`VisibleNoticeSource` supplies the currently permitted title/summary, a typed
destination and source acknowledgement/action affordances. `null` means hidden
or unavailable. The composition root supplies these ports; producers can import
the notification public API without a source↔notification import cycle. Do not
read another module's private repositories from notification code.

Resolve current person/event standing and source audience using metadata first;
only then query or serialise message bodies. Policy evaluation errors return
503, not a successful empty list. Every cursor/detail/read operation verifies
the owner and event. Filter unread counts and visible page contents through the
same current visibility decision. Bound candidate scanning and return a cursor
for the last scanned row so hidden rows do not strand pagination. Reset paging
when a read-state mutation changes an unread-only dataset.

## Source patches and transition identities

| Source | Exact integration points | Transition / audience / safe source rules |
| --- | --- | --- |
| Announcement, all priorities | `announcement/application/sendAnnouncement.ts`, `publishScheduledDraft.ts`; audience helpers in `data/audienceWhere.ts` and `domain/audience.ts`; new public read facade | `announcement:<id>:published`. Resolve role exactly and station/day against the event's current day, with active membership. Recheck expiry and current role/roster before body. Reuse the P14 entity reader's sender-history authority where applicable; Announcement.Ack is a write and cannot be the read gate. Drafts and cancelled schedules produce no notice. |
| Lost-person raised/resolved | `lostPerson/application/raiseAlert.ts`, `resolve.ts`; public safe read facade | `lostPerson:<id>:raised` and `lostPerson:<id>:resolved`. Active members at production time. Store no age, description, clothing, reporter phone or free-text resolution. Raised notice can show the source only while active; resolved detail omits transient fields immediately even if purge is late. OS payload remains the existing generic description-free message. |
| Assignment add/move/remove | `assignments/application/createAssignment.ts`, `deleteAssignment.ts`, scoped repo change comparison; `roster/application/applyRosterImport.ts` and roster repo upsert result | One identifier for each actual committed assignment transition. Compare persisted station/role state under the mutation's lock; no-op upserts/import reruns produce no notice. Context is recipient-specific operation plus assignment/shift/day/station IDs, not names or contacts. Removal must notify the old owner even though its row no longer exists. Do not require that person still own the assignment to read their own removal notice. Link removal to My shift; an existing current assignment can link to the permitted shift/entity. Invited recipients may retain a notice for first sign-in, but no push before ACTIVE standing. |
| Swap decisions and withdrawal | `shift/application/decideSwap.ts`, `withdrawSwap.ts`; public facade using existing `listMySwaps` ownership | `swap:<id>:APPROVED`, `:REJECTED`, `:CANCELLED`. Requester and target are persisted on the swap even after approval moves the assignment. Notify both decision participants; omit decider/request free text from stored notice. Current active event standing plus requester/target self-history controls reading. Existing source decision/withdrawal receipts settle with notices. |
| Fallback reminder | `fallback/application/fallbackReminder.ts`, `fallback/jobs.ts`, `data/reminderRepo.ts` | `fallback:<windowId>:remind:<sequence>` or the immutable scheduled-action ID. Insert while queueing the next reminder, then let a committed worker send. Declarer plus current coordinators are the intended recipients. Recheck open window, scope and the source read/acting authority; closure hides/stops stale actionable reminders. |
| Archive reminder | `event/application/remindArchive.ts`, `event/jobs.ts`, `data/archiveReminderRepo.ts` | `event:<id>:archive:<lifecycleVersion>` or scheduled-action ID. Current CLOSED status and exact version are mandatory. Recipient must remain an active own-organisation PLATFORM_ADMIN. Reopen/archive invalidates the source. Membership is optional; never broaden to all event ADMINs or manufacture event memberships. |
| Severe incident | `incident/application/reportIncident.ts`, replace `notifySafetyChain.ts` fanout with producer; public incident facade | `incident:<id>:raised`. Keep the existing severity threshold/excluded reporter and require current Incident.Read on this scoped incident before showing source information. Do not duplicate its description/location free text. |
| Gift low-stock | `gift/application/redeemGift.ts`, `adjustStock.ts`, replace `notifyLowStock.ts` fanout with producer | Use the committed redemption/adjustment ID for each meaningful threshold transition, not every redemption while already low. Recheck current gift state and dashboard read authority. Store IDs/counts only. Keep rehearsal separate; no live stock push from rehearsal. |

For assignments, the existing upsert and roster helpers need enough result data
to report `{id, before, after, changed}`. `applyRosterImport` must use that actual
result, not its pre-transaction preview counters. An approved swap should produce
its own decision notice; avoid duplicate assignment/change pushes for the same
decision unless deliberately represented as separate, useful in-app notices.

## Person routing and own-organisation administrators

Mount a separate person-authenticated centre/preferences router as a platform
route before legacy event aliases. Recommended paths are `/notifications/centre`,
`/notifications/centre/:id`, its own-read mutation and `/notifications/preferences`.
Use `requirePerson`; an optional event filter must not confer event authority.
Keep existing event subscription/config routes compatible.

For ordinary notices, derive current membership, then ask the existing source
Cedar action/resource. For archive reminders, ask the existing person-based
`Platform.AdministerEvent`/own-organisation standing against the source event.
No active membership is required for that platform notice. Cross-organisation
IDs and foreign notice/cursor IDs answer 404 without leaking source information.

There is a pre-existing navigation limitation: event APIs still require an
EventMembership even for a platform admin. The centre must therefore not send
an admin without one to an event page that will immediately 404. Give that reader
an honest event-administration destination; provide a direct close-out link only
when the existing event entry is available. Do not add memberships as a GET/read
side effect or silently broaden ordinary event reads.

## Durable push and preferences

Retain one owner per external delivery. Recommended small integration:

1. Keep the existing AnnouncementDeliveryPlan worker for URGENT announcements.
   Direct sends now queue it in their source transaction too. Centre notices are
   created for every priority, but urgent announcement notices must not also
   queue generic push deliveries.
2. Check current `urgentPush` in `announcement/application/deliveryReadiness.ts`.
   Extend its fixed error enum with PUSH_DISABLED; complete SKIPPED instead of
   repeatedly retrying a disabled preference. Preserve source lifetime, audience,
   membership and subscription-reassignment checks/accounting.
3. Generic notice device rows cover the other kinds and OPERATIONAL announcements
   only when the person explicitly opted in. INFO does not queue push work.
   Preference changes never suppress the durable centre notice.
4. Add `deliverNoticeBatch({workerId,clock,sourceReaders})` to the existing
   `server/src/app/startScheduledJobs.ts` afterActions hook beside announcement
   delivery. Reuse bounded claims/leases/attempts, current device ownership,
   immutable deadlines and sendDevicePush. Do not add a private timer.
5. Resolve current source visibility and preference before constructing a push
   snapshot. Disabled/unconfigured/expired/out-of-scope/gone-source states settle
   SKIPPED. Provider rejection retries only within the fixed deadline/attempt cap.
   Prune a gone subscription only if its owner/keys are still the original ones.

Preserve the five-device cap and the existing per-kind push TTLs. No new daily
push quota or delivery guarantee is implied. Browser/provider acceptance is not
proof that a person saw a notification. A source commit must never wait for a
push service.

New builds may have pre-existing announcements/active alerts. Provide an explicit,
bounded compatibility materialisation path for currently eligible sources, using
the same stable source transition keys and current audience checks. Do not send
historical pushes again or backfill private free text/audience history inferred
from timestamps. Document which pre-feature personal change history was never
recorded instead of inventing assignment/swap notifications for it.

## Retention, export and erasure

- Extend `people/data/personDataRepo.ts::exportPersonData` with the person's
  notice identifiers/source references/timestamps/read state and preferences.
  Do not export notification source bodies, other people's details, endpoints,
  credentials or arbitrary context without its strict safe projection.
- Extend `erasePersonNotes`/`anonymisePerson` to delete that person's preferences,
  notices and pending/delivery state in the existing erasure transaction. Revoke
  sessions/device state as today; source operational IDs and immutable audit stay.
- Extend `people/application/staffRetention.ts` with event-scoped notice cleanup
  at `privacy.staffRetentionDays` after archive (default 365). This deletion must
  run even when another current event prevents global person anonymisation.
- Global person preferences are removed on actual global erasure/anonymisation,
  not merely because one event aged out. Expired technical delivery rows can be
  pruned by a bounded notification retention handler without retaining credentials.
- Lost-person transient values must never be copied into notice/context/replay/
  push/audit storage. The existing lost-person purge continues unchanged.
- Root updates schema classification, the data map and privacy/export contracts;
  no broad scanner exception or shortened immutable-audit retention is needed.

## Client and meaningful affected verification

Build a notification screen and preference controls in `client/src/features/notification`.
Partition list/detail/preferences caches by person and event filter; unmount
private selected detail on identity, event or permission loss. Use no-store
requests and suppress old in-flight replies via the existing session-generation
guard. Read buttons affect only notice state. Action buttons use typed reviewed
entity/screen paths and preserve the source's own acknowledgement/decision controls.
Keep `AlertDelivery`'s explicit device permission gesture and distinguish person
preferences from that device's subscription.

After writing the whole lane with lint/typecheck only, add/fix affected suites:

- source + notice rollback; receipt/scheduler/concurrent transition dedupe;
- no-op assignment/import suppression; deleted assignment and transferred swap
  self-history; both swap participants, no foreign recipient or free-text copy;
- current role/roster/day/expiry and policy-failure checks before announcement body;
- raised/resolved/purged alert privacy, including a deliberately late purge worker;
- platform admin without EventMembership, cross-organisation denial and revocation;
- own/event cursor isolation, equal timestamp ordering, hidden rows, unread counts
  and reset after read-state filtering changes;
- preferences default urgent only, operational opt-in, INFO quiet, disabled terminal
  outcomes, subscription handoff/gone-device ownership and immutable send deadline;
- event retention while person remains active elsewhere; global export/erase;
- client owner/event changes, withheld source details, receive → read → act and
  notice-read not changing source acknowledgement.

Author the browser receive/read/action/preference scenario during P14 and execute
it in P16.1. The root runs one complete CI pipeline for the whole P14 source batch,
then one application push and exact-head GitHub CI. No per-notification full runs.
