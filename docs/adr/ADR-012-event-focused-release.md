# ADR-012 — Event-focused readiness and CI-first testing

| Field  | Value                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Status | Accepted by owner22October2026; D-25                                                                                       |
| Scope  | Readiness to operate SPOH2027 on6–9January2027                                                                             |
| Amends | ADR-009 §2 evidence scope; ADR-010/011 local-before-online order and exhaustive P16 launch prerequisites                   |
| Keeps  | Full exact-SHA CI/coverage; core correctness/security; data integrity; budget/action boundaries; production owner decision |

## Context

An exhaustive API, formal assurance, real-identity load, resilience and timed-restore campaign delayed practical event testing. The owner clarified that this short event does not require industry compliance, SLA or durability certification, accepted the practical five-gate plan, and requested updated instructions and a continuation prompt.

## Decision

[The event release plan](../EVENT_RELEASE_PLAN.md) is authoritative: E1 correct candidate/green CI; E2 core browser journeys; E3 essential access/data correctness; E4 brief realistic traffic; E5 deployment/rollback/basic operations.

Exhaustive API/deferred lists, formal ASVS/independent assurance,660real load identities/invites, fixed100RPS/mandatory sizing, six failure drills, timed dual restores/RPO/RTO and the already-waived24hsoak are nonblocking for this event. They are not marked passed. Historical results and the wider programme tracker remain intact.

A reviewed coherent direct-main candidate can be pushed after applicable focused local checks, using CI's PostgreSQL17 service for actual DB acceptance. Local Docker and duplicate local Whole29 are not prerequisites. All exact-SHA CI jobs and unchanged coverage floors gate staging deployment. This applies to the complete frozen eleven-file repair plus reviewed documents; it does not permit partial source commits or skipped failed CI.

Independent core checks need not wait for every API obligation. Cloud/session/traffic/rollback operations retain bounded current eligibility. This amendment creates no production, sends no messages and grants no new identity, fixture, real-data/SQL, resource or spending actions.

## Consequences and validation

Readiness answers whether actual event flows work, preserve access/count correctness and can be released/rolled back practically. It makes no blanket compliance, contractual availability, durability or full-programme completion claim. Keep28October ownergo/no-go. Preserve failures/nulls; record noncritical residuals with workarounds.

Document consistency/link checks and preservation of the eleven candidate blobs validate this amendment. No application test acceptance is created by documentation.
