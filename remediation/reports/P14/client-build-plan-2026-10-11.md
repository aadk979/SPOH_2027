# P14 client build plan — 11 October 2026

Future planning only. The foundation/P13 print repair is frozen for its final
pipeline. No P14 application source was changed for this plan; no browser,
accessibility, visual or staging campaign was executed. Start implementation only
after root confirms that batch's exact pushed commit is green on GitHub.

This plan covers P14.2, P14.4 and P14.8. Read it alongside
`build-plan-2026-10-11.md`, `browser-build-plan-2026-10-11.md`,
`../../findings/F02-journeys.md` and ADR-011. Code and focused suites are built in
one large batch; root runs the full local pipeline and pushes. Browser execution,
visual baselines and owner copy sign-off belong to P16/P16.8.

## Ownership and integration boundaries

The client lane owns:

- Dashboard components/screens/hooks and `features/counts/screens/CountsScreen.tsx`:
  actual filtered destinations, meaningful attention actions, permission gating,
  glossary links and consistent data states.
- Shared UI state, mutation feedback, confirmation, undo, toast and inline-help
  primitives; their focused unit/UI tests and migration of existing callers.
- A client glossary/help screen and copy inventory. Root mounts its composition
  page and navigation entry after agreeing on the event-relative address.
- Dashboard drill-down and feedback/confirmation/browser scenarios for root's
  shared strict route-fixture campaign. Author during P14; execute during P16.

Root owns schema/migrations, shared contracts/exports, middleware, server reads,
central action/audit catalogues, route mounting, navigation, inventories/matrices,
package files and the event-relative `workspacePath` helper. Notification and
branding lanes own their domain source. Coordinate root `app/providers.tsx`
placement for a toast provider; coordinate shell glossary/help affordances with
branding rather than editing `AppShell` concurrently.

Expected pure helper boundary, to be supplied by root:

```ts
type WithoutPaging<T> = T extends unknown ? Omit<T, 'cursor' | 'limit'> : never;
type EntityLink = EntityQuery;
type RecordsLink = WithoutPaging<RecordsQuery>;
type SearchLink = WithoutPaging<SearchQuery>;
entityPath(input: EntityLink): string;
recordsPath(input: RecordsLink): string;
searchPath(input: SearchLink): string;
```

The helper belongs to `client/src/shared/lib/workspacePath.ts`, imports only
shared contracts/types, returns event-relative paths, validates reviewed keys,
omits undefined/null, preserves false, and keeps station CODE/category case.
`AppLink`, `ButtonLink` and `useAppRouter` already add the current event through
`useAppHref`; do not add an event prefix twice or put these routes in PLATFORM.
The UI kit accepts href strings and never imports workspace feature internals.

## Dashboard integration files

| Area                                          | Existing files to change                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Live headline and totals                      | `dashboard/components/HeadlineTile.tsx`, `TodayTotals.tsx`                                                                 |
| Live category, room, card and gift breakdowns | `ArrivalsPanel.tsx`, `RoomEntriesPanel.tsx`, `CardFunnelPanel.tsx`, `GiftStockPanel.tsx`                                   |
| Staffing and attention                        | `StaffingPanel.tsx`, `AttentionPanel.tsx`, `model/attentionProblems.ts`                                                    |
| Station totals and breakdowns                 | `StationTotals.tsx`, `StationCategories.tsx`, `DeviceRegistrations.tsx`, `StationCounters.tsx`                             |
| Station people and exceptions                 | `StationRoster.tsx`, `FlaggedRedemptions.tsx`, `StationBoard.tsx`, `SwapQueue.tsx`                                         |
| Dashboard screens and reads                   | `screens/ChiefDashboardScreen.tsx`, `IcConsoleScreen.tsx`, `TvScreen.tsx`, `hooks/useIcConsole.ts`, `queries.ts`, `api.ts` |
| Shared dashboard presentation                 | `components/StatTile.tsx` (`StatTile`, `BarRow`, `BarList`), `dashboard/index.ts`                                          |
| Counts and health                             | `counts/screens/CountsScreen.tsx`, `counts/api.ts`, `counts/queries.ts`                                                    |
| Related references                            | Home/My shift/attendance references and report count links, coordinated with root's entity screen                          |

Paths in this table are under `client/src/features/`. Add optional `href` and
accessible link names to `StatTile`/`BarRow`; leave them plain when omitted. A
linked tile must remain one link, without nested links/buttons. TV's own
`TvStat`/`TvRow`, alerts and warning rows receive no drill-down links. Preserve
its existing explicit exit control. The interactive rehearsal switch remains a
separate configuration affordance, not a linked count.

