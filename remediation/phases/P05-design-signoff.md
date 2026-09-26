# P05 — Target design and sign-off ⛔ owner checkpoint

| Field             | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Gate              | G1                                                               |
| Depends on        | P01, P02, P03, P04                                               |
| Decisions         | D-01, D-02, D-03, D-04, D-06, D-07, D-08, D-09, D-10, D-12, D-14 |
| Changes behaviour | No                                                               |
| Size              | M                                                                |

## Purpose

Turn the four audits into one prioritised backlog and a set of Architecture Decision Records the
owner signs off. **Nothing from P06 onwards starts until the sign-off is recorded.**

## Context for a fresh session

- Inputs: `findings/F01…F04`, `DECISIONS.md` (all "Owner: you" items must be answered),
  `standards/target-architecture.md` (the draft this phase finalises).
- Outputs: `findings/BACKLOG.md` and `docs/adr/ADR-00x-*.md`. ADRs go in the repo's `docs/`
  because they outlive the programme.
- The final design is also published as a readable page for the owner (Artifact) and linked in
  `progress.json`.

## ADR format

`Context → Decision → Options considered → Consequences → How it is tested → Migration`. Each ADR
cites the findings it resolves.

## Steps

### P05.1 — Consolidated backlog

- **Do:**
  1. Merge the findings from F01–F04 (and preliminary) into `findings/BACKLOG.md`.
  2. Deduplicate them, rank by severity, and map each to a phase and step.
  3. Re-scope P06–P16 where the audits showed something the plan missed, adding or removing steps
     and running `progress.mjs sync`.
- **Done when:** every open finding has a home, and the phase files reflect it.

### P05.2 — ADR-001 Tenancy, event model and API scoping (D-02)

- **Do:** Specify:
  - the entity list and ERD
  - `eventId` on every event-owned table, and the indexes
  - path-scoped API (`/events/:eventId/...`) vs header scoping
  - the client route segment and event switcher
  - Person vs EventMembership
  - how cloning works
- **Done when:** the ADR is written with the ERD and the list of affected tables.

### P05.3 — ADR-002 Configurable taxonomy (D-04)

- **Do:**
  1. Map the enums to tables: CaptureCategory, StationType plus capability flags, StationTag, and
     ShiftTemplate/Shift.
  2. Define which enums stay as invariants, with the invariant tests that keep them honest.
  3. Specify the migration from enum values to rows.
- **Done when:** the ADR is written.

### P05.4 — ADR-003 Configuration model (D-14)

- **Do:** Specify:
  - the settings registry schema, scopes and resolution order
  - history and revert
  - the permission per setting
  - the cache bus (`LISTEN/NOTIFY`) and its failure behaviour
  - the env reduction list from F01
  - where infra config lives in AWS (SSM, Secrets Manager)
- **Done when:** the ADR is written.

### P05.5 — ADR-004 Event lifecycle and scheduling (D-09)

- **Do:** Specify:
  - the state machine, guards and side effects per transition
  - rehearsal mode (replaces `SHIFT_HOURS_ALWAYS_OPEN`)
  - the scheduler engine: table, worker, locking, retries, idempotency, audit
  - the handler catalogue
  - how existing interval jobs migrate
- **Done when:** the ADR is written.

### P05.6 — ADR-005 Authorization on Verified Permissions (D-03, D-06)

- **Do:** Specify:
  - the Cedar schema: entities, attributes, actions and action groups
  - the policy layout: role policies, station scope, locked guardrails, phase rules
  - the templates for per-event role permissions
  - the evaluation strategy and decision cache
  - failure behaviour (degraded local evaluation vs fail-closed, per action group)
  - how admins edit policies, and the policy test strategy
  - the mapping from the 26 current capabilities, and every intentional change

  Validate the schema by compiling sample policies with Cedar WASM, and measure AVP latency from
  this region with a throwaway policy store. The store is created only with the owner's approval and
  deleted after.

- **Done when:** the ADR is written, with the schema file and 5 sample policies passing local tests.

### P05.7 — ADR-006 Identity (Cognito)

