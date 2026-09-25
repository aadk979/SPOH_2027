# P06 — Server modular refactor (no behaviour change)

| Field             | Value                 |
| ----------------- | --------------------- |
| Gate              | G2                    |
| Depends on        | P05                   |
| Decisions         | —                     |
| Changes behaviour | **No**, pure refactor |
| Size              | XL                    |

## Purpose

Restructure the server into the module shape in `engineering-standards.md` §3. The result is
single-purpose functions and files, a real data layer, public module APIs, and a `platform/` for
cross-cutting code, with **identical external behaviour**. Every later phase builds on this, so it
must be clean.

## Context for a fresh session

- **The worklist is `findings/F03-code-quality.md`**: the module table (target home per function)
  and the function-level split plan. Follow it; do not redesign on the fly.
- Standards: `engineering-standards.md` §1–§3 and §9–§11.
- **Invariant:** the route inventory snapshot (P06.1) and all test suites must be identical before
  and after each commit. Bug fixes found along the way are **not** made here. They are recorded
  and fixed in a separate commit, flagged in the report, and only if trivial and covered by the
  F03 repro test.
- Order: the reference module first (station), then the high-traffic capture modules, then the rest.
  Each module is a separate series of commits: characterise → move → split → tidy.

## Steps

### P06.1 — Characterisation safety net

- **Do:**
  1. Add `remediation/tools/route-inventory.mjs`, which boots the app and dumps
     method + path + middleware names + capability for every route to
     `reports/P06/routes-before.json`.
  2. Write the integration tests P03.6 identified as missing for routes this phase will touch.
     Priority: capture, auth, admin.
- **Done when:** the snapshot is committed, the gap tests pass on the unrefactored code, and coverage
  is no lower than P00.

### P06.2 — Platform layer

- **Do:**
  1. Move the cross-cutting code into `server/src/platform/`:
     - `lib/prisma` → `platform/db`
     - `lib/logger` → `platform/logger`
     - `lib/errors` → `platform/errors`
     - `lib/audit` → `platform/audit`
     - `lib/time` → `platform/time`, with a `Clock` interface
     - `lib/settings` → `platform/settings`
     - `lib/requestContext`
     - middleware → `platform/http`
     - idempotency → `platform/idempotency`
     - `middleware/auth` → `platform/identity`
     - `rbac` → `platform/access` (still capability-based for now)
  2. Update imports; add no shims.
- **Done when:** `lib/` and `middleware/` are gone, and the suites and snapshot are unchanged.

### P06.3 — Reference module: `station`

- **Do:** Convert `station` to `http/ application/ domain/ data/ index.ts`. Write
  `modules/README.md` documenting the pattern, with this module as the worked example.
- **Done when:** the module passes the boundary rules. This is the template for every other module.

### P06.4 — Dissolve `admin` into domain modules

- **Do:**
  1. Split `admin/service.ts` (825–903 lines) into:
     - `people` (volunteer list/get/update/deactivate/reactivate, guardrails `assertCanActOn`,
       `assertNoReportingCycle`)
     - `assignments` (create/delete)
     - `stations` (create/update)
     - `eventDays` (list/create/update)
     - `gifts` (gift types)
     - `settings`
  2. Keep the `/admin/*` URLs by composing a route group from the domain modules' http layers.
  3. Split `updateVolunteer` (89 lines) and `deactivateVolunteer` (58) into steps: load target,
     guard, diff, write, revoke, audit.
- **Done when:** `modules/admin/` holds only route composition, or is deleted.

### P06.5 — Capture modules

- **Do:** For `registration`, `footfall`, `missionCard`, `gift`, extract one use case per file and
  pure domain rules. Split per the F03 plan:
  - `redeemGift` (119) → resolve card, assert stock, record redemption, emit low-stock event, audit
  - `stampCard` (90) and `reissueCard` (81)
  - `recordGroupRegistration` (79)
  - `issueCard`
  - `generateBatch`

  Move the funnel computation to `missionCard/domain/funnel.ts`. Replace cross-module imports of
  `fallback/repo`, `station/service` and so on with those modules' `index.ts` APIs.