## Shared filter vocabulary to agree with root

Names here are proposals, not implemented contracts. Use a discriminated query
per record kind so, for example, a registration cannot accept a gift filter.
Each query must retain the exact source observation instead of silently resetting
to the destination's current day or mode.

| Filter                                      | Meaning                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `date` / `eventDayId`                       | Event-local day; resolve dates against this event only. An event-day label is not an ID.                                    |
| `from`, `to`, `asOf`                        | `recordedAt >= from`, optional `recordedAt < to`, and `recordedAt <= asOf` snapshot cap. Preserve the source's time field.  |
| `includeRehearsal`                          | False means live rows only; true means live plus practice, as in `rehearsalFilter`. It does not mean practice only.         |
| `rehearsal`                                 | Exact stock pool, true or false, for one gift tile/ledger. Do not replace it with inclusion.                                |
| `stationId`, `recordedById`, `categoryCode` | The exact station, actor and case-preserved category behind a contribution.                                                 |
| `source` / `importBatchId`                  | Stored `APP`, `FALLBACK_SHEET` or `PAPER` provenance and exact batch association; never infer from name, filename or time.  |
| `stage` / `metric`                          | Reviewed card funnel stage or raw stamp count. Keep reserved lower-case stages distinct from case-preserved station CODEs.  |
| `giftTypeId`, `flag`                        | Exact gift/redemption subset; a flagged row is non-voided and has the recorded flag.                                        |
| `status`, `severity`                        | Source status predicate, including open incidents (`status != RESOLVED`) rather than only NEW.                              |
| `assignmentState`, `shiftId`                | Running-shift assignments, today's currently checked-in assignments, a specific shift, or an exact missing-coverage subset. |
| `cursor`, `limit`                           | Destination paging only; omit from links. Cursor anchors must belong to this event and all the same filters.                |

Suggested kinds include registration, footfall, card, stamp, redemption, incident,
lost-person, fallback-window, assignment and gift-stock. Root may choose different
names. A separate stamp-row destination is necessary unless root deliberately
changes and tests the source metric: station `stamps` is currently a row count,
while a funnel station stage is a distinct-card count.

All links preserve their source's rehearsal/date/station/category/actor/stage
context. Display an explicit filter summary on the destination, its count unit,
the aggregation value and actual row count when these differ. A footfall page
with 240 entries in one bulk row must show 240 entries and one record.

Use existing Cedar actions through `useAllows` for affordances and resource-aware
server checks for each read. Root's `Entity.Read` is a composite middleware point,
not a new Cedar action. A station/person reference can be legal while its roster
or full person profile is restricted. Avoid role comparisons or assuming that
Dashboard.ReadStation implies Roster.ReadStation/People.Read/Incident.Read.

## Exact figure-to-destination mapping

`D` means the event-local day containing source `asOf`; `S` is its start instant;
`T` is source `asOf`; `I` is source `rehearsalIncluded ?? false`. Existing live
registration/footfall/station queries use `recordedAt >= S && recordedAt <= T`.
Carry live `T` as `asOf`, whose boundary stays inclusive. An optional `to`
retains its independent exclusive boundary; card funnel time ranges stay
`[from, to)`. Never add one millisecond to fabricate parity between these
observations. Last-hour registrations start at `T - 60 min`
even when that falls on the previous local day.

