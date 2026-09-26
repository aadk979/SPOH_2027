# Server modules

One folder per domain. Each has the same shape, the rules in
`remediation/standards/engineering-standards.md` §3, and ADR-007. **`station` is the worked
example**: it is small, and it has every layer. Copy its shape when converting a module in P06.

```
modules/station/
├── index.ts                          the public API: the only file another module imports
├── http/
│   ├── routes.ts                     paths and the middleware chain; no logic
│   └── handlers.ts                   read the validated input, call a use case, shape the response
├── application/                      one file per use case
│   ├── listActiveStations.ts
│   ├── requireActiveStation.ts
│   └── requireCountedStation.ts
├── domain/
│   └── stationRules.ts               pure rules: no I/O, no Prisma, no Express, no Date.now()
└── data/
    ├── repo.ts                       Prisma queries only; each takes the client (a transaction) to run on
    └── mappers.ts                    row → API record
```

## Who may import what

| From → To       | http | application | domain   | data | another module | platform              |
| --------------- | ---- | ----------- | -------- | ---- | -------------- | --------------------- |
| **http**        | —    | ✅          | ✅ types | ❌   | ❌             | ✅                    |
| **application** | ❌   | ✅          | ✅       | ✅   | its `index.ts` | ✅                    |
| **domain**      | ❌   | ❌          | ✅       | ❌   | ❌             | `time`, `errors` only |
| **data**        | ❌   | ❌          | ✅ types | ✅   | ❌             | `db` only             |

`npm run arch:check` lists every breach (dependency-cruiser, `.dependency-cruiser.cjs`). The
rules become errors in P06.10.

## Writing each layer

- **`index.ts`** exports what other modules need: the router, the use cases, and the few reads
  another module needs. A read that a use case would only forward is exported from `data/`
  directly (`findStationById`) rather than wrapped in a pass-through.
- **`http/routes.ts`** is `router.<verb>(path, …middleware, handler)` and nothing else. The
  middleware chain is part of the contract: `remediation/tools/route-inventory.mjs` records it,
  and a P06 refactor must leave it unchanged.
- **`http/handlers.ts`** functions are named (`listStationsHandler`). One per route; each reads
  `validatedBody`/`validatedParams`, calls one use case and sends the response.
- **`application/`** has one file per use case, named for its intent (`requireActiveStation`).
  A use case owns its transaction and passes `tx` to the repo. It reads like a table of contents:
  load, check with a domain rule, write, audit.
- **`domain/`** holds the rules as pure functions over plain values
  (`assertStationActive({ name, active })`). They throw typed `AppError`s from `platform/errors`.
- **`data/repo.ts`** functions take the Prisma client last, defaulting to the shared one:
  `findStationById(id, db = prisma)`. They never open a transaction. From P09 each takes an
  `EventScope` first (ADR-001 §2).

## Tests

| Layer       | Test                                        | Station's                                |
| ----------- | ------------------------------------------- | ---------------------------------------- |
| domain      | pure, table-driven                          | `tests/unit/station.test.ts`             |
| application | with the repo mocked at the module boundary | `tests/unit/station.test.ts`             |
| http        | the route's contract, through the app       | `tests/integration/capture.test.ts` etc. |

A use case gets its unit test in the commit that moves it into `application/`.

## Converting a module

1. **Move** the files into the layers with `git mv`, rewriting imports. Nothing else in that
   commit, so the review sees renames.
2. **Split** in the next commit: one use case per file, rules into `domain/`, mappers out of the
   repo, named handlers, `index.ts`. Point other modules at `index.ts`.
3. Check: the suites, `node remediation/tools/route-inventory.mjs --diff
remediation/reports/P06/routes-before.json`, `npm run lint`, and `npm run arch:report` (under
   Node 24) with no count higher than before.
4. Land the module's P06.13 fixes after it, one `fix(...)` commit each.
