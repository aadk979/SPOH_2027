# ADR-007 — Code architecture, libraries and offline capture

| Field     | Value                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status    | Proposed (P05.8, 2026-09-26)                                                                                                                                       |
| Decisions | none from the owner. Recovering the missing brief and build plan (PF-11): **assumed** not needed                                                                   |
| Resolves  | PF-10 (the rules), PF-18 (the gate), PF-11 (the decision), F03-034 (which captures queue offline), F03 § P03.3's twelve "one way" patterns (made binding), F03-037 |
| Builds in | P06, P07 (structure and guards), P08.9 (the CI gate), P09.6 (time), P07.6 (forms), P07.11 (offline)                                                                |

## Context

P03 measured the structure. There are 57 Prisma imports outside a data layer, 32 Express imports
outside `http/`, 33 cross-module imports of internals, no module `index.ts`, and three modules
sharing one domain (PF-10). There are 97 functions over the size limit, each with a split plan.
There are twelve patterns done several ways, each with one way chosen (F03 § P03.3). Coverage
gates exist but were never enforced, and the baseline misses them (PF-18). The client queues
registrations and footfall offline, but not stamps, redemptions, incidents or lost-person alerts
(F03-034). Code comments cite a product brief and a build plan that are not in the repo (PF-11).

`standards/engineering-standards.md` and `standards/target-architecture.md` were drafts awaiting
P05. This ADR decides what they left open and makes both files **final**.

## Decision

### 1. Structure (binding from P06/P07)

The shapes in `engineering-standards.md` §3 (server module), §4 (client feature) and §5 (shared)
stand, with these additions from ADR-001–ADR-006:

- **Server:** `platform/` gains `identity` (token verification, session open) and `access` (the
  `Authorizer`, the `EntityBuilder` and the decision cache, ADR-005). Every repository function for
  an event-owned model takes an `EventScope` first (ADR-001 §2). Modules register scheduled
  handlers through `platform/scheduler` (ADR-004).
- **Client:** event screens live under `app/e/[event]/…` (ADR-001 §5), and `navigation/registry.ts`
  is the one source for every nav surface. Visibility comes from `/me/permissions`, the local
  Cedar engine's answer (ADR-005 §6), never from a matrix in the client.
- **Packages:**
  - `@spoh/shared`: contracts by domain, `invariants/` (the enums that stay, ADR-002 §2),
    `time/` (§2) and `generated/` (settings, actions);
  - `@spoh/access-policies` (new): schema, policies, grants generator and tests (ADR-005).

### 2. Libraries

| Concern                           | Decision                                                                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date and timezone**             | **`date-fns` 4 + `@date-fns/tz`**, behind one small module, `packages/shared/src/time/`, used by server and client alike: `zonedDayWindow(date, tz, boundaryMinutes)`, `wallTimeToInstant(date, "HH:MM", tz)` with the F01 DST rules (an ambiguous time takes the **earlier** offset; a skipped time moves forward to the first valid instant), `formatInEvent(instant, event)` | tree-shakes, so the client pays only for what it uses (the bundle is already 613 KB gzip, F03-037). The DST rule lives in **one** tested function, whatever the library does by default, so a library swap never changes behaviour. The 12 F01 DST cases are its unit tests |
| Temporal API                      | not yet                                                                                                                                                                                                                                                                                                                                                                         | not shipped in every browser the volunteers' phones run; revisit after the event                                                                                                                                                                                            |
| **Forms**                         | the in-house **`useZodForm(schema)`** hook F03 § P03.3 chose, with `Field` and `Choice` components. The schema is the `@spoh/shared` request schema the server validates with, so the messages match (P07.6)                                                                                                                                                                    | forms are small and uniform; a library (react-hook-form) adds an abstraction and a resolver layer for no capability the app needs. About 100 lines, unit-tested                                                                                                             |
| Server state (client)             | TanStack Query (kept), with **one key factory per feature** (`queries.ts`), every key prefixed by `eventId`                                                                                                                                                                                                                                                                     | F03 § P03.3 (query keys); ADR-001 §5                                                                                                                                                                                                                                        |
| Client-only state                 | React state and context. **`zustand` is removed**, and so is `aws-amplify` (both unused)                                                                                                                                                                                                                                                                                        | F03-037                                                                                                                                                                                                                                                                     |
| **Component testing**             | Vitest + Testing Library + happy-dom (already installed); `fake-indexeddb` for the outbox                                                                                                                                                                                                                                                                                       | no new tool. P07.1 adds the characterisation tests                                                                                                                                                                                                                          |
| Visual regression                 | Playwright `toHaveScreenshot`, phone and laptop, both themes, frozen clock, seeded database (P07.1, P14.9)                                                                                                                                                                                                                                                                      | already the e2e runner                                                                                                                                                                                                                                                      |
| Accessibility                     | `axe-core` in e2e (already a dependency), failing on `serious` and above (P14.7)                                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                             |
| Authorization                     | `@cedar-policy/cedar-wasm` (ADR-005), pinned                                                                                                                                                                                                                                                                                                                                    | the local engine and the policy tests                                                                                                                                                                                                                                       |
| Scheduler, cache bus, rate limits | none: a few hundred lines in `platform/` on `pg` (ADR-003, ADR-004)                                                                                                                                                                                                                                                                                                             | readable, and no second schema to migrate                                                                                                                                                                                                                                   |

