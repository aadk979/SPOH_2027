# P16 personal and operational read privacy

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P16.10 remains in progress. The preceding announcement repair a01a7381
passed all five exact-SHA CI jobs (39025421740) and staging release
39027399506, including Smoke. Its selected 45 GET requests verified
strict URL flags, personalised inbox no-store, six original event roles,
foreign and genuine access refusals, and unchanged owned messages and audits.
The existing two quiet messages and Root acknowledgement were reused.

The next source and HTTP review found successful read responses containing
personal or operational data without a cache policy. Eighteen regressions
reproduced the omission after valid response-contract, owned-record and
unchanged-row assertions. They cover the event picker, audit feed, caller
profile, personal and station rosters, staff list/detail, incidents and
follow-ups, and active lost-person descriptions and acknowledgement state.
Both event route forms are exercised; the person-level event picker also
allows an empty result for a provisioned person with no memberships.

Nine named successful read handlers now set private, no-store after their
read completes. DTOs, ownership, authorization, queries and business writes
are unchanged. This policy follows the returned caller identity/membership,
staff contact/audit information, and explicitly transient visitor descriptions.
It does not impose a default on unrelated response families or settle the
separate lifecycle metadata cache observation. Existing public immutable and
draft policies remain separate.

The first private fixture type failure and two own-roster DTO oracle failures
are retained separately. Explicit event-create metadata and the declared
MyAssignment response contract corrected the preview. The final eighteen
pre-repair failures all reached the missing-cache assertions.

All 18 maintained operational read regressions, focused lint and assembled
types passed. Private failing previews preserve the original missing-cache
responses and the separate fixture/type/DTO corrections.

The fresh unchanged 29-step Node 24/npm gate exited zero with no resumed or
inherited steps: 8,949 passes (server 7,020, client 1,220, shared 372,
policies 158 and infrastructure 179), plus two historical server skips.
Complete coverage was archived privately. Server coverage was
96.73% lines / 88.56% branches; client
80.23% / 71.80%; shared
94.39% / 87.40%. All unchanged floors,
including server 96.67% lines, passed. Image/build/CSP, architecture, hardcoding,
dependency and secret checks passed. Exact-SHA CI and genuine new-image
staging proof were pending at commit preparation.

The whole twelve-file repair was delivered once as 62513e56. All five exact
CI jobs (39033550622) and staging 39035771632 passed, including Smoke.
The current immutable ARM64 image, deployed 73 policy bytes/schema and original
seven identities were verified. Independent selected operating proof accepted
69 GET requests: 44 successful private responses, eight foreign-event refusals,
16 missing/genuinely expired access refusals and one unrelated station-discovery
control. Both served forms preserve selected response rows and owned audits.
No business writes or successful fixture replays were requested.

The original comparison failure is preserved: four response clock fields
(serverTime and asOf across the two served forms) advanced. Independent offline
validation accepted the saved 69 responses without replay, checking their raw
hashes, contracts, access timing and unchanged data and audits. The clock checks
allow five seconds of server/client skew; the observed maximum over the local
response observation was 33 milliseconds. No other response leaves differed.

Nonempty active-alert and zero-membership-picker staging proof is not claimed;
the maintained local tests cover those fixtures. Lifecycle cache classification
and the remaining route axes remain separate. A subsequent test-only batch
adds granular URL-field and nonempty incident-filter/keyset coverage without
changing the accepted application image.

No production, whole-route or independent ASVS acceptance is claimed. Only
P16.9 continuous soak is owner-skipped. Browser/full, deferred, load, drills,
restore, real-person recovery, alarm receipt and owner go decisions remain.
The original seven-day allocation, USD 100 ceiling, USD 50 alert and
31 October CDK exception are unchanged.
