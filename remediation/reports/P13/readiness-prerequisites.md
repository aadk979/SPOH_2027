# P13.6 readiness contracts and pure item rules — 6 October 2026

## Scope and prerequisite review

ADR-010 authorizes this bounded P13.6 dependency work before the whole P10/P11/P12
phases finish. Reviewed ADR-004/005/009, current decisions and engineering standards,
the completed P09 verification, P10 lifecycle readiness, go-live override, archive,
settings and rehearsal contracts. Git was `main` at `a0d0c3a` before these new files;
the inherited settings-editor changes were preserved.

The implementation is isolated in the existing event domain's `readiness/` folder.
It supplies pure server snapshot contracts and evaluators for all eleven existing
shared go-live item codes. It performs no I/O or writes, opens no transaction, and
does not read the ambient clock. The real lifecycle snapshot still returns an empty
go-live checklist. First LIVE remains refused; public archive, policy enforcement,
owner approvals and the 28 October production gate retain their existing guards.

## Inputs and rules

| Item             | Server evidence and rule                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift coverage   | Complete event days × active templates materialisation, then every materialised shift × active station staffed by an ACTIVE event membership for the exact person on the assignment. Missing materialised shifts and empty structures fail. Null/stale memberships, mismatched person mirrors and mismatched day assignments do not count. Duplicate or incoherent snapshot identities are unavailable. |
| Categories       | At least one active capture category. Required registration structure remains a separate, non-overrideable lifecycle guard.                                                                                                                                                                                                                                                                             |
| Card batch       | A non-blank batch label with unissued live cards; rehearsal batches never satisfy it. These fields already exist on MissionCard.                                                                                                                                                                                                                                                                        |
| Gift stock       | Every active gift type has positive live initial stock + adjustments − non-voided redemptions. Practice stock is refused as evidence. Empty active catalogues fail.                                                                                                                                                                                                                                     |
| Content          | Every server-specified required content key has a published version and publication timestamp. Drafts, missing publications and future timestamps cannot pass.                                                                                                                                                                                                                                          |
| Attendance       | A currently ACTIVE ADMIN root in this event, plus at least one trusted range validated by the existing settings resolver. No raw CIDRs or personal columns are returned.                                                                                                                                                                                                                                |
| Role permissions | An actual review timestamp for the exact current grants version. Missing or superseded review fails; a future review is unavailable.                                                                                                                                                                                                                                                                    |
| Notifications    | Current transport configuration and validated notification settings. This proves configuration only; it does not claim device delivery or user receipt.                                                                                                                                                                                                                                                 |
| Staging smoke    | A timely observation tied to the exact server-selected deployment. A current failed smoke is a known failure; absent, stale, future or wrong-release observations are unavailable.                                                                                                                                                                                                                      |
| Backups          | A timely observation for the exact server-selected database, with a fresh RDS restorable horizon. A fresh observation of a missing/old horizon is a known failure; absent/stale observation, wrong database or future horizon is unavailable. This does not prove the separate G3 restore rehearsal.                                                                                                    |
| Alarms           | Timely observation for the selected deployment, with every configured required alarm present, unique and sufficiently measured. ALARM is a known failure; missing alarms, INSUFFICIENT_DATA, absent requirements and stale observations are unavailable.                                                                                                                                                |

All evidence carries an event-scoped envelope and is parsed with a strict schema.
The server supplies the event identity, injected evaluation time, release/database
identities, expected alarm set and explicit positive freshness limits when configured.
Freshness configuration is explicitly nullable: the five existing-data local items
still evaluate without any cloud configuration, while all three infrastructure items
remain unavailable and cannot be waived when freshness limits are absent. No
placeholder limits or implicit defaults make absent configuration appear available.
There are no
hardcoded event IDs, source SHA, cloud names or freshness defaults in the rules.
Results contain only the shared item code, state, boolean and static reason codes;
they do not echo row IDs, private text, credentials or external error details.

An item has three states: passed, failed, unavailable. `toGoLiveChecks` omits
unavailable, duplicate and incoherent results. The existing P10 guard therefore
reports missing evidence, which a platform-admin written reason cannot waive.
Known failures retain the existing current-authority, per-item override semantics.
The adapter derives its boolean from the validated state rather than trusting a
contradictory caller-provided `passed` value.

The final contracts were reconciled against the actual P09 schema and established
attendance/people mappers. Person has no independent `active` or provider-disabled
column: current eligibility comes from this event's membership status. Coverage
requires ACTIVE membership and an exact membership.personId/assignment.volunteerId
match; attendance requires the configured same-event root to remain ACTIVE ADMIN.
Obsolete `personActive` assertion fields are rejected rather than fabricated. This
preserves event deactivation safeguards while making no assertion that a Cognito
identity is enabled. P12 must supply and verify any later independent identity
standing contract before it becomes another readiness prerequisite.

## Verification

Focused pure unit verification covers all items, complete coverage grids, live versus
practice provenance, active authority inputs, exact target identities, freshness
boundaries, missing/malformed/foreign evidence and composition with the existing
lifecycle/override guard. A read-only independent review reproduced an adapter
contradiction/duplicate-row hazard before its repair; new regressions prove both
forms now remain missing even with a written platform-admin override.

- Four new pure suites: **110 passed**. With the two affected existing lifecycle and
  go-live override suites: **143 passed** across six files after membership-input
  reconciliation and explicit nullable cloud freshness regressions.
- Focused ESLint and Prettier checks pass. Scoped dependency-cruiser reports zero
  violations (eight modules, twenty dependencies).
- The coordinator's isolated four-suite measurement passes all **110** new checks
  and covers every maintained line and branch in the new readiness folder:
  **141/141 lines and 138/138 branches**. This focused report is kept separately
  in ignored `.local`; it does not substitute for full application coverage or
  narrow the application ratchet. The subsequent full workspace type check passes.
- Server tests TypeScript project check passed before the final membership-input
  reconciliation. Focused pure tests and changed-file lint pass again after both the
  membership reconciliation and nullable cloud freshness refinement;
  the core agent retains final workspace types and full application CI for release.

No shared database, browser, visual, build, Prisma generation, cloud operation or
real local database mutation is part of this slice. Required full application CI
and release acceptance remain the core agent's milestone gate.

## Remaining P13.6 integration

P13.6 is open. The existing schema has no ContentDocument, RolePermission or
persisted permission-review evidence yet, so these evaluators deliberately receive
no invented availability claims. Future readers must gather actual evidence inside
the existing event-first transaction/lock order, with current EventScope filters,
active station/type selection, live stock aggregation and reviewed evidence versions.
External evidence readers must verify deployment/database identities, freshness and
the required alarms; an unavailable service cannot produce a fabricated pass.

The rules do not add a public evidence submission endpoint. They are not wired into
the existing lifecycle writer or readiness read in this milestone. That integration
still needs data-layer tests for transaction consistency, concurrent settings,
membership and lifecycle changes, production-free staging acceptance, and UI
Overview items/deep links resolved through the existing navigation registry. READY
retains ADR-004's structure checks; LIVE additionally needs this checklist. No item,
phase, G3 criterion or owner-controlled approval is marked complete here.