- **Do:** Specify:
  - reuse of the existing pool (import, retain)
  - the MFA policy per role tier
  - SES for invite emails (D-08)
  - the membership lifecycle (invite, accept, deactivate, archive)
  - what Cognito groups mean from now on
  - the session policy per role (idle timeout for admins)
- **Done when:** the ADR is written.

### P05.8 — ADR-007 Code architecture

- **Do:**
  1. Finalise `standards/target-architecture.md` §6–§8 and `engineering-standards.md` using the
     P03 backlog.
  2. Decide the libraries: date/tz (`@date-fns/tz` or Luxon), forms, component testing, and
     dependency-cruiser rules.
- **Done when:** the ADR is written, and both standards files are marked **final**.

### P05.9 — ADR-008 AWS topology, environments and cost (D-07, D-08, D-10)

- **Do:** Specify:
  - the service choice per concern
  - the environments
  - networking (with or without a NAT gateway: VPC endpoints vs cost)
  - RDS sizing and HA, event-week vs off-season
  - CI/CD with OIDC
  - DNS and certificates
  - monthly cost from the AWS Pricing API for event month and off-season, against D-10
- **Done when:** the ADR is written, with the cost table.

### P05.10 — ADR-009 Migration and rollout (D-01, D-12)

- **Do:** Specify:
  - how existing data becomes Event #1
  - the migration ordering and reversibility
  - zero-downtime rules (expand → migrate → contract)
  - client outbox compatibility across the upgrade (queued captures from the old build)
  - cutover from Lightsail to the new stack
  - the go/no-go criteria for 28 Oct
- **Done when:** the ADR is written.

### P05.11 — Owner review and sign-off

- **Do:**
  1. Publish the design summary: the backlog headline, each ADR in plain language, cost, schedule
     and risks.
  2. Walk the owner through it and record changes.
  3. Record the sign-off in `progress.json` (`decide G1 --answer "approved <date>"`) and mark the ADRs
     _Accepted_.
- **Done when:** the sign-off is recorded. **Stop here until it is.**

## Exit criteria

- All ADRs are accepted, the backlog is complete, the standards are final, and the owner's sign-off
  is recorded.

## Phase report

**Status: done (2026-09-26).** 11 of 11 steps done. G1 passed: the owner approved the design on
2026-09-26 and delegated every open item to the ADRs' recommendations. No product code changed:
`git diff 87bf2e0^..HEAD -- server/src client/src packages ops` is empty. P05 wrote the backlog,
nine ADRs in `docs/adr/`, the final standards, a Cedar test bench (`reports/P05/cedar/`) and a
pricing model built from the public Price List (`reports/P05/pricing/`).

### Summary

