# P11 — Authorization on Amazon Verified Permissions (PBAC)

| Field             | Value      |
| ----------------- | ---------- |
| Gate              | G3         |
| Depends on        | P09, P10   |
| Decisions         | D-03, D-06 |
| Changes behaviour | **Yes**    |
| Size              | XL         |

## Purpose

Replace the compiled role → capability matrix and the hand-written station/attendance checks with
Cedar policies. Policies are stored and evaluated in Amazon Verified Permissions, versioned in the
repo, tested locally, and editable per event by admins within locked guardrails. Every server
decision and every UI affordance comes from the same policies.

## Context for a fresh session

- Design: ADR-005 (schema, policy layout, evaluation strategy, failure mode, admin editing).
- Current model to reproduce, then deliberately improve:
  - `packages/shared/src/capabilities.ts` (26 capabilities × 6 roles)
  - `platform/access` (was `middleware/rbac.ts`): `requireCapability`, `requireStationScope`
    with the IC+ bypass
  - `people` guardrails: self-mutation, escalation, reporting cycle
  - attendance gating
- Oracle tests to port: `server/tests/unit/capabilities.test.ts` and
  `server/tests/integration/rbac.test.ts`.
- The event lifecycle (P10.5) and on-shift data (P09) feed the Cedar context.

## Steps

### P11.1 — `packages/access-policies`

- **Do:** Create a new workspace package:
  - `schema.cedarschema`: entities `Person`, `Role`, `Event`, `EventDay`, `Station`, plus resource
    types per domain; actions and action groups (Capture, Correct, Safety, Manage, Configure,
    Report, Platform)
  - `policies/` and `templates/`
  - a generated TypeScript action catalogue exported to `@spoh/shared/generated/actions`, which
    replaces the `Capability` type
- **Done when:** the schema validates with Cedar WASM, and the action catalogue builds.

### P11.2 — Policies

- **Do:** Write, in separate files:
  1. **role policies**, one per catalogue role, as templates linked per event (D-03 A)
  2. **station scope**: capture actions require `resource.station in principal.onShiftStations`
     unless the role has `anyStation`
  3. **attendance gate**: issuing attendance codes requires `principal.attendanceVerifiedToday`
  4. **locked guardrails** as `forbid`:
     - no action on a person of equal or higher rank, and none on yourself (people actions)
     - no granting a role of rank ≥ your own
     - no capture when `context.eventPhase` is CLOSED or ARCHIVED
     - no configuration changes by non-admins outside DRAFT, READY or REHEARSAL
     - no policy edits except by platform admins
  5. **platform admin** policy

  The reporting-cycle check stays in the domain, because it is a graph walk and not an
  authorization rule.

- **Done when:** every policy has a header comment that says what it guarantees and why.

### P11.3 — Policy test suite

- **Do:**
  1. A table-driven test in `packages/access-policies/tests/` evaluates policies locally with
     Cedar WASM.
  2. Port the 26×6 matrix as expectations. **Every** changed cell is listed in
     `CHANGES.md` with its reason and the owner's approval.
  3. Add guardrail tests (escalation, self, phase) and station-scope tests.
- **Done when:** the suite runs in CI in under 10 s with no AWS access.

### P11.4 — Authorizer abstraction

- **Do:** `platform/access` provides an `Authorizer` interface (`isAuthorized`, `batch`), with:
  - `AvpAuthorizer` (SDK `IsAuthorized`/`BatchIsAuthorized`, with timeouts and retries)
  - `LocalCedarAuthorizer` (dev, test, and degraded mode)
  - `EntityBuilder`: principal, resource and context from the DB, cached per request
  - `DecisionCache`: TTL, keyed by principal/action/resource/context-bucket, invalidated by the
    `access` and `membership` bus channels
- **Done when:** unit tests pass for both adapters, with the same results on the policy suite
  (a contract test runs the suite through both).

### P11.5 — Policy enforcement points

- **Do:**
  1. Replace `requireCapability` and `requireStationScope` with `authorize(action, resolveResource)`
     middleware on every route. Use-case-level checks cover resource-dependent decisions.
  2. Record denials through the security audit (from the audit branch) with the policy ids that
     determined them.
  3. Generate the route × role matrix test from the route inventory plus the policies, replacing
     `rbac.test.ts`.
- **Done when:** no route lacks an `authorize` call (asserted by a test over the route inventory),
  and the old RBAC middleware is deleted.

### P11.6 — AVP via CDK

- **Do:**
  1. Add a policy store per environment (validation `STRICT`), the schema, static policies and
     templates to `infra/cdk`, deployed from `packages/access-policies`.
  2. A drift check in CI compares the deployed policies with the repo.
  3. Template-linked (per-event) policies are data, owned by the app, and excluded from drift.
- **Done when:** staging's store matches the repo, and the drift check is green.

### P11.7 — Admin permissions UI

- **Do:** In the event workspace:
  - the roles list, showing what each role can do in plain language grouped by action group
  - toggles per action for editable roles, which write template-linked policies through AVP plus
    an audit row
  - guardrails shown read-only with their explanation
  - a **simulator** answering "Can ⟨person⟩ do ⟨action⟩ on ⟨resource⟩ now?" with the decision and
    the determining policies, and "What can ⟨person⟩ do?" through a batch request
- **Done when:** e2e covers editing a permission, seeing it take effect for that role on the next
  request, and the simulator explaining a denial.

### P11.8 — Client affordances from policy

- **Do:**
  1. `GET /events/:id/me/permissions` returns the allowed actions (batch-evaluated, cached).
  2. The navigation registry and screens use it.
  3. Remove all client use of `CAPABILITY_MATRIX`, then delete the matrix.
  4. Denied actions show why (from the decision) instead of a generic 403.
- **Done when:** the client imports no authorization logic.

### P11.9 — Performance and failure behaviour

- **Do:**
  1. Load-test the capture path on staging with AVP. The target is p95 under 300 ms at 2× the
     expected peak, and decision cache hit rate is measured.
  2. Simulate AVP failure (a blocked endpoint): capture continues in degraded local mode, if ADR-005
     says so, with an alarm; admin and config actions fail closed.
  3. Add alarms for AVP 5xx, throttles and latency.
- **Done when:** the numbers are recorded, and both failure behaviours are demonstrated on staging.

### P11.10 — Verify and report

- **Do:** Run all suites plus the policy suite, generated matrix, isolation suite (from P09) and load
  test, and write the report, including the final permission table per role for the owner.
- **Done when:** the exit criteria hold.

## Exit criteria

- All authorization decisions come from Cedar (AVP in deployed envs). The policies are in the repo,
  tested and deployed by CDK.
- Admins can adjust role permissions per event, and guardrails cannot be edited.
- The old matrix and RBAC middleware are gone, and the p95 target is met.

## Risks

- **Latency or cost of per-request AVP calls.** Mitigation: the decision cache, batch calls for
  the UI, and a measured budget. If the target is missed, fall back to ADR option B (local
  evaluation of AVP-stored policies) without changing policies.
- **Admins locking themselves out.** Mitigation: platform admin policies are static and not
  editable in the UI, and the guardrails are `forbid` policies admins cannot remove.

## Phase report

_Fill in on completion._