| Figure/source                                | Exact source meaning                                                                                                                       | Intended destination/filter                                                                   | Existing read authority                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Headline: registrations                      | Same `registrations.todayTotal`, not a sum of units                                                                                        | Registration records for D/S–T/I                                                              | Dashboard.ReadEvent source; Dashboard.ReadStation record read             |
| Headline: journeys                           | Same issued-card figure                                                                                                                    | Card records, issued metric, S–T/I                                                            | Dashboard.ReadStation aggregate/records; Self.Read selected card          |
| Headline: room entries                       | Selected `headline.source.stationId` footfall quantity sum                                                                                 | Footfall records, that station, S–T/I                                                         | Dashboard.ReadStation on station                                          |
| Today Registered                             | Count non-void Registration rows, S–T/I; one group capture may produce several registrations                                               | Registration records, voided=false                                                            | Dashboard.ReadStation                                                     |
| Registered last-hour note                    | Same rows, T−60 min through T; not the whole day                                                                                           | Registration records with last-hour window                                                    | Dashboard.ReadStation                                                     |
| Who is arriving category                     | Non-void registration rows with exact category.code, S–T/I                                                                                 | Registration records + categoryCode                                                           | Dashboard.ReadStation                                                     |
| Today room entries                           | Sum quantity over live counted stations, S–T/I                                                                                             | Footfall records + source counted-station scope                                               | Dashboard.ReadStation                                                     |
| Room entries station row                     | Sum non-void FootfallTick.quantity at station, S–T/I                                                                                       | Footfall records + stationId                                                                  | Dashboard.ReadStation on station                                          |
| Cards issued / issued stage                  | MissionCard status excludes UNISSUED and LOST; issuedAt in S–T, upper exclusive; VOIDED remains counted                                    | Cards, metric=issued, issuedAt window                                                         | Dashboard.ReadStation                                                     |
| Cards completed note / completed stage       | Current status exactly COMPLETED, with issuedAt in the same window; not completedAt                                                        | Cards, metric=completed, same issuedAt window                                                 | Dashboard.ReadStation                                                     |
| Card funnel station stage                    | Distinct missionCardId in stamp rows recordedAt S–T, upper exclusive; joined card status != LOST; both card/stamp rehearsal obey I         | Cards, metric=reached-station + exact station CODE/ID, stamp recordedAt window                | Dashboard.ReadStation; Self.Read individual card                          |
| Card funnel redeemed stage                   | Distinct non-null missionCardId in non-void redemptions recordedAt S–T, upper exclusive; no added card-status exclusion                    | Cards, metric=redeemed, redemption recordedAt window                                          | Dashboard.ReadStation                                                     |
| Funnel percentage of issued                  | Numerator stage value / issued denominator                                                                                                 | Same stage destination, show its cards and denominator context                                | Same as its stage                                                         |
| Gift remaining tile                          | Exact gift ID/pool; initialStock + adjustment sums − non-void redemption row count, all retained pool history                              | Gift-stock ledger, giftTypeId + exact rehearsal; not a today-only list                        | Dashboard.ReadStation/read ledger; Count.Adjust only for write            |
| Gift redeemed tile note                      | Non-void redemption row count in that exact pool, all retained history                                                                     | Redemptions + giftTypeId + exact rehearsal                                                    | Dashboard.ReadStation                                                     |
| Staffing On shift                            | ShiftAssignment rows whose shift is running at T; includes assignments whether checked in or not                                           | Assignments, state=on-shift, asOf=T; root's truly filtered destination                        | Roster.ReadStation/resource-aware roster facet; Roster.Edit for repair    |
| Staffing Checked in note                     | Today's eventDayId assignments with checkedInAt != null and checkedOutAt=null; currently independent of running-shift predicate            | Assignments, state=checked-in, date=D, asOf=T                                                 | Roster.ReadStation                                                        |
| Staffing gap tile                            | Number of station/shift gap cells returned for shifts running at T; not number of missing people                                           | Coverage cells, gap=true, asOf=T                                                              | Roster.ReadStation; Roster.Edit repair                                    |
| Individual staffing gap                      | Exact stationId and shift.id; assigned/check-in/missing counts for that running cell                                                       | Filtered assignment/coverage destination + stationId + shiftId + date/asOf                    | Roster.ReadStation; Roster.Edit action                                    |
| Long shift warning                           | Open assignment checkedInAt < current longShift threshold cutoff and >= S; not checked out                                                 | Exact assignment or limited person roster facet, plus station/shift/date                      | Roster.ReadStation; full person requires People.Read                      |
| Station Registered here                      | Non-void registration row count at selected station, S–T/I                                                                                 | Registration records + stationId                                                              | Dashboard.ReadStation on station                                          |
| Station category row                         | Same station registrations + category.code                                                                                                 | Registration records + stationId + categoryCode                                               | Dashboard.ReadStation                                                     |
| Station per-device registration value        | Current implementation groups all sources by recordedById; P14 source separation required below                                            | APP registration records + stationId + recordedById; separate imported rows                   | Dashboard.ReadStation; named limited person link has contextual authority |
| Station device rate/min                      | APP count and first/last recordedAt for that actor; source-separated input needed                                                          | Same APP contribution records, show observed rate window                                      | Dashboard.ReadStation                                                     |
| Station footfall total/contributor           | Sum non-void quantity at station; contributor groups recordedById; P14 source separation required below                                    | Footfall records + stationId + recordedById + explicit source                                 | Dashboard.ReadStation                                                     |
| Station Cards stamped (`board.stamps`)       | Raw CardStampEvent row count, recordedAt S–T inclusive; currently no MissionCard.status exclusion                                          | Stamp records + stationId, raw stamp metric; do not reuse funnel metric                       | Dashboard.ReadStation; Self.Read referenced card                          |
| Station roster row and its attendance status | One ShiftAssignment row per person/shift for D; assignmentId is its identity                                                               | Person limited roster facet or shift entity, with assignmentId/stationId/shiftId/date         | Roster.ReadStation; People.Read only for full profile                     |
| Count summary Room entries total             | Current `/footfall/summary` with no bounds: all non-void quantities, live-only by default, not just today                                  | All-range footfall list, same source bounds/mode; use a truthful summary label                | Dashboard.ReadStation                                                     |
| Count live station Today / active counters   | Source `/footfall/live` asOf, S–T; activeCounterCount is distinct recordedById across matching non-void rows                               | Today footfall records; counter-contributor list separately                                   | Dashboard.ReadStation                                                     |
| Count card summary stages                    | Current `/cards/funnel` has no time bounds: all-history stage predicates                                                                   | Cards with same all-range metric and I, not automatically today's window                      | Dashboard.ReadStation                                                     |
| Count Gift redemptions summary               | Current `/gifts/summary` counts all non-void redemption rows with no rehearsal filter; remaining values come from current event stock mode | Redemption list with exact all-history/mode semantics; reconcile root contract mismatch below | Dashboard.ReadStation                                                     |
| Count gift-type redeemed / remaining         | Redeemed summary row is gift-type count; remaining is current-mode all-history stock                                                       | Separate redemption filter and exact-mode gift ledger                                         | Dashboard.ReadStation                                                     |
| Counts health gap/checked-in/missing         | Same staffing-gap rows and observations from `/roster/gaps`                                                                                | Exact station/shift coverage filter                                                           | Roster.ReadStation; Roster.Edit repair                                    |
| TV figures/rows                              | Same source meanings as the live dashboard                                                                                                 | Plain text, no figure links                                                                   | Dashboard.ReadEvent                                                       |

