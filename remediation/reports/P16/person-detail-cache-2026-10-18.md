# Private person-detail responses — 18 October 2026

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


The readiness sprint found that `GET /api/v1/people/:id` returned staff contact
and cross-event membership information without an explicit cache policy. A
bounded read-only probe reproduced the missing header on accepted staging
application `63d9997dcc7e8b0408820fc8b870583e6cfa7e4d`; the adjacent person-data
export correctly returned `private, no-store`. No account or membership changed.

A maintained integration regression first established a platform administrator's
authority to read a person with two event memberships, checked the actual email
and both memberships, then required `Cache-Control: private, no-store`. It failed
against the original handler because the header was absent. Fourteen other
tests were excluded by that focused filter; they are not additional historical
skips or accepted results.

The person-detail handler now sets the same private, non-persistent policy as
the person-data export. Current organisation authority, target isolation,
response contracts and membership visibility are unchanged. The original live
probe and before-fix regression failures remain private evidence.

The batch requires its affected suites, complete fresh 29-step Node24/npm gate
with full coverage, final staged secret/whitespace/stat review, one direct-main
delivery, all five exact-SHA CI jobs and one new-image staging verification.
Those results are recorded separately; this report alone does not claim them.

The sprint also reconciled existing API evidence without replaying accepted
campaigns. The owner approved one zero-stock gift in the retained alias event;
its exact create audit and the original 42 held descriptors passed independent
verification. Together with the retained 730 descriptors, all 772 original
alias field descriptors now have composite acceptance across their actual
fixture contexts. This does not close whole routes, lifecycle/role axes or P16.

API acceptance remains first, followed by full/browser/visual regression,
deferred acceptance, representative load, resilience drills and both restore
paths. Only the continuous 24-hour soak is owner-skipped. Actual alarm/device
delivery, unfamiliar-person walkthrough, independent assurance, production/go
and future event-dependent requirements retain their evidence and approvals.
