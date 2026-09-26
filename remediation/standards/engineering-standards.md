# Engineering standards

**Status: final** (P05.8, ADR-007), signed off by the owner at G1 (2026-09-26). It is binding from P06.

The rules every phase follows. P06/P07 make the measurable ones blocking in lint and CI. Until then
they apply to all new and touched code.

The existing house rules in the root `README.md` still hold: Conventional Commits, no `any`,
comments explain _why_, every write idempotent, and every mutation audited in the same transaction.

---

## 1. Single responsibility

- **A file has one reason to change.** "Admin" is a screen, not a domain. Code lives with the
  domain it changes (volunteers, stations, gifts…), whichever screen calls it.
- **A function does one thing at one level of abstraction.** If describing it needs "and", split
  it. Orchestrators call named steps; steps do work. A use case reads like a table of contents.
- **Name by intent:** `assertStockAvailable`, `buildFunnelStages`, `toVolunteerRecord`, not
  `handle`, `process`, `doStuff`, `helper`.
- **No boolean mode flags that change what a function does.** `run(input, { dryRun })` becomes a
  `plan(input)` step and an `apply(plan)` step.

## 2. Size and complexity limits

| Measure                     | Target | Hard limit (lint error from P06/P07)     |
| --------------------------- | ------ | ---------------------------------------- |
| Server/shared function body | ≤ 30   | 50 lines (excluding blanks and comments) |
| React component             | ≤ 60   | 80 lines                                 |
| File                        | ≤ 200  | 300 lines                                |
| Cyclomatic complexity       | ≤ 6    | 10                                       |
| Nesting depth               | ≤ 2    | 3                                        |
| Parameters                  | ≤ 2    | 3 (use an options object beyond)         |
| `app/**/page.tsx`           | ≤ 30   | 60 lines: composition only               |

Tests, migrations, generated code and static data files are exempt. A limit may be disabled on
one line only with a `-- reason` comment explaining why the split would make it worse. Reviewers
treat every such comment as a question.

Measure with `npm run arch:report`, which counts the ESLint guards for these limits (warnings
until P06/P07) and the §3/§4 boundary rules. The ESLint guards follow this table and skip blank and
comment lines. `node remediation/tools/code-metrics.mjs` counts raw lines (defaults: function 50,
file 300), so its numbers run higher. Both are tracked in `reports/metrics/`.

## 3. Server module shape

```
server/src/modules/<domain>/
├── index.ts              public API: the only file other modules may import
├── http/
│   ├── routes.ts         paths + middleware chain only; no logic
│   └── handlers.ts       parse validated input → call a use case → shape the response
├── application/          one file per use case: redeemGift.ts, voidRegistration.ts …
├── domain/               pure rules: no I/O, no Prisma, no Express, no Date.now()
├── data/
│   ├── repo.ts           Prisma queries only; accepts a transaction client
│   └── mappers.ts        row ⇄ record
└── jobs.ts               (optional) scheduled handlers this module registers
```

Cross-cutting code lives in `server/src/platform/`: `db`, `http` (middleware, event context),
`identity`, `access` (the authorizer), `audit`, `idempotency`, `settings`, `scheduler`, `events`
(cache bus), `ratelimit`, `time`, `logger`, `errors`, `aws`.

**Import rules** (dependency-cruiser + ESLint, blocking from P06):

| From → To   | http | application | domain   | data | other module    | platform                    |
| ----------- | ---- | ----------- | -------- | ---- | --------------- | --------------------------- |
| http        | —    | ✅          | ✅ types | ❌   | ❌              | ✅                          |
| application | ❌   | ✅          | ✅       | ✅   | `index.ts` only | ✅                          |
| domain      | ❌   | ❌          | ✅       | ❌   | ❌              | `time`, `errors` types only |
| data        | ❌   | ❌          | ✅ types | ✅   | ❌              | `db` only                   |

- Prisma is imported **only** in `data/` and `platform/db`.
- Express types are imported **only** in `http/` and `platform/http`.
- A use case owns its transaction and passes `tx` down. Repos never open transactions.
- Audit and idempotency are applied by the use case (or a wrapper), never by the router.
- **Every repository function for an event-owned model takes an `EventScope` first.** The
  `platform/db` extension refuses a query without it (ADR-001 §2). Id lookups are
  `{ eventId, id }`, never `{ id }` alone.
- **Authorization** is `authorize(action, resolveResource)` on the route, or an
  `authorizer.isAuthorized` call in the use case when the decision depends on loaded data
  (ADR-005). Nothing else decides who may do what.
- The rule ids that enforce this table are listed in ADR-007 §3.

## 4. Client shape

```
client/src/
├── app/                       routes only: page.tsx composes feature screens, ≤ 60 lines
├── features/<domain>/
│   ├── index.ts               public API
│   ├── api.ts                 typed endpoint functions (the only place a path string appears)
│   ├── queries.ts             query keys + useQuery/useMutation hooks
│   ├── screens/               one screen per route, composed of components
│   ├── components/            feature-specific components
│   └── model/                 pure helpers (formatting, derivations), unit-tested
└── shared/
    ├── ui/                    design system (no domain imports)
    ├── lib/                   api client, session, outbox, time, env
    └── hooks/                 generic hooks
```

