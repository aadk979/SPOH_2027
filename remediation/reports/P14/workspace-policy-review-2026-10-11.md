# P14 workspace policy and link review — 11 October 2026

Future build input only. Reviewed the frozen workspace/client plans against the
current Cedar catalogue, source routes, aggregate queries and F02 relationship
matrix while the foundation/P13 batch entered full CI. No application source,
tests, dependencies, database, AWS resources, staging or commits were changed by
this review. This document does not claim P14 completion or verification.

## Concrete corrections before implementation

1. **Keep the existing person-level welfare warning.**
   `shift/domain/staffing.ts::longShiftWarnings` deliberately returns one warning
   per person, choosing the earliest open check-in. The client attention table's
   “never assume two assignments of one person are one warning” conflicts with
   that rule. Keep one warning, and add the chosen assignment/station/shift/day
   identifiers to its projection. Other open assignments can be related links;
   they must not multiply the warning count. Select a deterministic assignment
   when check-in instants tie.

2. **Give a staffing gap the same identity in its source and destination.**
   `shift/data/repo.ts::runningShiftRefs` picks one running materialized shift per
   template code. `staffingByStation` aggregates all running assignments by
   station plus template code, and `staffingGaps` matches that code. The client
   plan instead promises the exact `shift.id`. An exact shift filter cannot
   reproduce a grouped cell when more than one materialized shift with that code
   runs at once. Structure exceptions can change each day's hours independently;
   `templateWindow` validates the individual interval, not cross-day overlap.
   Recommendation: group source staffing and gap cells by materialized shift ID,
   retaining code only as a label, and carry that ID through the destination.
   If preserving template grouping instead, expose all constituent shift IDs and
   use that same reviewed grouped predicate on both sides.

3. **Do not promise a redemption void that has no implementation.**
   `Record.Void` supports a `GiftRedemption` Cedar resource, but
   `gift/http/routes.ts` exposes redemption creation and gift stock adjustments,
   with no redemption-void endpoint or application use case. The attention plan
   must either build a reasoned, audited, receipt-safe void on the exact scoped
   redemption, or point to an accurately labelled existing stock adjustment.
   `Count.Adjust` on a GiftType changes stock; it does not mark a redemption
   voided or remove its flag. Include the missing operation in the future batch
   if the proposed “correct this redemption” action remains.

4. **Do not intersect a cross-midnight last-hour link with today's date.**
   The workspace contract says `date` intersects `from`/`asOf`, while the client
   requires source-date context on all links and correctly notes that the
   last-hour count can include the previous day. For that link use its exact
   `from = asOf - 60 minutes` and inclusive `asOf`, without a filtering `date`
   or eventDayId. A display-only observation-date label is safe. Otherwise the
   destination silently excludes the prior-day records.

5. **Use a non-Write permission for archive history.**
   The workspace plan now records this correction, but the main/client plans
   still abbreviate capture imports as Fallback.Import and roster imports as
   Roster.Edit. Both are Write actions and the locked archive guardrail forbids
   them. Preserve their live metadata gates; use `Audit.Read` on Event for saved
   archive/cross-type import history, with existing archive standing. Undo/edit
   continue to require current Write authority. Do not ignore archive guardrails
   through the mutation-only `requireCurrentPermission` helper just to serve a
   read. Existing announcement draft routes also use a Write send action for
   their reads; a future published sender-history facade must explicitly choose
   its archive read gate rather than inheriting that route. Audit.Read can serve
   safe archive metadata; it does not by itself establish authority to an
   expired or targeted announcement body. Keep body visibility on the current
   recipient rule or an explicitly reviewed own-author history rule.

6. **Resolve the gift-summary pool mismatch before linking it.**
   The client plan already identifies this: `/gifts/summary` counts non-voided
   redemptions across rehearsal modes while remaining stock uses the current
   exact pool. Choose and expose an explicit observation for each figure. One
   “same mode” destination cannot reproduce both existing figures. A stock
   ledger needs all retained pool history and opening stock, not a today filter.

