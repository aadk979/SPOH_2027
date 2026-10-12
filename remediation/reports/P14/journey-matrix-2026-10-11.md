# P14 journey and interlinking review — 11 October 2026

This is a source review against F02's six journeys and interlinking matrix,
not a new browser walk. The foundation/P13 application is verified at
`c00da9faefda04ac2984dac177e5903a8e3b0260`; P14 remains unverified until its
affected suites, complete local gate and exact-head CI finish. Browser, visual,
keyboard and axe execution, and owner copy review belong to P16.1/P16.8 under
ADR-011. The historical F02 screenshots and findings are preserved.

## Journey comparison

| F02 journey | Before | Implemented source after P13/P14 | Deferred acceptance |
| --- | --- | --- | --- |
| Admin creates another event | Global data; setup required API/SQL and taxonomy changes required a deploy | Scoped event creation/clone, structural setup, people/import/assignment screens; approved branding and unpublished clone identity | Create two differently branded events using the UI; prove isolation, publication and all setup controls at both viewports/themes |
| Chief/Deputy during the event | Figures and attention items were dead ends; future imports inflated current counts | Typed drill-downs retain observation, exact pool, source and station; attention links reach their repair; private roster facets are checked separately | Open every populated figure, compare its unit and filtered aggregate, cross midnight and deny private facets |
| IC shift | Duplicate people per block, imported rows presented as device captures, no correction history | Materialized shift references, one welfare warning per person, APP-only device activity, source breakdowns; retained corrections and exact new import undo | Execute station switch, revocation, paper import and reasoned correction/undo without losing history |
| Volunteer shift | Flat lifetime assignments, silent swaps and permanently parked captures | Grouped upcoming/running/past assignments; durable assignment/swap notices; atomic outbox ownership and backend-confirmed salvage | Receive/read/act, two-tab races, offline replay and uncertain writes; unsupported salvage remains visible |
| Lead | No audit screen; navigation offered forbidden writes; machine-oriented report exports | Filtered audit and safe entity resolution, permission-aware actions/search, human labels and frozen export identity | Current-role and archive navigation, exact export bytes and loss of authority while a private read/download is pending |
| After the event/next event | No guided close-out, lost-person outcomes delayed until purge, no clone | Close-out/archive/clone workflows; resolved outcome metadata with personal descriptors hidden; frozen reports and print context | Complete the retained-state journey, purge/erase, archive read/write separation and clone publication |

## Entity matrix

All homes use the static event-scoped `/entity?kind=…&id=…` page. Record
collections use `/records` with strict typed filters. Related references carry
their own current authority; a visible count or source ID does not authorize a
private profile, body, roster, photo or audit row. Unsupported/erased targets
remain non-links. Query transport rejects unknown predicates and repeated keys.

| F02 entity | Before | Home and related destinations in the P14 source |
| --- | --- | --- |
| Event day | No page/list | Materialized shifts, permitted day counts and fallback records, authorized assignments and own attendance |
| Shift | No page; unnamed gap cells | Exact day and roster/own assignment; assignment proof scopes limited station readers |
| Station | No page; counts were dead ends | Capture collections, source contributions, authorized roster, safety records, fallback, configuration and authorized audit |
| Volunteer/person | Inline partial profile; phone only | Own or permitted profile, assignments, attendance, captured records and raised incidents; limited roster references omit full contacts |
| Assignment | No page or repair UI | Exact person/station/day/shift links, current attendance/swap/staffing operations |
| Registration | No retained list/page | Station, permitted recorder/card/group/import links and current reasoned correction |
| Footfall tick | No page | Station, permitted recorder/import links and reasoned correction; list aggregate sums quantity rather than rows |
| Mission card | Scan result disappeared | Stations left, stamp/registration/group/redemption links under their gates, redemption state, replacement chain and corrections |
| Gift type | Stock total only | Separate live/practice ledgers, retained redemptions and reasoned adjustment; ledger balance uses full retained exact-pool history |
| Incident | Count only; no follow-up | Status/follow-ups, station, permitted reporter, current update operation and authorized audit |
| Lost-person alert | Active banner only; vanished on resolve | Station, safe reporter/actions while active; resolved metadata hides descriptors immediately |
| Found item | List card only | Station, permitted logged-by reference/photo, claim and retained close-out state; no invented claimant identity |
| Announcement | Inbox only | Target station/day, permitted author, current message visibility and acknowledgement observation; archive metadata does not expose the body |
| Fallback window | Temporary open/closed list | Exact associated imports and report caveat destination |
| Import batch | Result vanished on navigation | Batch metadata, proven window/inserted capture rows, permitted importer, exact supported undo; legacy/roster ownership remains unknown |
| Audit row | No screen | Filtered audit home, source-checked target and permitted actor; safe unresolved target state |
| Gift redemption (additional) | No retained home/correction | Card/gift/station/actor references under their gates and retained reasoned void in its written pool |

## Authored verification and remaining campaign work

The source contains 17 entity kinds and 16 record kinds. The independent browser
inventory lists 57 composition pages and four viewport/theme projects. The new
workspace browser fixture rejects unexpected requests and supplies populated
entity/list/search states; an inventory entry alone is not coverage evidence for
another route. Existing non-workspace fixtures and historical visual baselines
must be reconciled before P16 execution. No baselines have been blindly refreshed.

Server cases cover current principal binding, source policy failures, private
facets, archive separation, strict HTTP queries, foreign cursors, retained undo,
redemption void, salvage proof and observation/pool/aggregate parity. Client
cases cover typed paths, permission/cache partitioning, exact observation links,
outbox ownership/lease races and explicit state rendering. These are authored
cases until their actual suite results are recorded in the P14 build report.

P16 must record the populated six-journey browser walk, all-route axe/keyboard and
visual results, owner copy acceptance, real staging identity and failure behavior.
It must not reuse historical local-dev screenshots as acceptance for this build.
