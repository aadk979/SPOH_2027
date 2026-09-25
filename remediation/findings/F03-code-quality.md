# F03 — Code quality, architecture and bugs

Output of P03 (Audit C). The module map and the target home of every exported function, the
per-function refactor backlog for P06/P07, duplication and "one way to do it" decisions, the bugs
found by a correctness review (each with a committed, skipped repro test), multi-instance checks,
test gaps, and reviews of the client, the shared package and the audit branch.

- **Reviewed:** `main`, product code as of `d4f6399` (unchanged by P03). Local dev and test
  databases only (D-13).
- **Tools and outputs:** `reports/P03/` (see its `README.md` for every command).
- **Repro tests:** committed as `it.skip` / `describe.skip`, each tagged `// F03-xxx` (or the
  existing ID it reproduces, for example `// F02-002`). `npm test` stays green. P06 un-skips a test
  in the commit that fixes it. `grep -rn "F0[23]-[0-9]" server/tests client/src` lists them.
- Earlier findings are referenced by ID (F01-xxx, F02-xxx, PF-xx), not re-filed. Finding format
  and severity: `README.md`.

## Summary (P03.10)

_Written at P03.10._

---

## Module map · P03.1

**Graphs.** `reports/P03/server-modules.svg` is the unit-level graph (each module, each `lib/`
file, `middleware/` and the composition root collapsed to one node, generated code excluded).
`reports/P03/server-files.svg` is the file-level graph. Both are rendered from the `.dot` files
next to them; red edges are the dependency-cruiser rule violations counted by `npm run arch:report`.

