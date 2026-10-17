# P16 operational read URL fields and incident selection

P16.10 remains in progress. The preceding personal read privacy repair
62513e56 passed exact CI 39033550622 and staging 39035771632, all
three release jobs and Smoke. Its immutable image, ARM64 task, 73 deployed
policies, original seven identities and selected 69 GET requests were
verified independently. No successful fixture was recreated.

This batch changes tests and documentation. The application remains 62513e56.
Ten maintained HTTP tests cover people, audit, incident and station-roster URL
queries in event-scoped and compatibility forms. The corpus contains 107
malformed definitions and 38 valid controls: 214 malformed GET requests and
76 valid GET controls across the two route forms. It uses scalar strings and
two repeated URL keys, rather than fictitious JSON query input types.

The queries cover page limits and cursor shapes; search, role, active, station,
day and sort fields; audit actor, entity, action and time fields; incident
status, severity, station and time fields; and station-roster day selection.
Each mounted field rejects its declared malformed cases. Nonempty people,
owned audit and station-roster controls preserve the actual response shapes,
caller standing, cache policy and selected rows and audits.

Two additional incident tests supply four local records across all severities,
three statuses and two stations. Their reported instants bracket one boundary
and include a tied timestamp; occurred times deliberately differ. Thirty-four
GET controls verify nonempty filter results, inclusive from/exclusive to, a
half-open one-instant range and four one-row keyset pages ending without an
extra empty fetch, duplicates or missing tied rows. The original empty incident
shape controls are retained alongside these positive semantic controls.

Private types and all ten candidate HTTP tests passed before promotion. The
initial eight and the two added semantic tests were run separately; eight
name-filter exclusions in the latter run are not historical programme skips.
The typed public helper and its JSON fixture exactly matched all 145 original
definitions across three distinct fixture hydrations (435 descriptor checks).
Local fixture setup created ten quiet test announcements and eight synthetic
incident rows; it contacted neither staging nor an identity provider. These
private checks alone do not establish public CI or staging acceptance.

All 10 maintained operational URL-field and incident-selection tests, focused
lint and assembled types passed. The private canonical/typed corpus equality,
nonempty reported-time filters and tied keyset controls are preserved separately.

The fresh unchanged 29-step Node 24/npm gate exited zero with no resumed or
inherited steps: 8,959 passes (server 7,030, client 1,220, shared 372,
policies 158 and infrastructure 179), plus two historical server skips.
Complete coverage was archived privately. Server coverage was
96.73% lines / 88.82% branches; client
80.23% / 71.80%; shared
94.39% / 87.40%. All unchanged floors,
including server 96.67% lines, passed. Image/build/CSP, architecture, hardcoding,
dependency and secret checks passed. Exact-SHA test CI and selected operating proof against the unchanged
accepted 62513e56 image were pending at commit preparation.

The whole six-file test-only batch was delivered once as c8eda5ab. All five
exact CI jobs (39045745325) passed. Independent selected operating proof
accepted 320 GET requests against the unchanged 62513e56 image: 214 malformed
query refusals, 76 valid corpus controls, 16 selected before/after snapshots,
three discovery/lifecycle controls and 11 existing-incident time/page controls.
The original controlled Root made the new query reads; prior seven-actor
acceptance is retained separately. All 73 deployed policy statements/schema
and the original image digest/task were checked afresh. Selected people,
incidents, rosters and owned announcement audit rows remained unchanged.

The scoped E and compatibility D forms use their own station/day hydration.
D's E-owned audit entity is explicitly an empty cross-event control. Existing
eight-incident reported-time filters and finite one-row keyset pages were
verified without creating incidents. The synthetic tied timestamps and
one-millisecond fixture remain local/CI evidence. No business writes, successful
fixture replays, new identities, invitations or application deployment occurred.
A subsequent test-only batch adds role/person/station read-authority coverage.

No whole-route, production or independent ASVS acceptance is claimed. Other
role, lifecycle, conflict and rate-limit axes remain in the granular inventory.
Only P16.9 continuous soak is owner-skipped. Browser, deferred acceptance,
load, drills, restore, alarm receipt, real-person recovery and owner gates
remain. The seven-day allocation, USD 100 ceiling, USD 50 alert and
31 October CDK exception are unchanged.
