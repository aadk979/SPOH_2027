# P14 workspace integration plan — 11 October 2026

Read-only preparation while the foundation/P13 application is frozen for CI.
This is a build map, not evidence of completed features or verification.

## Shared destinations and projections

Root will provide `contracts/workspace/` and pure `shared/lib/workspacePath.ts`.
`entityPath`, `recordsPath` and `searchPath` return event-relative URLs; existing
AppLink/ButtonLink/useAppRouter resolve the event once. URLSearchParams preserves
false values, raw station codes and encoded identifiers. No arbitrary server hrefs.
Static `/entity`, `/records`, `/search` pages use validated queries and Suspense,
as required by the installed Next static-export guide.

Entity kinds: station, person, event-day, shift, card, incident, lost-person,
lost-found, announcement, fallback, import, assignment, registration, footfall,
gift and audit. A person id is the global person id; every resolution also names
the event membership. A card id resolves to its scoped code, never its QR payload.

The entity result contains a typed reference, title, safe labelled fields,
permission-reviewed related references/record filters, and allowed existing action
destinations. Field values are bounded text, numbers, booleans or typed instants;
there is no arbitrary source-row JSON. Date formatting uses the event clock.
Related projections have their own authorization before querying or counting.

Records kinds include registrations, footfall, cards, stamps, redemptions,
incidents, lost-person, lost-found, announcements, assignments, imports, fallback,
gift-ledger, audit, people and days. Discriminated queries admit only meaningful
filters for their kind, not silently ignored combinations. Record responses carry
the reviewed applied filter, bounded rows, deterministic cursor and aggregate with
its actual unit; footfall totals sum quantities rather than page length.

Time filters distinguish `from` (inclusive), `to` (exclusive) and `asOf`
(inclusive snapshot instant). Event-calendar `date` intersects these bounds.
Dashboard today/last-hour links preserve their original inclusive as-of boundary;
card funnel ranges keep their original exclusive `to`. Future imported captures
never enter today's records merely because they are newer than midnight.

Capture queries preserve station/person/category/source/import/void/rehearsal.
Gift ledger uses an exact rehearsal pool, with full-history opening stock plus
adjustments minus non-voided redemptions; it is not a today-only row count. Assignment
queries distinguish running shifts, today's checked-in/not-checked-out assignments,
coverage gaps and individual station/shift/day/person references.

## Existing count distinctions to preserve

- Live registrations: non-voided server recordedAt, category and quantity-one rows.
- Station device rows must contain APP captures only. Imported registrations and
  room-entry totals get an explicit source breakdown and import/record destination.
  Removing imports from devices must not remove them from the station total.
- Station stamps count CardStampEvent rows in the observation window, including
  the existing card-status semantics. Their destination is the stamp-row list.
- Funnel station stages count DISTINCT card ids over stamp recordedAt and exclude
  LOST cards; VOIDED remains included. Add an explicit station pointer to a stage,
  preserving its raw code instead of lowercasing it into a reserved stage name.
- Issued excludes UNISSUED and LOST. Completed means exactly COMPLETED. Redeemed
  counts DISTINCT non-voided redemption card ids over redemption recordedAt.
- On-shift counts assignments on running shifts, while checked-in counts today's
  checked-in/not-checked-out assignments. A gap is a coverage slot, not a person.

## Authority and facade boundaries

Use a composite `Entity.Read` enforcement point selecting existing Cedar actions
and resources, never a new unreviewed Cedar permission. Its kind/action/resource
table is tested independently and recorded per request in the route inventory.
The read engine checks evaluation errors and fails 503; it cannot turn unavailable
policy evaluation into an empty successful search or a denied panel.

Station reference uses Self.Read; station counts use Dashboard.ReadStation;
station roster uses Roster.ReadStation. The existing station dashboard bundles
roster/device identity into a counts response: split/gate its private roster facets
before using it for foreign-station IC drill-downs. Hidden links alone do not fix it.

Full person detail uses People.Read. An own-person reference uses Self.Read and a
limited projection. A colleague reference needs a real scoped assignment/shift/
station roster context; supplied context must resolve to that person, never merely
an unrelated station the viewer may read. No email, phone, devices, reportsTo or
global standing escapes through a limited projection.

Full day/shift configuration uses Structure.Read. Limited own-assignment views
derive their scope from persisted assignments, not a fabricated Shift Cedar type.
Incident bodies/follow-ups use Incident.Read on the Incident. Resolved lost-person
history redacts age, description and clothing immediately regardless of worker lag.
Active reporter phone and found-item photo follow existing operational authority.
Announcement visibility rechecks current role, today's station/day and expiry, or
the existing sender-history permission; acknowledgement is not a read permission.

Live import capture metadata may use Fallback.Import and roster batch metadata
Roster.Edit. Both are Write actions, so saved archive history instead uses the
non-Write Audit.Read permission and existing archive standing; undo/edit still
requires its current Write permission. Cross-type history uses Audit.Read. Audit
projections omit IP/UA/sub/global rows.
Gift adjustment remains a separate write permission from ledger reads.

Source modules own focused data/application read facades and export them through
index.ts; workspace orchestrates those public APIs. Every lookup includes eventId.
Related cursors resolve inside the same event, kind and exact filters before paging.
Every page is capped at 200, with deterministic time/id or name/id ordering.

## Capture import history and reasoned undo

Root adds nullable scoped batch FKs to Registration/FootfallTick and a scoped
fallback-window FK on ImportBatch. Within one transaction, create the batch before
insert, stamp only newly inserted rows, then set the actual created row count.
Duplicates keep their original batch, including concurrent duplicates. Historical
import.run audit can explain a window reference but cannot prove capture ownership.
Legacy unlinked rows therefore cannot be silently offered as exact undo candidates.

Undo locks event, current membership, durable receipt, batch and rows in a stable
order. It rechecks current Fallback.Import and every Record.Void resource, refuses
archive, retains voided rows, writes per-row plus batch audit, and settles the
receipt in that transaction. Already manually voided rows count separately.
Replays use the same intent/actor/event fence; no nested per-row transaction use
cases and no roster identity undo. Failures roll back rows, audit and receipt.

## Verification after the source batch

Write contracts/path tests, all-kind positive/denied/foreign-id/cursor tests,
permission-error fail-closed tests, aggregate parity fixtures, audience/PII
projection tests, atomic undo races/rollback/duplicates/legacy tests, and client
links/search/palette/cache-switch coverage. Author phone/laptop/light/dark route,
axe and keyboard journeys without executing them until P16. Existing floors stay.

Only then run affected suites, one full local CI run, one application push and its
exact GitHub CI. The separate browser build plan owns the full route manifest and
fixture inventory; authoring that manifest does not claim browser acceptance.