The code observations above come from `dashboard/application/getLiveDashboard.ts`,
`getStationDashboard.ts`, `getDataHealth.ts`, `dashboard/data/repo.ts`,
`missionCard/data/repo.ts`, `footfall/data/repo.ts`, `gift/data/repo.ts`, and
`shift/application/staffing.ts` under `server/src/modules/`.

Do not replace a stock ledger link with `/admin/gifts` if the user would lose the
selected gift/pool. Do not link On shift to an unfiltered assignment board. Zero
figures can lead to an explicit empty result; populated fixture figures must
land on a non-empty set with the exact same semantic total.

## Attention destinations and target IDs

Keep attention items as structured discriminated data, e.g.
`{ kind, text, tone, target }`, rather than inferring routes from rendered text.

| Current item             | Exact target/action                                                                                | Required IDs/context and permission                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active lost-person count | ACTIVE alert records, then specific alert entity; acknowledgements remain source actions           | Event + I; Self.Read existing active reader; LostPerson.Resolve only for resolve                                                                                                 |
| Critical incidents open  | Incident records, status != RESOLVED + severity=CRITICAL                                           | Event + I; Incident.Read on each scoped incident; never derive from Dashboard.ReadEvent alone                                                                                    |
| All incidents open       | Incident records, status != RESOLVED                                                               | Event + I; same Incident.Read requirement                                                                                                                                        |
| Open fallback warning    | Open windows with startedAt <= T, endedAt=null; specific window entity/import relation             | Event + I/T; Dashboard.ReadStation on scoped window station, or existing event-wide dashboard reader; Fallback.Declare/Import only for writes                                    |
| Silent station           | Station entity counts/current roster facet with a link to exact today's footfall records           | Existing stationId; Dashboard.ReadStation counts, Roster.ReadStation only for roster/action facet                                                                                |
| Stale recorder           | Exact open assignment/limited person roster context, capture records and sync diagnostics guidance | Currently only volunteerId/stationName. Need stationId, assignmentId, shiftId, eventDayId/date to avoid name matching or full People.Read fallback                               |
| Flagged redemption       | Exact redemption record/detail and reasoned correction action                                      | Existing redemptionId/stationId/flag/recordedAt; no giftTypeId/cardId/recordedById today. Add these only if related links need them; Record.Void checks the actual scoped record |
| Missing staffing         | Exact stationId + shift.id coverage/assignment destination                                         | Already present. Include shift label/hours rather than only station name; Roster.Edit gates repair                                                                               |
| Long checked-in shift    | Exact assignment/limited person roster context for welfare follow-up                               | Current LongShiftWarning has volunteerId/stationName only. Need assignmentId/stationId/shiftId/eventDayId/date; never assume two assignments of one person are one warning       |

