# Next P13 implementation batch — 10 October 2026

Source map only; no tests, database work or feature edits performed. Current batch CI is pending.
All API paths below are relative to `/api/v1/events/:eventId`. Proposed paths are implementation
recommendations, not new product rules. ADR-001 event isolation, ADR-002 taxonomy/card rules,
ADR-004 lifecycle/rehearsal rules and ADR-005 authorization remain binding.

## Reuse before adding endpoints

| Area                    | Existing server routes, contracts and helpers                                                                                                                                                                                                                                                                                                                                                                        | Actual gap for P13.3 / P13.5                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Days                    | `GET/POST /admin/event-days`, `PATCH /admin/event-days/:id`; `contracts/eventDays` has `EventDayRecord`, create/update requests. `modules/eventDays/index.ts` exports handlers, `addShiftsForDay`, `requireEventDay`; `application/addShiftsForDay.ts`, `domain/shiftWindow.ts`, `domain/templateHours.ts` materialise event-timezone shifts. Days already return shift ids/times and assignment counts.             | Client day list/create/edit. Existing date is immutable. Any removal must preserve referenced history; there is no delete/deactivate API or day-active field. Do not equate full CRUD with deleting operational records.                                                                                                                                            |
| Templates / exceptions  | `GET /admin/shift-templates`, `PATCH /admin/shift-templates/:id`; `ShiftTemplateRecord`, `UpdateShiftTemplateRequest`. `updateShiftTemplate.ts` regenerates non-overridden rows using `listFollowingShifts` / `setShiftWindow`; Prisma already has `Shift.overridden`.                                                                                                                                               | Template create/deactivate, editing `endsNextDay`/order, and explicit per-day override/reset endpoints are absent. Current shift DTO does not expose template id or override state. Add the exceptions grid and a complete template editor, reusing wall-clock conversion.                                                                                          |
| Stations / types / tags | `GET /stations` active reference list; `GET /admin/stations` includes inactive; `POST/PATCH /admin/stations[/:id]`. `contracts/station` provides summary, create/update schemas. Public module exports `listActiveStations`, `requireActiveStation`, `requireEventStation`, `findStationById`, `listStampingStations`, `listStations`, `toStationSummary`.                                                           | Client administration; standalone type/tag list/create/edit/deactivate contracts/routes are absent. Existing summaries only reveal types/tags already attached to a station, so they cannot populate a new-event editor. `floor` is the present location field. Capabilities stay on the type; stamp selection must use `issuesStamp`, never a second station flag. |
| Visitor categories      | `GET /admin/capture-categories[/:categoryId]` includes inactive; list/read/schedule contracts in `contracts/taxonomy`; scheduled activity create/update/cancel routes already exist. `modules/taxonomy/index.ts` exports readers and schedule use cases. `registration/application/setCategoryActive.ts` is an internal transaction-aware worker primitive, not a public cross-module API.                           | Category create and immediate label/order/active update routes/contracts are absent. Extend the category workspace; keep scheduled activity review and existing guards. Stable code and historical counts survive deactivation.                                                                                                                                     |
| Gifts                   | `GET /gifts`, `POST/PATCH /admin/gift-types[/:id]`, `POST /gifts/:id/adjust`; `contracts/gift` has all mutation schemas and derived-stock records. Public `gift` exports `listGifts`, `toGiftTypeRecord`, admin handlers. `data/repo.ts:listGiftTypes` already accepts `includeInactive`.                                                                                                                            | Admin list including inactive is absent: `/gifts` deliberately lists active types only. Add this read plus client create/edit/restore/reasoned adjustment. Never edit opening stock through update; remaining stock stays initial + adjustments − redemptions, separated by rehearsal mode.                                                                         |
| Cards                   | `POST /cards/batch`, `GET /cards/:shortCode`, `GET /cards/qr/:payload`, issue/stamp/void/reissue routes; complete schemas in `contracts/missionCard`. `generateBatch.ts` inserts only fresh cards, audits and settles replay; `domain/cardBatch.ts` creates ambiguity-free codes/opaque QR payloads and formula-safe CSV. Public module exports normalization/redemption/journey helpers, not raw application files. | Batch/lookup/void/reissue clients; persisted batch list/detail/export downloads and actual printable PDF/ZIP in private S3 exports are absent. Existing response is CSV only, and there is no batch table: `MissionCard.batchLabel` is insufficient as an immutable export receipt. See export requirements below.                                                  |
| Assignments             | `POST /admin/assignments`, `DELETE /admin/assignments/:id`; `CreateAssignmentRequest`, `ShiftAssignmentRecord`; `GET /roster/station/:stationId?eventDayId=`, `GET /roster/me`. `assignments/index.ts` exports handlers, mapper and `assignmentLinks`. `createAssignment.ts` upserts/moves by person × shift; delete refuses worked assignments.                                                                     | Future-day board/query hooks, assign/unassign controls and coverage derivation. Existing `/roster/gaps` reports running-shift check-in gaps, not planning coverage. Reuse station-roster reads initially or add one authorized planning read; do not use the live gaps endpoint as a readiness proxy.                                                               |
| CSV / escalation        | `POST /roster/import` supports preview/apply and assignment columns. `RosterImportRow`, `parseRosterCsv`, `ROSTER_CSV_HEADER`; server `planRosterImport.ts` resolves station/date/template code, repeated person rows, managers and conflicts. `PATCH /admin/volunteers/:id` already accepts `reportsToId`; `people/application/updateVolunteer.ts` checks active manager and cycles.                                | Assignment-context entry point and refreshed board after import; no second importer required. The existing editor omits reporting-line controls, so add a manager picker and chain view. Preserve invite/rank rules: a roster editor cannot silently provision missing identities or escalate roles.                                                                |
| Swaps / briefings       | `POST/GET /roster/swaps`, pending list and decision; `GET /roster/briefing-slots`, `POST /roster/briefing-slots/:id/complete`. `contracts/shift` has request/decision/slot schemas and `CANCELLED` already exists in `SwapStatus`. `shift/application/briefingSlots.ts` supplies mapped slots/completion; published content has `briefing.mandatoryPoints`, with client `usePublishedContent` publicly exported.     | Own-swap creation/list UI, requester withdrawal endpoint and atomic pending-state transition; briefing schedule create/edit/remove endpoints and schemas; scheduled/completed slot UI reading published mandatory points. Do not perpetuate `MANDATORY_BRIEF_POINTS` placeholder literals.                                                                          |

