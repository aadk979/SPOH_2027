# Preliminary findings (from planning, 2026-09-25)

Observed while writing the plan and **not yet verified**. Each one is confirmed with a repro or
closed during the audit phase named. IDs are kept when a finding moves into an F0x file.

### PF-01 — Per-process caches are stale across PM2 cluster workers

- **Severity:** High (to verify)
- **Area:** `server/src/middleware/auth/index.ts:84–100` (`volunteerCache`, `sessionCache`)
- **Evidence:** In-memory `Map`s with a 60 s TTL. Invalidation (`invalidateVolunteerCache`) runs
  only in the worker that handled the change. The audit branch runs PM2 `instances: 'max'`.
- **Impact:** Deactivating a volunteer or changing a role may not apply on other workers for up to
  60 s. This contradicts "deactivation takes effect immediately".
- **Verify in:** P03.5 · **Fix in:** P10.3 (cache bus)

### PF-02 — Rate limiter uses the default in-memory store

- **Severity:** High (to verify)
- **Area:** `server/src/middleware/rateLimit.ts:28`
- **Evidence:** `rateLimit({...})` with no `store`, so each worker has its own counter.
- **Impact:** Effective limits are multiplied by the worker count, and the sensitive limits
  (sign-in, provisioning) are weaker than configured.
- **Verify in:** P03.5 / P04.4 · **Fix in:** P15.2

### PF-03 — Lint is red on `main`

- **Severity:** Medium
- **Area:** `test/do-inference.mjs`
- **Evidence:** 8 `no-console` errors. The file is a DigitalOcean AI inference smoke test unrelated
  to the product, added in `22e38ae`. CI's lint job fails on it.
- **Fix in:** P00.4 (after the owner confirms it can go)

### PF-04 — No Event entity; one event per database

- **Severity:** Blocker for reuse
- **Area:** `server/prisma/schema.prisma` (`EventDay` has no parent), `server/prisma/seed.ts:50–63, 205–206`
- **Fix in:** P09

### PF-05 — Event taxonomy is enums

- **Severity:** Blocker for reuse
- **Area:** `schema.prisma` `VisitorCategory`, `StationKind`, `CourseCode`, `ShiftBlock`; mirrored in
  `packages/shared/src/enums.ts` and client screens
- **Fix in:** P09.2

### PF-06 — Singapore time hardcoded

- **Severity:** High for reuse
- **Area:** `server/src/lib/time.ts:21–22`, `server/src/modules/report/repo.ts:54,153,159,183`,
  `server/src/modules/report/export.ts:29`, `client/src/lib/format.ts`
- **Fix in:** P09.6

### PF-07 — Operational settings in env

- **Severity:** Medium
- **Area:** `ATTENDANCE_ROOT_EMAIL`, `ATTENDANCE_SP_CIDRS`, `SHIFT_HOURS_ALWAYS_OPEN`, `RATE_LIMIT_*`,
  `ACCESS_TOKEN_TTL_SECONDS` in `server/src/config/env.ts`
- **Fix in:** P10.4

### PF-08 — Event content compiled into the client

- **Severity:** High for reuse
- **Area:** `client/src/content/brief.ts`, `client/src/app/{map,journey,brief}/page.tsx`,
  `client/src/app/layout.tsx:9`, `client/public/manifest.json`, `client/public/sw.js` precache list
- **Fix in:** P13.3 (content model), P14.6 (branding)

### PF-09 — Server features with no screen

- **Severity:** High (admin usability)
- **Evidence:** Endpoints never called by the client: `/admin/stations*`, `/admin/event-days*`,
  `/admin/gift-types*`, `/admin/assignments*`, `/cards/batch`, `/cards/:code/{issue,void,reissue}`,
  `/registrations/:id/void`, `/footfall/{bulk,ticks/:id/void}`, `/gifts/:id/adjust`,
  `/incidents/:id/{follow-ups,status}`, `/lost-found/close-out`, `/roster/swaps` (create),
  `/roster/briefing-slots*`, `/auth/sessions*`, `/audit` (screen on audit branch only),
  `/roster/import` (screen on audit branch only), `/reports/summary` only partially.
- **Verify in:** P02 · **Fix in:** P13.7

### PF-10 — Layering is conventional, not enforced

- **Severity:** Medium
- **Evidence:** Prisma in 5 routers and all 18 services. About 30 direct cross-module imports of
  `service.ts`/`repo.ts`. `admin/service.ts` spans five domains (825 lines; 903 on the audit branch).
- **Fix in:** P06

### PF-11 — Documentation drift

- **Severity:** Medium
- **Evidence:** The README test counts and phase status are stale. Four referenced docs are missing
  (brief, build plan, runbook, deployment) but are cited throughout code comments. The "seven FKs"
  claim contradicts the migrations.
- **Fix in:** P16.5 (docs rewrite). Also decide in P05 whether the missing brief and build plan
  should be recovered and committed.

### PF-12 — Long-lived IAM user keys on the host

- **Severity:** High (to verify)
- **Evidence:** Audit-branch commit `319d06d` switched to "explicit AWS credentials" because the
  Lightsail instance role lacked permissions, which implies static access keys on the server.
- **Verify in:** P04.5 / P04.7 · **Fix in:** P08.6 (task roles), P15.6

### PF-13 — Client `next.config.ts` has no `output: 'standalone'` on `main`

- **Severity:** Low (to verify)
- **Evidence:** The audit branch topology says the client runs "Next.js standalone", but `main`
  sets no output mode. P00.2 checked: `client/next.config.ts` is identical on both branches and sets
  no `output`, so the deployed topology document does not match its own code.
- **Fix in:** P08.4 (container image)

### PF-14 — The deployed system is not the baseline code

- **Severity:** High for the programme
- **Evidence:** D-05 kept the baseline on `main` (`d2497b6`). Staging (`spoh2027.duckdns.org`) runs
  `feat/audit-cloudwatch` (`319d06d`), according to that branch's commits: +7,779/−325 lines over 61
  files, including migration `20260922000000_audit_severity_and_security_events`. See
  `baseline.md` § _After reconciliation_.
- **Impact:** The code probed on staging is not the code being refactored. The baseline tag is
  behind staging's schema, so it is not a clean rollback target for staging. Every P06/P07 change to
  `admin`, `audit`, `roster`, `lib/audit.ts`, `lib/logger.ts` or `config/env.ts` widens the later
  merge of the audit branch.
- **Verify in:** P04 (tag deploy against a migrated DB) · **Decide before:** P05 (owner: merge
  later, re-implement or drop the audit branch)
