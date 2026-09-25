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