7. **Apply source separation to device freshness as well as device totals.**
   The client plan now records this source-policy check. The current
   `dashboard/data/repo.ts::checkedInWithLastCapture` takes MAX recordedAt from
   registrations, footfall and stamps across sources, and registrations/footfall
   do not exclude voided rows there. A bulk importer can therefore look like an
   active phone. If the figure remains “device quiet”, calculate it from APP
   captures under an explicit void policy; otherwise rename it as general
   recorder activity. Keep source/destination predicates identical and preserve
   imports in the overall station totals.

## Exact existing action and resource map

`Entity.Read` is a composite enforcement point, not a Cedar action. The catalogue
is `packages/shared/src/generated/actions/index.ts`; resources are declared in
`platform/access/authorizer/resourceEntities.ts`. There is no Shift, Person,
ImportBatch or AuditRow Cedar resource. Use the existing resource below, followed
by event-scoped source lookup and a deliberately bounded projection.

| Projection | Existing action and exact resource | Additional source proof |
| --- | --- | --- |
| Station legend/reference | Self.Read on the caller's Membership | Scoped station; minimal reference only, not full configuration |
| Station count/capture records | Dashboard.ReadStation on that Station | Exact observation and station predicate |
| Event dashboard observation | Dashboard.ReadEvent on Event | Does not grant incident, person or roster details |
| Station named roster/assignment | Roster.ReadStation on that Station | Assignment resolves to the same event/station/person/shift/day |
| Own person/assignment/day reference | Self.Read on the caller's Membership | Persisted own membership/assignment; never Self.Read on the target Station or another membership |
| Full event person profile | People.Read on Event | Scoped event membership/person; use event `getVolunteer`, not global `getPersonDetail` |
| Full event day/materialized shift configuration | Structure.Read on Event | Scoped day/shift; no invented Shift resource |
| Incident collection | Incident.Read on Event | Exact scoped filters |
| Incident body/follow-ups | Incident.Read on that Incident | Scoped incident; dashboard counts cannot substitute |
| Active lost-person/found-item view | Self.Read on the caller's Membership | Current operational projection; resolved alert descriptors redacted immediately |
| Announcement recipient body | Self.Read on the caller's Membership | Current role, today's persisted station/day assignments and expiry |
| Published announcement sender history | Announcement.SendStation on the target Station or Announcement.SendEvent on Event, plus persisted author ownership, for live sender history; Audit.Read on Event for safe archive metadata | Body needs current recipient or reviewed own-author history authority; never unrelated readers or all private drafts |
| Station fallback window | Dashboard.ReadStation on the resolved Station | Window belongs to that event/station |
| Event-wide fallback explanation | Existing dashboard-reader collection gate | Preserve current reader eligibility; do not invent a Fallback.Read permission |
| Live capture import metadata | Fallback.Import on Event | Exact scoped batch, associated window and retained provenance |
| Live roster import metadata | Roster.Edit on Event | Exact scoped batch; no identity undo |
| Archive/cross-type import history and audit | Audit.Read on Event | Existing archive standing; safe event-only projection |
| Gift ledger/redemption records | Existing dashboard-reader collection gate; exact Dashboard.ReadStation for station-filtered rows | Exact gift/pool/station/time predicates; source-safe related references |
| Selected card scan/history | Self.Read on the caller's Membership | Scoped short code/card; never QR payload in URLs; extra capture/actor facets separately gated |
| Capture/redemption void action | Record.Void on the exact Registration, FootfallTick or GiftRedemption | Current Write standing and actual implemented use case |
| Gift stock adjustment | Count.Adjust on that GiftType | Exact pool/reason/current Write standing |
| Platform event administration without membership | Platform.AdministerEvent on Event with Person principal | Owning organisation; use the platform destination, not a fabricated event membership |

`anyStation(..., any=true)` proves permission on one candidate, not on every
station in a returned private collection. Evaluate each station for roster
facets and query only authorized stations. The locked IC station restriction
applies to Roster.ReadStation and Announcement.SendStation; Dashboard.ReadStation
does not carry that restriction. Consequently foreign-station counts can be
visible while the named roster and full person profile remain absent.

Do not use global `people/application/personLifecycle.ts::getPersonDetail` under
People.Read. That function exposes global membership/account data and checks
Platform.ManageAdmins on every relevant Organisation. The event workspace needs
the event projection or a narrower reference instead.

## Recommended public facade boundary