Prefer explicit target permission/facet information from root's entity/read
projection if `useAllows` cannot prove resource-specific visibility. Full
profile links require People.Read; named assignment references can use reviewed
minimal roster projections with station/shift context. Audit/incident/photo and
announcement links recheck their own read permissions before data queries.

## Backend contract gaps to resolve before drill-down wiring

1. **Assignment destinations:** exact running/as-of, checked-in/date, station/shift
   and coverage filters. On-shift, checked-in and missing-cell counts are different
   datasets; a generic staffing URL cannot satisfy their click-through tests.
2. **Time boundaries:** live counts retain an inclusive `asOf` cap alongside
   optional exclusive `to` and inclusive `from`. Card funnel retains its half-open
   range. Source DTOs need enough clock/day/window information to reproduce both,
   including a last-hour window crossing midnight. Root's operational server-clock
   cap also prevents an old unbounded aggregate from including future-dated rows.
   Do not manufacture equivalent bounds with an added millisecond.
3. **Raw stamps vs reached cards:** a separate stamp-record metric/kind, or an
   explicit agreed/tested aggregate change. Retain LOST/VOIDED semantics as above.
4. **Count gift summary mode:** `/gifts/summary` has no inclusion query and currently
   combines practice/live redemption rows while stock comes from current event mode.
   Do not label it live-only or pass false to a destination that excludes counted
   rows. Root should align the summary and filtered-list contract in P14; record
   the documented reporting recommendation as assumed if a choice is needed.
5. **Related IDs:** add scoped assignment/station/shift/day targets for stale and
   long-shift warnings; optionally gift/card/actor targets for flagged redemptions.
   Labels are presentation only, never lookup keys.
6. **Figure-specific authorization:** station roster/person links need a contextual
   permitted facet; general action availability is not proof of foreign roster access.
   The existing station dashboard bundles unrestricted roster into count reads.
   Root owns the roster facet authority correction in shared/backend integration;
   this client lane consumes the resulting permitted facet instead of requesting
   or rendering roster details through a count-only capability.

## F02-012: distinguish imports from device captures

`registrationsByDevice` currently groups every non-void source by importer
`recordedById`; `footfallByDevice` likewise groups quantity regardless of source.
The IC view therefore presents fallback imports as phone taps and uses them in
device rate/anomaly calculations. Root's new exact import associations should
support a source-separated read DTO rather than a client name heuristic.

Recommended shape (proposal):

```ts
type StationCaptureBreakdown = {
  app: Array<{
    personId: string;
    name: string;
    value: number;
    firstAt: string;
    lastAt: string;
    perMinute?: number;
    rateAnomaly?: boolean;
  }>;
  imported: Array<{
    source: 'FALLBACK_SHEET' | 'PAPER';
    importBatchId: string | null;
    value: number;
    lastAt: string;
    importedBy?: MinimalPersonReference;
  }>;
};
```

- Device/app rows contain source APP only. Compute rate/first/last from those APP
  rows, preserving registration row counts and footfall quantity sums.
- Separate “Imported/paper records” rows identify the recorded source and exact
  batch when present. A manual paper adjustment need not have an ImportBatch.
- Sum APP and imported contributions back to the station total; source separation
  must not discard imported quantities from overall counts.
- Import metadata is Fallback.Import, not implicitly granted to every dashboard
  reader. If a viewer cannot open the batch, show the safe source label and a
  permitted record list without importer private details or an unauthorized link.
- Legacy rows without exact batch provenance remain a source group with a truthful
  “batch link unavailable” explanation. Never attach rows to a guessed batch.
- Whether paper records should count as a recorder's last device activity is an
  additional source-policy check in `checkedInWithLastCapture`; a completed bulk
  import should not make a phone appear active merely because the importer acts
  as recordedBy. Root owns any backend correction and focused tests.

## Shared UI state patterns

