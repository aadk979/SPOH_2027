# P16 audit cursor ownership, read pagination and quota error privacy

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P16.10 remains in progress. This repair batch follows the operational read
role and station authority batch. Its selected operating proof is recorded
separately; request counts do not establish whole-route acceptance.

Two local HTTP regressions reproduced quota refusals without an explicit
Cache-Control no-store directive. Both URL forms returned a typed RATE_LIMITED
429 containing only the public error code, message and request ID. The configured
limiter wrote the response directly before the shared error handler's cache
guard ran. The repair reuses that guard, preserving any existing no-store
privacy directives and leaving the response body and quota policy unchanged.

Two further local regressions, covering both URL forms, found different audit
pages for valid foreign-event or global cursor IDs and a missing cursor. No
foreign audit row content was returned. The generic cursor could still influence
the current event's pagination anchor and skip its first matching row. The audit
query now resolves an anchor inside the current event before paging. Missing,
foreign and global anchors all retain the existing empty-page answer. Normal
owned cursors keep their creation-time and ID ordering.

Fourteen maintained regressions cover these changes. Eight exercise all four
people sorts with tied names, creation times and null/non-null membership last
seen values, page sizes 1, 2 and 4, terminal and missing cursors, exact typed rows
and unchanged business data. Four audit cases cover tied creation-time keysets,
inclusive from/exclusive to filters, complete page endings and foreign/global
anchor equivalence with a missing anchor. Two pin normal stored local-provider
session admission, the successful private own-roster response, the typed public
quota refusal, no-store and unchanged selected rows. Synthetic people, event,
audit rows, local quota settings and tied timestamps are local test setup only.

The original failed HTTP tests and first lint failure are retained privately.
The corrected private preparation uses a small audit ownership helper and actual
formatter output. Virtual types, focused lint and all 14 HTTP regressions passed
before promotion. These private results do not establish public CI or staging
acceptance.

The first local gate was interrupted to correct test database portability.
The tests now check the configured test database while allowing the local and
CI service ports to differ. Its partial results and actual exit remain preserved.

All 14 maintained quota-error privacy and people/audit pagination regressions,
focused lint and assembled server/test types passed. Original private HTTP and lint
failures remain preserved separately. The earlier interrupted and timed-out full-gate
attempts also remain preserved, with no inherited credit.

The fresh unchanged 29-step Node 24/npm gate exited zero without resumed or
inherited steps: 9,009 passes (server 7,080, client 1,220, shared 372,
policies 158 and infrastructure 179), plus two historical server skips.
Complete coverage was archived privately. Server coverage was
96.74% lines / 88.83% branches; client
80.23% / 71.80%; shared
94.39% / 87.40%. All unchanged floors,
including server 96.67% lines, passed. Build/image/CSP, architecture, hardcoding,
dependency and secret checks passed. Exact-commit CI and selected proof on a
new accepted repaired staging image were pending at commit preparation.

The application changes require all five exact-commit CI jobs and one accepted
staging deployment, including Smoke, current immutable image/task binding and
all 73 deployed policies. Selected operating proof must use original controlled
identities and existing event-owned records. A bounded natural quota exhaustion,
shared-form refusal and recovery case must also check the repaired error headers.
No successful fixture write, invitation, readiness override, quota reset or
clock change is authorised by these tests.

Whole-route, production, independent ASVS and full-load acceptance remain open.
Only P16.9's continuous soak is owner-skipped. Remaining API, browser/full,
deferred, load, drill, restore, alarm receipt, real-person recovery and owner
gates remain. The seven-day allocation, USD 100 ceiling, USD 50 alert and
31 October CDK exception are unchanged.
