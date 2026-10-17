# P16 personal and operational read privacy

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

Application source changes require exact-SHA CI, one genuine new-image
staging release, current deployed policies and actual controlled-actor GET
proof. Existing fixtures and the original seven identities are retained.
No production, whole-route or independent ASVS acceptance is claimed. Only
P16.9 continuous soak is owner-skipped. Browser/full, deferred, load, drills,
restore, real-person recovery, alarm receipt and owner go decisions remain.
The original seven-day allocation, USD 100 ceiling, USD 50 alert and
31 October CDK exception are unchanged.