Build on `shared/ui/Feedback.tsx`, `Callout.tsx`, `Field.tsx`,
`shared/lib/apiErrors.ts` and `shared/hooks/useOnline.ts`.

| State             | Shared behavior and required evidence                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading           | Existing labelled skeletons with aria-busy; reserve useful space. Choose based on isPending/isLoading correctly; an intentionally disabled query is not an endless loading page.                                                       |
| Empty             | Title + explanation + permitted next action; distinguish no records from no records matching filters. Include the unit/filter summary.                                                                                                 |
| API/network error | Actionable operation-specific copy, permitted retry and ApiError requestId. Do not expose arbitrary unknown exception text/SQL/provider detail.                                                                                        |
| Offline           | Explain queued local capture vs unavailable live/admin reads. Keep queued/synced/failed separate; do not claim successful server capture when only local durable enqueue succeeded.                                                    |
| Permission denied | Use the safe reason from server ApiError/message/known details; no generic outage or connection advice, and no retry for 401/403. Do not invent which role may grant access. Hide stale private data and clear/cancel its owner cache. |
| Not found         | Explain that the selected entity is unavailable in this event; provide a safe back/list/search path. Do not enumerate foreign IDs or turn every 403 into a disclosed entity.                                                           |
| Validation        | Preserve Field/Choice error association and focus the first invalid control. Missing reason/confirmation prevents a write.                                                                                                             |
| Mutation pending  | Disable duplicate intent, retain stable receipt, state the action underway. A transport failure is “not confirmed”, so the exact same intent can be retried safely.                                                                    |
| Confirmed success | Persistent relevant inline result plus a concise toast where useful. Retain the returned entity/version. Never optimistic-toast a server mutation before confirmation.                                                                 |

Private queries and forms are partitioned by event/person, have deliberate
retention, and reset on resource/owner changes. A stale success value must not
remain visible under an error/permission state. A denied read unmounts/discards
the private reader, as the new print history does. Download/media receipts and
object URLs are discarded on unmount or owner/permission loss; blob payloads
are not cached as mutation results.

Proposed shared UI API: `QueryState`/`ErrorState`, `MutationFeedback`,
`ConfirmAction`/`ConfirmationDialog`, `UndoAction`, `ToastProvider`/`useToast`,
and `ControlHelp`. Keep hooks that need session/event in shared hooks or the
feature, not in a UI primitive that imports a feature. Preserve feature-specific
domain states; replace their ad-hoc presentation rather than flattening them
into an uninformative generic box.

Confirmation shows target, consequence, submitted reason/version and a clear
cancel path; cancel restores focus to its origin. Keyboard Escape/cancel and
pending disable are tested. Existing reviewed lifecycle/content/permission
flows keep their version locks and exact reviewed inputs. No confirmation on
normal capture taps. Undo calls only a genuine reversible operation: queued
capture cancellation or root's reasoned capture-import undo, never an invented
inverse of identity provisioning, gift redemption or archived lifecycle.

Capture's configured undo window remains `ms.undoWindow()`; copy must derive
the seconds from that setting. `useCapture.undo` currently silently expires
when a row has already been sent; expose a truthful result so the shared undo
feedback can direct the user to an IC correction. Do not show “undone” unless
the queued entry was actually removed.

## Confirmation, feedback and help migration inventory