## Missing endpoint work, without duplicating existing mutations

- **Structure lane:** `GET/POST/PATCH /admin/station-types[/:id]` and
  `/admin/station-tags[/:id]`; `POST /admin/capture-categories`,
  `PATCH /admin/capture-categories/:categoryId`; `POST /admin/shift-templates`, expand its
  existing PATCH; `PATCH /admin/shifts/:id` for explicit exception/reset, with a read response
  exposing `templateId`/`overridden`. Use `Structure.Read` for reference administration,
  `Structure.Change` for new structure/capability changes, and `Structure.Edit` for allowed
  labels/deactivation. Keep category reads' existing `Settings.Read` contract.
- **Stock/print lane:** `GET /admin/gift-types` including inactive; stable batch receipt/list/detail
  and format-specific authenticated downloads, e.g. `/cards/batches/:id/exports/:format`.
  Register fixed batch paths before `/:shortCode`. Build persistence/replay and print artifacts
  together; an extra download button over the existing CSV does not fulfil PDF/ZIP.
- **Staffing lane:** optional `GET /roster/assignments?eventDayId=...` planning contract if it
  replaces per-station fan-out; `POST/PATCH/DELETE /roster/briefing-slots[/:id]` for schedule
  management using existing event-scoped `Roster.Edit`; requester-only
  `POST /roster/swaps/:id/cancel`. `Swap.Request` applies to a `ShiftAssignment`, not a
  `SwapRequest`: resolve its assignment, verify the requester and conditionally cancel only a
  pending request. Never authorize that endpoint against the wrong Cedar resource type.

New writes need current authorization/lifecycle rechecks inside their audited/idempotent
transaction, not only route middleware. In particular existing station PATCH accepts a new
`typeCode` under `Structure.Edit`; the new editor must enforce ADR-005's LIVE capability freeze
when a type change changes capabilities. Type/tag selection must refuse inactive new targets.
Type deactivation also needs consistent reference/capture behaviour: current `listStations` and
`assertStationActive` check station activity only, while readiness excludes inactive station types.
Template create must materialise shifts for existing days; day create must retain its current
template materialisation. Board gaps must match `event/domain/readiness/coverage.ts`: every active
station/type × materialised active-template shift has an active, matching membership assignment;
do not invent a new headcount target or confuse absent check-in with absent staffing.