Root owns orchestration and shared contracts. Source modules export focused
reads through their `index.ts`, not raw repositories. Pass one read context with
event scope, person/membership identity, one observation clock and an authority
port that propagates policy evaluation failures as 503. Recommended operations:

```ts
readStationReference(context, stationId)
readStationCounts(context, stationId, observation)
readStationRoster(context, stationId, assignmentFilters)
readPersonReference(context, { personId, via })
readEventPerson(context, personId)
readOwnAssignment(context, assignmentId)
readStructureReference(context, { eventDayId, shiftId })
readIncident(context, incidentId)
readAnnouncementVisibleTo(context, announcementId)
readImportHistory(context, importBatchId)
readCapturePage(context, exactDiscriminatedFilters)
```

`via` must be a discriminated persisted relation such as `{kind:'assignment',
assignmentId}`. Resolve its event, person, station, day and shift before checking
the relevant station roster permission. Supplying an unrelated allowed station
or shift in the URL must not unlock a person. The limited reference contains
only scoped person/membership ID, display name and the proved relation; it omits
email, phone, devices, reportsTo and global standing.

Return a typed reference, safe fields, reviewed available facets and typed
related destinations. Keep count/row units and applied observation in the
response. A facet permission must be decided before fetching or counting its
private source. A denied facet carries no hidden IDs, names, row counts or raw
JSON. An unavailable policy engine fails the request; it is not an empty result.
Do not return arbitrary hrefs, QR payloads, photo object keys or audit before/
after JSON in generic fields. Safe audit field projection is action-specific.

Current station dashboard payloads bundle named roster/device data into count
reads. The workspace plan correctly calls for splitting/gating those facets;
the source response must be corrected too, since hiding the new link leaves
the data exposed. APP contribution rows should carry an authorized minimal
person reference only when its persisted context is proved; otherwise present
the safe count/source without an unauthorized profile destination.

For lists, validate the cursor inside the exact event/kind/filter/visibility
dataset before paging. Counts must describe that same authorized dataset, not
the unfiltered database or the current page length. Keep person/event partition
on all client caches and discard private readers on denial or owner change.

## Related-link coverage to make explicit

The plans say “related references” but the F02 matrix needs a concrete inventory.
Use this as the implementation checklist; each destination retains its own gate.

| Home | Required related destinations |
| --- | --- |
| Event day | That day's materialized shifts, authorized counts/records and fallback windows; own attendance route separately |
| Shift/assignment | Exact station/day/person reference, that shift's permitted roster, own check-in/attendance/swap actions and approved assignment repair |
| Station | Counts, APP contributions, recent capture rows, authorized roster, incident/alert/found-item records and fallback windows |
| Person | Authorized assignments, attendance, captured records and raised reports; full contacts/escalation separately from limited roster reference |
| Card | Stamp history and stations left, scoped group/registration links when authorized, redemption status, replacement predecessor/successor and permitted corrections |
| Gift | Exact-pool ledger, redemptions, adjustments and the existing reasoned stock action |
| Incident | Follow-ups/status, station and safe reporter reference; audit only under Audit.Read |
| Lost-person alert | Last-seen station, safe reporter contact under active operational rules, own ACK/resolve controls; resolved-today list without personal descriptors |
| Found item | Station, authorized photo read, existing claim/close-out status and safe logged-by reference; no invented claimant identity |
| Announcement | Target station/day, permitted author reference and acknowledgment observation; named acknowledgment rows need separate person/roster authority |
| Fallback | Exact associated imports and report caveat destination |
| Import | Proven window, exact newly inserted capture rows/source, safe importer reference and genuinely supported reasoned undo |
| Registration/footfall/redemption | Station, authorized actor/card/gift/batch references and actual correction operation |
| Audit row | Scoped safe entity resolution plus authorized actor reference; unresolved/erased/unsupported entities remain honest non-links |

Extend the future mapping tests to every inventory row, including absent related
facets. Cover forged person contexts, IC foreign station counts without roster,
archive read/write separation, source-only count visibility, grouped shift
identity, one-person welfare warning, midnight boundaries and distinct-card vs
stamp-row vs footfall-quantity units. Author these after the feature batch; this
review executed no suites and made no acceptance claim.
