# P07 — Client and shared-package refactor (no behaviour change)

| Field             | Value                 |
| ----------------- | --------------------- |
| Gate              | G2                    |
| Depends on        | P05                   |
| Decisions         | —                     |
| Changes behaviour | **No**, pure refactor |
| Size              | XL                    |

## Purpose

Give the client the structure in `engineering-standards.md` §4: thin routes, feature modules that
own their API calls, queries and screens, a shared design system, one form pattern and one
navigation registry. Do the same for `@spoh/shared` (§5). Screens and behaviour stay identical.
This can run in parallel with P06.

## Context for a fresh session

- Worklist: the client and shared sections of `findings/F03-code-quality.md`.
- Every route must look and behave the same. Visual snapshots taken in P07.1 are the check.
- Read `client/AGENTS.md` first: this Next.js version differs from training data, so check
  `node_modules/next/dist/docs/` before touching routing or config.

## Steps

### P07.1 — Safety net

- **Do:**
  1. Add Testing Library component tests for the screens with the most logic: registration,
     footfall, stamp, redeem, attendance, admin users, admin settings, imports, reports, IC console
     and the chief dashboard.
  2. Add Playwright visual snapshots of every route at phone and laptop sizes, with a seeded DB and
     a frozen clock.
- **Done when:** the tests are green, and the snapshots are committed under `client/tests/visual/`.

### P07.2 — Shared layer

- **Do:**
  1. `components/ui` → `shared/ui`.
  2. `lib/{api,session,outbox,env,format,runtimeSettings}` → `shared/lib`.
  3. Generic hooks → `shared/hooks`.
  4. Layout chrome (`AppShell`, `GlobalNav`, `SectionNav`, `SyncIndicator`) → `shared/shell`.
- **Done when:** `components/` and `lib/` are gone, and the tests and snapshots are unchanged.

### P07.3 — Feature API and query layer

- **Do:**
  1. For each domain, write `features/<domain>/api.ts` (typed endpoint functions using the shared
     client) and `queries.ts` (query keys, `useX` and `useXMutation` hooks, with invalidation rules
     in one place).
  2. Remove every inline `api(...)`/`useQuery` from `app/**` and components.
  3. Move `useCapture`, `useDashboard` and `useActiveAlerts` into their features.
- **Done when:** path strings appear only in `features/*/api.ts` (checked by lint), and query keys
  come only from `queries.ts`.

### P07.4 — Thin routes

- **Do:** Every `app/**/page.tsx` renders a feature screen (`features/<domain>/screens/XScreen.tsx`)
  and nothing else, in 60 lines or fewer.
- **Done when:** the lint rule for `page.tsx` size passes.

### P07.5 — Break up long components

- **Do:** Split per the F03 plan. The largest:
  - `ReportsPage` (269)
  - `AuditLogPage` (265)
  - `AdminSettingsPage` (237)
  - `ImportsPage` (237)
  - `AttendancePage` (222)
  - `GroupRegistrationPage` (202)
  - `IcConsolePage` (185)
  - `NewLostFoundPage`, `RedeemPage`, `FallbackPage`, `DashboardBody` (about 180 each)
  - `ProvisionForm` (178), `VolunteerEditor` (147)
  - the admin users page file (966 lines)

  Pattern: screen = layout + panels, a panel = one concern, logic in hooks, and derivations in
  `model/` pure functions with unit tests.

- **Done when:** there is no component over 80 lines and no file over 300.

### P07.6 — One form pattern

- **Do:**
  1. Introduce the chosen form approach (ADR-007): a zod schema from `@spoh/shared`, a form hook,
     and `Field`/`Choice` components that show errors consistently.
  2. Migrate every form: provisioning, volunteer editor, settings, incident, lost-person,
     lost-found, announcement composer, fallback, imports, shift forms.
- **Done when:** no form uses ad-hoc `useState` per field, and validation messages match the server's.

### P07.7 — Navigation registry

- **Do:**
  1. Create `navigation/registry.ts` with path, label, hint, section, icon, required action, and
     visibility predicate.
  2. Rebuild `GlobalNav`, `SectionNav`, the operations tiles, `RoleTiles` and `sectionForPath` from it.
- **Done when:** adding a screen means one registry entry, and the four nav surfaces cannot disagree.

### P07.8 — Shared package reorganisation

- **Do:**
  1. `packages/shared/src/contracts/<domain>/…` for DTOs, `errors/` for errorCodes, `invariants/`
     for enums that stay, and `generated/` (empty, ready for P10/P11).
  2. Keep the public index stable, and re-export the capability matrix until P11 replaces it.
- **Done when:** the shared package mirrors the server modules and the builds are green.

### P07.9 — Make the guards blocking

- **Do:**
  1. Switch the size/complexity/boundary rules to **error** for `client/**`.
  2. Add the lint rules: no path strings outside `api.ts`, and `shared/ui` must not import `features`.
  3. Make CI blocking.
- **Done when:** there are zero client violations.

### P07.10 — Verify and report

- **Do:**
  1. Run all suites, e2e and visual snapshots, which must be identical.
  2. Run `next build` and compare bundle sizes against P00, within ±5%.
  3. Snapshot the metrics and write the report.
- **Done when:** the exit criteria hold.

## Verification

```bash
npm run lint && npm run arch:check && npm run typecheck
npm run test --workspace client && npm run test:e2e --workspace client
npm run test:visual --workspace client
npm run build --workspace client
node remediation/tools/code-metrics.mjs     # client: 0 components > 80, 0 files > 300
```

## Exit criteria

- Zero client size or boundary violations, and visual snapshots unchanged.
- All suites green, and bundle size within ±5%.

## Phase report

_Fill in on completion._