## Printable card export requirements already in scope

1. Preserve `GenerateCardBatchRequest`'s explicit LIVE/REHEARSAL mode and count cap of 5,000.
   Print only successfully inserted codes, with the same opaque `qrPayload` that the existing
   authenticated QR lookup resolves. Include a legible short code, event/batch/mode labels and
   the configured stamping stations; card journeys remain counts of cards, never visitors.
2. Produce a real printable PDF and ZIP print pack (retaining the existing CSV), not HTML with
   a renamed extension. Use a stable server-generated batch/export id and persist immutable
   membership of the batch so retries/downloads never create or print a second set of codes.
   Record artifact metadata/replay/audit; storage failure must not be reported as a ready export.
3. Use `S3_EXPORTS_BUCKET` and the private exports bucket's existing ninety-day lifecycle.
   The report archive's `application/archiveStorage.ts` demonstrates conditional writes and
   authenticated server-streamed reads; its XLSX-only MIME constant and CLOSED-final-report
   gate are not reusable card requirements. Add a small card-owned storage adapter.
4. `infra/cdk/src/exportAccess.ts` currently grants **only `archive/*`**. Extend to the exact new
   server-generated card prefix with Get/Put only; no listing/public ACLs or arbitrary key input.
   Downloads must load the event-owned receipt before S3 access and use safe filenames,
   correct MIME and `no-store`. Read permission must remain available after archive via a
   suitable existing read/export action; `Card.GenerateBatch` is a Write action and is not a
   universal download permission. AWS delivery/print acceptance stays P16; no deployment here.
5. Preserve ADR-002: reissue marks the original `LOST`, links the replacement and keeps one
   redemption per journey; spoiled-card void is distinct. Reuse the current state-machine
   use cases rather than implementing those transitions in the client.

## Client surfaces and queries to reuse

- `stations/api.ts` + `useStations` currently expose active reference data only; add a separate
  admin key/read. `taxonomy/api.ts`/`queries.ts` already parse event-owned paginated activity and
  scheduled mutations. `settings/api.ts`/`queries.ts` and `ShiftHoursForm` already edit template
  labels/hours; move composition into the days workspace or reuse its public feature API.
- `gifts/api.ts`/`queries.ts` only list active gifts/redeem; `cards/api.ts` only stamps.
  `capture/api.ts:resolveScannedCard` and `cards/components/CardSummary` are reusable lookup
  primitives. Add administration query/mutation hooks with event-prefixed keys.
- `provisioning/api.ts`, `useImportPeople`, `RosterImportForm` already preview/apply assignments
  and managers; export a composed surface through its feature index rather than deep imports.
  `volunteers/api.ts:updateVolunteer` is the reporting-line mutation. `roster/queries.ts` only
  supplies pending swaps/decision; `shift/queries.ts` only check-in/out and `/me` invalidation.
- Use `useZodForm`, shared `Field`/`Choice`, `useRetryKey`, server `/me/permissions` affordances
  and registry navigation. Update `events/model/goLiveChecklist.ts` destinations from generic
  settings/users/reader routes to the actual new editors when integrating them.

## Corrections and audit follow the setup/staffing contracts

