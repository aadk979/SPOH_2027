# P10.7 — Timed announcement publication

The registered `announcement.publish` handler accepts only `{ draftId, expectedVersion }`.
It publishes saved private content for the real scheduled-action creator, under that
creator's current event membership, announcement permission and station authority. The
payload cannot supply content, attribution, event scope or a delivery deadline. Platform,
system-created and recurring publication actions are refused.

The existing scheduler holds Event UPDATE before its action lock and samples the clock
after waiting. The handler uses that instant and the event's current timezone/day boundary;
ARCHIVED, changed authority, foreign/private/missing drafts, stale versions and inclusive
expiry are refused. An IC must still be rostered at the target station on the current
event day. Creation-time schedule authority is still a requirement for the future producer.

The published message, immutable saved-version/publication link, URGENT delivery plan and
per-device intents, metadata-only publication/enqueue audit, and scheduler completion/outcome
share the supplied transaction. There is no nested transaction or network call. INFO lands
quietly in the inbox with no delivery plan. A zero-device URGENT plan remains frozen.
Concurrent executors or separate valid actions for the same saved version leave one message,
publication and plan; the actions keep their separate attributed execution outcomes.

The additive 29th migration creates `AnnouncementPublication` with scoped references to the
exact draft version, published message and real event-bound ScheduledAction. It adds only
the needed parent keys and indexes, with no existing-row rewrite. Publication links and
published drafts/messages are immutable, including INFO messages. Their provenance cannot
be deleted through a dangling parent. Retention remains a separate required integration.
Existing unplanned immediate messages keep their prior mutation behavior.

Private draft reads/listing and id-only creation replay now return `publishedAt` and
`publishedAnnouncementId`, nullable before publication. A published draft cannot be edited;
another announcement needs a new draft. Draft body text and push secrets are not copied
into indefinitely retained audit metadata.

## Verification, 3 October 2026

- **105 focused database checks in four files** passed, including **38 new publication
  cases**, private drafts, durable storage and existing communications. Cases cover current
  authority/targets, private and foreign event isolation, strict payloads, one-off provenance,
  stale-version refusal/review, due/expiry boundaries, duplicate execution, zero-device
  deduplication, published read/replay/refusal and database immutability/provenance FKs.
- Real Event-lock waits observe archive, deactivation, demotion and inclusive expiry. A
  timezone/day-boundary change moves an IC to the next event day; old postings are refused
  until a current posting exists. The actual API worker composition executes the handler.
- Faults at source write, publication link, delivery enqueue, module audit, completion and
  outcome audit roll back all message/publication/plan/device/module-audit effects. Each then
  completes once on a clean retry; raw fault text is absent from stored outcomes.
- **59 shared checks**, **556 server units**, all workspace types and shared/server builds
  pass. Types initially caught two fault mocks returning a plain Promise where Prisma's
  fluent return type was required; bounded pre-write faults now preserve those types. Lint
  caught an oversized publication function, split into preparation and commit orchestration.
- Lint, architecture (**921 modules / 3,989 dependencies**), hardcoding, generated settings,
  changed formatting/diff and current source/fixture/full committed-history secret scans pass.
  Full integration passed **1,158 checks / four existing skips in 87 files** (418.79 seconds),
  including all 38 new publication cases. No new source deployment is claimed by this report.

All local migration/data work is on guarded `spoh2027_test` at localhost:5435. The real
local database, sibling `V1`, pricing artifacts, client layouts, visual baselines, limits
and production resources are unchanged. Full verification uses a temporary awake hold
restored in `finally`. No actual cloud schedule or external push result is claimed here.

P10.7 remains **in progress**. The after-commit delivery worker, authenticated schedule
producer/CRUD, UI, reminders, retention and remaining catalogue dependencies are pending.
P10.9 still requires scheduling a real announcement through the legitimate staging flow.
Polling is the inbox guarantee; external delivery cannot be claimed exactly once.