- No `fetch`/`api()` outside `features/*/api.ts` and `shared/lib`.
- `shared/ui` never imports from `features`. Features import each other only through `index.ts`.
- One form pattern: a zod schema from `@spoh/shared` plus `useZodForm` and the `Field` and
  `Choice` components (ADR-007 §2).
- One navigation registry drives every nav surface. Visibility comes from `/me/permissions`, never
  from a role check in the client (ADR-005).
- Event screens live under `app/e/[event]/…`. Every query key starts with the `eventId`
  (ADR-001 §5).
- Offline: the outbox queues registration, footfall, stamps, redemptions and incident reports.
  Each entry records `eventId`, path, `personId` and `clientRecordedAt`. Lost-person alerts are
  never queued (ADR-007 §5).

## 5. Shared package

- Contracts (request and response DTOs, zod) are grouped by domain folder, matching server modules.
- Domain constants that are **product invariants** stay as enums. Anything an event can change is
  data, not an enum.
- Generated artefacts (Cedar action catalogue, settings registry types) live in `src/generated/`
  and are never hand-edited.

## 6. Configuration

- **No event-specific literal in `src/`**: no dates, venue names, course codes, category names or
  timezone names. A CI check enforces this from P09.
- **Env holds infrastructure and secrets only:** database URL, AWS resource IDs, `NODE_ENV`, port,
  log level, origins. In AWS these come from Secrets Manager and SSM, not files on disk.
- **Behaviour an admin might change** is a registered setting with a scope (platform, event or
  station), a schema, a default, a description, a permission and a history (ADR-003 §1).

## 7. Time

- Never call `new Date()` or `Date.now()` in domain or application code. Inject a `Clock` from
  `platform/time`.
- Every wall-clock interpretation takes the **event's IANA timezone**. There are no fixed offsets
  and no `AT TIME ZONE` literals.
- Conversions go through `@spoh/shared/time` (`date-fns` + `@date-fns/tz`), which fixes the DST
  rules: an ambiguous time takes the earlier offset, and a skipped time moves forward (ADR-007 §2).
  "Today" is the event day window starting at `dayBoundaryMinutes` (ADR-004 §3).
- Store instants as `timestamptz`, and store event-local dates as `date` together with the event's tz.

## 8. Errors and validation

- Validate at the boundary with zod schemas from `@spoh/shared`. Past the boundary, types are trusted.
- Throw typed `AppError`s with codes from `errorCodes.ts`. Never throw strings and never swallow errors.
  A `catch` either handles the error meaningfully or rethrows it with context.
- A rule failure (outside the check-in window, a stale swap) is **not** a permission denial. Only
  the authorizer produces 403s, with the determining policy's reason code (F03-026, ADR-005 §7).
- Users see actionable messages. Logs get the detail and the request id.

## 9. Tests

| Layer        | Test                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| domain       | pure unit tests, table-driven                                            |
| application  | unit tests with fake repos and a fixed clock                             |
| data         | integration against real Postgres (`*_test` database guard stays)        |
| http         | route contract tests (status, shape, auth, idempotency)                  |
| access       | Cedar policy tests evaluated locally, plus route × role matrix           |
| client model | unit tests                                                               |
| client UI    | Testing Library for components, Playwright for journeys (phone + laptop) |
| architecture | dependency-cruiser rules, size lint, no-hardcoding check                 |

- **Coverage never drops.** `reports/metrics/coverage-floor.json` holds per-package floors, CI
  enforces them, and each phase close raises them. The targets by G5 are in ADR-007 §4.
- Behaviour-preserving refactors land only with the suites green before **and** after each commit.
- A bug fix lands with a test that fails without it.
- Integration tests never depend on the wall clock. They freeze time inside the event's timezone.

## 10. Commits and progress

- Small commits, each green, each carrying a `Remediation-Step: P06.3` trailer.
- One logical change per commit. Moves and edits go in separate commits so reviews can diff moves as renames.
- Update `progress.json` through `tools/progress.mjs` after every step, and push to `main`. There are
  no feature branches, pull requests or tags (D-11).

## 11. One way to do it (F03 § P03.3, binding)

| Concern        | The one way                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Record mappers | pure and synchronous in `data/mappers.ts`; related data loaded with the list (no N+1)                  |
| Pagination     | keyset on `(sortKey, id)`, with `nextCursor: null` at the end                                          |
| Errors         | one typed error per code; unique violations mapped to 409                                              |
| Time           | the injected `Clock`; `@spoh/shared/time` for zones                                                    |
| Audit          | `audited(tx, …)` in the mutation's transaction, curated `before`/`after`, one action name per mutation |
| Idempotency    | `withIdempotency` on every write a client may retry; PII endpoints store no response body              |
| Transactions   | the use case owns `tx`; no reads outside it that its writes depend on; no `Promise.all` on `tx`        |
| Envelopes      | lists `{ data, meta }`, entities `{ data }`                                                            |
| Rate limits    | a limit class per route, from the registry                                                             |
| Query keys     | one key factory per feature, prefixed by `eventId`                                                     |
| Forms          | `useZodForm` with the shared request schema                                                            |
| Data fetching  | `features/<domain>/api.ts` and `queries.ts` only                                                       |

## 12. Definition of done (a step)

1. The step's **Done when** criteria are met.
2. Lint, typecheck and all affected suites are green. For refactors, all suites are green.
3. No new size, complexity or boundary violations, and metrics are no worse.
4. Docs and comments are updated where behaviour or structure changed.
5. The commit is pushed and `progress.json` is updated.