### 3. Boundary rules (dependency-cruiser and ESLint, blocking at P06.10 and P07.9)

| Rule id                     | Forbids                                                                                                                     | Tool                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `no-cycles`                 | any import cycle                                                                                                            | dependency-cruiser              |
| `module-public-api-only`    | importing another module's file other than its `index.ts`                                                                   | dependency-cruiser              |
| `layer-http`                | `http/` importing `data/`                                                                                                   | dependency-cruiser              |
| `layer-application`         | `application/` importing `http/` or Express                                                                                 | dependency-cruiser              |
| `layer-domain-pure`         | `domain/` importing anything but `domain/`, `platform/time` and `platform/errors` types; any Prisma, Express or `node:` I/O | dependency-cruiser              |
| `layer-data`                | `data/` importing `application/` or `http/`                                                                                 | dependency-cruiser              |
| `prisma-in-data-only`       | `@prisma/client` or the generated client outside `data/` and `platform/db`                                                  | dependency-cruiser              |
| `express-in-http-only`      | `express` outside `http/` and `platform/http`                                                                               | dependency-cruiser              |
| `no-wall-clock`             | `new Date()` without arguments, and `Date.now()`, in `domain/` and `application/`                                           | ESLint (`no-restricted-syntax`) |
| `no-event-literals`         | the F01 patterns (dates, venue and brand names, course codes, zone names) in `src/`                                         | `check:hardcoding` (P09.11)     |
| `client-api-in-features`    | `fetch`/`api(` outside `features/*/api.ts` and `shared/lib`                                                                 | ESLint                          |
| `client-ui-no-features`     | `shared/ui` importing `features`                                                                                            | dependency-cruiser              |
| `client-feature-public-api` | a feature importing another feature's internals                                                                             | dependency-cruiser              |
| size and complexity         | engineering-standards §2 limits                                                                                             | ESLint                          |

`npm run arch:report` counts violations per rule. A rule becomes `error` when its count reaches
zero, and after that it can never regress.

### 4. Coverage gate (PF-18): a ratchet, then a target

- **Ratchet from P06:** `reports/metrics/coverage-floor.json` holds per-package floors for lines
  and branches. CI fails if a change drops below them, and each phase's close raises them to
  the new measurement.
- **Targets by G5:**

  | Scope                                                      |             Lines | Branches |
  | ---------------------------------------------------------- | ----------------: | -------: |
  | server `domain/` and `application/`                        |              90 % |     80 % |
  | server overall                                             |              85 % |     75 % |
  | `@spoh/access-policies` (every policy exercised by a test) | 100 % of policies |        — |
  | client `model/` and `shared/lib`                           |              90 % |     80 % |
  | client overall                                             |              40 % |        — |

- Routers and composition code count toward coverage from P06 (they were outside the configured
  scope, PF-18). The existing thresholds (80/70) are replaced by the ratchet until the targets
  are met.

### 5. Offline capture (F03-034)

