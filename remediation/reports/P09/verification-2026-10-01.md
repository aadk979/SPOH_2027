# P09 phase verification — 2026-10-01

## Local verification

| Check                                                                                  | Result                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared and server builds; root typecheck, ESLint, architecture, hardcoding, formatting | Passed on Node 24; zero architecture violations and no event-specific source literals.                                                                     |
| Server unit                                                                            | 455 passed.                                                                                                                                                |
| Server integration on dedicated `spoh2027_test`                                        | 474 passed, 7 skipped. The cross-event isolation and Europe/London DST files passed separately: 19/19.                                                     |
| Client unit                                                                            | 229 passed.                                                                                                                                                |
| Mobile browser E2E on dedicated `spoh2027_p06_e2e_test`                                | 30 passed, including two rosters in one browser, offline outbox and visitor allowlist capture/purge.                                                       |
| Visual snapshots on dedicated `spoh2027_visual_test`                                   | 58 passed; no baseline updates. The visual API was restarted before the run.                                                                               |
| Event totals oracle on the seeded E2E database                                         | Two events exist; every event ownership, membership and cross-event relationship check reported zero mismatches, including VisitorField and VisitorRecord. |
| Dependency audit gate                                                                  | `scripts/audit.mjs` passed. Its explicit `aws-cdk-lib`/brace-expansion exception expires 2026-10-31.                                                       |

The schema contains only invariant enums; event taxonomy is in tables. No fixed Singapore timezone literal remains in application source. The P09.12 report and dashboard tests compare Event #1 and its clone. There is no production data or `pg_dump` to compare: the owner confirmed production starts empty, so migration counts were checked on seeded test data and staging. The original [staging migration totals](staging-totals.md) had zero mismatches.

## Staging

The `c62ea61` release passed [CI](https://github.com/aadk979/SPOH_2027/actions/runs/36828620206) and [staging deploy](https://github.com/aadk979/SPOH_2027/actions/runs/36828930632), including its migration and six smoke probes. The staging-only [fixture task](../P08/staging-fixture-2026-10-01.md) seeded SPOH 2027 and Dry Run as two synthetic events. Its totals task found two events and zero missing event owners, membership mismatches or cross-event relationship mismatches. The local route inventory exercises cross-event IDs for every event-scoped route; the dedicated 19-test isolation and DST run passed. Together these establish two coexisting events on staging and no observed cross-event leakage.

## Follow-on constraints

The old eventless API aliases stay through P16.7 for queued clients (ADR-009). P10.7 must stamp `VisitorRecord.purgeAfter` on the close transition; the current hourly purge job also recalculates deadlines and purges each field at its own retention deadline. The production stack is gated on the 28 October go decision.