| Feature/files                                                                                                                                                                                                    | Required migration/help                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards/components/CardIssue.tsx`, `CardCorrections.tsx`                                                                                                                                                          | Replace three native window.confirm calls with common confirmation/focus behavior; preserve physical handover, void reason, replacement code and current permissions.                                                                                    |
| `cards/components/CardBatchForm.tsx`, `CardPrintHistory.tsx`, `CardPrintDetails.tsx`, `CardLookup.tsx`                                                                                                           | Common loading/empty/request-ID/retry/denied feedback; generation mode, exact unused codes, stored download, frozen labels and card correction effect help. Preserve new ownership/cache barriers.                                                       |
| `events/components/CreateEventWizard.tsx`, `CloneEventWizard.tsx`, `EventWizardReview.tsx`, `LifecycleReview.tsx`, `ManageEvents.tsx`                                                                            | Consistent review/confirm/cancel/success; explain copy selections, fresh operational records, day offsets, lifecycle freeze/late-sync/archive and joining as admin. Preserve lifecycle expectedVersion.                                                  |
| `closeout/components/CloseoutTransition.tsx`, `OpenCloseoutCases.tsx`, `LostFoundCloseout.tsx`, `screens/CloseoutScreen.tsx`                                                                                     | Consistent readiness/error/confirmation; custody, saved exports and archive consequence help. Never imply copy sign-off or production go was granted.                                                                                                    |
| `structure/components/*Editor.tsx`, `StationStructureFields.tsx`, `ExceptionsGrid.tsx`, `RemoveDay.tsx`, `StructureFeedback.tsx`, `WriteFeedback.tsx`                                                            | Field-level effect help: capabilities, types/tags/categories, station CODEs, template vs single-shift exception, active flags and guarded unused-day removal. Preserve immutable day dates and frozen structure errors.                                  |
| `gifts/components/CreateGiftForm.tsx`, `GiftTypeEditor.tsx`, `GiftStockForm.tsx`, `screens/GiftAdminScreen.tsx`                                                                                                  | Confirm reasoned stock change; explain immutable opening stock, exact live/practice pool, derived total, retirement and thresholds. Common receipt-safe retry/success.                                                                                   |
| `staffing/components/AssignmentBoard.tsx`, `AssignmentForm.tsx`, `EscalationEditor.tsx`, `BriefingScheduleForm.tsx`, `BriefingCard.tsx`, `SwapReviewQueue.tsx`, `WithdrawSwapButton.tsx`, `MutationFeedback.tsx` | Unassign/assignment/swap decision/withdraw confirmation as applicable; person/station/shift coverage, escalation relation, briefing completion/schedule effects; common pending/error/empty result presentation.                                         |
| `provisioning/components/InvitePersonForm.tsx`, `RosterImportForm.tsx`; `volunteers/components/BulkPeoplePanel.tsx`, `WithdrawVolunteerAccess.tsx`, `PersonSessionActions.tsx`, editor actions/feedback          | Preserve CSV preview/apply receipt and target review; state event membership vs global account/session effects, resend invitation and cross-event sign-out. No fake undo of invitations/accounts.                                                        |
| `people/components/PersonLifecycle.tsx`, `PersonMemberships.tsx`, `PersonPrivacy.tsx`, `PersonDataErasure.tsx`, `PersonDataExport.tsx`                                                                           | Shared confirmation and permission states; explicit global deactivate vs event membership and irreversible profile-erasure effects. Existing owner boundary still applies if real unrecoverable data is requested.                                       |
| `settings/components/*Review.tsx`, `SettingSaveError.tsx`, `SettingsFeedback.tsx`, catalogue/history/field components; `permissions/components/PermissionReviewPanel.tsx`                                        | Preserve reason, old/new value, version and review requirements. Help for attendance roots, network lists, retention, visitor fields, count headline choice and scoped overrides/restores. Shared request-ID error presentation.                         |
| `schedule/components/*Review.tsx`, `ScheduleCancelButton.tsx`, producer forms/outcomes/timeline; `taxonomy/components/CategorySchedule*`                                                                         | Explain create vs execution time, timezone/DST, occurrence targets, frozen reviewed input, pending-only cancellation and category/capture state changes. Preserve preview/review and UUID receipt behavior.                                              |
| `content/components/ContentPublishPanel.tsx`, `ContentEditor.tsx`, `ContentScheduleForm.tsx`, `ContentVersions.tsx`, `FloorPlanUpload.tsx`                                                                       | Common publish confirmation and async states; clarify saved/reviewed version, offline publication effects, immutable asset version, upload retry and alt text.                                                                                           |
| `corrections/components/VoidRecordForm.tsx`, `BulkFootfallForm.tsx`, `RecentRecordPicker.tsx`, `CorrectionOutcome.tsx`                                                                                           | Explain retained audit/void, source-tagged quantity entry and required reason; same-target confirmation and safe retry. Root adds exact import undo; this lane presents it with common confirmation.                                                     |
| `audit/screens/AuditScreen.tsx`, filters/entries; `incident/components/IncidentList.tsx`, status/follow-up forms                                                                                                 | Common read states, request IDs and field help; filter source vs occurrence times and explain acknowledgement/resolution/status effects. Read permissions stay separate from write permissions.                                                          |
| `lostPerson/components/LostPersonBanner.tsx`, `LostPersonAlert.tsx`, raise form; `lostFound` cards/forms, `media/components/PhotoRead.tsx`                                                                       | One collapsed urgent banner with count/newest and explicit expanded list (F02-016); action feedback and permitted detail links. Alert read does not ACK; resolved view omits personal descriptors immediately. Preserve current private photo authority. |
| `announcements/components/ComposerAudience.tsx`, `DraftAudience.tsx`, `PrivateDraftWorkspace.tsx`, `DraftEditor.tsx`, scheduling rows; Inbox                                                                     | Clarify audience selection, urgency/push opt-in and publish/schedule effect; check F02-009 no-audience behavior against current shared request validation, without weakening product policy. Coordinate notification lane.                               |
| `capture/useCapture.ts`, registration/group/footfall screens, stamp/redeem result panels                                                                                                                         | Shared undo and status wording while keeping ≥88px capture targets, durable local writes and separate unit counts; no capture confirmation. Distinguish warning/hard-stop/duplicate from transport failure.                                              |
| `shift/components/SyncDiagnostics.tsx`, `hooks/useSyncDiagnostics.ts`, `shared/shell/SyncIndicator.tsx`                                                                                                          | Move actionable diagnostics where they can be found; add explicit copied/transcribed confirmation before clearing failed parked captures (F02-022), scoped to current person/event. Never clear pending/sendable captures as part of this action.        |
| Counts/report/home/overview/operations/setup/safety screens and reference lists                                                                                                                                  | Use common states and count glossary links; gate action links by existing permission. No error page that appears to be a successful empty view.                                                                                                          |

Inventory completion is checked with a scoped review of remaining `isError`,
`error`, `Callout`, native confirm and hardcoded loading/empty cases across every
feature. Existing `Callout` uses that explain domain facts are still legitimate;
the checklist evaluates state handling, not a blanket ban on the component.
Root's new workspace/notification/branding screens adopt the same public shared
primitives from the start. No broad lint suppression or coverage-floor change.

## Glossary and help copy

The glossary must explain registrations (people entered at signup, including
group members), room entries (visits/quantity, repeat entries allowed), and cards
(journeys, possibly a family), and why those counts cannot be added. Also define
gift redemption vs distinct redeemed cards, APP/paper/import provenance,
practice vs live pools, stock adjustment vs void, stage/rate, checked-in vs on
shift, fallback vs late sync, and reviewed/scheduled/executed state.

Link the glossary wherever counts appear: Chief/IC/Counts, reports and snapshots,
registration/group/footfall/card/redeem capture results and person/station/day
entities. The TV remains a display; use concise inline unit explanation there.
Use an event-relative help route and stable glossary anchors once root supplies
the composition/nav contract. Do not embed implementation detail, database IDs
or infrastructure warnings in product copy when they do not change the user's
decision.

Every administrative control has nearby effect/help text, not only a generic
page preamble. Existing Field hint/error associations should carry the help;
checkbox/select/actions get an equivalent description. Review exact semantics
with root contracts and preserve documented product rules. Track owner copy
approval in P16.8 rather than asking for it during the build batch.

## Focused verification to author

- Independent mapping tests for every count/attention target, with source cases
  for midnight, last-hour previous day, false rehearsal preservation, separate
  gift pools, non-lowercase station CODEs, LOST/VOIDED and bulk quantity≠row count.
- UI clicks for every populated dashboard figure, asserting a typed filtered
  destination and corresponding non-empty strict fixture result. The root API
  integration suite proves matching rows, isolation and authorization.
- Running assignment vs checked-in/date vs gap-cell cases, including two shifts
  for one person; exact gap/welfare/stale-device targets and permitted limited
  person/roster contexts.
- F02-012 mixed APP/import/manual rows: app-only rates and named device count,
  separate source/batch lines, totals reconciling, unauthorized batch metadata
  absent, legacy missing association explained without invented links.
- Query/mutation state matrix covering network error + retry/requestId, offline,
  401/403 denial, 404, empty vs filtered-empty, validation focus and post-success
  refetch error. Include permission revocation/person/event switch with stale
  private cache and in-flight request cancellation.
- Confirmation cancel sends no request and restores focus; submit uses exact
  reviewed input/current version; pending duplicate taps and transport retries
  keep a stable receipt. Test supported undo success, expired/already-sent undo,
  and failed-capture clearing limited to confirmed current-owner failed IDs.
- Toast/status announcements only follow durable/confirmed results, do not leak
  private labels across owner change, and are reachable/dismissible by keyboard.
- Help/glossary control coverage and correct unit copy; root's all-route axe,
  keyboard and both-theme visual suite includes resulting states. Author those
  browser cases now and execute only in P16.

This document is a future implementation input. It records no P14 completion,
browser result, owner approval or AWS acceptance.