- **Done when:** no function exceeds the limits in these modules, and their boundaries are clean.

### P06.6 — Safety modules

- **Do:**
  - `incident`: report, follow-up, status.
  - `lostPerson`: raise, ack, resolve, purge. The purge becomes a module job.
  - `lostFound`: log, claim, close-out. Add its missing data layer.
- **Done when:** the limits and boundaries are clean.

### P06.7 — People and auth modules

- **Do:**
  - `roster`: split `importRoster` (159) into parse, validate, plan (pure), identity provisioning
    (outside the transaction), and apply (transaction). Dry run becomes "plan without apply", not
    a thrown rollback.
  - `shift`: swaps, briefings and gaps become separate use cases.
  - `me`: check-in/out.
  - `attendance`: `submitAttendance` (83) → verify code, lock person, mark present, check in
    running shifts, audit. Add its data layer.
  - `auth`: move OAuth/PKCE/cookie code out of `router.ts` into `application/` (`beginLogin`,
    `completeCallback`, `openSession`, `rotateSession` split into lookup / detect reuse / revoke
    family / issue), and cookies into `http/cookies.ts`.
  - `identity`: provider adapters.
- **Done when:** the limits and boundaries are clean, and `auth/router.ts` is routes only.

### P06.8 — Operations modules

- **Do:**
  - `dashboard`: one query per panel, composed by `getLiveDashboard` and `getStationDashboard`.
  - `report`: `generateReport` (128) → per-section builders. `export.ts` → one writer per sheet
    plus a CSV writer sharing row builders.
  - `fallback`: windows vs imports into separate use cases. `runImport` → the plan/apply pipeline
    shared with roster import.
  - `announcement`, `notification` (`dispatch` 96 → select recipients, build payload, send,
    prune failures), `media`, `audit` (query builder out of the router).
- **Done when:** the limits and boundaries are clean.

### P06.9 — Composition root and config

- **Do:**
  1. `main.ts` (entry) and `app/createApp.ts` (69 → wiring steps).
  2. A route registry that lists modules.
  3. Split `config/env.ts` (300 lines, one 112-line schema callback) into per-concern schemas
     (server, db, auth, aws, attendance) composed at boot.
  4. Modules register their scheduled jobs through `platform/scheduler`, which still wraps
     `setInterval` until P10.
- **Done when:** the entry path is readable top-down in under a minute.

### P06.10 — Make the guards blocking

- **Do:**
  1. Switch the ESLint size/complexity rules and the dependency-cruiser boundary rules to **error**
     for `server/**` and `packages/shared/**`.
  2. Fix any remaining violations.
  3. Make CI blocking.
- **Done when:** `npm run lint` and `npm run arch:check` are clean with zero server violations.

### P06.11 — Verify and report

- **Do:**
  1. Regenerate `routes-after.json` and diff it: it must be empty apart from middleware renames.
  2. Run all suites and e2e, and the load test locally to compare p95 against baseline.
  3. Snapshot `reports/metrics/P06.json` and write the phase report.
- **Done when:** the exit criteria hold.

## Verification

```bash
npm run lint && npm run arch:check && npm run typecheck
npm run test:unit --workspace server && npm run test:integration --workspace server
node remediation/tools/route-inventory.mjs --diff remediation/reports/P06/routes-before.json
node remediation/tools/code-metrics.mjs     # server/shared: 0 functions > 50, 0 files > 300
```

## Exit criteria

- Zero server/shared size, complexity or boundary violations.
- The route inventory is unchanged, and all suites are green with no test deleted or weakened.
- Load test p95 is within 10% of baseline.

## Risks

- **Scope creep into behaviour changes.** Mitigation: any behaviour change is a separate, labelled
  commit tied to an F03 finding, or deferred to P09+.
- **Merge pain if others commit to `server/` meanwhile.** Mitigation: agree a freeze with the owner
  for the length of this phase (D-11).

## Phase report

_Fill in on completion._
