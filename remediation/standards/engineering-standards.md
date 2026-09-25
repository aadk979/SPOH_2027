# Engineering standards

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

Measure with `node remediation/tools/code-metrics.mjs` (defaults: function 50, file 300).

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

Cross-cutting code lives in `server/src/platform/`: `db`, `http` (middleware), `access` (the
authorizer), `audit`, `idempotency`, `settings`, `scheduler`, `events` (cache bus), `time`, `logger`,
`errors`, `aws`.

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
- One form pattern: a zod schema from `@spoh/shared` plus the shared form hook and field components.
- One navigation registry drives every nav surface.

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
  station), a schema, a default, a description, a permission and a history.

## 7. Time

- Never call `new Date()` or `Date.now()` in domain or application code. Inject a `Clock` from
  `platform/time`.
- Every wall-clock interpretation takes the **event's IANA timezone**. There are no fixed offsets
  and no `AT TIME ZONE` literals.
- Store instants as `timestamptz`, and store event-local dates as `date` together with the event's tz.

## 8. Errors and validation

- Validate at the boundary with zod schemas from `@spoh/shared`. Past the boundary, types are trusted.
- Throw typed `AppError`s with codes from `errorCodes.ts`. Never throw strings and never swallow errors.
  A `catch` either handles the error meaningfully or rethrows it with context.
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

- Behaviour-preserving refactors land only with the suites green before **and** after each commit.
- A bug fix lands with a test that fails without it.
- Integration tests never depend on the wall clock. They freeze time inside the event's timezone.

## 10. Commits and progress

- Small commits, each green, each carrying a `Remediation-Step: P06.3` trailer.
- One logical change per commit. Moves and edits go in separate commits so reviews can diff moves as renames.
- Update `progress.json` through `tools/progress.mjs` after every step, and push.

## 11. Definition of done (a step)

1. The step's **Done when** criteria are met.
2. Lint, typecheck and all affected suites are green. For refactors, all suites are green.
3. No new size, complexity or boundary violations, and metrics are no worse.
4. Docs and comments are updated where behaviour or structure changed.
5. The commit is pushed and `progress.json` is updated.