**Data.** `node remediation/reports/P03/module-map.mjs` writes `reports/P03/module-map.json` (per
unit: exports, inbound and outbound edges, violations) and `module-map.md` (one row per exported
declaration with its target location). The targets are rules in the script: a module's
`service.ts` function goes to `application/<name>.ts` of its target domain, `repo.ts` to
`data/repo.ts` (mappers named `to*` to `data/mappers.ts`), `router.ts` to `http/`, and
`lib/`/`middleware/` to `platform/`. Dissolving modules (`admin`, `roster`, `shift`, `me`) and every
misplaced or dead export have explicit overrides. The script exits 1 if any export has no target:
**359 exported declarations in 47 units, 0 without a target** (293 of them functions). The full
table is [Appendix A](#appendix-a--target-location-of-every-export).

### Server modules

Out/In are edges to and from other **modules** (edges to `lib/`, `middleware/` and `config/` are
in the JSON). Violations are dependency-cruiser edges per rule: **P** Prisma outside `data/`,
**E** Express outside `http/`, **M** another module's internals.

| Module       | Holds today                                                                                                         | Fns | Out                                         | In                                                                                                | P/E/M | Target home (target-architecture §1)                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | --: | ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| admin        | volunteers (list/edit/deactivate), assignments, stations, event days, gift types; the settings routes in its router |  15 | auth, gift, identity, roster, station       | —                                                                                                 | 2/1/6 | **Dissolves:** people, assignments, stations, eventDays, gifts; settings routes → `platform/settings/http` |
| announcement | send, inbox, acknowledge, audience count, urgent push                                                               |  10 | notification, station                       | —                                                                                                 | 2/1/2 | announcements                                                                                              |
| attendance   | root start, challenge (QR/PIN), submit, status; signs attendance tokens; auto check-in                              |   7 | —                                           | —                                                                                                 | 1/1/0 | attendance (campus-network check → `attendance/domain`)                                                    |
| audit        | `GET /audit` query built in the router                                                                              |   0 | —                                           | —                                                                                                 | 1/1/0 | `platform/audit` (http + application + data)                                                               |
| auth         | sessions (open, rotate, revoke, list, prune), access tokens, Cognito hosted-UI OAuth in the router                  |  15 | —                                           | admin, middleware/auth, jobs                                                                      | 2/1/0 | identity (sessions); OAuth/PKCE and cookies → `identity/http`                                              |
| dashboard    | live dashboard, data health, station dashboard; composes five other modules                                         |  15 | footfall, gift, missionCard, shift, station | —                                                                                                 | 2/1/5 | dashboard + dataHealth (read models; other modules through `index.ts`)                                     |
| devAuth      | local sign-in route for development                                                                                 |   1 | —                                           | —                                                                                                 | 1/1/0 | identity (`http/devRoutes.ts`, local provider only)                                                        |
| fallback     | windows (declare/close/list), CSV imports of registrations and footfall, `rangeOverlapsFallbackWindow`              |   6 | —                                           | footfall, gift, missionCard, registration, report                                                 | 2/1/0 | fallback (imports as `application/importRegistrations.ts`, `importFootfall.ts`; overlap check public)      |
| footfall     | ticks, bulk counts, void, summary, live per-station stats                                                           |  14 | fallback, station                           | dashboard                                                                                         | 2/1/3 | footfall                                                                                                   |
| gift         | list, redeem, adjust stock, summary, low-stock push                                                                 |  13 | fallback, notification, station             | admin, dashboard, report                                                                          | 2/1/3 | gifts (gift-type admin joins from `admin`)                                                                 |
| health       | `/healthz`, `/readyz`                                                                                               |   0 | —                                           | —                                                                                                 | 1/1/0 | `platform/http/health.ts`                                                                                  |
| identity     | Cognito admin calls (ensure, disable, enable user)                                                                  |   0 | —                                           | admin, roster                                                                                     | 0/0/0 | `platform/aws/cognito.ts` behind the identity module                                                       |
| incident     | report, list, follow-up, status change, push to the safety chain                                                    |  11 | notification                                | —                                                                                                 | 2/1/1 | incidents                                                                                                  |
| lostFound    | log, list, claim, close-out                                                                                         |   4 | —                                           | —                                                                                                 | 1/1/0 | lostFound                                                                                                  |
| lostPerson   | raise, list active, acknowledge, resolve, purge job, push                                                           |  14 | notification, station                       | jobs                                                                                              | 2/1/2 | lostPersons (purge → `jobs.ts`)                                                                            |
| me           | `GET /me` (profile, shifts, escalation chain), check-in, check-out                                                  |  10 | station                                     | roster                                                                                            | 2/1/1 | people (`getMe`, escalation chain); check-in/out → assignments                                             |
| media        | presigned S3 upload and read URLs                                                                                   |   3 | —                                           | —                                                                                                 | 0/1/0 | media (S3 client → `platform/aws`)                                                                         |
| missionCard  | get, issue, stamp, void, reissue, batch, funnel                                                                     |  20 | fallback, station                           | dashboard                                                                                         | 2/1/3 | missionCards (short codes → `missionCards/domain`)                                                         |
| notification | web-push dispatch, audience resolution, subscriptions                                                               |   5 | —                                           | announcement, gift, incident, lostPerson                                                          | 1/1/0 | notifications (platform context)                                                                           |
| registration | single and group registration, void, summary                                                                        |  14 | fallback, station                           | —                                                                                                 | 2/1/2 | registration                                                                                               |
| report       | full report (19 queries), XLSX and CSV export                                                                       |  22 | fallback, gift, station                     | —                                                                                                 | 2/1/3 | reports (one query file per section, one writer per sheet)                                                 |
| roster       | provisioning, roster CSV import, station roster                                                                     |  11 | identity, me                                | admin                                                                                             | 2/1/2 | **Dissolves:** provisioning → people; import and station roster → assignments                              |
| shift        | swaps, briefing slots, staffing gaps, long shifts (mounted on `/roster`)                                            |  21 | —                                           | dashboard                                                                                         | 2/1/0 | **Dissolves:** swaps, briefings; gaps and long shifts → assignments                                        |
| station      | list active stations, `requireActiveStation`/`requireCountedStation`, mapper                                        |   9 | —                                           | admin, announcement, dashboard, footfall, gift, lostPerson, me, missionCard, registration, report | 1/1/0 | stations (the most depended-on module: its `index.ts` is the first one P06 writes)                         |

### Platform code (`lib/`, `middleware/`, `config/`, `jobs/`)

| Unit                     | Holds                                                              |  In | Target                                                                    |
| ------------------------ | ------------------------------------------------------------------ | --: | ------------------------------------------------------------------------- |
| `lib/prisma`             | Prisma client and pool, ping, `PrismaTransactionClient`            |  28 | `platform/db`                                                             |
| `lib/errors`             | `AppError` and 12 subclasses                                       |  25 | `platform/errors`                                                         |
| `middleware/auth`        | provider choice, token check, volunteer and session caches (PF-01) |  25 | `platform/access/authenticate.ts`; caches → `platform/events` bus (P10.3) |
| `middleware/validate`    | zod request validation and typed getters                           |  21 | `platform/http/validate.ts`                                               |
| `middleware/rateLimit`   | four in-memory limiters (PF-02)                                    |  20 | `platform/http/rateLimit.ts` with a shared store (P15.2)                  |
| `middleware/rbac`        | capability check, station scope (queries Prisma)                   |  18 | `platform/access` (P11 replaces with the Cedar authorizer)                |
| `lib/audit`              | `writeAudit`, the `AuditAction` union, station-scope bypass record |  17 | `platform/audit`                                                          |
| `lib/logger`             | pino logger                                                        |  17 | `platform/logger`                                                         |
| `lib/requestContext`     | `AuditContext` from an Express request                             |  15 | `platform/http/auditContext.ts`                                           |
| `config/env`             | 34 env keys, one schema                                            |  15 | `config/`, split per concern (P01.4)                                      |
| `lib/time`               | Singapore date and minute helpers, shift-block ranges              |  14 | `platform/time` with a `Clock` (P09.6)                                    |
| `lib/settings`           | runtime settings cache, load, update, clear                        |  10 | `platform/settings` (P10.1)                                               |
| `middleware/idempotency` | reserve, replay, settle, prune                                     |   7 | `platform/idempotency` (a use-case wrapper, not a router)                 |
| `middleware/requestId`   | request id                                                         |   5 | `platform/http/requestId.ts`                                              |
| `lib/captureActor`       | `CaptureActor` from a request                                      |   4 | `platform/http/captureActor.ts`                                           |
| `jobs/scheduler`         | four `setInterval` jobs                                            |   1 | `platform/scheduler` (D-09)                                               |
| `lib/shortCode`          | card short codes and QR payloads                                   |   2 | `modules/missionCards/domain/shortCode.ts`                                |
| `lib/campusNetwork`      | CIDR check                                                         |   2 | `modules/attendance/domain/campusNetwork.ts`                              |

### Layering, measured (PF-10)

- **Prisma outside a data layer: 57 edges.** Five routers query Prisma directly (`admin` for
  settings and the updater's name, `audit` for the whole query, `auth` for local sign-in, `devAuth`,
  `health`). **18 of 20 `service.ts` files** call `prisma.`/`tx.` themselves (only `media` and
  `station` do not); `admin/service.ts` has 42 such calls and no repo at all. Of the 12 modules with
  a `repo.ts`, every service still bypasses it for some queries (for example `dashboard/service.ts`
  queries `shiftAssignment` and `registration` inline next to its repo).
- **Express outside `http/`: 32 edges.** Every router is one file of path, middleware and logic.
  The services are coupled to Express only through `lib/captureActor.ts` and
  `lib/requestContext.ts`, which take a `Request`; the services import the types they export.
- **Cross-module internals: 33 edges**, all straight to another module's `service.ts` or `repo.ts`
  (no module has an `index.ts`). The hubs are `station` (10 modules import its repo or service) and
  `fallback/repo.rangeOverlapsFallbackWindow` (5 modules). `dashboard` imports five modules'
  internals; `admin` imports five.
- **Three modules share one domain.** `roster`, `shift` and `me` all own shift assignments, and
  `routes.ts` mounts `shiftRouter` and `rosterRouter` on the same `/roster` path. Check-in lives in
  `me`, attendance auto-check-in in `attendance`, swaps in `shift` and assignment CRUD in `admin`:
  four writers of `ShiftAssignment` with four sets of rules (see P03.4).
- **Middleware reaches into modules:** `middleware/auth` imports `modules/auth/tokens.ts`, and
  `jobs/scheduler` imports three modules' services. Both become module `index.ts`/`jobs.ts` imports.
- **No cycles** (`no-circular`: 0) and no deployable crossings.

**PF-10 status: confirmed** with the numbers above (`arch:report` on `d4f6399`: 57 / 32 / 33).

### Dead exports (no production caller)

27 exported declarations have no caller outside their own file. Twelve have no caller at all:
`singaporeHourStart` (P01 follow-up, T-04), `floorToBucket`, `SHORT_CODE_SPACE`,
`ServiceUnavailableError`, `requestLogger`, `describeCause`, `requireMinimumRole`,
`stationIdFromParams`, `IDEMPOTENCY_RETENTION_DAYS`, `footfallSince`, `findCardById`,
`findStationByCode`, and three in `auth/router.ts` (`REFRESH_COOKIE_NAME`, `accessTokenTtlSeconds`,
`refreshSessionDays`). Three matter more than the rest:

- `admin/service.ts` `assertCanActOn`: its comment says "used by the router so a forbidden action
  never reaches the service"; no router calls it. The rule it would enforce is also missing from
  provisioning and the roster import (F03-001).
- `middleware/auth` `invalidateSessionCache`: "so a revoke takes effect at once"; nothing calls it,
  so revoking a session does not take effect at once (F03-009).
- `lib/settings.ts` `clearSettings`: no route; resetting a setting to its default needs SQL (F02-005
  is the visible half). If P10 keeps it, it must take a transaction and audit atomically (F03-021).

`me/service.ts` re-exports `setAssignmentCheckIn`/`setAssignmentCheckOut` from its repo and nothing
imports them. Appendix A marks all 27 "delete (no production caller)" or names the phase that
revives them.

### Matrix oddities, located in code (input to P03.4 and P11.7)

From F02 § P02.9, with the code that implements each and one addition found here:

| Oddity                                                          | Where                                                                                                                                 | Note                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Printing a card batch needs `user.provision`                    | `missionCard/router.ts` `POST /cards/batch`                                                                                           | Card stock is config, not people: `config.manage` or a `card.batch` action in P11           |
| Event days read with `user.read`, stations with `config.manage` | `admin/router.ts` `GET /admin/event-days`, `GET /admin/stations`                                                                      | The IC and Lead cannot list inactive stations; a Lead can list days but not stations        |
| Lost-and-found close-out is `report.generate`                   | `lostFound/router.ts` `POST /lost-found/close-out`                                                                                    | A Lead may close out items they may not log                                                 |
| `own.read` gates writes                                         | check-in/out (`me/router.ts`), swap request, briefing-slot completion (`shift/router.ts`), alert and announcement ack, push subscribe | Any signed-in role, including Lead, may complete **any** unassigned briefing slot (F03-016) |
| IC may read fallback windows, not declare them                  | `fallback/router.ts`                                                                                                                  | By design (`fallback.declare`: D, C, A); no IC screen shows them                            |
| **`roster.edit` may set any role**                              | `roster/service.ts` `importRoster` → `upsertVolunteer`                                                                                | New: a Deputy can make any account, including their own, an Admin (F03-001)                 |

---

## Function-level refactor backlog · P03.2

**Scope.** Every function over the limits in `reports/metrics/P00.json` (97 functions over 50 raw
lines: 46 client, 51 server). The list is still the current one: `code-metrics.mjs` on
`d4f6399` reports the same 97 and 18 files. The ESLint guard (`max-lines-per-function`, blank and
comment lines excluded) flags 56 of them; P06/P07 work to the stricter raw list.

**Data.** `node remediation/reports/P03/backlog.mjs` writes `reports/P03/backlog.md` and exits 1
unless every flagged function has exactly one plan: **97 of 97 have a split plan** (risk H 35,
M 37, L 25). The table is [Appendix B](#appendix-b--refactor-backlog-one-row-per-flagged-function).

**How to read a row.** "Responsibilities" names the distinct jobs the function holds today.
"Proposed split" gives the new functions and their files per engineering-standards §3/§4 and the
module map; for a nested callback (a `$transaction` callback, an inner `apply`, a `.map` render) it
says "resolved by the parent's split", because the parent's split removes it. Risk: **H** capture,
auth or count paths with thin tests, **M** admin or read paths with some tests, **L**
presentational or well covered. Coverage is line % from `P00-coverage.json` (whole-`src` run) and
the e2e spec that drives the screen, if any.

### What the backlog says

- **Client code is nearly half.** 46 of 97, and every `app/**/page.tsx` in the list has 0 % unit
  coverage; only nine screens are driven by an e2e spec. P07.1's characterisation tests go first
  on the H rows: import, attendance, group registration, redeem, stamp, registration, counter,
  check-in/out, the capture hook and the lost-person banner.
- **Server H rows cluster in four places:** the roster import, the fallback imports, the capture
  services (redeem, stamp, group registration, check-in) and the auth path (rotate, open, callback,
  `requireAuth`, idempotency). Several of these also carry P03.4 bugs, so P06 fixes and splits them
  in the same step, test first (for example `importRoster` with F02-002 and F03-001, `rotateSession`
  with F02-032, `buildVolunteerReport` with F02-027).
- **Two boolean mode flags break §1** and are removed by the split, not kept as options:
  `importRoster(request.commit)` and `runImport(input.commit)` become `plan*` and `apply*`.
- **Nested callbacks.** 13 rows are nested inside another flagged function (6 `$transaction`
  callbacks, 2 in `idempotent`, 3 inner `apply`s, 2 `.map` renders). They need no plan of their own.

### Files over 300 lines

| Lines | File                                        | Split (see the module map and the rows above)                                         |
| ----: | ------------------------------------------- | ------------------------------------------------------------------------------------- |
|   825 | `server/src/modules/admin/service.ts`       | five modules: people, assignments, stations, eventDays, gifts                         |
|   453 | `server/src/modules/fallback/service.ts`    | fallback/application: declare, close, list, importRegistrations, importFootfall, plan |
|   439 | `server/src/modules/report/export.ts`       | one writer per sheet under reports/application/export/, CSV separate                  |
|   433 | `server/src/modules/missionCard/service.ts` | one use case per file; short codes to domain                                          |
|   427 | `client/src/app/admin/settings/page.tsx`    | features/settings (screen, five form sections, validation model)                      |
|   423 | `client/src/app/admin/users/page.tsx`       | features/people (screen, filters, list, row, editor)                                  |
|   382 | `server/src/modules/auth/router.ts`         | identity/http: sessionRoutes, oauthRoutes, cookies.ts; logic to application           |
|   382 | `server/src/modules/auth/service.ts`        | identity/application: one session use case per file; data/sessionRepo.ts              |
|   363 | `server/src/modules/report/service.ts`      | reports/application/sections/*                                                        |
|   358 | `server/src/modules/report/repo.ts`         | reports/data: one query file per section                                              |
|   334 | `server/src/modules/admin/router.ts`        | the five modules' http/routes.ts + platform/settings/http                             |
|   333 | `server/src/modules/shift/service.ts`       | swaps, briefings, assignments                                                         |
|   329 | `server/src/modules/attendance/service.ts`  | attendance/application: status, start, challenge, submit, markPresent; domain rules   |
|   328 | `client/src/lib/outbox.ts`                  | shared/lib/outbox/{store.ts (IndexedDB), queue.ts, flush.ts, entries.ts}              |
|   325 | `client/src/app/chief/imports/page.tsx`     | features/fallback (screen, CSV model, preview, result)                                |
|   319 | `client/src/app/chief/page.tsx`             | features/dashboard (panels, attention model)                                          |
|   304 | `client/src/app/reports/page.tsx`           | features/reports (sections, export)                                                   |
|   301 | `server/src/config/env.ts`                  | config/ split per concern (P01.4)                                                     |

---

## Duplication and consistency · P03.3

### Clone scan

`jscpd` 5.3.2 over `server/src`, `client/src` and `packages/shared/src` (generated code and tests
excluded, 50-token minimum; command in `reports/P03/README.md`, report in
`reports/P03/jscpd-report.json`): **32 clones, 362 of 27,399 lines (1.3 %)**. Text-level copying
is low. Most clones are import blocks and middleware chains that repeat because every router is
written out by hand. The clusters that matter:

| Cluster                                                                                      | Lines | What is copied                                       | One way                                                                     |
| -------------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `auth/service.ts` `openSession` ↔ `rotateSession` (106–132 ↔ 231–249, 77–87 ↔ 212–220)       |    38 | session row creation and the `SessionResponse` shape | `issueSession(tx, volunteer, familyId)` + `toSessionResponse`               |
| `fallback/service.ts` `importRegistrations` ↔ `importFootfall` (221–243 ↔ 295–317)           |    23 | station-code map, key, find-then-create loop         | one `importRows(rows, {key, insert})` over a per-table adapter              |
| capture `registration/page.tsx` ↔ `registration/group/page.tsx` (12–34 ↔ 9–35)               |    27 | station and session guards, empty states             | `useCaptureStation()` + `<CaptureGuard>` in features/capture                |
| `footfall/repo.ts` ↔ `registration/repo.ts` ↔ `gift/repo.ts` (64–79, 84–99, 126–137)         |    28 | `{stationId, from, to}` → Prisma `where`             | `capturedWithin(filter)` in `platform/db` (with a bounded `to`, F02-006)    |
| `gift`/`registration`/`footfall` summary services (200–207, 213–220, 183–189)                |    21 | filter building + `rangeOverlapsFallbackWindow`      | same helper; the fallback check through `fallback/index.ts`                 |
| `admin/service.ts` event-day mapper ×3 (632–640, 676–690, 718–736)                           |    24 | `EventDayRecord` shape written three times           | `toEventDayRecord` in `eventDays/data/mappers.ts`                           |
| routers: footfall/registration/gift/lostFound/shift/announcement/fallback/roster (8–22 each) |    67 | import and middleware preamble                       | a route table (`http/routes.ts`) built from a shared `route()` helper (P06) |
| client lost-found/lost-person/incident forms (181–192 ↔ 135–147, 57–64 ↔ 31–38)              |    20 | submit/pending/error scaffolding                     | the shared form hook (below)                                                |
| client redeem ↔ stamp (93–102 ↔ 79–97), fallback ↔ ic (50–59 ↔ 38–47)                        |    20 | card-code capture flow; station list query           | `CardCapture` component; `useStations()` in features/stations               |
| shared DTOs: `dto/dashboard.ts` ×2, `dto/roster.ts` ×2, `dto/gift.ts` ↔ `dto/report.ts`      |    29 | repeated object shapes                               | named schemas reused (P03.8)                                                |

### Patterns that differ, and the one way to do each

| Concern                    | What the code does today                                                                                                                                                                                                                                                                                                                                                                                                                                            | One way (P06/P07 apply it; standard reference)                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Record mappers**         | `to*Record` in `repo.ts` for 10 modules; in `service.ts` for admin, me, fallback, lostFound; inline in the audit router and three times in admin for event days. Five are **async and query per row** (`fallback` 2/window, `lostFound`, `incident`, announcement and lost-person `decorate` for station names), an N+1 on polled lists (F03-029).                                                                                                                  | Pure, synchronous `toXRecord(row)` in `data/mappers.ts`. Names and joins come from the query's `include`/`select`, never from a query inside the mapper.                                                                                                                                  |
| **Pagination**             | Five cursor endpoints (`admin/volunteers`, announcements, incidents, lost-found, audit), all Prisma `cursor + skip: 1` on `id` while ordering by another column; `admin` returns `nextCursor: null` on a short page, the other four always return the last id (the client cannot see the end). Everything else is unpaginated with `meta.nextCursor: null`. No offset pagination.                                                                                   | Keyset on `(sortKey, id)` with an `id` tiebreaker, `nextCursor` null on the last page, one `paginate()` helper in `platform/db` and one `Paginated<T>` DTO (F03-017). Unbounded lists that can grow per event (roster, gaps, swaps) get it.                                               |
| **Error shaping**          | 72 typed subclasses (`NotFoundError`, `ConflictError`…) and 42 inline `new AppError(status, code, msg)`; 18 `ForbiddenError`s in services for rules that are not about permission (attendance time and code checks, check-in window); Prisma unique violations fall through to 500 (F03-002).                                                                                                                                                                       | One typed error per `ERROR_CODES` entry (`errors/catalogue.ts`), thrown by name; 403 only for authorization, 409 for state, 422 for a rule on valid input (F03-026); the error handler maps P2002/P2025 to 409/404.                                                                       |
| **Date and time**          | 55 `new Date()` and 7 `Date.now()` in modules/middleware; `eventDayAnchor(singaporeDateString(now))` written 14 times; `startOfEventDay` defined three times (dashboard, registration, footfall) and used as an instant lower bound (F03-013); "today" has no upper bound (F02-006).                                                                                                                                                                                | `Clock` injected from `platform/time` (§7); `eventDayOf(instant, event)` and `eventDayWindow(day, event) → {from, to}` as the only ways to say "today"; every range query takes both bounds.                                                                                              |
| **Audit calls**            | `writeAudit(tx, …)` inside the mutation's transaction in most use cases; in a **separate** transaction after the write in 4 places (card batch, session reuse, own-session revoke, settings clear); **missing** for alert and announcement acknowledgements and media uploads; action names reused for other things (`swap.decide` for a request, `lostFound.claim` for close-out, `card.issue` for a batch); `after: {...patch}` versus curated objects (F03-018). | `audited(tx, action, entity, fn)` wrapper in `platform/audit` that runs the mutation and writes one row with `before`/`after` from the same read; one action per verb, generated into the Cedar action catalogue (P11). Every mutation passes through it; an architecture test checks it. |
| **Idempotency**            | Middleware on 9 capture routes, keyed by body `idempotencyKey`; voids, stock adjust, swaps, check-in/out, fallback declare, lost-and-found, announcements and every admin write have none; imports derive deterministic keys; group registration derives per-row keys; reissue writes synthetic `reissue:` keys; the takeover path races (F03-011).                                                                                                                 | `withIdempotency(key, scope, useCase)` at the use-case level (engineering-standards: "every write idempotent"): every state-changing POST carries a key; natural keys (imports, stamps) stay as unique constraints with `ON CONFLICT DO NOTHING`.                                         |
| **Transactions**           | Use cases open `prisma.$transaction` and sometimes pass `tx` to repos, sometimes call `prisma` directly inside; checks read outside the transaction then write inside it (deactivate, delete assignment, resolve alert, void, swap decide); `Promise.all` over a transaction client in 3 places (F03-019).                                                                                                                                                          | The use case owns `tx` and passes it to every repo call; guards re-read inside the transaction or use a conditional write (`updateMany where status = …`); no `Promise.all` on `tx`.                                                                                                      |
| **Response envelopes**     | Lists as `{data, meta}`; single entities as `{volunteer}`, `{station}`, `{card}`, `{assignment}`…; 26 routes return the use-case result bare; 204 on some writes.                                                                                                                                                                                                                                                                                                   | Lists `{data, meta}`; entities `{data}`; mutations return the entity; 204 only for deletes. Documented in the P05 API ADR, enforced by the route contract tests (§9).                                                                                                                     |
| **Rate limits**            | Per route, chosen by hand; the `me` routes (including check-in and check-out) and `GET /stations` have none; `attendance/start` and `/challenge` use the sensitive limit.                                                                                                                                                                                                                                                                                           | A limit class per route in the route table (default, capture, admin, sensitive); none missing. P04.4/P15.2 decide the store.                                                                                                                                                              |
| **Query keys (client)**    | 17 literal arrays in pages and hooks: kebab (`'lost-person'`, `'lost-found'`) beside path-shaped (`['roster','swaps','pending']`, `['admin','volunteers']`); the same key written in up to 4 files (`['me']`); invalidation by string in 13 places.                                                                                                                                                                                                                 | One key factory per feature (`peopleKeys.list(filters)`) in `features/<domain>/queries.ts`; mutations invalidate through the factory; no literal key outside it.                                                                                                                          |
| **Form handling (client)** | Every form is hand-rolled: 98 `useState` calls across pages, validation written inline per field, one `zod` import in the whole client (env parsing). None of the `@spoh/shared` request schemas is used to validate a form.                                                                                                                                                                                                                                        | `useZodForm(schema)` over the shared request schema + `Field` components (engineering-standards §4); server and client reject the same inputs with the same messages.                                                                                                                     |
| **Data fetching (client)** | 13 files call `api()` directly in components; nine hooks in `features/`; capture writes go through the outbox for registration and footfall but **not** for stamps, redemptions, incidents and lost-person alerts (P03.7).                                                                                                                                                                                                                                          | `features/<domain>/api.ts` + `queries.ts` only (§4); every capture write through the outbox.                                                                                                                                                                                              |

### F03-029 — Record mappers query per row (N+1) on polled lists

- **Severity:** Low
- **Area:** `fallback/service.ts:44` `toRecord`, `lostFound/service.ts:39` `toRecord`,
  `incident/repo.ts:20` `toIncidentRecord`, `announcement/service.ts:145` and
  `lostPerson/service.ts:226` `decorate`, `lostPerson/service.ts:101` `getActiveAlerts`
- **Evidence:** each mapper awaits a Prisma query for a station or volunteer name per row. The
  active-alert list and the inbox are polled every `alertPollSeconds` (10 s) by every signed-in
  device.
- **Impact:** at event scale (≈ 80 devices, a handful of rows) this is a few hundred extra queries a
  minute, well within budget, but it grows with rows × devices and holds pool connections under the
  5 s connect timeout. Not a correctness bug.
- **Fix:** names from the query's `include`; pure mappers (the "one way" above).
- **Phase:** P06
- **Status:** open

## Correctness review · P03.4

### Method

Every server module, `lib/` file and middleware was read in full against the checklist:
transaction boundaries, idempotency keys, races (double redeem, double stamp, concurrent swaps and
decisions), time boundaries (the 13:30–14:00 overlap, midnight in the event zone), null handling,
pagination, error-code accuracy and audit completeness. Each suspected bug was then written as an
integration test that asserts the correct behaviour, run against the local test database to prove
it **fails today for the stated reason** (a setup error does not count), and committed skipped.

- **Repro tests:** `server/tests/integration/repro/` — 8 files, **38 tests** (P03.5 adds a ninth file with 4), each tagged with its
  finding id. `npm test` stays green because they are skipped.
- **Proof they fail:** `bash remediation/reports/P03/run-repros.sh [filter]` runs unskipped copies
  and prints each assertion error; on `d4f6399` all 38 fail. Races are written as several rounds
  so they lose on every run, not one in three (checked three times each).
- The phase plan says "run `/code-review` at high effort per module". That skill reviews a diff, and
  there is no diff here, so the review was done by reading each module against the checklist.

### Per-module result

| Module / unit             | Transactions and races                                             | Time                           | Errors, audit, pagination                          | Findings                                             |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| admin                     | checks read outside the tx (deactivate, delete assignment): benign | —                              | rename collisions 500; move audited as create      | F03-002, F03-017, F03-018                            |
| announcement              | —                                                                  | inbox "today" only             | acknowledgement unaudited; audience rules differ   | F03-014, F03-018, F03-029                            |
| attendance                | advisory lock per person: sound                                    | minute-of-day (T-03)           | rule failures reported as 403                      | F03-026                                              |
| audit                     | read only                                                          | —                              | `nextCursor` never null                            | F03-017                                              |
| auth                      | rotation not conditional (fork); no grace for a second tab         | —                              | revoke leaves cached session live                  | F02-032, F03-009, F03-010                            |
| dashboard                 | read only                                                          | "today" unbounded, 08:00 start | —                                                  | F02-006, F03-013                                     |
| fallback                  | imports in one tx; dry run by rollback: sound                      | future rows accepted           | repeated rows collapse                             | F03-012 (F02-006 via imports)                        |
| footfall                  | —                                                                  | same "today" as dashboard      | —                                                  | F03-013                                              |
| gift                      | stock and per-card checks read then insert: race                   | —                              | reissued card loses its redemption                 | F03-003, F03-007, F03-019 (context)                  |
| incident                  | —                                                                  | —                              | any status to any status; `nextCursor` never null  | F03-017, F03-024, F03-029                            |
| lostFound                 | —                                                                  | —                              | close-out audited as `lostFound.claim`             | F03-018, F03-029                                     |
| lostPerson                | resolve checked outside tx: double audit possible                  | —                              | acknowledgement unaudited                          | F03-018, F03-029                                     |
| me                        | check-in conditional: sound; check-out not                         | block test (T-03)              | repeat check-out rewrites the time; 403 for rules  | F03-015, F03-026                                     |
| media                     | —                                                                  | —                              | `media.upload` in the action list, never written   | F03-018                                              |
| missionCard               | stamp insert races the unique key; reissue from any status         | —                              | batch audit outside the insert; LOST never written | F03-008, F03-022, F03-027, F03-028                   |
| notification              | never throws: sound                                                | station = rostered today       | —                                                  | F03-014 (union audience)                             |
| registration              | group link overwrites card status                                  | same "today"                   | card code folded with `toUpperCase` only           | F03-004, F03-013, F03-020                            |
| report                    | read only                                                          | range defaults                 | future shifts counted as no-shows                  | F02-027                                              |
| roster                    | dry run by rollback; placeholder sub collides                      | —                              | roles and reactivation unchecked; counters         | F02-002, F03-001, F03-025                            |
| shift                     | decisions not conditional; stale requests approvable               | long shifts unbounded          | request audited as a decision; slot rules          | F03-005, F03-006, F03-016, F03-018, F03-023, F03-019 |
| station                   | —                                                                  | —                              | —                                                  | none                                                 |
| identity, devAuth, health | —                                                                  | —                              | —                                                  | none (security review is P04)                        |
| `middleware/idempotency`  | abandoned-key takeover not conditional                             | —                              | key reuse ignores the body                         | F03-011                                              |
| `middleware/errorHandler` | —                                                                  | —                              | Prisma P2002/P2025 become 500                      | F03-002                                              |
| `lib/settings`            | `clearSettings` deletes then audits outside a tx                   | —                              | —                                                  | F03-021                                              |
| `lib/shortCode`, DTO      | —                                                                  | —                              | O/I rejected, L/U accepted                         | F03-020                                              |

**Checked and sound:** attendance (advisory lock, attempt limit, root rules), check-in (conditional
update), the fallback and roster dry runs (rolled-back transaction), card issue (idempotent by
status), the 13:30–14:00 overlap (`activeShiftBlocks` returns both blocks, station scope accepts
either, `getMe` picks the first; no double counting because captures are not tied to a block),
the lost-person purge (per-alert transaction), and the refresh-token hash storage.

### P02 bugs, reproduced and root-caused

| ID      | Repro                    | Root cause                                                                                                                                                                                                                                                                                                        |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F02-002 | `repro/roster.test.ts`   | `importRoster` gives every new person in a dry run the placeholder `cognitoSub: 'pending'` (`roster/service.ts:132`), and `Volunteer.cognitoSub` is unique, so the second new row violates the constraint inside the rolled-back transaction; the handler maps P2002 to 500 (F03-002).                            |
| F02-006 | `repro/numbers.test.ts`  | `registrationsSince`, `registrationsByCategory` and `getFunnel({from})` take a lower bound only (`dashboard/repo.ts:12,16`, `dashboard/service.ts:79`). Imports and bulk footfall accept any timestamp, so a row dated tomorrow is "today" and "in the last hour".                                                |
| F02-027 | `repro/numbers.test.ts`  | `buildVolunteerReport` (`report/service.ts:345`) computes `noShows = assignments − checkedIn` over every assignment in the range, and the default range is the whole event, so every shift not yet worked is a no-show.                                                                                           |
| F02-032 | `repro/sessions.test.ts` | `rotateSession` (`auth/service.ts:161`) treats any presentation of an already-rotated token as theft and revokes the whole family. A second tab that sent the same cookie a moment later is indistinguishable from a thief. Fix: accept a token rotated within a few seconds and return the same successor (P12). |

### `CardStatus.LOST` — intent confirmed

P02 recorded that `reissueCard` "leaves the original as it was". The code does not: it sets the
original to **VOIDED** in the same transaction (`missionCard/service.ts:311`). The intent of `LOST`
is clear from the code's own comment ("Reissue against a lost card", PRODUCT_BRIEF §4.3) and from
`ONBOARDING_AND_FEATURES.md` §4.3 ("links the new card back to the old via `reissuedFromId` so the
funnel isn't double-counted"): the original of a reissue was meant to become `LOST`, and the funnel
was meant to count the journey once. Neither happens: `LOST` is never written, the funnel counts
both cards as issued and both as stamped at each station, and counts the original as voided
(F03-028). "Voided" was meant for a spoiled card. P05 confirms the rule; P06 fixes it.

### Findings

#### F03-001 — Roster import and provisioning can grant any role, including Admin

- **Severity:** High (security; P04 re-checks the wider authorization model)
- **Area:** `roster/service.ts:34` `provisionVolunteer`, `:101` `importRoster`, `roster/repo.ts:35`
  `upsertVolunteer`
- **Evidence:** `repro/roster.test.ts`: a Deputy (`roster.edit`) imports one row with their own
  email and `role: ADMIN` with `commit: true` → 200 and they are an Admin; a Chief provisions a new
  Admin → 201; importing a deactivated person's email sets `active: true`. `upsertVolunteer`
  overwrites `role` and `active` for any existing email. None of the rules in `admin/service.ts`
  (`loadTarget`: not yourself, only people below you, only grant roles below yours) is applied.
- **Impact:** any Deputy or Chief can make themselves or anyone else an Admin, change the role of
  someone above them, or undo a deactivation, without the audit showing a role change
  (`roster.import` records counts only). This defeats the role matrix.
- **Fix:** one escalation rule in `people/domain/escalation.ts` applied to every path that sets a
  role or `active` (edit, provision, import); the import never changes `active` and refuses rows
  whose role is not below the importer's; per-row audit of role changes.
- **Phase:** P06 (guard, test first), P11 (Cedar policy)
- **Status:** open

#### F03-002 — Unique-constraint violations are answered with 500

- **Severity:** Medium
- **Area:** `middleware/errorHandler.ts:54` `normalise`; callers without a pre-check:
  `admin/service.ts:768` `updateGiftType`, and every check-then-create (`createStation`,
  `createEventDay`, `createGiftType`) under concurrency
- **Evidence:** `repro/platform.test.ts`: renaming a gift type onto an existing name → 500
  `INTERNAL_ERROR`. It is also why F02-002 is a 500.
- **Impact:** the user sees "Something went wrong" for an ordinary conflict, and the log fills with
  errors that are not faults.
- **Fix:** map Prisma `P2002` to 409 (`CONFLICT` or the field's specific code) and `P2025` to 404 in
  the error handler; keep the pre-checks for their friendly messages.
- **Phase:** P06
- **Status:** open

#### F03-003 — A reissued card can be given a second gift with no warning

- **Severity:** Medium
- **Area:** `gift/service.ts:97` (`existingRedemptionForCard` checks the presented card only),
  `missionCard/service.ts:254` `reissueCard` (moves stamps, not redemptions)
- **Evidence:** `repro/capture.test.ts`: redeem on card A, reissue A → B, redeem on B → 201 with
  no `GIFT_ALREADY_REDEEMED`.
- **Impact:** "one journey, one gift" fails for exactly the visitor who lost their card; the gift
  count and stock go down twice.
- **Fix:** check redemptions across the `reissuedFromId` chain (or move the redemption link on
  reissue).
- **Phase:** P06
- **Status:** open

#### F03-004 — Linking a group to a completed card resets it to ISSUED

- **Severity:** Medium
- **Area:** `registration/service.ts:128` (`missionCard.update({ status: 'ISSUED', issuedAt })`
  whatever the current status)
- **Evidence:** `repro/capture.test.ts`: a COMPLETED card linked by a group registration is ISSUED
  afterwards, with a new `issuedAt`. No audit row records the change.
- **Impact:** the funnel's "completed" drops and "issued" moves to a new time; the card has to be
  completed again.
- **Fix:** issue only an UNISSUED card (as `issueCard` does), through `missionCards/index.ts`.
- **Phase:** P06
- **Status:** open

#### F03-005 — Approving a stale swap request moves someone else's shift

- **Severity:** Medium
- **Area:** `shift/service.ts:121` `decideSwap`, `shift/repo.ts:67` `applySwap`
- **Evidence:** `repro/shifts.test.ts`: a volunteer asks two people to take the same shift; the IC
  approves the first, then the second → 200, and the shift moves from the first taker (who never
  asked) to the second.
- **Impact:** a volunteer loses a shift they accepted, with no message (F02-019), and the roster no
  longer matches who agreed to what.
- **Fix:** approve only while the assignment still belongs to the requester; cancel the requester's
  other pending requests for that assignment when one is approved.
- **Phase:** P06
- **Status:** open

#### F03-006 — Two decisions on one swap both apply

- **Severity:** Medium
- **Area:** `shift/service.ts:131` (status read, then an unconditional update)
- **Evidence:** `repro/shifts.test.ts`: an approval and a rejection sent together both return 200 in
  five rounds out of five; the swap ends REJECTED or APPROVED depending on commit order, while the
  shift may already have moved.
- **Impact:** two ICs acting on the same queue item can leave a rejected swap whose shift has moved.
- **Fix:** `updateMany({ where: { id, status: 'REQUESTED' } })` and act only when one row changed.
- **Phase:** P06
- **Status:** open

#### F03-007 — Simultaneous redemptions oversell stock and give one card several gifts

- **Severity:** Medium
- **Area:** `gift/service.ts:60`/`:97` (stock and per-card checks read, then insert, at READ COMMITTED)
- **Evidence:** `repro/capture.test.ts`: four redemptions of the last item at once → 4 created;
  four redemptions on one card at once → 2 to 4 gifts per card, every run.
- **Impact:** negative stock and double gifts when two desks, or one double-tap, act at once.
- **Fix:** lock the gift type row (`SELECT … FOR UPDATE`) or a conditional stock decrement, and a
  partial unique index on a card's live redemption (or an advisory lock per card).
- **Phase:** P06
- **Status:** open

#### F03-008 — Simultaneous stamps of one card at one station fail with 500

- **Severity:** Medium
- **Area:** `missionCard/service.ts:157` (checks `stampEvents`, then inserts into the unique
  `(missionCardId, stationId)`)
- **Evidence:** `repro/capture.test.ts`: three stamps at once → one 201, others 500, every run.
- **Impact:** a scanner that reads the QR twice shows the volunteer an error for a stamp that was
  recorded, and stamps are not queued offline (P03.7), so the volunteer may re-stamp by hand.
- **Fix:** `INSERT … ON CONFLICT DO NOTHING` and report "already stamped" (the warning path).
- **Phase:** P06
- **Status:** open

#### F03-009 — Revoking a session leaves its access token working for up to a minute

- **Severity:** Medium (P04 re-checks)
- **Area:** `auth/service.ts` `revokeOwnSession`, `revokeAllForVolunteer`, `revokeFamily`;
  `middleware/auth/index.ts:98` `invalidateSessionCache` (no caller)
- **Evidence:** `repro/sessions.test.ts`: a phone signed out from the laptop keeps getting 200 on
  `/me` because its session is cached as live for 60 s.
- **Impact:** "sign this device out" and reuse detection do not take effect immediately, on this
  worker; on other workers (PF-01) not even when the cache is cleared.
- **Fix:** call `invalidateSessionCache` from every revoke now; P10.3's cache bus for other workers.
- **Phase:** P06 (local), P10.3 (cross-instance)
- **Status:** open

#### F03-010 — Concurrent refreshes fork a session family

- **Severity:** Medium (security; P04 re-checks)
- **Area:** `auth/service.ts:205` (the old session is revoked with an unconditional update)
- **Evidence:** `repro/sessions.test.ts`: three refreshes with one cookie at once → three 200s and
  three live sessions in the family, in five rounds out of five.
- **Impact:** refresh-token rotation is meant to leave exactly one live token per family, which is
  what makes reuse detectable. A stolen token replayed at the same moment as the real one gets its
  own live session.
- **Fix:** revoke with `updateMany({ where: { id, revokedAt: null } })` and rotate only if one row
  changed; the loser gets the F02-032 grace answer.
- **Phase:** P12 (with F02-032)
- **Status:** open

#### F03-011 — Two retries can both take over an abandoned idempotency key

- **Severity:** Low
- **Area:** `middleware/idempotency.ts:115` (unconditional `update` of `createdAt`)
- **Evidence:** `repro/platform.test.ts`: three retries of a key abandoned five minutes ago → one
  201 and a 500 per round (the second handler hits the table's own unique key).
- **Impact:** a 500 on a retry after a crash. No double count today, because every capture table
  also has a unique `idempotencyKey`; a future endpoint without one would double-write.
- **Fix:** take over with `updateMany({ where: { key, createdAt: existing.createdAt } })` and treat
  zero rows as "in progress"; store a hash of the body and refuse a reused key with a different body.
- **Phase:** P06
- **Status:** open

#### F03-012 — The fallback import merges separate paper tallies

- **Severity:** High (wrong numbers)
- **Area:** `fallback/service.ts:249` (row key = source + file + station + category + time +
  occurrence index within the row)
- **Evidence:** `repro/numbers.test.ts`: two rows for the same desk, category and half hour (counts
  2 and 3) → 3 registrations, not 5; the second row's first two occurrences are "skipped" as
  duplicates of the first row's.
- **Impact:** when two volunteers' sheets cover the same half hour at one desk, the smaller tally
  disappears, silently: the response reports them as `skipped`, the wording used for a re-import.
- **Fix:** key by row identity (file + row number) for replay protection, not by content.
- **Phase:** P06
- **Status:** open

#### F03-013 — "Today" starts at 08:00 local time

- **Severity:** Low today (the event opens at 09:30); High for any event in another zone or with
  earlier hours
- **Area:** `startOfEventDay` in `dashboard/service.ts:48`, `registration/service.ts:40`,
  `footfall/service.ts:54`: `eventDayAnchor(singaporeDateString(now))` is the `@db.Date` anchor
  (UTC midnight = 08:00 in Singapore), used as an instant
- **Evidence:** `repro/numbers.test.ts`: a registration at 07:00 on 7 January (Singapore) is not
  in that day's dashboard total.
- **Impact:** anything captured before 08:00 local is in no day's live numbers. P01's T-02 and T-06
  list both helpers but not their combination.
- **Fix:** `eventDayWindow(day, event) → {from, to}` in the event zone (P03.3 "one way").
- **Phase:** P09.6
- **Status:** open

#### F03-014 — An urgent announcement is pushed to people it does not reach

- **Severity:** Medium
- **Area:** `announcement/service.ts:179` `pushToDevices`, `notification/service.ts:104`
  `resolveAudience`, `announcement/repo.ts:59,117`
- **Evidence:** `repro/numbers.test.ts`: an URGENT announcement to "IC at the booth" reports
  `audienceCount: 1`; the push resolves **4** recipients. Three rules disagree: the inbox matches the
  role exactly and the station only if the reader is rostered there **today**; the audience count
  matches the role exactly and the station on **any** day; the push takes every role **at or above**
  the target **plus** everyone rostered at the station, and ignores the event day.
- **Impact:** Deputies, Chiefs and booth volunteers are woken by an urgent push that opens an inbox
  where the message is not shown; the sender is told a smaller number than were alerted.
- **Fix:** one audience rule (`announcements/domain/audience.ts`) used by the inbox, the count and
  the push. Related to F02-009 (no audience chosen).
- **Phase:** P06 (rule), P14.4 (composer copy)
- **Status:** open

#### F03-015 — A second check-out overwrites the first

- **Severity:** Low
- **Area:** `me/service.ts:133` `checkOut`
- **Evidence:** `repro/shifts.test.ts`: check out, then again 90 minutes later → 200 and
  `checkedOutAt` moves.
- **Impact:** the report's hours (check-in to check-out) grow if a volunteer taps again later.
- **Fix:** conditional update `checkedOutAt: null`, 409 `ALREADY_CHECKED_OUT` otherwise.
- **Phase:** P06
- **Status:** open

#### F03-016 — Briefing-slot completion rules are inverted

- **Severity:** Low
- **Area:** `shift/service.ts:204` `markSlotComplete` (`own.read` in the router)
- **Evidence:** `repro/shifts.test.ts`: a volunteer (or a Lead) completes an unassigned wave → 200;
  an IC completing someone else's wave → 403, although the message says "the assigned briefer or
  an IC".
- **Impact:** anyone can mark a briefing done; the IC who should cover a missing briefer cannot.
- **Fix:** briefer or `swap.approve`-level role (a named action in P11).
- **Phase:** P06, P11.7
- **Status:** open

#### F03-017 — Pagination cursors do not end, and can skip or repeat

- **Severity:** Low
- **Area:** `incident/router.ts:60`, `announcement/router.ts:61`, `lostFound/router.ts:55`,
  `audit/router.ts:73` (`nextCursor` = last id always); `admin/service.ts:156` (cursor on `id` while
  ordering by name, role or last-seen, with no `id` tiebreaker)
- **Evidence:** `repro/platform.test.ts`: one incident, `limit=50` → `nextCursor` is set.
- **Impact:** a client that follows the cursor makes an extra empty request per list; volunteers
  with equal names or equal "last seen" can appear on two pages or none.
- **Fix:** the `paginate()` helper from P03.3.
- **Phase:** P06
- **Status:** open

#### F03-018 — Audit rows are missing, mislabelled or lack a "before"

- **Severity:** Medium (the house rule is "every mutation audited in the same transaction")
- **Area:** `lostPerson/service.ts:120` `acknowledge` and `announcement/service.ts:130`
  `acknowledgeAnnouncement` (no audit); `media/service.ts:92` (`media.upload` never written);
  `shift/service.ts:107` (a request audited as `swap.decide`); `lostFound/service.ts:177` (close-out
  as `lostFound.claim`); `missionCard/service.ts:364` (a batch as `card.issue`, in its own
  transaction after the insert); `admin/service.ts:484` (a move audited as `assignment.create` with
  no `before`)
- **Evidence:** `repro/platform.test.ts`: an alert acknowledgement writes no row; a swap request is
  `swap.decide`; moving a shift records no previous station.
- **Impact:** post-event reconciliation cannot answer "who acknowledged the alert" or "where was
  this person rostered before"; filtering the log by action gives wrong answers.
- **Fix:** the `audited()` wrapper and one action per verb (P03.3); an architecture test that every
  exported use case that writes goes through it.
- **Phase:** P06 (P11 generates the action catalogue)
- **Status:** open

#### F03-019 — Relation loads run concurrently on a transaction connection (PF-20)

- **Severity:** Medium (pg@9 turns the warning into an error)
- **Area:** `shift/repo.ts:37` `createSwap` and `:44` `findSwapById(tx)` (an `include` of four
  relations inside `$transaction`); the same shape in `admin/service.ts:459` (`upsert … include`)
- **Evidence:** `repro/pgConcurrency.test.ts` (alone in its file because pg warns once per
  process): a swap request emits "Calling client.query() when the client is already executing a
  query". `--trace-deprecation` shows the source is Prisma's query interpreter
  (`interpretNode` → `Array.map`) loading the relations in parallel through `PgTransaction`, not the
  app's own `Promise.all` (the `Promise.all(tx…)` sites PF-20 suspected are serialised by Prisma
  and do not warn). The full suite shows it from `comms.test.ts` and `rbac.test.ts`, both via swaps.
- **Impact:** none today; a pg major upgrade makes every swap request fail.
- **Fix:** inside a transaction, `select` scalar fields only and load relations after commit, or
  upgrade Prisma once it serialises relation loads in transactions; the repro guards either way.
- **Phase:** P06
- **Status:** open. PF-20's remaining item is this.

#### F03-020 — Card-code input disagrees with the printed alphabet

- **Severity:** Low
- **Area:** `packages/shared/src/dto/missionCard.ts:22` `CardShortCode` (regex excludes I and O,
  allows L and U); `lib/shortCode.ts:22` alphabet (excludes I, L, O, U); `normaliseShortCode` does
  not fold look-alikes; `registration/service.ts:116` uses `toUpperCase` only
- **Evidence:** `repro/capture.test.ts`: `GET /cards/IOOOOO` for card `100000` → 400
  "Not a valid card code".
- **Impact:** the alphabet drops I, L, O and U so a scuffed card is read right first time; typing
  the letter a volunteer sees is refused instead of read as the digit.
- **Fix:** one `normaliseCardCode` in shared (Crockford decoding: O→0, I/L→1), used by the DTO, the
  server and `CardCodeInput`.
- **Phase:** P06/P07
- **Status:** open

#### F03-021 — Resetting a setting is not atomic with its audit row

- **Severity:** Low (no caller today)
- **Area:** `lib/settings.ts:199` `clearSettings` (defaults `tx = prisma`)
- **Evidence:** `repro/platform.test.ts`: when the audit insert fails, the setting is already
  deleted.
- **Impact:** none until P10 wires "reset to default"; then an unaudited change.
- **Fix:** run delete and audit in one transaction and reload after commit.
- **Phase:** P10.1
- **Status:** open

#### F03-022 — A card batch can print a code that belongs to another card

- **Severity:** Low (a 1-in-a-billion-per-code collision)
- **Area:** `missionCard/service.ts:344` `generateBatch` (`createMany` with `skipDuplicates`, CSV
  built from the generated rows, not the created ones)
- **Evidence:** `repro/cardBatch.test.ts` forces the generator to return an existing code: the CSV
  lists it and `created` is one less than the rows printed.
- **Impact:** two physical cards with one code; one journey stamps both.
- **Fix:** insert with `RETURNING`, regenerate until `count` codes are new, print only those.
- **Phase:** P06
- **Status:** open

#### F03-023 — Long-shift warnings include shifts from earlier days

- **Severity:** Low
- **Area:** `shift/repo.ts:233` `longRunningShifts` (no date bound)
- **Evidence:** `repro/shifts.test.ts`: a shift checked in yesterday and never checked out is
  today's longest shift (1,530 minutes).
- **Impact:** after day 1, everyone who forgot to check out tops the Chief's list every day.
- **Fix:** today's assignments only; stale open check-ins become a data-health item.
- **Phase:** P06
- **Status:** open

#### F03-024 — Incident status moves freely, including back from RESOLVED

- **Severity:** Low
- **Area:** `incident/service.ts:128` `changeIncidentStatus`
- **Evidence:** `repro/platform.test.ts`: RESOLVED → OPEN returns 200.
- **Impact:** the "incidents open" count can go back up with no reason recorded; there is no
  resolution time. F02-015 builds the incident screen on this.
- **Fix:** a state machine (OPEN → ACKNOWLEDGED → RESOLVED, reopen only with a note) and
  `resolvedAt`.
- **Phase:** P06, P13.7
- **Status:** open

#### F03-025 — Import counters count a new person twice

- **Severity:** Low
- **Area:** `roster/service.ts:142` (every row calls `upsertVolunteer`; the second row for a new
  email counts as "updated")
- **Evidence:** `repro/roster.test.ts`: one new person with two shifts → 1 created and 1 updated.
- **Impact:** the preview tells the Chief an existing volunteer will change when none does.
- **Fix:** plan per person, not per row (the P03.2 split).
- **Phase:** P06
- **Status:** open

#### F03-026 — Rule failures are reported as permission denials

- **Severity:** Low
- **Area:** 18 `ForbiddenError`s in services, e.g. `me/service.ts:107` (check-in outside the
  block), `attendance/service.ts` (code invalid or expired, day not configured)
- **Evidence:** `repro/shifts.test.ts`: checking in to the afternoon shift at 11:30 → 403
  `FORBIDDEN`.
- **Impact:** the client shows "not allowed for your role" (F02-030) for "not yet"; logs mix
  authorization failures with ordinary rule failures.
- **Fix:** 409/422 with specific codes (P03.3 error decision).
- **Phase:** P06, P11.8
- **Status:** open

#### F03-027 — A voided or unissued card can be reissued

- **Severity:** Low
- **Area:** `missionCard/service.ts:269` (no status check on the original)
- **Evidence:** `repro/capture.test.ts`: reissuing from a VOIDED card → 201, stamps carried over.
- **Impact:** a spoiled card's stamps move onto a fresh card.
- **Fix:** reissue only from ISSUED or COMPLETED.
- **Phase:** P06
- **Status:** open

#### F03-028 — A reissued journey is counted twice, and the original as voided

- **Severity:** Medium (wrong numbers)
- **Area:** `missionCard/repo.ts:97` `issuedWhere`, `:134` `countCardsPerStation`,
  `missionCard/service.ts:311`
- **Evidence:** `repro/capture.test.ts`: one card stamped once and reissued → funnel `issued: 2`,
  `voided: 1`, the booth stage 2.
- **Impact:** every lost card adds one to "issued" and to each station it reached, and one to
  "voided".
- **Fix:** mark the original `LOST` (see above) and count journeys, excluding originals with a
  reissue.
- **Phase:** P06 (P05 confirms the rule)
- **Status:** open

## Multi-instance correctness · P03.5

### Method

`server/tests/integration/repro/multiInstance.test.ts` loads the app twice with
`vi.resetModules()`, so each instance has its own copy of every module: the volunteer and session
caches, the rate-limit counters, the settings cache and the job functions, with one database
behind both. That is what several PM2 workers or containers are. The file's four tests are skipped
repros like P03.4's; `run-repros.sh multiInstance` shows all four failing, twice in a row.

| Check                          | Result                                                                                                                                                                                                                                                                                    | Status                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **PF-01** auth caches          | Deactivated through instance A, the volunteer still gets 200 from instance B, which had them cached. A itself refuses at once (its cache is cleared). B follows only when its 60 s entry expires. Same for role changes and for session revocation (F03-009 is the single-instance half). | **Confirmed**                |
| **PF-02** rate limiter         | Twenty failed sign-ins exhaust instance A's limit (the 21st is 429); instance B answers the 22nd with 404. The effective limit is 20 × instances.                                                                                                                                         | **Confirmed**                |
| Settings refresh skew          | A settings change made through A is not visible on B (`eventName` still the default). B converges on its next `loadSettings` tick, up to 60 s later. For shift boundaries that is up to a minute of capture permitted or refused on one worker only.                                      | Confirmed as F03-030         |
| Scheduled jobs on every worker | Every instance runs all four jobs. Two instances purging together write **10** lost-person summaries for **5** alerts. The idempotency and session prunes are bounded deletes and safe to repeat. The settings refresh is per instance by design.                                         | Purge: F03-031; others sound |

#### F03-030 — A settings change reaches other instances up to a minute later

- **Severity:** Medium (Low for thresholds; Medium for shift boundaries, which gate capture)
- **Area:** `lib/settings.ts` (per-process cache), `jobs/scheduler.ts:31` (`SETTINGS_REFRESH_MS`)
- **Evidence:** `repro/multiInstance.test.ts`.
- **Impact:** after moving a shift boundary, a volunteer's capture can succeed on one worker and be
  refused on the next request to another, for up to 60 s; the admin screen can show the old value
  if the read lands on another worker. The code documents the trade-off, but it was made for one
  instance.
- **Fix:** the cache bus (`LISTEN/NOTIFY`, D-14) invalidates every instance on write.
- **Phase:** P10.3
- **Status:** open

#### F03-031 — Every worker runs the lost-person purge, so summaries are written twice

- **Severity:** Medium (the report's lost-person section double-counts)
- **Area:** `jobs/scheduler.ts:41`, `lostPerson/service.ts` `purgeResolvedAlerts`,
  `lostPerson/repo.ts:111` `purgeAlert` (creates a summary, then updates the alert, with no check
  that it is still unpurged)
- **Evidence:** `repro/multiInstance.test.ts`: two workers purging five alerts → 10 summaries. The
  scheduler's comment says concurrent runs are safe because the purge is "transactional per
  alert"; being transactional does not stop two transactions purging the same alert.
- **Impact:** after the first purge, every resolved lost-person case appears once per worker in the
  report's lost-person summary and resolution times.
- **Fix:** claim the alert with `updateMany({ where: { id, purgedAt: null } })` and create the
  summary only if one row changed; jobs move to the D-09 scheduler with one runner per job.
- **Phase:** P06 (claim), P10 (scheduler)
- **Status:** open

## Test gaps · P03.6

**Data.** `node remediation/reports/P03/test-gaps.mjs <coverage-final.json>` (the coverage command
is in the script header) writes `reports/P03/test-gaps.json`: the 95 routes from P02's
`permissions.json` checked against the integration tests (a quoted occurrence of the path, with or
without `/api/v1`, counts; the skipped repros do not), the server functions no test executes (a
fresh whole-`src` coverage run on `d4f6399`, unit + integration), and the 29 client routes checked
against the e2e specs (a `goto`, `waitForURL` or URL assertion counts). P00's per-file coverage
(`P00-coverage.json`: server modules 78 % lines, every client screen 0 % unit) is the baseline.

| Measure                           | Count                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Routes with no integration test   | **23 of 95**                                                                                                                    |
| Server functions no test executes | **81** (29 are dead or dev-only, P03.1)                                                                                         |
| Server use cases with a unit test | **0**: the 6 unit files test `lib/` (time, settings, short codes), the capability matrix, attendance tokens and the no-PII rule |
| Client screens with no e2e        | **17 of 29**                                                                                                                    |
| Client unit tests                 | 2 files (outbox, tokens), 21 tests; no `model` helper, hook or component test                                                   |

### Ranked gaps (capture and auth first)

| Rank | Gap                                                                                                                                                                                                                            | Why it matters                                                                                                               | Covered by       |
| ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
|    1 | **Hosted sign-in has no test at all:** `GET /auth/login`, `GET /auth/callback` and the Cognito verifier (`cognitoProvider.verify`, `extractGroups`) are never executed; every test signs in through the local provider         | This is the only sign-in path in staging and production; state/PKCE handling and the callback's error redirects are unproven | P06.1, P12       |
|    2 | **Capture screens without e2e:** `/capture/stamp`, `/capture/redeem`, `/capture/registration/group`; `/shift` (parked captures, copy, flush)                                                                                   | Three of the four counts and the offline salvage path; only registration and footfall have a journey test                    | P07.1            |
|    3 | **Corrections untested:** `POST /footfall/ticks/:id/void` (`voidTickById` never runs), `POST /me/check-out`, `GET /attendance` (status)                                                                                        | Voids and check-out change the counts and the hours (F03-015 went unseen)                                                    | P06.1            |
|    4 | **Concurrency is untested everywhere** except the idempotency middleware                                                                                                                                                       | Every race in P03.4 (F03-006…F03-011) and P03.5 (F03-031) was invisible to the suite                                         | P03 repros → P06 |
|    5 | **Safety module gaps:** `POST /incidents/:id/status`, `/follow-ups` untested; the whole `lostFound` service never runs (log, list, claim, close-out); `GET /dashboard/data-health` untested                                    | Incident and lost-and-found state are what the Chief acts on; close-out changes item state in bulk                           | P06.1            |
|    6 | **Multi-instance behaviour** (caches, limits, jobs): only the P03.5 repros                                                                                                                                                     | Production runs more than one worker                                                                                         | P10.3, P15.2     |
|    7 | **Admin writes untested:** `POST /admin/assignments` (`createAssignment`), `PATCH /admin/event-days/:id`, `updateStation`, `updateGiftType`, `getStationRoster`, `GET /roster/swaps/pending`, `/roster/gaps`, `/gifts/summary` | Setup changes that re-scope capture (stations, days, assignments)                                                            | P06.1            |
|    8 | **Operations screens without e2e:** `/chief`, `/chief/imports`, `/chief/fallback`, `/ic`, `/reports`, `/inbox`, `/tv`                                                                                                          | Read-mostly, but the dashboard numbers (F02-006) and imports (F03-012) are where wrong numbers surface                       | P07.1            |
|    9 | **Jobs never run in tests:** `startScheduledJobs`, `pruneIdempotencyRecords`, `pruneRefreshSessions`                                                                                                                           | The purge is tested directly; the prunes delete rows and have no test                                                        | P06.1, P10       |
|   10 | **Push and media:** `/notifications/*`, `/media/*` untested (need VAPID keys and S3); `pushToDevices` never runs                                                                                                               | Best-effort features; a fake transport makes them testable                                                                   | P06.1            |
|   11 | **Safety screens without e2e:** `/safety/incident/new`, `/safety/lost-found`, `/safety/lost-found/new`; content screens `/journey` and `/map`                                                                                  | Forms with no journey test; content becomes data in P13.3                                                                    | P07.1            |

**What P06.1/P07.1 characterise first:** ranks 1–3 and 5 on the server (route contract tests with
the P03.4 repros beside them), ranks 2 and 8 on the client, then the H rows of the P03.2 backlog in
the order P06/P07 split them. A use case gets its unit test (fake repo, fixed clock, §9) in the
commit that moves it to `application/`, so "0 use cases with a unit test" closes as the refactor
goes, not as a separate pass.

---

## Appendix A — Target location of every export

Generated by `node remediation/reports/P03/module-map.mjs` into `reports/P03/module-map.md`;
copied here unchanged. "Now" is the declaration's file and line on `d4f6399`.

<!-- module-map:start -->

| Unit                    | Export                        | Kind      | Lines | Now                                     | Target                                                                                                   |
| ----------------------- | ----------------------------- | --------- | ----: | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| app                     | `createApp`                   | function  |    69 | `app.ts:19`                             | app/createApp.ts                                                                                         |
| config/env              | `parseEnv`                    | function  |    12 | `config/env.ts:284`                     | config/ (test seam; keep, add a test)                                                                    |
| config/env              | `env`                         | const     |     1 | `config/env.ts:297`                     | config/env.ts                                                                                            |
| config/env              | `isProduction`                | const     |     1 | `config/env.ts:299`                     | config/isProduction.ts                                                                                   |
| config/env              | `isTest`                      | const     |     1 | `config/env.ts:300`                     | config/isTest.ts                                                                                         |
| jobs/scheduler          | `startScheduledJobs`          | function  |    37 | `jobs/scheduler.ts:37`                  | platform/scheduler/startScheduledJobs.ts                                                                 |
| lib/audit               | `writeAudit`                  | function  |    16 | `lib/audit.ts:93`                       | platform/audit/writeAudit.ts                                                                             |
| lib/audit               | `auditStationScopeBypass`     | function  |    15 | `lib/audit.ts:120`                      | platform/audit/writeAudit.ts                                                                             |
| lib/campusNetwork       | `parseCidr`                   | function  |    20 | `lib/campusNetwork.ts:3`                | modules/attendance/domain/campusNetwork.ts                                                               |
| lib/campusNetwork       | `isCampusIp`                  | function  |    13 | `lib/campusNetwork.ts:24`               | modules/attendance/domain/campusNetwork.ts                                                               |
| lib/captureActor        | `captureActorFrom`            | function  |     7 | `lib/captureActor.ts:21`                | platform/http/captureActor.ts                                                                            |
| lib/errors              | `AppError`                    | class     |    23 | `lib/errors.ts:11`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `ValidationError`             | class     |     5 | `lib/errors.ts:35`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `UnauthenticatedError`        | class     |     5 | `lib/errors.ts:41`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `NotProvisionedError`         | class     |     5 | `lib/errors.ts:52`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `AccountInactiveError`        | class     |     5 | `lib/errors.ts:58`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `ForbiddenError`              | class     |     5 | `lib/errors.ts:64`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `StationScopeError`           | class     |     5 | `lib/errors.ts:71`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `NotFoundError`               | class     |     5 | `lib/errors.ts:77`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `ConflictError`               | class     |     5 | `lib/errors.ts:83`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `IdempotencyKeyReuseError`    | class     |     9 | `lib/errors.ts:89`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `RateLimitedError`            | class     |     5 | `lib/errors.ts:99`                      | platform/errors/index.ts                                                                                 |
| lib/errors              | `InternalError`               | class     |     5 | `lib/errors.ts:105`                     | platform/errors/index.ts                                                                                 |
| lib/errors              | `ServiceUnavailableError`     | class     |     5 | `lib/errors.ts:111`                     | delete (no production caller)                                                                            |
| lib/errors              | `isAppError`                  | function  |     3 | `lib/errors.ts:117`                     | platform/errors/index.ts                                                                                 |
| lib/logger              | `logger`                      | const     |    12 | `lib/logger.ts:32`                      | platform/logger/index.ts                                                                                 |
| lib/logger              | `requestLogger`               | function  |     3 | `lib/logger.ts:46`                      | delete (no production caller)                                                                            |
| lib/prisma              | `prisma`                      | const     |     9 | `lib/prisma.ts:23`                      | platform/db/client.ts                                                                                    |
| lib/prisma              | `pingDatabase`                | function  |     3 | `lib/prisma.ts:41`                      | platform/db/client.ts                                                                                    |
| lib/prisma              | `disconnectPrisma`            | function  |     3 | `lib/prisma.ts:45`                      | platform/db/client.ts                                                                                    |
| lib/requestContext      | `auditContextFrom`            | function  |    10 | `lib/requestContext.ts:12`              | platform/http/auditContext.ts                                                                            |
| lib/requestContext      | `SYSTEM_AUDIT_CONTEXT`        | const     |     7 | `lib/requestContext.ts:24`              | platform/http/auditContext.ts                                                                            |
| lib/settings            | `DEFAULT_SETTINGS`            | const     |    27 | `lib/settings.ts:43`                    | platform/settings/DEFAULT_SETTINGS.ts                                                                    |
| lib/settings            | `getSettings`                 | function  |     3 | `lib/settings.ts:84`                    | platform/settings/getSettings.ts                                                                         |
| lib/settings            | `settingsMeta`                | function  |    11 | `lib/settings.ts:89`                    | platform/settings/settingsMeta.ts                                                                        |
| lib/settings            | `loadSettings`                | function  |    50 | `lib/settings.ts:109`                   | platform/settings/loadSettings.ts                                                                        |
| lib/settings            | `updateSettings`              | function  |    31 | `lib/settings.ts:166`                   | platform/settings/updateSettings.ts                                                                      |
| lib/settings            | `clearSettings`               | function  |    15 | `lib/settings.ts:199`                   | platform/settings/ (no caller: P10 revert uses it or it goes)                                            |
| lib/settings            | `overrideSettingsForTest`     | function  |     7 | `lib/settings.ts:219`                   | platform/settings/testing.ts (no caller)                                                                 |
| lib/shortCode           | `SHORT_CODE_SPACE`            | const     |     1 | `lib/shortCode.ts:24`                   | delete (no production caller)                                                                            |
| lib/shortCode           | `generateShortCode`           | function  |    14 | `lib/shortCode.ts:34`                   | modules/missionCards/domain/shortCode.ts                                                                 |
| lib/shortCode           | `generateQrPayload`           | function  |     3 | `lib/shortCode.ts:57`                   | modules/missionCards/domain/shortCode.ts                                                                 |
| lib/shortCode           | `normaliseShortCode`          | function  |     3 | `lib/shortCode.ts:62`                   | modules/missionCards/domain/shortCode.ts                                                                 |
| lib/time                | `EVENT_TIME_ZONE`             | const     |     1 | `lib/time.ts:19`                        | retired by P09 (Event.timeZone)                                                                          |
| lib/time                | `shiftBlockRanges`            | function  |    13 | `lib/time.ts:36`                        | platform/time/ (internal)                                                                                |
| lib/time                | `SHIFT_BLOCKS`                | const     |    12 | `lib/time.ts:57`                        | delete (no production caller) (compiled defaults; P09 block rows)                                        |
| lib/time                | `singaporeDateString`         | function  |     4 | `lib/time.ts:71`                        | platform/time/singaporeDateString.ts                                                                     |
| lib/time                | `eventDayAnchor`              | function  |     3 | `lib/time.ts:81`                        | platform/time/eventDayAnchor.ts                                                                          |
| lib/time                | `singaporeMinuteOfDay`        | function  |     4 | `lib/time.ts:86`                        | platform/time/ (internal)                                                                                |
| lib/time                | `singaporeHourKey`            | function  |     4 | `lib/time.ts:99`                        | platform/time/singaporeHourKey.ts                                                                        |
| lib/time                | `singaporeHourStart`          | function  |     5 | `lib/time.ts:105`                       | delete (no production caller)                                                                            |
| lib/time                | `activeShiftBlocks`           | function  |    13 | `lib/time.ts:121`                       | platform/time/activeShiftBlocks.ts                                                                       |
| lib/time                | `floorToBucket`               | function  |     4 | `lib/time.ts:136`                       | delete (no production caller)                                                                            |
| lib/time                | `BUCKET_MINUTES`              | const     |     5 | `lib/time.ts:141`                       | platform/time/BUCKET_MINUTES.ts                                                                          |
| lib/time                | `minutesBetween`              | function  |     3 | `lib/time.ts:148`                       | platform/time/minutesBetween.ts                                                                          |
| middleware/auth         | `createCognitoAuthProvider`   | function  |    37 | `middleware/auth/cognitoProvider.ts:14` | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `AuthProvider`                | re-export |     1 | `middleware/auth/index.ts:18`           | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `VerifiedToken`               | re-export |     1 | `middleware/auth/index.ts:18`           | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `authProvider`                | const     |     6 | `middleware/auth/index.ts:40`           | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `localAuthIssuer`             | const     |     1 | `middleware/auth/index.ts:51`           | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `invalidateVolunteerCache`    | function  |     8 | `middleware/auth/index.ts:88`           | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `invalidateSessionCache`      | function  |     4 | `middleware/auth/index.ts:98`           | platform/access/ (no caller: F03 bug, revokes should call it; P10.3 cache bus)                           |
| middleware/auth         | `requireAuth`                 | function  |    56 | `middleware/auth/index.ts:169`          | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `getAuth`                     | function  |     8 | `middleware/auth/index.ts:227`          | platform/access/authenticate.ts                                                                          |
| middleware/auth         | `createLocalAuthProvider`     | function  |    52 | `middleware/auth/localProvider.ts:34`   | platform/access/authenticate.ts                                                                          |
| middleware/errorHandler | `errorHandler`                | function  |    36 | `middleware/errorHandler.ts:16`         | platform/http/errorHandler.ts                                                                            |
| middleware/errorHandler | `notFoundHandler`             | function  |    10 | `middleware/errorHandler.ts:78`         | platform/http/errorHandler.ts                                                                            |
| middleware/errorHandler | `describeCause`               | function  |     4 | `middleware/errorHandler.ts:93`         | delete (no production caller)                                                                            |
| middleware/idempotency  | `idempotent`                  | function  |    59 | `middleware/idempotency.ts:75`          | platform/idempotency/idempotent.ts                                                                       |
| middleware/idempotency  | `IDEMPOTENCY_RETENTION_DAYS`  | const     |     1 | `middleware/idempotency.ts:210`         | delete (no production caller)                                                                            |
| middleware/idempotency  | `pruneIdempotencyRecords`     | function  |     8 | `middleware/idempotency.ts:212`         | platform/idempotency/pruneIdempotencyRecords.ts                                                          |
| middleware/rateLimit    | `defaultRateLimit`            | const     |     1 | `middleware/rateLimit.ts:47`            | platform/http/rateLimit.ts                                                                               |
| middleware/rateLimit    | `captureRateLimit`            | const     |     1 | `middleware/rateLimit.ts:50`            | platform/http/rateLimit.ts                                                                               |
| middleware/rateLimit    | `sensitiveRateLimit`          | const     |     1 | `middleware/rateLimit.ts:59`            | platform/http/rateLimit.ts                                                                               |
| middleware/rateLimit    | `adminRateLimit`              | const     |     1 | `middleware/rateLimit.ts:70`            | platform/http/rateLimit.ts                                                                               |
| middleware/rbac         | `requireCapability`           | function  |    16 | `middleware/rbac.ts:22`                 | platform/access/requireCapability.ts                                                                     |
| middleware/rbac         | `requireMinimumRole`          | function  |    10 | `middleware/rbac.ts:44`                 | delete (no production caller)                                                                            |
| middleware/rbac         | `stationIdFromBody`           | function  |     6 | `middleware/rbac.ts:59`                 | platform/access/ (internal default)                                                                      |
| middleware/rbac         | `stationIdFromParams`         | function  |     6 | `middleware/rbac.ts:66`                 | delete (no production caller)                                                                            |
| middleware/rbac         | `requireStationScope`         | function  |    36 | `middleware/rbac.ts:80`                 | platform/access/requireStationScope.ts                                                                   |
| middleware/requestId    | `requestId`                   | function  |     7 | `middleware/requestId.ts:17`            | platform/http/requestId.ts                                                                               |
| middleware/requestId    | `requestIdOf`                 | function  |     3 | `middleware/requestId.ts:32`            | platform/http/requestId.ts                                                                               |
| middleware/validate     | `validate`                    | function  |    31 | `middleware/validate.ts:21`             | platform/http/validate.ts                                                                                |
| middleware/validate     | `validatedBody`               | function  |     3 | `middleware/validate.ts:70`             | platform/http/validate.ts                                                                                |
| middleware/validate     | `validatedQuery`              | function  |     3 | `middleware/validate.ts:75`             | platform/http/validate.ts                                                                                |
| middleware/validate     | `validatedParams`             | function  |     3 | `middleware/validate.ts:80`             | platform/http/validate.ts                                                                                |
| modules/admin           | `adminRouter`                 | const     |     1 | `modules/admin/router.ts:58`            | split: people, assignments, stations, eventDays, gifts http/routes.ts; settings → platform/settings/http |
| modules/admin           | `listVolunteers`              | function  |    38 | `modules/admin/service.ts:126`          | modules/people/application/listPeople.ts                                                                 |
| modules/admin           | `getVolunteer`                | function  |     5 | `modules/admin/service.ts:165`          | modules/people/application/getPerson.ts                                                                  |
| modules/admin           | `updateVolunteer`             | function  |    89 | `modules/admin/service.ts:231`          | modules/people/application/updatePerson.ts                                                               |
| modules/admin           | `deactivateVolunteer`         | function  |    58 | `modules/admin/service.ts:330`          | modules/people/application/deactivatePerson.ts                                                           |
| modules/admin           | `reactivateVolunteer`         | function  |    47 | `modules/admin/service.ts:389`          | modules/people/application/reactivatePerson.ts                                                           |
| modules/admin           | `createAssignment`            | function  |    58 | `modules/admin/service.ts:441`          | modules/assignments/application/assignShift.ts                                                           |
| modules/admin           | `deleteAssignment`            | function  |    28 | `modules/admin/service.ts:500`          | modules/assignments/application/unassignShift.ts                                                         |
| modules/admin           | `createStation`               | function  |    39 | `modules/admin/service.ts:533`          | modules/stations/application/createStation.ts                                                            |
| modules/admin           | `updateStation`               | function  |    48 | `modules/admin/service.ts:573`          | modules/stations/application/updateStation.ts                                                            |
| modules/admin           | `listEventDays`               | function  |    16 | `modules/admin/service.ts:626`          | modules/eventDays/application/listEventDays.ts                                                           |
| modules/admin           | `createEventDay`              | function  |    46 | `modules/admin/service.ts:643`          | modules/eventDays/application/createEventDay.ts                                                          |
| modules/admin           | `updateEventDay`              | function  |    41 | `modules/admin/service.ts:690`          | modules/eventDays/application/updateEventDay.ts                                                          |
| modules/admin           | `createGiftType`              | function  |    31 | `modules/admin/service.ts:736`          | modules/gifts/application/createGiftType.ts                                                              |
| modules/admin           | `updateGiftType`              | function  |    50 | `modules/admin/service.ts:768`          | modules/gifts/application/updateGiftType.ts                                                              |
| modules/admin           | `assertCanActOn`              | function  |     5 | `modules/admin/service.ts:820`          | delete (no production caller); the rule lives in modules/people/domain/escalation.ts                     |
| modules/announcement    | `toAnnouncementRecord`        | function  |    22 | `modules/announcement/repo.ts:16`       | modules/announcements/data/mappers.ts                                                                    |
| modules/announcement    | `createAnnouncement`          | function  |     6 | `modules/announcement/repo.ts:39`       | modules/announcements/data/repo.ts                                                                       |
| modules/announcement    | `findAnnouncementById`        | function  |     3 | `modules/announcement/repo.ts:46`       | modules/announcements/data/repo.ts                                                                       |
| modules/announcement    | `listForRecipient`            | function  |    33 | `modules/announcement/repo.ts:59`       | modules/announcements/data/repo.ts                                                                       |
| modules/announcement    | `acknowledgedIds`             | function  |    13 | `modules/announcement/repo.ts:93`       | modules/announcements/data/repo.ts                                                                       |
| modules/announcement    | `acknowledge`                 | function  |     7 | `modules/announcement/repo.ts:108`      | modules/announcements/data/repo.ts                                                                       |
| modules/announcement    | `countAudience`               | function  |    22 | `modules/announcement/repo.ts:117`      | modules/announcements/data/repo.ts                                                                       |
| modules/announcement    | `announcementRouter`          | const     |     1 | `modules/announcement/router.ts:17`     | modules/announcements/http/routes.ts + handlers.ts                                                       |
| modules/announcement    | `sendAnnouncement`            | function  |    51 | `modules/announcement/service.ts:32`    | modules/announcements/application/sendAnnouncement.ts                                                    |
| modules/announcement    | `listInbox`                   | function  |    45 | `modules/announcement/service.ts:84`    | modules/announcements/application/listInbox.ts                                                           |
| modules/announcement    | `acknowledgeAnnouncement`     | function  |    14 | `modules/announcement/service.ts:130`   | modules/announcements/application/acknowledgeAnnouncement.ts                                             |
| modules/attendance      | `attendanceRouter`            | const     |     1 | `modules/attendance/router.ts:9`        | modules/attendance/http/routes.ts + handlers.ts                                                          |
| modules/attendance      | `attendanceStatus`            | function  |    33 | `modules/attendance/service.ts:53`      | modules/attendance/application/attendanceStatus.ts                                                       |
| modules/attendance      | `startAttendance`             | function  |    17 | `modules/attendance/service.ts:150`     | modules/attendance/application/startAttendance.ts                                                        |
| modules/attendance      | `issueChallenge`              | function  |    45 | `modules/attendance/service.ts:200`     | modules/attendance/application/issueChallenge.ts                                                         |
| modules/attendance      | `submitAttendance`            | function  |    83 | `modules/attendance/service.ts:246`     | modules/attendance/application/submitAttendance.ts                                                       |
| modules/attendance      | `ATTENDANCE_TTL_MS`           | const     |     1 | `modules/attendance/tokens.ts:6`        | modules/attendance/domain/tokens.ts                                                                      |
| modules/attendance      | `hashPin`                     | function  |     3 | `modules/attendance/tokens.ts:15`       | modules/attendance/domain/tokens.ts                                                                      |
| modules/attendance      | `signAttendanceToken`         | function  |    16 | `modules/attendance/tokens.ts:19`       | modules/attendance/domain/tokens.ts                                                                      |
| modules/attendance      | `verifyAttendanceToken`       | function  |    28 | `modules/attendance/tokens.ts:36`       | modules/attendance/domain/tokens.ts                                                                      |
| modules/audit           | `auditRouter`                 | const     |     1 | `modules/audit/router.ts:18`            | platform/audit/http/routes.ts + application/listAuditEntries.ts + data/repo.ts                           |
| modules/auth            | `authRouter`                  | const     |     1 | `modules/auth/router.ts:50`             | modules/identity/http/routes.ts + handlers.ts                                                            |
| modules/auth            | `REFRESH_COOKIE_NAME`         | const     |     1 | `modules/auth/router.ts:368`            | delete (no production caller)                                                                            |
| modules/auth            | `accessTokenTtlSeconds`       | function  |     3 | `modules/auth/router.ts:371`            | delete (no production caller)                                                                            |
| modules/auth            | `refreshSessionDays`          | function  |     3 | `modules/auth/router.ts:376`            | delete (no production caller)                                                                            |
| modules/auth            | `openSession`                 | function  |    62 | `modules/auth/service.ts:61`            | modules/identity/application/openSession.ts                                                              |
| modules/auth            | `rotateSession`               | function  |   115 | `modules/auth/service.ts:132`           | modules/identity/application/rotateSession.ts                                                            |
| modules/auth            | `revokeFamily`                | function  |     6 | `modules/auth/service.ts:249`           | modules/identity/data/repo.ts (internal; not exported)                                                   |
| modules/auth            | `endSession`                  | function  |    29 | `modules/auth/service.ts:257`           | modules/identity/application/endSession.ts                                                               |
| modules/auth            | `revokeAllForVolunteer`       | function  |     8 | `modules/auth/service.ts:294`           | modules/identity/application/revokeAllForVolunteer.ts                                                    |
| modules/auth            | `listSessions`                | function  |    25 | `modules/auth/service.ts:303`           | modules/identity/application/listSessions.ts                                                             |
| modules/auth            | `revokeOwnSession`            | function  |    24 | `modules/auth/service.ts:335`           | modules/identity/application/revokeOwnSession.ts                                                         |
| modules/auth            | `pruneRefreshSessions`        | function  |    18 | `modules/auth/service.ts:364`           | modules/identity/jobs.ts                                                                                 |
| modules/auth            | `issueAccessToken`            | function  |    17 | `modules/auth/tokens.ts:64`             | modules/identity/domain/tokens.ts                                                                        |
| modules/auth            | `verifyAccessToken`           | function  |    19 | `modules/auth/tokens.ts:89`             | modules/identity/domain/tokens.ts                                                                        |
| modules/auth            | `generateRefreshToken`        | function  |     3 | `modules/auth/tokens.ts:116`            | modules/identity/domain/tokens.ts                                                                        |
| modules/auth            | `hashRefreshToken`            | function  |     3 | `modules/auth/tokens.ts:121`            | modules/identity/domain/tokens.ts                                                                        |
| modules/auth            | `newFamilyId`                 | function  |     3 | `modules/auth/tokens.ts:125`            | modules/identity/domain/tokens.ts                                                                        |
| modules/dashboard       | `registrationsSince`          | function  |     3 | `modules/dashboard/repo.ts:12`          | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `registrationsByCategory`     | function  |    13 | `modules/dashboard/repo.ts:16`          | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `footfallSince`               | function  |     7 | `modules/dashboard/repo.ts:30`          | delete (no production caller)                                                                            |
| modules/dashboard       | `openIncidentCounts`          | function  |     7 | `modules/dashboard/repo.ts:38`          | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `activeLostPersonCount`       | function  |     3 | `modules/dashboard/repo.ts:46`          | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `openFallbackWindowExists`    | function  |     7 | `modules/dashboard/repo.ts:50`          | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `checkedInWithLastCapture`    | function  |    51 | `modules/dashboard/repo.ts:66`          | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `checkedInCount`              | function  |     5 | `modules/dashboard/repo.ts:118`         | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `onShiftCount`                | function  |     5 | `modules/dashboard/repo.ts:124`         | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `registrationsByDevice`       | function  |    29 | `modules/dashboard/repo.ts:131`         | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `footfallByDevice`            | function  |    20 | `modules/dashboard/repo.ts:161`         | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `stampsAtStation`             | function  |     3 | `modules/dashboard/repo.ts:182`         | modules/dashboard/data/repo.ts                                                                           |
| modules/dashboard       | `dashboardRouter`             | const     |     1 | `modules/dashboard/router.ts:11`        | modules/dashboard/http/routes.ts + handlers.ts                                                           |
| modules/dashboard       | `getLiveDashboard`            | function  |    79 | `modules/dashboard/service.ts:52`       | modules/dashboard/application/getLiveDashboard.ts                                                        |
| modules/dashboard       | `getDataHealth`               | function  |    50 | `modules/dashboard/service.ts:140`      | modules/dataHealth/application/getDataHealth.ts                                                          |
| modules/dashboard       | `getStationDashboard`         | function  |    89 | `modules/dashboard/service.ts:198`      | modules/dashboard/application/getStationDashboard.ts                                                     |
| modules/dashboard       | `SILENT_STATION_MINUTES`      | re-export |     1 | `modules/dashboard/service.ts:288`      | delete (no production caller) (re-export; read the setting)                                              |
| modules/dashboard       | `STALE_DEVICE_MINUTES`        | re-export |     1 | `modules/dashboard/service.ts:288`      | delete (no production caller) (read the setting)                                                         |
| modules/devAuth         | `createDevAuthRouter`         | function  |    49 | `modules/devAuth/router.ts:20`          | modules/identity/http/devRoutes.ts                                                                       |
| modules/fallback        | `rangeOverlapsFallbackWindow` | function  |    25 | `modules/fallback/repo.ts:13`           | modules/fallback/index.ts (public: used by four capture modules)                                         |
| modules/fallback        | `fallbackRouter`              | const     |     1 | `modules/fallback/router.ts:30`         | modules/fallback/http/routes.ts + handlers.ts                                                            |
| modules/fallback        | `declareFallback`             | function  |    56 | `modules/fallback/service.ts:72`        | modules/fallback/application/declareFallback.ts                                                          |
| modules/fallback        | `closeFallback`               | function  |    47 | `modules/fallback/service.ts:129`       | modules/fallback/application/closeFallback.ts                                                            |
| modules/fallback        | `listFallbackWindows`         | function  |    14 | `modules/fallback/service.ts:177`       | modules/fallback/application/listFallbackWindows.ts                                                      |
| modules/fallback        | `importRegistrations`         | function  |    73 | `modules/fallback/service.ts:213`       | modules/fallback/application/importRegistrations.ts                                                      |
| modules/fallback        | `importFootfall`              | function  |    68 | `modules/fallback/service.ts:287`       | modules/fallback/application/importFootfall.ts                                                           |
| modules/footfall        | `toFootfallTickRecord`        | function  |    12 | `modules/footfall/repo.ts:13`           | modules/footfall/data/mappers.ts                                                                         |
| modules/footfall        | `createTick`                  | function  |     6 | `modules/footfall/repo.ts:26`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `findTickById`                | function  |     3 | `modules/footfall/repo.ts:33`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `voidTick`                    | function  |     3 | `modules/footfall/repo.ts:37`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `sumForStationSince`          | function  |     3 | `modules/footfall/repo.ts:46`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `sumForRecorderSince`         | function  |     7 | `modules/footfall/repo.ts:50`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `sumMatching`                 | function  |     3 | `modules/footfall/repo.ts:79`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `sumByBucket`                 | function  |    28 | `modules/footfall/repo.ts:91`           | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `liveStationStats`            | function  |    24 | `modules/footfall/repo.ts:125`          | modules/footfall/data/repo.ts                                                                            |
| modules/footfall        | `footfallRouter`              | const     |     1 | `modules/footfall/router.ts:31`         | modules/footfall/http/routes.ts + handlers.ts                                                            |
| modules/footfall        | `SILENT_STATION_MINUTES`      | const     |     1 | `modules/footfall/service.ts:52`        | read platform/settings (constant retired)                                                                |
| modules/footfall        | `recordTick`                  | function  |    44 | `modules/footfall/service.ts:58`        | modules/footfall/application/recordTick.ts                                                               |
| modules/footfall        | `recordBulk`                  | function  |    48 | `modules/footfall/service.ts:109`       | modules/footfall/application/recordBulk.ts                                                               |
| modules/footfall        | `voidTickById`                | function  |    21 | `modules/footfall/service.ts:158`       | modules/footfall/application/voidTickById.ts                                                             |
| modules/footfall        | `summariseFootfall`           | function  |    43 | `modules/footfall/service.ts:180`       | modules/footfall/application/summariseFootfall.ts                                                        |
| modules/footfall        | `getLiveFootfall`             | function  |    29 | `modules/footfall/service.ts:229`       | modules/footfall/application/getLiveFootfall.ts                                                          |
| modules/gift            | `toGiftTypeRecord`            | function  |    16 | `modules/gift/repo.ts:20`               | modules/gifts/data/mappers.ts                                                                            |
| modules/gift            | `listGiftTypes`               | function  |     6 | `modules/gift/repo.ts:37`               | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `findGiftType`                | function  |     6 | `modules/gift/repo.ts:44`               | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `giftTotals`                  | function  |    25 | `modules/gift/repo.ts:52`               | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `totalsForGiftType`           | function  |    11 | `modules/gift/repo.ts:78`               | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `createRedemption`            | function  |     6 | `modules/gift/repo.ts:90`               | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `createAdjustment`            | function  |     6 | `modules/gift/repo.ts:97`               | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `existingRedemptionForCard`   | function  |     9 | `modules/gift/repo.ts:105`              | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `summariseRedemptions`        | function  |    22 | `modules/gift/repo.ts:121`              | modules/gifts/data/repo.ts                                                                               |
| modules/gift            | `giftRouter`                  | const     |     1 | `modules/gift/router.ts:19`             | modules/gifts/http/routes.ts + handlers.ts                                                               |
| modules/gift            | `listGifts`                   | function  |     7 | `modules/gift/service.ts:40`            | modules/gifts/application/listGifts.ts                                                                   |
| modules/gift            | `redeemGift`                  | function  |   119 | `modules/gift/service.ts:48`            | modules/gifts/application/redeemGift.ts                                                                  |
| modules/gift            | `adjustStock`                 | function  |    31 | `modules/gift/service.ts:168`           | modules/gifts/application/adjustStock.ts                                                                 |
| modules/gift            | `summariseGifts`              | function  |    27 | `modules/gift/service.ts:200`           | modules/gifts/application/summariseGifts.ts                                                              |
| modules/health          | `healthRouter`                | const     |     1 | `modules/health/router.ts:12`           | platform/http/health.ts                                                                                  |
| modules/identity        | `identityProvider`            | const     |     4 | `modules/identity/provider.ts:156`      | platform/aws/cognito.ts behind modules/identity/index.ts                                                 |
| modules/incident        | `toIncidentRecord`            | function  |    32 | `modules/incident/repo.ts:20`           | modules/incidents/data/mappers.ts                                                                        |
| modules/incident        | `createIncident`              | function  |     6 | `modules/incident/repo.ts:53`           | modules/incidents/data/repo.ts                                                                           |
| modules/incident        | `findIncidentById`            | function  |     3 | `modules/incident/repo.ts:60`           | modules/incidents/data/repo.ts                                                                           |
| modules/incident        | `listIncidents`               | function  |    21 | `modules/incident/repo.ts:74`           | modules/incidents/data/repo.ts                                                                           |
| modules/incident        | `addFollowUp`                 | function  |     6 | `modules/incident/repo.ts:96`           | modules/incidents/data/repo.ts                                                                           |
| modules/incident        | `updateIncidentStatus`        | function  |     7 | `modules/incident/repo.ts:103`          | modules/incidents/data/repo.ts                                                                           |
| modules/incident        | `incidentRouter`              | const     |     1 | `modules/incident/router.ts:29`         | modules/incidents/http/routes.ts + handlers.ts                                                           |
| modules/incident        | `reportIncident`              | function  |    51 | `modules/incident/service.ts:32`        | modules/incidents/application/reportIncident.ts                                                          |
| modules/incident        | `getIncident`                 | function  |     5 | `modules/incident/service.ts:84`        | modules/incidents/application/getIncident.ts (no route yet; F02-015 gives it one)                        |
| modules/incident        | `listIncidentRecords`         | function  |    13 | `modules/incident/service.ts:90`        | modules/incidents/application/listIncidentRecords.ts                                                     |
| modules/incident        | `appendFollowUp`              | function  |    23 | `modules/incident/service.ts:104`       | modules/incidents/application/appendFollowUp.ts                                                          |
| modules/incident        | `changeIncidentStatus`        | function  |    28 | `modules/incident/service.ts:128`       | modules/incidents/application/changeIncidentStatus.ts                                                    |
| modules/lostFound       | `lostFoundRouter`             | const     |     1 | `modules/lostFound/router.ts:22`        | modules/lostFound/http/routes.ts + handlers.ts                                                           |
| modules/lostFound       | `logItem`                     | function  |    32 | `modules/lostFound/service.ts:66`       | modules/lostFound/application/logItem.ts                                                                 |
| modules/lostFound       | `listItems`                   | function  |    16 | `modules/lostFound/service.ts:99`       | modules/lostFound/application/listItems.ts                                                               |
| modules/lostFound       | `claimItem`                   | function  |    42 | `modules/lostFound/service.ts:116`      | modules/lostFound/application/claimItem.ts                                                               |
| modules/lostFound       | `markUnclaimedAtClose`        | function  |    20 | `modules/lostFound/service.ts:164`      | modules/lostFound/application/markUnclaimedAtClose.ts                                                    |
| modules/lostPerson      | `toAlertRecord`               | function  |    25 | `modules/lostPerson/repo.ts:14`         | modules/lostPersons/data/mappers.ts                                                                      |
| modules/lostPerson      | `createAlert`                 | function  |     6 | `modules/lostPerson/repo.ts:40`         | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `findAlertById`               | function  |     3 | `modules/lostPerson/repo.ts:47`         | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `listActiveAlerts`            | function  |     7 | `modules/lostPerson/repo.ts:51`         | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `acknowledgedAlertIds`        | function  |    13 | `modules/lostPerson/repo.ts:60`         | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `acknowledgeAlert`            | function  |     7 | `modules/lostPerson/repo.ts:79`         | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `resolveAlert`                | function  |    11 | `modules/lostPerson/repo.ts:87`         | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `findPurgeCandidates`         | function  |    10 | `modules/lostPerson/repo.ts:100`        | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `purgeAlert`                  | function  |    33 | `modules/lostPerson/repo.ts:111`        | modules/lostPersons/data/repo.ts                                                                         |
| modules/lostPerson      | `lostPersonRouter`            | const     |     1 | `modules/lostPerson/router.ts:13`       | modules/lostPersons/http/routes.ts + handlers.ts                                                         |
| modules/lostPerson      | `PURGE_AFTER_HOURS`           | const     |     1 | `modules/lostPerson/service.ts:53`      | read platform/settings (constant retired)                                                                |
| modules/lostPerson      | `raiseAlert`                  | function  |    34 | `modules/lostPerson/service.ts:55`      | modules/lostPersons/application/raiseAlert.ts                                                            |
| modules/lostPerson      | `getActiveAlerts`             | function  |    21 | `modules/lostPerson/service.ts:94`      | modules/lostPersons/application/getActiveAlerts.ts                                                       |
| modules/lostPerson      | `acknowledge`                 | function  |    14 | `modules/lostPerson/service.ts:120`     | modules/lostPersons/application/acknowledge.ts                                                           |
| modules/lostPerson      | `resolve`                     | function  |    41 | `modules/lostPerson/service.ts:136`     | modules/lostPersons/application/resolve.ts                                                               |
| modules/lostPerson      | `purgeResolvedAlerts`         | function  |    40 | `modules/lostPerson/service.ts:185`     | modules/lostPersons/jobs.ts                                                                              |
| modules/me              | `findVolunteerById`           | function  |    14 | `modules/me/repo.ts:15`                 | modules/people/data/repo.ts                                                                              |
| modules/me              | `listAssignmentsForVolunteer` | function  |     9 | `modules/me/repo.ts:31`                 | modules/assignments/data/repo.ts                                                                         |
| modules/me              | `findAssignmentById`          | function  |     3 | `modules/me/repo.ts:41`                 | modules/assignments/data/repo.ts                                                                         |
| modules/me              | `setAssignmentCheckIn`        | function  |     7 | `modules/me/repo.ts:45`                 | delete (no production caller)                                                                            |
| modules/me              | `setAssignmentCheckOut`       | function  |     7 | `modules/me/repo.ts:53`                 | delete (no production caller)                                                                            |
| modules/me              | `buildEscalationChain`        | function  |    44 | `modules/me/repo.ts:66`                 | modules/people/application/escalationChain.ts (walk) + data/repo.ts (one query)                          |
| modules/me              | `meRouter`                    | const     |     1 | `modules/me/router.ts:10`               | modules/people/http/routes.ts + handlers.ts                                                              |
| modules/me              | `getMe`                       | function  |    37 | `modules/me/service.ts:24`              | modules/people/application/getMe.ts                                                                      |
| modules/me              | `toMyAssignment`              | function  |    13 | `modules/me/service.ts:62`              | modules/assignments/data/mappers.ts                                                                      |
| modules/me              | `checkIn`                     | function  |    52 | `modules/me/service.ts:80`              | modules/assignments/application/checkIn.ts                                                               |
| modules/me              | `checkOut`                    | function  |    35 | `modules/me/service.ts:133`             | modules/assignments/application/checkOut.ts                                                              |
| modules/me              | `setAssignmentCheckIn`        | re-export |     1 | `modules/me/service.ts:188`             | delete (no production caller) (re-export)                                                                |
| modules/me              | `setAssignmentCheckOut`       | re-export |     1 | `modules/me/service.ts:188`             | delete (no production caller) (re-export)                                                                |
| modules/media           | `mediaRouter`                 | const     |     1 | `modules/media/router.ts:17`            | modules/media/http/routes.ts + handlers.ts                                                               |
| modules/media           | `mediaEnabled`                | function  |     3 | `modules/media/service.ts:47`           | modules/media/application/mediaEnabled.ts                                                                |
| modules/media           | `createUpload`                | function  |    34 | `modules/media/service.ts:92`           | modules/media/application/createUpload.ts                                                                |
| modules/media           | `readUrl`                     | function  |    14 | `modules/media/service.ts:134`          | modules/media/application/readUrl.ts                                                                     |
| modules/missionCard     | `toMissionCardRecord`         | function  |    28 | `modules/missionCard/repo.ts:17`        | modules/missionCards/data/mappers.ts                                                                     |
| modules/missionCard     | `findCardByShortCode`         | function  |     6 | `modules/missionCard/repo.ts:46`        | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `findCardById`                | function  |     6 | `modules/missionCard/repo.ts:53`        | delete (no production caller)                                                                            |
| modules/missionCard     | `createCardBatch`             | function  |     9 | `modules/missionCard/repo.ts:60`        | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `updateCard`                  | function  |     7 | `modules/missionCard/repo.ts:70`        | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `createStamp`                 | function  |     6 | `modules/missionCard/repo.ts:78`        | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `countStampsForCard`          | function  |     6 | `modules/missionCard/repo.ts:85`        | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `countIssued`                 | function  |     3 | `modules/missionCard/repo.ts:111`       | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `countByStatus`               | function  |     6 | `modules/missionCard/repo.ts:115`       | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `countVoided`                 | function  |     3 | `modules/missionCard/repo.ts:122`       | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `countCardsPerStation`        | function  |    12 | `modules/missionCard/repo.ts:134`       | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `countRedeemedCards`          | function  |    13 | `modules/missionCard/repo.ts:147`       | modules/missionCards/data/repo.ts                                                                        |
| modules/missionCard     | `missionCardRouter`           | const     |     1 | `modules/missionCard/router.ts:38`      | modules/missionCards/http/routes.ts + handlers.ts                                                        |
| modules/missionCard     | `getCard`                     | function  |     6 | `modules/missionCard/service.ts:51`     | modules/missionCards/application/getCard.ts                                                              |
| modules/missionCard     | `issueCard`                   | function  |    51 | `modules/missionCard/service.ts:65`     | modules/missionCards/application/issueCard.ts                                                            |
| modules/missionCard     | `stampCard`                   | function  |    90 | `modules/missionCard/service.ts:125`    | modules/missionCards/application/stampCard.ts                                                            |
| modules/missionCard     | `voidCard`                    | function  |    29 | `modules/missionCard/service.ts:216`    | modules/missionCards/application/voidCard.ts                                                             |
| modules/missionCard     | `reissueCard`                 | function  |    81 | `modules/missionCard/service.ts:254`    | modules/missionCards/application/reissueCard.ts                                                          |
| modules/missionCard     | `generateBatch`               | function  |    33 | `modules/missionCard/service.ts:344`    | modules/missionCards/application/generateBatch.ts                                                        |
| modules/missionCard     | `getFunnel`                   | function  |    45 | `modules/missionCard/service.ts:383`    | modules/missionCards/application/getFunnel.ts                                                            |
| modules/missionCard     | `toRecord`                    | function  |     3 | `modules/missionCard/service.ts:430`    | modules/missionCards/data/mappers.ts                                                                     |
| modules/notification    | `notificationRouter`          | const     |     1 | `modules/notification/router.ts:17`     | modules/notifications/http/routes.ts + handlers.ts                                                       |
| modules/notification    | `pushEnabled`                 | function  |     3 | `modules/notification/service.ts:57`    | modules/notifications/application/pushEnabled.ts                                                         |
| modules/notification    | `pushPublicKey`               | function  |     3 | `modules/notification/service.ts:61`    | modules/notifications/application/pushPublicKey.ts                                                       |
| modules/notification    | `dispatch`                    | function  |    96 | `modules/notification/service.ts:146`   | modules/notifications/application/dispatch.ts                                                            |
| modules/notification    | `subscribeDevice`             | function  |    29 | `modules/notification/service.ts:251`   | modules/notifications/application/subscribeDevice.ts                                                     |
| modules/notification    | `unsubscribeDevice`           | function  |     6 | `modules/notification/service.ts:282`   | modules/notifications/application/unsubscribeDevice.ts                                                   |
| modules/registration    | `toRegistrationRecord`        | function  |    13 | `modules/registration/repo.ts:15`       | modules/registration/data/mappers.ts                                                                     |
| modules/registration    | `createRegistration`          | function  |     6 | `modules/registration/repo.ts:29`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `createRegistrationsForGroup` | function  |     8 | `modules/registration/repo.ts:36`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `findRegistrationById`        | function  |     3 | `modules/registration/repo.ts:45`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `voidRegistration`            | function  |    10 | `modules/registration/repo.ts:49`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `countForStationSince`        | function  |     5 | `modules/registration/repo.ts:61`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `countForRecorderSince`       | function  |     9 | `modules/registration/repo.ts:68`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `groupByCategory`             | function  |    11 | `modules/registration/repo.ts:99`       | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `groupByTimeBucket`           | function  |    31 | `modules/registration/repo.ts:117`      | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `countMatching`               | function  |     3 | `modules/registration/repo.ts:149`      | modules/registration/data/repo.ts                                                                        |
| modules/registration    | `registrationRouter`          | const     |     1 | `modules/registration/router.ts:30`     | modules/registration/http/routes.ts + handlers.ts                                                        |
| modules/registration    | `recordRegistration`          | function  |    47 | `modules/registration/service.ts:44`    | modules/registration/application/recordRegistration.ts                                                   |
| modules/registration    | `recordGroupRegistration`     | function  |    79 | `modules/registration/service.ts:100`   | modules/registration/application/recordGroupRegistration.ts                                              |
| modules/registration    | `voidRegistrationById`        | function  |    25 | `modules/registration/service.ts:185`   | modules/registration/application/voidRegistrationById.ts                                                 |
| modules/registration    | `summariseRegistrations`      | function  |    32 | `modules/registration/service.ts:211`   | modules/registration/application/summariseRegistrations.ts                                               |
| modules/report          | `toXlsx`                      | function  |    17 | `modules/report/export.ts:45`           | modules/reports/application/export/xlsx/ (one file per sheet)                                            |
| modules/report          | `toCsv`                       | function  |    80 | `modules/report/export.ts:352`          | modules/reports/application/export/csv.ts                                                                |
| modules/report          | `registrationTotals`          | function  |    23 | `modules/report/repo.ts:21`             | modules/reports/data/repo.ts                                                                             |
| modules/report          | `registrationsByDay`          | function  |    14 | `modules/report/repo.ts:52`             | modules/reports/data/repo.ts                                                                             |
| modules/report          | `registrationsByHour`         | function  |    18 | `modules/report/repo.ts:67`             | modules/reports/data/repo.ts                                                                             |
| modules/report          | `footfallTotals`              | function  |     7 | `modules/report/repo.ts:86`             | modules/reports/data/repo.ts                                                                             |
| modules/report          | `footfallBySource`            | function  |     9 | `modules/report/repo.ts:94`             | modules/reports/data/repo.ts                                                                             |
| modules/report          | `footfallCurve`               | function  |    19 | `modules/report/repo.ts:105`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `cardTotals`                  | function  |    15 | `modules/report/repo.ts:125`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `cardsByDay`                  | function  |    21 | `modules/report/repo.ts:149`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `cardsPerStation`             | function  |     9 | `modules/report/repo.ts:171`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `giftRedemptionsByDay`        | function  |    13 | `modules/report/repo.ts:181`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `giftRedemptionsByStation`    | function  |     9 | `modules/report/repo.ts:195`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `incidentsInRange`            | function  |    10 | `modules/report/repo.ts:205`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `lostPersonSummaries`         | function  |     6 | `modules/report/repo.ts:223`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `unpurgedLostPersonCount`     | function  |    16 | `modules/report/repo.ts:237`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `lostFoundCounts`             | function  |    15 | `modules/report/repo.ts:254`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `volunteerAttendance`         | function  |    12 | `modules/report/repo.ts:270`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `importBatches`               | function  |     6 | `modules/report/repo.ts:283`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `recordsBySource`             | function  |    47 | `modules/report/repo.ts:291`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `voidedCounts`                | function  |    19 | `modules/report/repo.ts:339`            | modules/reports/data/repo.ts                                                                             |
| modules/report          | `reportRouter`                | const     |     1 | `modules/report/router.ts:11`           | modules/reports/http/routes.ts + handlers.ts                                                             |
| modules/report          | `generateReport`              | function  |   128 | `modules/report/service.ts:68`          | modules/reports/application/generateReport.ts                                                            |
| modules/roster          | `toVolunteerRecord`           | function  |    13 | `modules/roster/repo.ts:14`             | modules/people/data/mappers.ts                                                                           |
| modules/roster          | `findVolunteerByEmail`        | function  |     6 | `modules/roster/repo.ts:28`             | modules/people/data/repo.ts                                                                              |
| modules/roster          | `upsertVolunteer`             | function  |    43 | `modules/roster/repo.ts:35`             | modules/people/data/repo.ts                                                                              |
| modules/roster          | `toAssignmentRecord`          | function  |    16 | `modules/roster/repo.ts:89`             | modules/assignments/data/mappers.ts                                                                      |
| modules/roster          | `listAssignmentsForStation`   | function  |    10 | `modules/roster/repo.ts:106`            | modules/assignments/data/repo.ts                                                                         |
| modules/roster          | `upsertAssignment`            | function  |    32 | `modules/roster/repo.ts:122`            | modules/assignments/data/repo.ts                                                                         |
| modules/roster          | `findEventDayByDate`          | function  |     6 | `modules/roster/repo.ts:155`            | modules/assignments/data/repo.ts                                                                         |
| modules/roster          | `findStationByCodeTx`         | function  |     6 | `modules/roster/repo.ts:162`            | modules/assignments/data/repo.ts                                                                         |
| modules/roster          | `rosterRouter`                | const     |     1 | `modules/roster/router.ts:18`           | split: people/http (POST /volunteers), assignments/http (import, station roster, GET /me alias)          |
| modules/roster          | `provisionVolunteer`          | function  |    56 | `modules/roster/service.ts:34`          | modules/people/application/provisionPerson.ts                                                            |
| modules/roster          | `importRoster`                | function  |   159 | `modules/roster/service.ts:101`         | modules/assignments/application/importRoster/ (planImport.ts + applyImport.ts)                           |
| modules/roster          | `getStationRoster`            | function  |    10 | `modules/roster/service.ts:269`         | modules/assignments/application/getStationRoster.ts                                                      |
| modules/shift           | `toSwapRecord`                | function  |    18 | `modules/shift/repo.ts:18`              | modules/swaps/data/mappers.ts                                                                            |
| modules/shift           | `createSwap`                  | function  |     6 | `modules/shift/repo.ts:37`              | modules/swaps/data/repo.ts                                                                               |
| modules/shift           | `findSwapById`                | function  |     6 | `modules/shift/repo.ts:44`              | modules/swaps/data/repo.ts                                                                               |
| modules/shift           | `listSwaps`                   | function  |    15 | `modules/shift/repo.ts:51`              | modules/swaps/data/repo.ts                                                                               |
| modules/shift           | `applySwap`                   | function  |    17 | `modules/shift/repo.ts:67`              | modules/swaps/data/repo.ts                                                                               |
| modules/shift           | `rejectSwap`                  | function  |    10 | `modules/shift/repo.ts:85`              | modules/swaps/data/repo.ts                                                                               |
| modules/shift           | `hasAssignmentInBlock`        | function  |    14 | `modules/shift/repo.ts:97`              | modules/swaps/data/repo.ts                                                                               |
| modules/shift           | `toBriefingSlotRecord`        | function  |    23 | `modules/shift/repo.ts:119`             | modules/briefings/data/mappers.ts                                                                        |
| modules/shift           | `listBriefingSlots`           | function  |    13 | `modules/shift/repo.ts:143`             | modules/briefings/data/repo.ts                                                                           |
| modules/shift           | `findSlotById`                | function  |     3 | `modules/shift/repo.ts:157`             | modules/briefings/data/repo.ts                                                                           |
| modules/shift           | `completeSlot`                | function  |    10 | `modules/shift/repo.ts:161`             | modules/briefings/data/repo.ts                                                                           |
| modules/shift           | `staffingByStation`           | function  |    50 | `modules/shift/repo.ts:177`             | modules/assignments/data/repo.ts                                                                         |
| modules/shift           | `longRunningShifts`           | function  |    11 | `modules/shift/repo.ts:233`             | modules/assignments/data/repo.ts                                                                         |
| modules/shift           | `shiftRouter`                 | const     |     1 | `modules/shift/router.ts:36`            | split: swaps/http, briefings/http, assignments/http (gaps)                                               |
| modules/shift           | `LONG_SHIFT_MINUTES`          | const     |     1 | `modules/shift/service.ts:48`           | delete (no production caller) (read the setting)                                                         |
| modules/shift           | `requestSwap`                 | function  |    65 | `modules/shift/service.ts:50`           | modules/swaps/application/requestSwap.ts                                                                 |
| modules/shift           | `decideSwap`                  | function  |    60 | `modules/shift/service.ts:121`          | modules/swaps/application/decideSwap.ts                                                                  |
| modules/shift           | `listMySwaps`                 | function  |     3 | `modules/shift/service.ts:182`          | modules/swaps/application/listMySwaps.ts                                                                 |
| modules/shift           | `listPendingSwaps`            | function  |     3 | `modules/shift/service.ts:186`          | modules/swaps/application/listPendingSwaps.ts                                                            |
| modules/shift           | `getBriefingSlots`            | function  |    13 | `modules/shift/service.ts:190`          | modules/briefings/application/listBriefingSlots.ts                                                       |
| modules/shift           | `markSlotComplete`            | function  |    40 | `modules/shift/service.ts:204`          | modules/briefings/application/completeBriefingSlot.ts                                                    |
| modules/shift           | `getStaffingGaps`             | function  |    47 | `modules/shift/service.ts:252`          | modules/assignments/application/getStaffingGaps.ts                                                       |
| modules/shift           | `getLongShifts`               | function  |    33 | `modules/shift/service.ts:300`          | modules/assignments/application/getLongShifts.ts                                                         |
| modules/station         | `toStationSummary`            | function  |    14 | `modules/station/repo.ts:7`             | modules/stations/data/mappers.ts                                                                         |
| modules/station         | `listStations`                | function  |     8 | `modules/station/repo.ts:22`            | modules/stations/data/repo.ts                                                                            |
| modules/station         | `findStationById`             | function  |     3 | `modules/station/repo.ts:31`            | modules/stations/data/repo.ts                                                                            |
| modules/station         | `findStationByCode`           | function  |     3 | `modules/station/repo.ts:35`            | delete (no production caller)                                                                            |
| modules/station         | `listStampingStations`        | function  |     6 | `modules/station/repo.ts:40`            | modules/stations/data/repo.ts                                                                            |
| modules/station         | `listCountedStations`         | function  |     6 | `modules/station/repo.ts:48`            | modules/stations/data/repo.ts                                                                            |
| modules/station         | `stationRouter`               | const     |     1 | `modules/station/router.ts:10`          | modules/stations/http/routes.ts + handlers.ts                                                            |
| modules/station         | `getActiveStations`           | function  |     4 | `modules/station/service.ts:6`          | modules/stations/application/getActiveStations.ts                                                        |
| modules/station         | `requireActiveStation`        | function  |    14 | `modules/station/service.ts:18`         | modules/stations/application/requireActiveStation.ts                                                     |
| modules/station         | `requireCountedStation`       | function  |    13 | `modules/station/service.ts:38`         | modules/stations/application/requireCountedStation.ts                                                    |
| routes                  | `apiRouter`                   | const     |     1 | `routes.ts:33`                          | app/routes.ts                                                                                            |

<!-- module-map:end -->

## Appendix B — Refactor backlog, one row per flagged function

Generated by `node remediation/reports/P03/backlog.mjs` into `reports/P03/backlog.md`; copied here
unchanged. Paths in "Proposed split" are relative to `server/src` or `client/src`.

<!-- backlog:start -->

| Lines | Now                                                      | Function                                 | Responsibilities it holds                                                                                                              | Proposed split (new names → target files)                                                                                                                                                                                                                                                             | Risk | Existing coverage                      |
| ----: | -------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: | -------------------------------------- |
|   269 | `client:app/reports/page.tsx:35`                         | `ReportsPage`                            | report query; export download (fetch + blob + filename); 9 report sections rendered inline                                             | client:features/reports/{api.ts: getReport, downloadExport; queries.ts: useReport; screens/ReportScreen.tsx; components/{ReportHeader, RegistrationSection, FootfallSection, CardSection, GiftSection, SafetySection, VolunteerSection, IntegritySection, ExportButton}.tsx}; model/exportFileName.ts |  M   | 0% lines                               |
|   237 | `client:app/admin/settings/page.tsx:151`                 | `AdminSettingsPage`                      | load settings; five form-state groups; shift-row validation; save + invalidate; overridden-key display                                 | client:features/settings/{api.ts, queries.ts: useSettings, useSaveSettings; screens/SettingsScreen.tsx; components/{EventNameField, ShiftBlocksForm, ThresholdsForm, PollingForm, CaptureForm}.tsx; model/validateShiftBlocks.ts} + shared form hook (P03.3)                                          |  M   | 0% lines; e2e: admin                   |
|   237 | `client:app/chief/imports/page.tsx:52`                   | `ImportsPage`                            | target/source choice; CSV text and file input; CSV parsing; dry-run preview; commit; result table                                      | client:features/fallback/{api.ts: importRows; model/parseImportCsv.ts (pure, unit-tested); screens/ImportScreen.tsx; components/{ImportSourceForm, ImportPreview, ImportResult}.tsx; queries.ts: useImportPreview, useImportCommit}                                                                   |  H   | 0% lines                               |
|   222 | `client:app/attendance/page.tsx:19`                      | `AttendancePage`                         | status query; root start; issue/rotate verifier code; QR scan; PIN entry; submit; confirmation                                         | client:features/attendance/{api.ts; queries.ts: useAttendanceStatus, useStartAttendance, useIssueChallenge, useSubmitAttendance; screens/AttendanceScreen.tsx; components/{RootStart, VerifierPanel, ProofEntry (scan + PIN), PresenceConfirmed}.tsx}                                                 |  H   | 0% lines; e2e: attendance              |
|   202 | `client:app/capture/registration/group/page.tsx:35`      | `GroupRegistrationPage`                  | per-category stepper state; card code entry; validation; outbox enqueue; navigation back                                               | client:features/registration/{screens/GroupRegistrationScreen.tsx; components/{CategorySteppers, GroupCardCode, GroupSubmitBar}.tsx; model/{groupMembers.ts, validateGroup.ts}}; enqueue through features/capture                                                                                     |  H   | 0% lines                               |
|   185 | `client:app/ic/page.tsx:35`                              | `IcConsolePage`                          | station picker; station dashboard stats; category bars; roster ("who is here", F02-011); pending swaps query + SwapQueue               | client:features/dashboard/{screens/IcConsoleScreen.tsx; components/{StationPicker, StationStats, WhoIsHere (keyed by assignment, F02-011), CategoryBars}.tsx}; features/swaps/components/SwapQueue.tsx + queries.ts: usePendingSwaps, useDecideSwap                                                   |  M   | 0% lines                               |
|   181 | `client:app/safety/lost-found/new/page.tsx:23`           | `NewLostFoundPage`                       | form state and validation; photo upload; submit; navigation                                                                            | client:features/lostFound/{screens/NewLostFoundScreen.tsx; components/{LostFoundForm, PhotoField}.tsx; queries.ts: useLogItem} + shared form hook                                                                                                                                                     |  L   | 0% lines                               |
|   180 | `client:app/capture/redeem/page.tsx:33`                  | `RedeemPage`                             | gift list query; gift choice; QR scan + card code; redeem with duplicate-card confirm; result message                                  | client:features/gifts/{screens/RedeemScreen.tsx; components/{GiftPicker, RedeemCardEntry, RedeemResult}.tsx; queries.ts: useGifts, useRedeemGift; model/redeemMessage.ts}                                                                                                                             |  H   | 0% lines                               |
|   180 | `client:app/chief/fallback/page.tsx:36`                  | `FallbackPage`                           | windows query; stations query; declare form; close action; window list                                                                 | client:features/fallback/{screens/FallbackScreen.tsx; components/{DeclareFallbackForm, FallbackWindowList}.tsx; queries.ts: useFallbackWindows, useDeclareFallback, useCloseFallback}                                                                                                                 |  M   | 0% lines                               |
|   180 | `client:app/chief/page.tsx:62`                           | `DashboardBody`                          | renders every dashboard panel inline: attention, registrations, footfall, cards, gifts, staffing, safety                               | client:features/dashboard/components/{AttentionPanel, RegistrationPanel, FootfallPanel, CardFunnelPanel, GiftPanel, StaffingPanel, SafetyPanel}.tsx; DashboardBody composes them                                                                                                                      |  M   | 0% lines                               |
|   159 | `server:modules/roster/service.ts:101`                   | `importRoster`                           | identity lookup and minting; volunteer upserts; manager links; assignment validation and upserts; dry run by rollback; counters; audit | server:modules/assignments/application/importRoster/{planRosterImport.ts (pure: rows → plan + issues), mintIdentities.ts, applyRosterImport.ts (tx), importRoster.ts (orchestrates; no dryRun flag, §1)}; people/domain/escalation.ts guards roles (F03-001)                                          |  H   | 55.4% lines                            |
|   147 | `client:app/admin/users/page.tsx:276`                    | `VolunteerEditor`                        | role/phone/portfolio edit form; deactivate with reason; reactivate; three mutations                                                    | client:features/people/components/{PersonEditForm, DeactivatePerson, ReactivatePerson}.tsx; queries.ts keeps the three mutations                                                                                                                                                                      |  M   | 0% lines; e2e: admin                   |
|   144 | `client:app/safety/incident/new/page.tsx:41`             | `NewIncidentPage`                        | type/severity/location/time form; validation; idempotent submit; navigation                                                            | client:features/incidents/{screens/ReportIncidentScreen.tsx; components/IncidentForm.tsx; model/incidentFormSchema.ts; queries.ts: useReportIncident}                                                                                                                                                 |  M   | 0% lines                               |
|   144 | `client:app/safety/lost-found/page.tsx:35`               | `LostFoundPage`                          | search debounce; held-only filter; list query; claim mutation; item cards                                                              | client:features/lostFound/{screens/LostFoundScreen.tsx; components/{LostFoundFilters, LostFoundItemCard}.tsx; queries.ts: useLostFoundItems, useClaimItem}; shared/hooks/useDebouncedValue.ts                                                                                                         |  L   | 0% lines                               |
|   139 | `client:app/safety/lost-person/new/page.tsx:24`          | `RaiseLostPersonPage`                    | description/age/clothing form; validation; submit; navigation                                                                          | client:features/lostPersons/{screens/RaiseAlertScreen.tsx; components/RaiseAlertForm.tsx; queries.ts: useRaiseAlert}                                                                                                                                                                                  |  M   | 0% lines                               |
|   139 | `client:app/tv/page.tsx:25`                              | `TvPage`                                 | live dashboard poll; wake lock; visibility handling; four TV panels                                                                    | client:features/dashboard/{screens/TvScreen.tsx; components/{TvRegistrations, TvFootfall, TvCards, TvSafety}.tsx}; shared/hooks/useWakeLockWhileVisible.ts                                                                                                                                            |  L   | 0% lines                               |
|   137 | `client:app/admin/users/page.tsx:47`                     | `AdminUsersPage`                         | filters and search state; volunteer list query; editing selection; list rendering                                                      | client:features/people/{screens/PeopleScreen.tsx; components/{PeopleFilters, PeopleList}.tsx; queries.ts: usePeople}                                                                                                                                                                                  |  M   | 0% lines; e2e: admin                   |
|   128 | `server:modules/report/service.ts:68`                    | `generateReport`                         | resolves the range; runs 23 queries; shapes every report section                                                                       | server:modules/reports/application/{generateReport.ts (orchestrates), sections/{registrations, footfall, cards, gifts, safety, volunteers, integrity}.ts each: query + shape}                                                                                                                         |  M   | 83.63% lines                           |
|   123 | `client:app/inbox/page.tsx:127`                          | `Composer`                               | composer form (body, audience, station, ack); stations query; send mutation; error display                                             | client:features/announcements/{components/{AnnouncementComposer, AudiencePicker}.tsx; queries.ts: useSendAnnouncement}; stations via features/stations/queries.ts                                                                                                                                     |  M   | 0% lines                               |
|   122 | `client:app/capture/stamp/page.tsx:27`                   | `StampCapturePage`                       | QR scan; card code entry; stamp request; card summary; wake lock; messages                                                             | client:features/missionCards/{screens/StampScreen.tsx; components/{StampCardEntry, StampResult}.tsx; queries.ts: useStampCard}                                                                                                                                                                        |  H   | 0% lines                               |
|   119 | `server:modules/gift/service.ts:48`                      | `redeemGift`                             | station check; stock check; card lookup and duplicate rules; redemption insert; audit; totals; low-stock push                          | server:modules/gifts/{domain/{remainingStock.ts, cardRedemptionWarning.ts}; application/redeemGift.ts (tx + audit); application/notifyLowStock.ts}; card lookup via missionCards/index.ts                                                                                                             |  H   | 84.9% lines                            |
|   118 | `client:app/capture/registration/page.tsx:34`            | `RegistrationCapturePage`                | category buttons; capture + undo; session and booth totals query; wake lock; sync indicator                                            | client:features/registration/{screens/RegistrationScreen.tsx; components/{CategoryButtons, CaptureTotals, UndoBar}.tsx; queries.ts: useRegistrationSummary}                                                                                                                                           |  H   | 0% lines; e2e: capture, a11y           |
|   117 | `client:app/shift/page.tsx:29`                           | `ShiftPage`                              | assignment list; outbox entries (parked captures) with copy/flush; alert delivery card                                                 | client:features/assignments/{screens/MyShiftScreen.tsx; components/MyAssignments.tsx}; features/capture/components/ParkedCaptures.tsx; AlertDelivery stays                                                                                                                                            |  M   | 0% lines                               |
|   117 | `client:components/ShiftOverview.tsx:23`                 | `ShiftCard`                              | current shift card; attendance status query; check-in and check-out mutations with confirm                                             | client:features/assignments/components/{CurrentShiftCard, CheckInButton, CheckOutButton}.tsx; queries.ts: useCheckIn, useCheckOut                                                                                                                                                                     |  H   | 0% lines; e2e: navigation              |
|   116 | `client:features/notification/usePushRegistration.ts:66` | `usePushRegistration`                    | support detection; config fetch; permission request; subscribe/unsubscribe; key decoding; state machine                                | client:features/notifications/{model/{pushSupport.ts, decodeVapidKey.ts}; api.ts; hooks/{usePushConfig, usePushSubscription}.ts}                                                                                                                                                                      |  M   | 0% lines                               |
|   115 | `server:modules/auth/service.ts:132`                     | `rotateSession`                          | token lookup; reuse detection and family revocation + audit; expiry and active checks; rotation tx; access-token issue; response shape | server:modules/identity/{application/rotateSession.ts; domain/refreshDecision.ts (pure: live/rotated-within-grace/reused/expired, F02-032); data/sessionRepo.ts: rotate (conditional update), revokeFamily; application/toSessionResponse.ts}                                                         |  H   | 83.87% lines                           |
|   115 | `client:app/capture/footfall/page.tsx:28`                | `FootfallCapturePage`                    | counter button; capture + undo; idle timer; wake lock; sync indicator                                                                  | client:features/footfall/{screens/CounterScreen.tsx; components/{CounterButton, UndoBar}.tsx}; shared/hooks/useIdleTimer.ts                                                                                                                                                                           |  H   | 0% lines; e2e: capture, a11y           |
|   112 | `server:config/env.ts:165`                               | callback of z .object({ NODE_ENV: z.enum | one zod object for 34 keys plus cross-field refinements                                                                                | server:config/{database.ts, http.ts, auth.ts, aws.ts, attendance.ts, observability.ts} each a schema; config/index.ts merges (P01.4 split)                                                                                                                                                            |  M   | 58.82% lines                           |
|   111 | `client:components/LostPersonBanner.tsx:35`              | `LostPersonBanner`                       | active alerts query; per-alert card with ack and resolve; layout of the stack (F02-016)                                                | client:features/lostPersons/components/{LostPersonBanner (list + collapse), LostPersonAlertCard, AlertActions}.tsx                                                                                                                                                                                    |  H   | 0% lines; e2e: capture (second device) |
|   110 | `client:components/ui/Choice.tsx:34`                     | `ChoiceGroup`                            | radio-group semantics, keyboard handling and option rendering in one component                                                         | client:shared/ui/Choice/{ChoiceGroup.tsx, ChoiceOption.tsx, useRovingFocus.ts}                                                                                                                                                                                                                        |  L   | 0% lines                               |
|   102 | `client:components/AppShell.tsx:56`                      | `AppShell`                               | layout; header; section nav; banners; skip link; path → section mapping                                                                | client:shared/ui/AppShell/{AppShell.tsx, AppHeader.tsx, SkipLink.tsx}; navigation/registry.ts owns sectionForPath                                                                                                                                                                                     |  M   | 0% lines; e2e: navigation              |
|   101 | `client:components/CardCodeInput.tsx:23`                 | `CardCodeInput`                          | input state; paste handling; normalisation; validation; submit                                                                         | client:features/missionCards/{components/CardCodeInput.tsx; model/normaliseCardCode.ts (mirrors the server, F03-020)}                                                                                                                                                                                 |  M   | 0% lines                               |
|    96 | `server:modules/notification/service.ts:146`             | `dispatch`                               | audience resolution; subscription lookup; payload build; send; prune dead endpoints; counters and logs                                 | server:modules/notifications/{application/dispatch.ts; domain/buildPayload.ts; data/audienceRepo.ts: resolveAudience; application/sendToDevices.ts; data/subscriptionRepo.ts: pruneGone}                                                                                                              |  M   | 41.07% lines                           |
|    96 | `client:features/attendance/VerifierCode.tsx:8`          | `VerifierCode`                           | countdown timer; copy to clipboard; QR and PIN display                                                                                 | client:features/attendance/{components/{VerifierQr, VerifierPin}.tsx; hooks/useCountdown.ts}                                                                                                                                                                                                          |  L   | 0% lines; e2e: attendance              |
|    94 | `server:modules/roster/service.ts:136`                   | `apply`                                  | inner apply of importRoster                                                                                                            | resolved by the importRoster split (applyRosterImport.ts)                                                                                                                                                                                                                                             |  H   | 55.4% lines                            |
|    91 | `client:features/media/usePhotoUpload.ts:46`             | `usePhotoUpload`                         | media config query; presign; S3 POST; preview URL lifecycle; error state                                                               | client:features/media/{api.ts: getMediaConfig, presignUpload, postToS3; hooks/usePhotoUpload.ts (orchestrates); model/previewUrl.ts}                                                                                                                                                                  |  L   | 0% lines                               |
|    90 | `server:modules/missionCard/service.ts:125`              | `stampCard`                              | station checks; card lookup; duplicate stamp; issue on first stamp; stamp insert; completion; audit                                    | server:modules/missionCards/{domain/{stampOutcome.ts, isComplete.ts}; application/stampCard.ts; data/repo.ts: insertStampOnce (ON CONFLICT, F03-008)}                                                                                                                                                 |  H   | 93.75% lines                           |
|    89 | `server:modules/admin/service.ts:231`                    | `updateVolunteer`                        | escalation checks; manager check and cycle walk; update + audit; session revoke; Cognito group sync; cache invalidation                | server:modules/people/{domain/escalation.ts: assertCanChange; application/{updatePerson.ts, assertNoReportingCycle.ts, syncIdentityRole.ts}}; sessions via identity/index.ts                                                                                                                          |  M   | 66.66% lines                           |
|    89 | `server:modules/dashboard/service.ts:198`                | `getStationDashboard`                    | station lookup; five queries; per-device rate anomaly; roster and category shaping                                                     | server:modules/dashboard/{application/getStationDashboard.ts; domain/deviceRate.ts (anomaly rule); data/stationDashboardRepo.ts}                                                                                                                                                                      |  M   | 90% lines                              |
|    88 | `server:modules/gift/service.ts:56`                      | callback of prisma.$transaction          | transaction callback inside redeemGift                                                                                                 | resolved by the redeemGift split                                                                                                                                                                                                                                                                      |  H   | 84.9% lines                            |
|    86 | `client:components/GlobalNav.tsx:29`                     | `GlobalNav`                              | nav items per role; active state; sign out                                                                                             | client:navigation/{registry.ts, GlobalNav.tsx, SignOutButton.tsx}                                                                                                                                                                                                                                     |  L   | 0% lines; e2e: navigation              |
|    83 | `server:modules/attendance/service.ts:246`               | `submitAttendance`                       | locking; day and person checks; attempt limiting; token/PIN verification; issuer rules; network rule; mark present                     | server:modules/attendance/{application/submitAttendance.ts; domain/{attemptWindow.ts, proofRules.ts: assertProofAccepted}; data/challengeRepo.ts}                                                                                                                                                     |  H   | 81.11% lines                           |
|    82 | `server:modules/auth/router.ts:214`                      | callback of authRouter.get               | OAuth callback: state/PKCE check, token exchange, verify, open session, cookie, redirect                                               | server:modules/identity/{http/oauthRoutes.ts (thin); application/completeHostedSignIn.ts; platform/aws/cognitoOAuth.ts: exchangeCode}                                                                                                                                                                 |  H   | 47.15% lines                           |
|    81 | `server:modules/missionCard/service.ts:254`              | `reissueCard`                            | code checks; original and replacement lookups; carry status and stamps; void original; audit                                           | server:modules/missionCards/{domain/reissuePlan.ts (status to carry, LOST vs VOIDED, F03-028); application/reissueCard.ts; data/repo.ts: copyStamps}                                                                                                                                                  |  M   | 93.75% lines                           |
|    80 | `server:modules/report/export.ts:352`                    | `toCsv`                                  | CSV for every section with its own row/section helpers                                                                                 | server:modules/reports/application/export/csv/{toCsv.ts, sections/*.ts}; shared csvRow helper                                                                                                                                                                                                         |  L   | 93.75% lines                           |
|    79 | `server:modules/dashboard/service.ts:52`                 | `getLiveDashboard`                       | day lookup; 11 parallel sub-queries; staffing counts; response shape                                                                   | server:modules/dashboard/application/{getLiveDashboard.ts (compose), liveRegistrations.ts, liveStaffing.ts}; other modules through index.ts; bounded 'today' window (F02-006)                                                                                                                         |  M   | 90% lines                              |
|    79 | `server:modules/registration/service.ts:100`             | `recordGroupRegistration`                | station check; card link with status change; member rows; insert; audit; booth total                                                   | server:modules/registration/{domain/groupMembers.ts; application/recordGroupRegistration.ts}; card link via missionCards/index.ts linkGroupToCard (F03-004)                                                                                                                                           |  H   | 89.36% lines                           |
|    79 | `client:app/sign-in/page.tsx:22`                         | `SignInForm`                             | email/role form; hosted-UI link; session open; redirect                                                                                | client:features/identity/{screens/SignInScreen.tsx; components/{DevSignInForm, HostedSignInLink}.tsx}                                                                                                                                                                                                 |  M   | 0% lines; e2e: navigation, a11y        |
|    78 | `client:app/home/page.tsx:12`                            | `HomePage`                               | me query; shift card; role tiles; operations link; error states                                                                        | client:features/people/screens/HomeScreen.tsx composing CurrentShiftCard, RoleTiles, OperationsEntry                                                                                                                                                                                                  |  L   | 0% lines; e2e: navigation, a11y        |
|    77 | `server:modules/fallback/service.ts:376`                 | `runImport`                              | dry-run vs commit branches; batch row; audit                                                                                           | server:modules/fallback/application/{planImport.ts, commitImport.ts} replacing the commit flag (§1)                                                                                                                                                                                                   |  H   | 95.6% lines                            |
|    75 | `server:modules/attendance/service.ts:251`               | callback of prisma.$transaction          | transaction callback inside submitAttendance                                                                                           | resolved by the submitAttendance split                                                                                                                                                                                                                                                                |  H   | 81.11% lines                           |
|    75 | `client:app/inbox/page.tsx:43`                           | `InboxPage`                              | inbox query; ack mutation; composer gate; list rendering                                                                               | client:features/announcements/{screens/InboxScreen.tsx; components/AnnouncementList.tsx; queries.ts: useInbox, useAcknowledge}                                                                                                                                                                        |  L   | 0% lines                               |
|    73 | `server:modules/fallback/service.ts:213`                 | `importRegistrations`                    | registration import rows: station map, key, dedupe, insert                                                                             | server:modules/fallback/{domain/importKey.ts; application/importRegistrations.ts; data/importRepo.ts: insertRegistrationIfNew} (F03-012 key)                                                                                                                                                          |  H   | 95.6% lines                            |
|    73 | `client:components/LostPersonBanner.tsx:70`              | callback of alerts.map                   | one alert card inside the banner map                                                                                                   | resolved by the LostPersonBanner split (LostPersonAlertCard)                                                                                                                                                                                                                                          |  L   | 0% lines; e2e: capture (second device) |
|    69 | `server:app.ts:19`                                       | `createApp`                              | trust proxy; helmet; CORS; logging; body limits; routers; error handlers                                                               | server:app/createApp.ts calling platform/http/{security.ts, cors.ts, logging.ts, bodyParsers.ts}; app/routes.ts registers modules                                                                                                                                                                     |  L   | 94.44% lines                           |
|    69 | `client:app/chief/page.tsx:250`                          | `AttentionPanel`                         | derives and renders every attention item (gaps, silent stations, stale devices, stock, safety)                                         | client:features/dashboard/{model/attentionItems.ts (pure, unit-tested); components/AttentionPanel.tsx}                                                                                                                                                                                                |  M   | 0% lines                               |
|    69 | `client:features/capture/useQrScanner.ts:32`             | `useQrScanner`                           | camera start/stop; decode loop; permission errors; result state                                                                        | client:features/capture/{model/qrDecodeLoop.ts; hooks/useCamera.ts, useQrScanner.ts}                                                                                                                                                                                                                  |  M   | 0% lines                               |
|    68 | `server:modules/fallback/service.ts:287`                 | `importFootfall`                         | footfall import rows: station map, key, dedupe, insert                                                                                 | server:modules/fallback/{application/importFootfall.ts; data/importRepo.ts: insertTickIfNew}                                                                                                                                                                                                          |  H   | 95.6% lines                            |
|    67 | `client:app/ic/page.tsx:222`                             | `SwapQueue`                              | swap list; decide mutation; pending/error state                                                                                        | client:features/swaps/components/{SwapQueue, SwapRow}.tsx; queries.ts: useDecideSwap                                                                                                                                                                                                                  |  L   | 0% lines                               |
|    66 | `client:features/capture/useCapture.ts:59`               | `useCapture`                             | enqueue to outbox; undo window timer; session count; error state                                                                       | client:features/capture/hooks/{useCapture.ts (compose), useUndoWindow.ts, useSessionCount.ts}                                                                                                                                                                                                         |  H   | 0% lines; e2e: capture                 |
|    65 | `server:modules/shift/service.ts:50`                     | `requestSwap`                            | ownership check; target checks; block clash; insert; audit                                                                             | server:modules/swaps/{domain/swapRules.ts; application/requestSwap.ts}; clash query via assignments/index.ts                                                                                                                                                                                          |  M   | 91.66% lines                           |
|    65 | `client:components/AlertDelivery.tsx:21`                 | `AlertDelivery`                          | push state display; enable/disable actions; copy per state                                                                             | client:features/notifications/components/{AlertDelivery, AlertDeliveryStatus}.tsx; model/deliveryCopy.ts                                                                                                                                                                                              |  L   | 0% lines                               |
|    65 | `client:components/ui/Choice.tsx:75`                     | callback of options.map                  | one option inside ChoiceGroup                                                                                                          | resolved by the ChoiceGroup split (ChoiceOption.tsx)                                                                                                                                                                                                                                                  |  L   | 0% lines                               |
|    64 | `server:modules/identity/provider.ts:62`                 | `createCognitoIdentityProvider`          | Cognito client; ensureUser (find, create, groups); disable; enable                                                                     | server:platform/aws/cognito/{client.ts, ensureUser.ts, setUserEnabled.ts, syncGroups.ts}                                                                                                                                                                                                              |  M   | 37.5% lines                            |
|    64 | `client:features/attendance/AttendanceScanner.tsx:7`     | `AttendanceScanner`                      | camera lifecycle; decode; failure fallback message                                                                                     | client:features/attendance/components/AttendanceScanner.tsx on top of features/capture/hooks/useCamera.ts                                                                                                                                                                                             |  M   | 0% lines; e2e: attendance              |
|    62 | `server:modules/auth/service.ts:61`                      | `openSession`                            | volunteer load; refresh token; session row; last seen; audit; access token; response                                                   | server:modules/identity/application/{openSession.ts, toSessionResponse.ts}; data/sessionRepo.ts                                                                                                                                                                                                       |  H   | 83.87% lines                           |
|    62 | `server:modules/missionCard/service.ts:145`              | callback of prisma.$transaction          | transaction callback inside stampCard                                                                                                  | resolved by the stampCard split                                                                                                                                                                                                                                                                       |  H   | 93.75% lines                           |
|    60 | `server:modules/missionCard/service.ts:268`              | callback of prisma.$transaction          | transaction callback inside reissueCard                                                                                                | resolved by the reissueCard split                                                                                                                                                                                                                                                                     |  M   | 93.75% lines                           |
|    60 | `server:modules/registration/service.ts:110`             | callback of prisma.$transaction          | transaction callback inside recordGroupRegistration                                                                                    | resolved by the recordGroupRegistration split                                                                                                                                                                                                                                                         |  H   | 89.36% lines                           |
|    60 | `server:modules/shift/service.ts:121`                    | `decideSwap`                             | status check; reject or clash-check and apply; audit; reload                                                                           | server:modules/swaps/{application/{approveSwap.ts, rejectSwap.ts}; data/repo.ts: decideIfPending (conditional, F03-006)}                                                                                                                                                                              |  M   | 91.66% lines                           |
|    59 | `server:middleware/idempotency.ts:75`                    | `idempotent`                             | key read; reserve; reuse/in-progress/abandoned/replay branches; response capture                                                       | server:platform/idempotency/{reserveKey.ts, classifyExisting.ts (pure), replay.ts, settle.ts, withIdempotency.ts (use-case wrapper)}                                                                                                                                                                  |  H   | 73.07% lines                           |
|    59 | `server:modules/fallback/service.ts:225`                 | `apply`                                  | inner apply of importRegistrations                                                                                                     | resolved by the importRegistrations split                                                                                                                                                                                                                                                             |  H   | 95.6% lines                            |
|    59 | `server:modules/report/service.ts:304`                   | `buildVolunteerReport`                   | active count; per-station attendance, hours and no-shows                                                                               | server:modules/reports/{domain/volunteerStats.ts (pure; past shifts only, F02-027); application/sections/volunteers.ts}                                                                                                                                                                               |  M   | 83.63% lines                           |
|    58 | `server:modules/admin/service.ts:330`                    | `deactivateVolunteer`                    | escalation check; deactivate + purge push subscriptions + audit; revoke sessions; disable identity; cache                              | server:modules/people/application/{deactivatePerson.ts, withdrawAccess.ts (sessions + identity + cache)}                                                                                                                                                                                              |  M   | 66.66% lines                           |
|    58 | `server:modules/admin/service.ts:441`                    | `createAssignment`                       | three existence checks; upsert (create or move); audit                                                                                 | server:modules/assignments/application/{assignShift.ts, moveShift.ts} (moves audited with before, F03-018)                                                                                                                                                                                            |  M   | 66.66% lines                           |
|    58 | `server:modules/report/service.ts:245`                   | `buildSafetyReport`                      | incident, lost-person and lost-and-found shaping                                                                                       | server:modules/reports/application/sections/{incidents.ts, lostPersons.ts, lostFound.ts}                                                                                                                                                                                                              |  L   | 83.63% lines                           |
|    58 | `client:app/brief/page.tsx:19`                           | `BriefPage`                              | renders the compiled volunteer brief (F01 content)                                                                                     | client:features/content/screens/BriefScreen.tsx rendering a ContentDocument (P13.3); sections as components                                                                                                                                                                                           |  L   | 0% lines                               |
|    57 | `server:middleware/idempotency.ts:76`                    | anonymous                                | async body of idempotent                                                                                                               | resolved by the idempotent split                                                                                                                                                                                                                                                                      |  H   | 73.07% lines                           |
|    57 | `server:modules/attendance/service.ts:92`                | `markPresent`                            | find-or-create attendance + audit; auto check-in to running shifts + audit                                                             | server:modules/attendance/application/markPresent.ts calling assignments/index.ts checkInRunningShifts                                                                                                                                                                                                |  H   | 81.11% lines                           |
|    57 | `server:modules/shift/service.ts:55`                     | callback of prisma.$transaction          | transaction callback inside requestSwap                                                                                                | resolved by the requestSwap split                                                                                                                                                                                                                                                                     |  M   | 91.66% lines                           |
|    57 | `client:app/admin/users/page.tsx:198`                    | `VolunteerRow`                           | one volunteer row: status chip, role label, edit toggle, editor                                                                        | client:features/people/components/{PersonRow, PersonStatus}.tsx                                                                                                                                                                                                                                       |  L   | 0% lines; e2e: admin                   |
|    56 | `server:middleware/auth/index.ts:169`                    | `requireAuth`                            | bearer parse; own token vs provider token; session liveness; volunteer lookup; drift log; req.auth                                     | server:platform/access/{authenticate.ts (compose), readBearerToken.ts, resolveSubject.ts, resolvePrincipal.ts}; caches in platform/events (P10.3)                                                                                                                                                     |  H   | 92.85% lines                           |
|    56 | `server:modules/fallback/service.ts:72`                  | `declareFallback`                        | open-window check; insert; audit; log                                                                                                  | server:modules/fallback/application/declareFallback.ts + data/repo.ts: findOpenWindow                                                                                                                                                                                                                 |  M   | 95.6% lines                            |
|    56 | `server:modules/roster/service.ts:34`                    | `provisionVolunteer`                     | manager lookup; identity mint; upsert + audit; cache                                                                                   | server:modules/people/application/provisionPerson.ts with domain/escalation.ts (F03-001)                                                                                                                                                                                                              |  H   | 55.4% lines                            |
|    56 | `client:app/safety/page.tsx:18`                          | `SafetyPage`                             | safety hub tiles; escalation chain; error states                                                                                       | client:features/incidents/screens/SafetyHubScreen.tsx composing SafetyTiles and EscalationChain                                                                                                                                                                                                       |  L   | 0% lines                               |
|    55 | `server:middleware/idempotency.ts:77`                    | anonymous                                | inner async IIFE of idempotent                                                                                                         | resolved by the idempotent split                                                                                                                                                                                                                                                                      |  H   | 73.07% lines                           |
|    54 | `server:modules/fallback/service.ts:299`                 | `apply`                                  | inner apply of importFootfall                                                                                                          | resolved by the importFootfall split                                                                                                                                                                                                                                                                  |  H   | 95.6% lines                            |
|    54 | `server:modules/report/export.ts:290`                    | `buildIntegrity`                         | integrity sheet: windows, imports, sources, voids                                                                                      | server:modules/reports/application/export/xlsx/integritySheet.ts                                                                                                                                                                                                                                      |  L   | 93.75% lines                           |
|    53 | `server:modules/report/export.ts:214`                    | `buildSafety`                            | safety sheet: incidents, lost persons, lost and found                                                                                  | server:modules/reports/application/export/xlsx/safetySheet.ts                                                                                                                                                                                                                                         |  L   | 93.75% lines                           |
|    53 | `client:components/ui/Field.tsx:64`                      | `Field`                                  | label, hint, error, required marker and aria wiring                                                                                    | client:shared/ui/Field/{Field.tsx, FieldLabel.tsx, FieldMessage.tsx}; useFieldIds.ts                                                                                                                                                                                                                  |  L   | 0% lines                               |
|    52 | `server:middleware/auth/localProvider.ts:34`             | `createLocalAuthProvider`                | local JWT issue and verify; group extraction                                                                                           | server:modules/identity/dev/{localIssuer.ts, localVerifier.ts}                                                                                                                                                                                                                                        |  L   | 89.47% lines                           |
|    52 | `server:modules/me/service.ts:80`                        | `checkIn`                                | ownership; already-checked-in; attendance and time checks; conditional update; audit                                                   | server:modules/assignments/{domain/checkInRules.ts; application/checkIn.ts}                                                                                                                                                                                                                           |  H   | 58.97% lines                           |
|    52 | `client:components/ShiftOverview.tsx:145`                | `RoleTiles`                              | role-dependent tile list                                                                                                               | client:navigation/registry.ts supplies tiles; features/people/components/RoleTiles.tsx maps them                                                                                                                                                                                                      |  L   | 0% lines; e2e: navigation              |
|    51 | `server:modules/announcement/service.ts:32`              | `sendAnnouncement`                       | event-wide permission; insert + audit; urgent push; decorate                                                                           | server:modules/announcements/{application/sendAnnouncement.ts; domain/audience.ts (one audience rule for inbox, push and count, F03-014)}                                                                                                                                                             |  M   | 93.93% lines                           |
|    51 | `server:modules/dashboard/repo.ts:66`                    | `checkedInWithLastCapture`               | one raw SQL query for checked-in devices and last capture                                                                              | server:modules/dataHealth/data/repo.ts; SQL moves to a named .sql-in-ts constant, row mapper separate                                                                                                                                                                                                 |  L   | 85.71% lines                           |
|    51 | `server:modules/incident/service.ts:32`                  | `reportIncident`                         | insert + audit; station name; safety push                                                                                              | server:modules/incidents/application/{reportIncident.ts, notifySafetyChain.ts}                                                                                                                                                                                                                        |  M   | 32.25% lines                           |
|    51 | `server:modules/missionCard/service.ts:65`               | `issueCard`                              | card lookup; issue + audit; link group registrations; bypass audit; reload                                                             | server:modules/missionCards/application/{issueCard.ts, linkGroupToCard.ts}                                                                                                                                                                                                                            |  M   | 93.75% lines                           |

<!-- backlog:end -->
