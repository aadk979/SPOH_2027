# P14 notification and safety workspace source build — 11 October 2026

Status: source ready for the P14 batch gate. This report records implementation
and authored checks, not suite execution. ADR-011 source batching is preserved:
only ESLint and TypeScript checks ran in this lane; no database migration, suite,
browser campaign, commit or push ran here.

## Notification centre and delivery

The person-authenticated centre, owned detail/read state, quiet-by-default
operational preference and urgent preference use durable notice/preference rows.
Source mutations enqueue minimal notice context in their existing transaction;
no private message, transient description, reporter contact or push credential is
copied into notice storage. Read state is separate from announcement/alert
acknowledgement. Source readers prove current event, membership or own-organisation
authority and source-specific current state before private projection.

Generic push uses bounded durable claims, leases, attempts, immutable expiry,
current preference and current subscription ownership. Urgent announcements keep
their existing delivery-plan owner; generic notice delivery does not duplicate
them. INFO notices stay in the centre. Push acceptance is best effort; source
polling and centre reads remain the availability contract.

Compatibility history materialisation is injectable and limited to current
eligible published announcements and active lost-person searches. Each source
adds at most 100 missing notices per request, over at most 25 eligible events;
the centre reports incomplete coverage honestly. Historical materialisation never
requests push, creates a source acknowledgement, or invents old assignment, swap,
stock or scheduler transitions.

App composition exports are `createNoticeHistoryMaterialiser`,
`materialiseAnnouncementNoticeHistory`, `materialiseLostPersonNoticeHistory`,
and each source's `read*NoticeSource` through its public module index. Root owns
the app registry and scheduler wiring.

Global person export includes safe owned notice identifiers/context references,
timestamps and preferences. Erasure removes owned notices, cascaded deliveries and
global preferences in the existing transaction. Event staff retention clears that
event's notices even when a person remains active elsewhere; preferences remain
until global erasure/anonymisation. Event retention also removes technical
delivery rows through the notice cascade.

## Source workspace homes

`announcementWorkspaceSource`, `lostPersonWorkspaceSource` and
`incidentWorkspaceSource` expose source-owned entity, records and search facades.
Records count, cursor and row queries share their exact visibility, time and pool
predicate. Observation `asOf` is inclusive; interval `to` remains exclusive.

Announcement bodies require current role, persisted current-day posting and
expiry, or reviewed live own-author authority. Final recipient queries recheck
the persisted assignment after the initial audience snapshot. Archive Audit.Read
provides safe metadata and does not inherit write authority. A current recipient
sees their own acknowledgement state; an authorised author sees an observed
aggregate. Unrelated metadata readers trigger no acknowledgement query. Named
acknowledgement rows are omitted.

Incident.Read is checked on the exact incident before body/follow-up selection,
and on the Event before collection access. Private bodies are not searchable.
Lost-person resolved descriptors and reporter contact are omitted immediately,
including when the purge worker is late. Practice descriptors/actions are hidden
outside rehearsal; explicit practice metadata remains distinguishable.

Roster apply additionally writes metadata-only ImportBatch provenance version 0
inside the apply transaction, with the reviewed people row count, actual clock,
actor membership and current rehearsal pool. It does not claim identity undo or
invent missing legacy import provenance.

## Authored verification, pending the batch gate

- `noticeDelivery.test.ts`: delivery kind, preference, deadline and retry rules.
- `noticeCentre.test.ts`: queue atomicity/deduplication, own read/cursor isolation,
  hidden-row bounds, policy failure, current standing, delivery ownership and
  historical materialisation.
- `assignmentNotices.test.ts`: actual roster transitions, no-op suppression and
  roster import metadata.
- `personDataRetention.test.ts`: safe export, erase/cascade and event-vs-person
  retention.
- `safetyWorkspace.test.ts`: source gates before body, announcement posting race,
  acknowledgement privacy, safe archive metadata, exact safety count/pool/time
  parity and immediate transient redaction.
- `notice-centre.test.tsx` and `notification-centre.spec.ts`: read/ack distinction,
  quiet defaults, typed destinations, owner switch and the authored phone/laptop,
  light/dark keyboard/accessibility journey. Browser execution stays in P16.

Targeted source/test lint passed. Client typecheck passed. The final complete
server typecheck result is reported to the root separately so unrelated concurrent
lane failures cannot be mistaken for verification of this source.
