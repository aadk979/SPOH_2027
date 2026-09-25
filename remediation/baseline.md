# Baseline — 2026-09-25

Measured during planning, before any code change. P00 re-measures after branch reconciliation
(D-05) and records the result in its phase report. Every later phase compares against this.

## Repository state

| Item                       | Value                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Working branch             | `claude/inspiring-ritchie-203bp3` = `main` = `d2497b6`                                 |
| Unmerged branch            | `origin/feat/audit-cloudwatch` = `319d06d` = `main` + 5 commits, fast-forwards cleanly |
| Deployed (per its commits) | `spoh2027.duckdns.org`, single Lightsail `small_3_0`, PM2 cluster, Postgres in Docker  |
| Source lines (src only)    | ≈ 26,700 across 184 files (server, client, shared; generated code excluded)            |
| Test lines                 | ≈ 6,300                                                                                |
| Node in container          | 22.22 (`.nvmrc` asks for 24; `engines` allows ≥ 22)                                    |

## Checks on `main`

| Check                    | Result                   | Notes                                                                                                  |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`      | ✅ pass                  |                                                                                                        |
| `npm run lint`           | ❌ **8 errors**          | All in `test/do-inference.mjs`, an unrelated DigitalOcean AI inference smoke script added in `22e38ae` |
| Server unit tests        | ✅ 233 passed (6 files)  | README says 190, so the README is stale                                                                |
| Server integration tests | ✅ 288 passed (13 files) | Ran on Postgres 16 locally; README says 224                                                            |
| Client unit tests        | ✅ 19 passed (2 files)   | README says 14                                                                                         |
| Client e2e (Playwright)  | not run                  | Needs both apps running; P00.5                                                                         |
| Build                    | not run                  | P00.5                                                                                                  |

## Refactor debt (from `tools/code-metrics.mjs`)

| Measure              | `main` | `feat/audit-cloudwatch` |
| -------------------- | ------ | ----------------------- |
| Functions > 50 lines | 97     | 108                     |
| Functions > 40 lines | 142    | —                       |
| Files > 300 lines    | 18     | 22                      |
| Files > 250 lines    | 28     | —                       |

Full lists: `reports/metrics/baseline-main.json`, `reports/metrics/baseline-feat-audit-cloudwatch.json`.

### Worst functions

| Lines | Where                                                                | What it mixes                                                             |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 269   | `client/src/app/reports/page.tsx` `ReportsPage`                      | fetching, export download, every report section's rendering               |
| 265   | `client/src/app/admin/audit/page.tsx` `AuditLogPage` (audit branch)  | filters, paging, live tail, table rendering                               |
| 237   | `client/src/app/admin/settings/page.tsx` `AdminSettingsPage`         | load, per-field forms, validation, save, error display                    |
| 237   | `client/src/app/chief/imports/page.tsx` `ImportsPage`                | CSV parsing, preview, commit, results                                     |
| 222   | `client/src/app/attendance/page.tsx` `AttendancePage`                | status, root start, issuing codes, scanning, PIN entry                    |
| 180   | `client/src/app/chief/page.tsx` `DashboardBody`                      | all dashboard panels inline                                               |
| 178   | `client/src/app/admin/users/page.tsx` `ProvisionForm` (audit branch) | form state, validation, submit, result                                    |
| 159   | `server/src/modules/roster/service.ts` `importRoster`                | parsing, validation, identity minting, two DB passes, dry run, audit      |
| 128   | `server/src/modules/report/service.ts` `generateReport`              | every report section's queries and shaping                                |
| 119   | `server/src/modules/gift/service.ts` `redeemGift`                    | card lookup, stock check, fallback tagging, low-stock notification, audit |
| 115   | `server/src/modules/auth/service.ts` `rotateSession`                 | lookup, reuse detection, family revocation, issuance                      |

### Worst files

| Lines | File                                                  | Problem                                                                 |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| 966   | `client/src/app/admin/users/page.tsx` (audit branch)  | list, filters, editor, provisioning form, shift form in one file        |
| 903   | `server/src/modules/admin/service.ts` (audit branch)  | five domains: volunteers, assignments, stations, event days, gift types |
| 528   | `server/src/modules/roster/service.ts` (audit branch) | provisioning plus the whole CSV import pipeline                         |
| 453   | `server/src/modules/fallback/service.ts`              | windows plus two import pipelines                                       |
| 439   | `server/src/modules/report/export.ts`                 | eight sheet writers plus CSV                                            |
| 382   | `server/src/modules/auth/router.ts`                   | OAuth/PKCE, cookie handling and session logic inside the router         |

## Layering

- **Prisma called from routers:** admin, audit, auth, devAuth, health.
- **Prisma called directly from every service:** 18 of 18 services. Only 12 modules have a `repo.ts`,
  and even those services bypass it.
- **Modules with no data layer:** admin, attendance, audit, auth, lostFound, media, notification.
- **Cross-module coupling:** services import other modules' `service.ts`/`repo.ts` directly, with
  about 30 edges and no public-API boundary. For example, `dashboard` imports footfall, gift,
  missionCard, shift and station internals.
- **Client:** 9 pages call `api()`/`useQuery` inline. Only 9 hooks live in `features/`. There is no
  feature-level API layer.

## Hardcoding (headline; P01 does the full sweep)

- **Event dates exist only in `server/prisma/seed.ts`.** There is **no `Event` entity**, and
  `EventDay` rows are global, so the database can hold one event.
- **Taxonomy lives in Prisma enums:** `VisitorCategory` (Sec 1–5…), `StationKind`,
  `CourseCode` (DAAA/DCDF/DCS/DCITP) and `ShiftBlock` (MORNING/AFTERNOON). Changing any of them
  needs a migration and a deploy.
- **Singapore time is hardcoded** in `server/src/lib/time.ts` (a fixed +8 offset), report SQL
  (`AT TIME ZONE 'Asia/Singapore'`), `report/export.ts` (+8h) and `client/src/lib/format.ts`.
- **Operational config sits in env:** `ATTENDANCE_ROOT_EMAIL`, `ATTENDANCE_SP_CIDRS`,
  `SHIFT_HOURS_ALWAYS_OPEN` and rate limits.
- **Event content is compiled into the client:** `client/src/content/brief.ts`, map and journey
  (T19, course names), `layout.tsx` metadata ("6–9 January 2027"), manifest name and icons.
- **Authorization is compiled:** `packages/shared/src/capabilities.ts` holds 6 roles × 26 capabilities.
- **About 15 server features have no screen**, so setup needs the API or SQL.

## Documentation drift

- The README status table says phases 3–4 (cards, gifts, dashboard, fallback, reports) have not
  started. They are built and tested.
- The README links `docs/SPOH2027_Ops_System_Brief.md`, `docs/SPOH2027_BUILD_PLAN.md`,
  `docs/RUNBOOK.md` and `docs/DEPLOYMENT.md`. **None exist** in the repo, yet code comments cite
  them everywhere (§ references).
- The README says "Seven foreign keys have no referential integrity". Migration
  `20260901131748_real_foreign_keys…` and `ONBOARDING_AND_FEATURES.md` say otherwise. To verify in P03.

## AWS (names only; nothing was called)

- Credentials are present in this environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), and
  AWS endpoints are reachable. There is no `aws` CLI; use the SDK.
- The repo references Cognito pool `ap-southeast-1_9bwl2nGF7`, backups bucket
  `spoh2027-backups-665146708212` and region `ap-southeast-1`.

## After reconciliation (P00.2)

**D-05: the owner chose to stay on the current branch.** The audit branch is **not** merged. The
baseline is `main` = `d2497b6` plus the remediation docs. The working branch does **not** contain
`319d06d`, so P00.2's _Done when_ is replaced by this record.

What that means:

- **The deployed system is ahead of the baseline.** According to its own commits,
  `spoh2027.duckdns.org` runs `feat/audit-cloudwatch` (`319d06d`). Staging therefore serves
  features and a schema that this repo does not have. Anything learned by probing staging (P00.9,
  P02) describes the audit branch, not the code being refactored.
- **Schema drift.** Migration `20260922000000_audit_severity_and_security_events` (two enums, five
  `AuditLog` columns, three indexes) exists only on the audit branch. A staging database built from
  that branch has it applied. Deploying the baseline tag there puts the repo's migrations behind the
  database's. P04 must verify how `prisma migrate deploy` behaves in that state before anyone relies
  on the tag as a rollback target for staging.
- **Not in the tree (5 commits, 61 files, +7,779/−325):**
  - Server: CloudWatch audit shipping (`lib/cloudwatch.ts`), security-event auditing
    (`middleware/securityAudit.ts`), audit-log query API (`modules/audit`), roster CSV import and
    provisioning rework (`modules/roster/service.ts` +433 lines).
  - Client: admin audit-log screen, roster-import screen, the expanded `admin/users` page.
  - Shared: `dto/audit.ts`, `rosterCsv.ts`, new enums and error codes.
  - Tests: +3 files (`roster.test.ts` integration, `auditLog.test.ts`, `rosterCsv.test.ts` unit).
  - Docs and ops: `docs/USER_MANAGEMENT.md`, `docs/AUDIT_LOG.md`, all of `infra/` (Lightsail
    provisioning, nginx, PM2, runbooks for deploy, DNS/TLS, restore and scale-up, and
    `scripts/smoke-test.sh`), and `ops/cloudwatch/`.
- **Docs re-read from the tree:** of the four files P00.2 names, only `ONBOARDING_AND_FEATURES.md`
  exists here, and it is `main`'s version. `docs/USER_MANAGEMENT.md`, `docs/AUDIT_LOG.md` and
  `infra/README.md` exist only on the audit branch. Nothing measured above changes, because the tree
  is the one measured at planning. The `(audit branch)` rows under _Worst functions_ and _Worst
  files_ are not in the baseline tree. P00.6 re-measures.
- **Knock-on effects for later steps:**
  - P00.3 cannot point at `infra/runbooks/deploy.md` in the tree. It references the audit
    branch's copy by commit instead.
  - P00.9's `smoke-test.sh` is not in the tree. It also calls the `aws` CLI (not installed) with
    Cognito `admin-initiate-auth` (AWS credentials, which D-13 does not allow) and needs
    `SMOKE_PASSWORD`.
  - The audit branch's work has to be re-applied or merged later. Every refactor in P06/P07 that
    touches `admin`, `audit`, `roster`, `lib/audit.ts`, `lib/logger.ts` or `config/env.ts` widens
    that merge. **This is for the owner to decide before P05:** merge the branch later, re-implement
    it, or drop it.
