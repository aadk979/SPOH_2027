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

_Fill in on completion._