| Capture                        | Offline                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| registration, footfall (today) | queued (unchanged)                                                                                                                                                                                                                                                                   |
| **stamps**                     | **queued**. A duplicate (the same card at the same station) syncs as an idempotent success                                                                                                                                                                                           |
| **gift redemptions**           | **queued**. On sync, a redemption that breaks the stock or one-per-journey rule is **recorded and flagged** for the IC in Data health, not refused: the gift was handed over, and the record must say so. Online, the same rule refuses before the gift is handed over (F03-007)     |
| **incident reports**           | **queued**, with a banner: "Queued. If anyone is hurt or in danger, tell your IC now." A HIGH or CRITICAL report that syncs late is marked with its `occurredAt` and its sync time                                                                                                   |
| **lost-person alerts**         | **never queued.** An alert that arrives late is worse than none, because people stop looking at alerts. Offline, the screen shows the escalation script ("radio or call your IC now") and keeps the description for sending when the connection returns, with an explicit "send now" |

Every queued entry records its `eventId`, full path, the `personId` that created it (F04-003) and
`clientRecordedAt`. The outbox flushes only the signed-in person's entries. On sign-out it shows
what is still queued and offers "send now" or "discard", with a confirmation. After the event
closes, the late-sync window applies (ADR-004 §1).

### 6. The twelve patterns become rules

F03 § P03.3's choices are binding and are added to engineering-standards: pure, synchronous
mappers, one query per list; keyset pagination on `(sortKey, id)` with a real end; one typed
error per code, with rule failures that are not permission denials (F03-026); an injected
`Clock`; `audited(tx, …)` in the same transaction with curated before and after values;
`withIdempotency` for every write a client may retry; the use case owns the transaction; lists
as `{ data, meta }` and entities as `{ data }`; a limit class per route; one query-key factory;
`useZodForm`; `features/<domain>/api.ts`.

### 7. The missing documents (PF-11, **assumed**)

The product brief, build plan, runbook and deployment documents that code comments cite are not
recovered. The ADRs, the two standards files and the remediation findings now hold what they
decided. P06 and P07 rewrite each `BUILD_PLAN §x` or `PRODUCT_BRIEF §x` comment they touch to
cite the ADR or standard instead, and P16.5 removes the rest. If the owner has copies, they can
be committed under `docs/history/` as a record, but nothing will depend on them.

## Options considered

| Topic          | Chosen                           | Rejected, and why                                                                                                                                                                                                                |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timezone       | `@date-fns/tz` behind one module | Luxon: a sound, immutable API, but about 20 KB gzip more on every capture route, and its own conventions next to the `Date` the rest of the code uses. Hand-written `Intl` arithmetic: that is how the fixed-offset bug happened |
| Forms          | `useZodForm`                     | react-hook-form: a second validation model beside zod, and more code in the bundle                                                                                                                                               |
| Coverage       | a ratchet and targets            | enforcing 80/70 at once: the baseline misses it, so P06 would start red                                                                                                                                                          |
| Offline safety | alerts never queue               | queue everything: a late lost-person alert misleads. Queue nothing new: F03-034's lost stamps and redemptions stay                                                                                                               |

## Consequences

- P06 and P07 have one target shape and a machine-checked definition of done.
- Two unused dependencies leave, and two small ones arrive (`date-fns`, `@date-fns/tz`). The
  Cedar WASM module is loaded **server-side only**, because the client never evaluates policy.
- Offline redemptions can exceed stock, by design, and are visible for review.
- Code comments stop pointing at documents nobody can open.

## How it is tested

- `packages/shared/src/time`: the 12 DST cases, plus a shift crossing midnight, in
  `Asia/Singapore`, `Europe/London` and `America/New_York`.
- `useZodForm`: unit tests; a form shows the server's message for the same invalid input.
- The boundary rules: `arch:check` in CI (P06.10, P07.9), and a fixture file per rule proving it
  fires.
- Coverage: the floor file is checked in CI (P08.9).
- The outbox: repros F03-033 and F04-003 un-skipped, stamp and redemption queue tests, an
  over-stock redemption synced and flagged, and a lost-person alert refused by the queue.

## Migration

- **P06/P07:** the structure moves, and the guards turn to `error` per rule as their counts reach
  zero. `zustand` and `aws-amplify` are removed in P07.11.
- **P07.11:** the offline queue for stamps, redemptions and incidents; the alert screen's offline
  state; outbox ownership.
- **P08.9:** the coverage ratchet in CI.
- **P09.6:** `packages/shared/src/time` replaces `lib/time.ts` and `client/src/lib/format.ts`'s
  zone.