`findings/BACKLOG.md` ranks **116 rows, 108 unique open findings: 1 Blocker, 22 High, 52 Medium,
33 Low**, each with a home step (`check-backlog.mjs` proves it). The audits added four steps:
P06.12 (the January safety net), P06.13 (correctness fixes after each module's refactor), P07.11
(client fixes) and P09.14 (the D-04 per-event product rules). ADR-001…009 cover tenancy, taxonomy,
configuration, lifecycle and scheduling, authorization on AVP, identity, code architecture, AWS
topology and cost, and migration and rollout. The design summary for the owner is
<https://claude.ai/artifact/Ahdqgo11tYz3W9LQh6TpeF>.

| Step   | Status  | Outcome                                                                                                                  |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| P05.1  | ✅ done | backlog: 116 rows, 108 unique open, every ID homed; new steps P06.12, P06.13, P07.11, P09.14; P08 and P15 edits          |
| P05.2  | ✅ done | ADR-001: Organisation root, Event, memberships, `eventId` on every event-owned table, path-scoped API, cloning, ERD      |
| P05.3  | ✅ done | ADR-002: taxonomy tables, the enums that stay as invariants, enum-to-row migration, D-04 modes, data classification      |
| P05.4  | ✅ done | ADR-003: settings registry, history and revert, `LISTEN/NOTIFY` bus (D-14 A), env reduction, retention schedule          |
| P05.5  | ✅ done | ADR-004: lifecycle, rehearsal mode, day boundary, `ScheduledAction` engine (D-09 A), handler catalogue                   |
| P05.6  | ✅ done | ADR-005: Cedar schema, 5 policy files, grants as data, 51 Cedar WASM tests passing; AVP latency deferred to P11.9 (Q-P7) |
| P05.7  | ✅ done | ADR-006: pool per environment, MFA tiers, SES invites, membership lifecycle, sessions, groups retired                    |
| P05.8  | ✅ done | ADR-007: layering, libraries, offline capture; both standards files final                                                |
| P05.9  | ✅ done | ADR-008: HTTP API + Cloud Map, one Fargate ARM service, RDS single-AZ; US$36–97/month from the Price List                |
| P05.10 | ✅ done | ADR-009: Event #1 migration, expand → migrate → contract, outbox compatibility, cutover, the twelve 28 Oct criteria      |
| P05.11 | ✅ done | design summary published; G1 approved 2026-09-26; ADRs Accepted                                                          |

**Exit criteria:** all ADRs accepted ✅; backlog complete ✅; standards final ✅; sign-off recorded ✅.

### Decisions at G1

Recorded in `progress.json` and `DECISIONS.md` § G1: D-07 (the ADR-008 lean topology), D-08 (a
Route 53 domain with ACM and SES + DKIM; **the domain name is still a placeholder**, flagged for
P08), D-10 (US$100 for staging + production; Q-P9 allows about US$130 in January 2027 only), D-12
(migrate as Event #1), and D-13 amended (the agent may use the AWS CLI and this environment's
credentials within ADR-008's cost plan; the live Lightsail site is not changed without the owner).
Q-P1…Q-P9, the PIN default, PF-11 and C1–C13 are accepted as written. The items marked
**assumed** in the ADRs stay marked, as a record of what was accepted by delegation.

### Deviations from plan

- **The walkthrough (P05.11 step 2) did not happen as a meeting.** The owner read the published
  summary and approved it with a blanket delegation to the recommendations, so no ADR changed at
  sign-off.
- **AVP latency was not measured** (P05.6 asked for it). D-13 forbade AWS calls at the time. Q-P7
  moves the measurement to P11.9, and the 50 ms budget in ADR-005 is unmeasured until then.
- **Prices come from the public Price List offer files**, not the Pricing API (D-13 at the time).
  P08.10 replaces the usage assumptions with Cost Explorer data.
- **Checks at phase end:** lint 0 errors (the same 131 guard warnings), typecheck clean, prettier
  clean, server 525 passed + 50 skipped, client 19 passed + 7 skipped: identical to P04.
  `arch:report` ran under a temporary Node 24.

### Metrics before → after

| Measure                      | End of P04                        | End of P05                 |
| ---------------------------- | --------------------------------- | -------------------------- |
| Lint errors / guard warnings | 0 / 131                           | 0 / 131                    |
| Functions > 50 / files > 300 | 97 / 18                           | 97 / 18                    |
| Guard counts (`arch:report`) | `P04-arch.json`                   | identical                  |
| Tests (server / client)      | 525 + 50 skipped / 19 + 7 skipped | identical                  |
| Open findings                | 171 filed                         | 108 unique open, all homed |

Snapshots: `reports/metrics/P05.json` and `P05-arch.json` (identical to P04 apart from timestamps).

### Follow-ups for later phases

- **P06.12 first:** the ten January safety-net fixes, cherry-picked onto `release/january` from
  `319d06d` (Q-P5).
- **P08:** the static-export spike first (ADR-008 §2). If it fails, the January budget breaks and the
  owner is told. The domain is a placeholder until the owner names it (D-08).
- **P11.9:** the throwaway AVP store for latency (Q-P7). **Before P12.1:** the read-only Cognito
  describe (Q-P8).
- **P12.8:** the 28 Oct go/no-go. The owner makes that call on the prepared evidence.

### Commits

`87bf2e0` backlog · `f28b815` ADR-001 · `9cfb868` ADR-002 · `630cb37` ADR-003 · `01e5ed2` ADR-004 ·
`d5f8ea4` ADR-005 · `949d915` ADR-006 · `1576672` ADR-007 · `6f5149c` ADR-008 · `346d4e7` ADR-009 ·
`2422df9` design summary · `9cfe023` G1 decisions · `f66b131` ADRs accepted, plus the
`chore(remediation): P05.x done` tracker commits and the phase close.
