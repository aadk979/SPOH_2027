# Architecture Decision Records

Decisions that shape the platform, written in P05 of the remediation programme. They outlive
the programme, which is why they are here and not under `remediation/`.

| ADR                                         | Decision                                      | Owner decisions  | Status   |
| ------------------------------------------- | --------------------------------------------- | ---------------- | -------- |
| [ADR-001](ADR-001-tenancy-event-model.md)   | Tenancy, event model and API scoping          | D-02, D-12       | Proposed |
| [ADR-002](ADR-002-configurable-taxonomy.md) | Configurable taxonomy and per-event rules     | D-04             | Proposed |
| [ADR-003](ADR-003-configuration-model.md)   | Configuration model, cache bus, retention     | D-14             | Proposed |
| [ADR-004](ADR-004-lifecycle-scheduling.md)  | Event lifecycle and scheduling                | D-09             | Proposed |
| [ADR-005](ADR-005-authorization-avp.md)     | Authorization on Amazon Verified Permissions  | D-03, D-06       | Proposed |
| [ADR-006](ADR-006-identity-cognito.md)      | Identity on Cognito                           | D-08             | Proposed |
| [ADR-007](ADR-007-code-architecture.md)     | Code architecture, libraries, offline capture | —                | Proposed |
| [ADR-008](ADR-008-aws-topology-cost.md)     | AWS topology, environments and cost           | D-07, D-08, D-10 | Proposed |
| [ADR-009](ADR-009-migration-rollout.md)     | Migration, rollout and the 28 Oct go/no-go    | D-01, D-12       | Proposed |

## Format

`Context → Decision → Options considered → Consequences → How it is tested → Migration`. Each ADR
cites the findings it resolves (IDs from `remediation/findings/`) and marks every choice made on a
recommendation the owner has not confirmed as **assumed**.

## Status

- **Proposed:** written, awaiting the owner's sign-off at gate G1 (P05.11).
- **Accepted:** signed off. Binding on every later phase. A change needs a new ADR that
  supersedes this one.
- **Superseded by ADR-0xx:** kept for history.
