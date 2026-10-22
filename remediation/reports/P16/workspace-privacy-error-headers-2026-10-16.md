# P16 workspace error response privacy

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P16.10 remains in progress. The workspace staging batch on application `c1f7fa0d`
stopped at a real cross-event 404 response that lacked `Cache-Control: no-store`.
The status and sanitized error code were correct. The batch is failed and its
native exit and request evidence are retained; preceding successful requests do
not make the batch accepted.

Authentication and event-scope middleware can reject a request before the
workspace router installs its cache policy. The shared error handler now sets
`no-store` on error responses that lack that directive. It preserves an existing
safe policy, including `private, no-store`. The terminal route-not-found handler
uses the same protection. Status codes, error masking and authorization checks
are unchanged; successful immutable content responses retain their cache policy.

Four HTTP regression tests failed against the original source. Three exercise
workspace entity, records and search reads, each checking successful private
reads, foreign-event 404, unauthenticated 401, unprovisioned alias 403 and malformed
query 400 responses. The fourth checks an unmatched API route's 404. The first
three failures and the expanded four-test failing run are both preserved.

All 38 affected tests passed across five files, including the existing workspace
query corpus, identity lifecycle and immutable-content cache controls. Focused
lint and assembled server/test types passed.

The fresh 29-step Node 24/npm gate exited zero with all five frozen files
unchanged and no resumed or inherited steps. It passed 8,868 tests: server 6,963,
client 1,220, shared 348, policies 158 and infrastructure 179, plus the two
retained historical server skips. This batch adds four runner tests.

Server coverage was 96.72% lines / 88.50% branches;
client 80.23% / 71.80%; shared 94.38% / 87.40%. All unchanged coverage
floors passed, including the 96.67% server line floor. Types, lint, image/build/CSP,
architecture, hardcoding, dependency audit and both secret scans passed. Complete
coverage and native evidence were archived privately.

The first acceptance-recording helper exited one because it expected the stale
server total of 6,961 instead of 6,965 including skips. A versioned read-only
reconciliation checked the original native-zero gate, all 29 step exits, exact
test counts, unchanged source and coverage, then archived the complete results.
The gate was not repeated; the original helper and wrapper failures remain.

Exact-SHA CI and new-image staging verification remain separate requirements.
The failed workspace batch will be repeated as reads after release acceptance;
the successful capture and other business writes will not be recreated.

The previous release's cleanup recovery, natural hourly successor, first LIVE
transition, 245 capture cases, six warmed-session rotations and 438 import,
safety and lost-and-found cases have separate accepted evidence. Those selected
families do not establish complete route coverage.

Only P16.9's continuous soak is waived and recorded as skipped. Browser,
deferred acceptance, load, drills, restore, independent assurance, actual alarm
receipt and owner production/go decisions remain outstanding. The original
seven-day cost authorization, USD 100 ceiling and USD 50 alert remain unchanged.
The CDK advisory exception expires on 31 October; zero advisories are not claimed.