| Surface               | Current read API and permission                                                                                                                                                                                                                                                                                                                | Next work                                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrations / ticks | Only category/aggregate/live reads. `GET /registrations/summary`, `/footfall/summary`, `/footfall/live` use `Dashboard.ReadStation` with candidate checks and use-case scope. Existing single-record repo lookups serve writes; no paginated recent-record read route exists. Void uses `Record.Void` on the actual Registration/FootfallTick. | Add bounded station/day/time/mode recent-record reads with authorized station filtering, then reasoned void UI. Never expose all operational rows via `Self.Read` or a client-only filter. `POST /footfall/bulk` already uses `Count.Adjust` on the station and idempotency; wire a separate bulk-entry form. |
| Incidents             | `GET /incidents` is paginated, filterable and returns follow-ups/author names under `Incident.Read` on Event. `incident/application/incidentRecord.ts:getIncident` already loads an event-scoped detail but is not routed/exported. Follow-up/status routes use `Incident.Update` on Incident.                                                 | Client list/detail/follow-up/status; expose `GET /incidents/:id` using the existing helper and `Incident.Read` on Incident for deep links. Do not widen reads to every reporter: default Lead can report but lacks `Incident.Read`.                                                                           |
| Audit                 | `GET /audit` uses `Audit.Read` on Event; `http/schemas.ts` supports cursor/limit, action/entity/entity id/actor/from/to. `listAuditLog.ts` and `data/mappers.ts` already return actor, before/after, request id and time. Default grants are Chief, Lead and Admin, subject to current policy.                                                 | Shared audit request/response schemas, client API/query/explorer and workspace registry entry. Read-only; reuse sanitized audit output, pagination and event scope. There is no need for an audit mutation API.                                                                                               |
| Lost and found        | `GET /lost-found` uses `Self.Read`; `POST /lost-found/close-out` already uses `LostFound.CloseOut` on Event (Deputy and above by default).                                                                                                                                                                                                     | Wire the close-out action and connect it to P13.8's guided flow; preserve the existing status transition/use case.                                                                                                                                                                                            |

Station rosters contain phone numbers: `Roster.ReadStation` and `assignments/domain/rosterVisibility.ts`
restrict an IC to assigned stations; Deputy and above cover the event. A new aggregated board must
not bypass that rule. Permission visibility comes from current `/me/permissions`, not hardcoded
role branches. The authoritative catalogue is `packages/access-policies/default-grants.json` plus
locked Cedar policies, not historical route comments.

## Three disjoint implementation lanes

| Lane                                   | Exclusive ownership                                                                                                                                                                                                                                                 | Hand-off                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — event structure                    | `server/src/modules/{eventDays,station,taxonomy}/**`; matching shared contracts `{eventDays,station,taxonomy}`; client `{stations,taxonomy}` and new `features/eventDays`; their domain-specific tests.                                                             | Export route-registration functions/handlers through each module index. Supply typed day/shift/type/tag/category reads to C and stamp configuration to B. Do not edit settings' existing shared composer or admin router. |
| B — gifts and printable cards          | `server/src/modules/{gift,missionCard}/**`; matching shared contracts; client `{gifts,cards}`; new card storage/rendering modules and tests.                                                                                                                        | Supply storage-prefix/IAM and manifest/migration changes as an explicit coordinator patch request. Keep report archive files owned by the coordinator; do not turn its CLOSED-only export into a generic writer.          |
| C — staffing, then operational readers | `server/src/modules/{assignments,roster,shift,people,registration,footfall,incident,audit,lostFound}/**`; matching shared contract domains; client `{roster,shift,volunteers,provisioning,registration,footfall,incident,lostFound}` plus new `audit`; their tests. | Build the board against A's contracts; reuse people import. After staffing, add correction readers/audit and caller coverage data. Report API/policy additions to the coordinator; do not edit A's/B's files.             |

**Coordinator alone owns shared integration files:** `server/src/modules/admin/http/routes.ts`
(already beyond the size target; extract domain registration rather than grow it),
`server/src/app/routes.ts`, `packages/shared/src/index.ts`, Prisma schema/migration ordering,
package manifests/lockfile, Cedar schema/generators, infrastructure, navigation registry,
event workspace/readiness destinations, route composition pages and route-inventory/matrix fixtures.
Agents can prepare distinct new registration/page files and hand off their registration entries.
The coordinator also owns P13.7's generated route-to-client inventory check with reasoned internal
exceptions. No agent starts another full CI or database setup while these lanes are in flight.

Write the batch with typecheck/lint only; then add meaningful domain/HTTP/isolation/UI tests and
the empty-day-to-zero-gaps, setup, printable/retry and correction browser specifications. Existing
`repro/cardBatch`, `repro/shifts`, `repro/roster`, `categorySchedule*`, `gift`, route-role and
isolation suites are the regression anchors. The coordinator runs touched suites serially where
they share Postgres, then one complete local CI gate and one push/watch cycle. Staging execution
and owner walkthroughs remain P16.8; missing code/specifications remain in P13.
