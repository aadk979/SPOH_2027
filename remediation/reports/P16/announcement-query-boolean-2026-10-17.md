# P16 announcement query flags and inbox privacy

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


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

The whole eight-file batch was delivered once as a01a7381. All five exact-SHA
CI jobs (39025421740) and staging release 39027399506 passed, including
Smoke. Current immutable image, ARM64 task, 73 deployed policy bytes/schema
and the seven original real-provider identities were verified.

Selected operating proof accepted 45 GET requests: 24 malformed-query errors,
13 successful personalised inbox reads, one foreign refusal, two genuine access
refusals and five lifecycle/audit controls. Nonempty owned rows verify literal
false, omission and per-person acknowledgement filtering. Both route forms have
selected flag/cache proof. Owned message and acknowledgement audits were
unchanged, and the two existing INFO messages and Root ACK were not replayed.
These counts do not close the remaining granular route axes. A separate
operational-read cache-policy repair follows the independently reproduced
profile, roster, people, audit, incident and transient-description omissions.

Only P16.9's continuous soak is owner-skipped. Browser/full acceptance, deferred
acceptance, load, drills, restore, independent assurance, actual alarm-email
receipt, production/cutover and owner go decisions remain. The original seven-day
cost allocation, USD 100 ceiling, USD 50 alert and 31 October CDK exception remain.
