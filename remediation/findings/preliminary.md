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
- **Status:** Fixed in P00.4. The owner chose deletion, and `npm run lint` exits 0.

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

### PF-15 — e2e test drifted from the home screen

- **Severity:** Low
- **Area:** `client/tests/e2e/attendance.spec.ts:111`
- **Evidence:** The test clicks a "Submit attendance / verify team" link on `/home`. Home renders
  "Attendance & verification" (P00.5 page snapshot), and the old label now exists only on `/shift`
  (`client/src/app/shift/page.tsx:60`). It fails on retry too.
- **Impact:** The scanner-failure → PIN-fallback journey has no working e2e coverage.
- **Verify in:** P02 (is the label change intended?) · **Fix in:** P07 (update the test to the
  current label, or restore the label)

### PF-16 — At 320 px, content covers the bottom navigation and controls

- **Severity:** Medium (to verify on devices)
- **Area:** `/home` (`.home-companion` card), `/attendance` root verifier panel, the section nav
- **Evidence:** Two e2e tests at a 320 × 740 viewport (P00.5), both failing on retry:
  `navigation.spec.ts:41`: in dark mode `/home` overflows horizontally (text clipped at the left
  edge) and `.home-companion` intercepts taps on the "Guide" nav link.
  `attendance.spec.ts:130`: "Generate fresh QR / PIN" is intercepted by the "Expires in 5:00"
  caption and then by the section nav.
- **Impact:** On the smallest phones a volunteer cannot reach Guide from Home, and root cannot rotate
  verifier credentials. Possibly a regression from `c07b5d8` (the laptop layout change).
- **Verify in:** P02 (phone journeys) · **Fix in:** P14

### PF-17 — CI does not run the e2e suite

- **Severity:** Medium
- **Area:** `.github/workflows/ci.yml`
- **Evidence:** No job runs Playwright. PF-15 and PF-16 were found only by running e2e by hand in
  P00.5. The README's "13 tests" is also stale: `playwright test --list` reports 26.
- **Impact:** UI regressions reach staging unnoticed. P06/P07 cannot prove "identical behaviour"
  through the UI.
- **Fix in:** P08 (pipeline). Until then, P06/P07 run e2e by hand before and after each step.

### PF-18 — Coverage thresholds exist but were never enforced, and the baseline misses them

- **Severity:** Medium
- **Area:** `server/vitest.config.ts` (`coverage.thresholds`), `client/vitest.config.mts`
- **Evidence:** The server config sets v8 thresholds (lines/functions/statements 80, branches 70),
  but `@vitest/coverage-v8` was not installed, so `--coverage` could never run. P00.6 installed it.
  The configured scope measures lines 78.4 %, statements 75.4 %, functions 75.0 % and branches
  60.1 %, all below threshold. The client's unit suite covers 6.5 % of lines, and `packages/shared`
  has no tests at all. See `reports/metrics/P00-coverage.json`.
- **Impact:** The documented quality gate has never been a gate. P06/P07 refactor code that has
  thin direct coverage (routers and `lib/` are outside the configured scope).
- **Fix in:** P06/P07 (coverage must not drop). The gate itself is decided in P05.

### PF-19 — CI's dependency audit fails on the baseline

- **Severity:** High (to verify exploitability)
- **Area:** `.github/workflows/ci.yml` _Security checks_ → `npm audit --audit-level=high`
- **Evidence:** 4 high and 2 moderate advisories on the baseline lockfile, before and after
  P00.6. The highs come through `prisma` 7.10.0 (`@prisma/config` → `deepmerge-ts`, and `mysql2`).
  The moderates come through `exceljs` → `uuid`. npm's only offered fix for the highs is a
  semver-major downgrade to `prisma@6`.
- **Impact:** The security job is red on `main`, so a new high advisory would not stand out.
- **Verify in:** P04 (runtime reachability: `mysql2` is unused with Postgres) · **Fix in:** P15, or
  a documented, time-boxed audit exception decided in P05

### PF-20 — Test harness rough edges

- **Severity:** Low
- **Evidence:**
  - Root `npm test` exits 1 because `packages/shared` runs `vitest run` with no test files. CI
    calls each workspace separately, so it is unaffected.
  - Integration runs print pg's _"Calling client.query() when the client is already executing a
    query"_ deprecation. Something issues concurrent queries on one client, possibly
    `Promise.all` inside a transaction (candidates: `attendance/service.ts:33`,
    `admin/service.ts:445`, `registration/service.ts:84,220`, `shift/service.ts:266`). pg@9
    turns this into an error.
  - `npm run format:check` fails on 14 files that are already on `main` (for example
    `server/src/config/env.ts`, `server/src/modules/auth/router.ts`, `client/src/app/reports/page.tsx`
    and `ONBOARDING_AND_FEATURES.md`). CI does not run it.
- **Verify in:** P03 · **Fix in:** P06 (the transaction pattern) and P07 (shared gets tests or
  `passWithNoTests`)
