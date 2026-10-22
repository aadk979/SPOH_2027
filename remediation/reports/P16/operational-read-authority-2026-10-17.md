# P16 operational read role, person and station authority

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P16.10 remains in progress. The preceding test-only batch c8eda5ab passed its
fresh 29-step gate with 8,959 passes and two historical skips, then all five
exact CI jobs (39045745325). Its selected 320 GET requests were verified
independently against the unchanged accepted 62513e56 application image.
No additional deployment was needed.

This batch adds 36 maintained HTTP regressions and documentation. Twelve
role/form cases exercise People.Read list and person detail access, including
self, another role and the administrator as targets; Audit.Read against an
owned quiet announcement audit; and own-roster equality with the same actor's
typed upcomingAssignments. They use normal stored local test-provider sessions.
The two served forms are tested independently.

Twenty-four role/form/station cases separate an IC-assigned station from an
IC-unassigned station. An IC can read the assigned roster and is refused the
other; a Volunteer lacks the roster grant, while Deputy, Chief, Lead and Admin
can read both stations. The tests pin the exact FORBIDDEN response and action,
including the station-scope.ic-own-stations deciding policy where applicable.
They do not replace the policy's assigned-station rule with current-shift time.

Every refusal is reconciled with its persisted security audit, including the
actor, membership, event, action, deciding policies, request ID, method, route,
status, severity and outcome. Repeated person-detail refusals in the same local
window are deliberately checked as one collapsed audit. People, memberships,
assignments, grants, owned announcements, acknowledgements and business audits
remain unchanged. Legitimate security-denial audits are expected effects.

The private candidate passed assembled types and all 36 runner tests before
promotion. Its 36 quiet announcement fixtures and 36 stored session admissions
were local test setup, with no staging or identity-provider actions. These
private results do not establish public CI or staging acceptance.

All 36 maintained operational read role, person and station authority tests, focused
lint and assembled types passed. The private tests and exact refused action/policy audit checks are preserved separately.

The fresh unchanged 29-step Node 24/npm gate exited zero with no resumed or
inherited steps: 8,995 passes (server 7,066, client 1,220, shared 372,
policies 158 and infrastructure 179), plus two historical server skips.
Complete coverage was archived privately. Server coverage was
96.73% lines / 88.82% branches; client
80.23% / 71.79%; shared
94.39% / 87.40%. All unchanged floors,
including server 96.67% lines, passed. Image/build/CSP, architecture, hardcoding,
dependency and secret checks passed. Exact-SHA test CI and selected operating proof against the unchanged
accepted 62513e56 image were pending at commit preparation.

At preparation, selected staging role and station cases were conditional on genuine fresh
D/E membership, grant and assignment readbacks using the original seven
identities. D and E are distinct events. A positive D audit control needs an
actual existing D-owned entity. Naturally separated denial-audit windows are
required; no clock, readiness or quota override is authorised by these tests.
Unexposed persisted audit fields are local/CI evidence, not assumed HTTP data.

No additional person, peer administrator, foreign organisation or empty-picker
fixture is claimed. The already accepted scoped incident/lost-person matrices
and 55 permission semantics are retained without replay. Whole-route,
production and independent ASVS acceptance are not claimed. Only P16.9's
continuous soak is owner-skipped; remaining API, browser/full, deferred, load,
drill, restore, alarm receipt, real-person recovery and owner gates remain.
The original seven-day allocation, USD 100 ceiling, USD 50 alert and
31 October CDK exception are unchanged.

Selected operating authority proof subsequently passed independently against the unchanged 62513e56 image. All five exact test-commit CI jobs (39054831750) passed for 6d4c63cb. The original seven identities were used; 87 selected cases and 20 precisely attributed transport-visible policy-denial audits were verified, with 0 plan cases held for unavailable fixtures or grants. Selected business rows and owned audits remained unchanged. Unexposed persisted fields remain local/CI evidence. No fixture write, new identity or deployment was needed.
