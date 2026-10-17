# P16 announcement query flags and inbox privacy

P16.10 remains in progress. The previous record-field test batch cd829ff9
passed all five exact-SHA CI jobs (39015969932), after a fresh 29-step local
gate with 8,900 passes and two historical skips. Its 756 malformed scoped
queries and 16 valid controls were accepted separately on the existing
application image a940cb7e. Compatibility-route staging and all-route
coverage are not inferred from those selected checks.

The announcement inbox used generic truthiness conversion for its URL flag.
The string unackedOnly=false therefore selected only unacknowledged messages,
and malformed values such as TRUE were accepted. The repair accepts only the
exact URL strings true and false, defaults omission to false, then produces the
existing boolean application value. Repeated flags, whitespace, other literals
and non-string inputs are refused.

A successful inbox response contains caller-specific acknowledgement state,
author names and targeted message text. Its handler now sets private, no-store.
This is a narrow response policy for personalised inbox data; it does not decide
the separate positive lifecycle-metadata cache observation.

The maintained regressions add 24 shared grammar cases, four announcement
query HTTP cases, two personalised-cache HTTP cases and one notification-centre
control. Both scoped and compatibility routes exercise the inbox defects. The
notification-centre control verifies its real history materialisation once,
idempotent subsequent reads, strict malformed queries, unread false/true
semantics, unchanged rows after refusal and no historical device-delivery rows.
Only the sole approved local test database is used.

All 31 added tests (24 shared grammar and seven HTTP tests), focused lint and
assembled types passed. The original private previews retain the failing
coercion and missing-cache responses observed before the repair.

The fresh unchanged 29-step Node 24/npm gate exited zero, with no resumed or
inherited steps. It passed 8,931 tests: server 7,002, client 1,220, shared 372,
policies 158 and infrastructure 179, plus two historical server skips. Complete
coverage was archived privately. Coverage was server 96.73%
lines / 88.56% branches, client 80.23% /
71.80%, and shared 94.39% /
87.40%. All unchanged floors, including server 96.67%
lines, passed. Image/build/CSP, architecture, hardcoding, dependency and secret
checks passed. Exact-SHA CI and actual new-image staging acceptance remain
separate and were pending at commit preparation.

This batch changes application source. Exact-SHA CI, one genuine new-image
staging release, current deployed-policy proof and actual controlled-actor API
verification remain required. Quiet owned fixtures use only the existing event
and seven original synthetic identities. Existing successful writes are preserved
and reused across the release. No production or full-route acceptance is claimed.

Only P16.9's continuous soak is owner-skipped. Browser/full acceptance, deferred
acceptance, load, drills, restore, independent assurance, actual alarm-email
receipt, production/cutover and owner go decisions remain. The original seven-day
cost allocation, USD 100 ceiling, USD 50 alert and 31 October CDK exception remain.
