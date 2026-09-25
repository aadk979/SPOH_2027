# P03 — Audit C: code quality, architecture and bugs

| Field             | Value |
| ----------------- | ----- |
| Gate              | G0    |
| Depends on        | P00   |
| Decisions         | —     |
| Changes behaviour | No    |
| Size              | L     |

## Purpose

Produce the exact refactor backlog (every oversized or multi-purpose function, where each piece
goes) and find the real bugs, with reproductions, before any code moves.

## Context for a fresh session

- Metrics: `reports/metrics/P00.json` (long functions/files), plus the dependency-cruiser report
  from P00.7.
- The layering facts in `baseline.md` § _Layering_. The target shape in
  `standards/engineering-standards.md` §3–§5.
- Output: `findings/F03-code-quality.md`. Bug repro tests are committed as **skipped** tests tagged
  `// F03-xxx`, so P06 can un-skip them when fixing.

## Steps

### P03.1 — Module map and dependency graph

- **Do:**
  1. Generate the module dependency graph (`depcruise --output-type dot` → SVG in `reports/P03/`).
  2. For each of the 24 server modules, record its responsibilities, public surface, inbound and
     outbound edges, and layering violations (Prisma in routers/services, Express in services).
  3. Propose the target module for every function, per `target-architecture.md` §1.
- **Done when:** a module table in F03 gives the target location of every exported function.

### P03.2 — Function-level refactor backlog

- **Do:** For **every** function over the limits in `P00.json`, write one row:
  - where it is now
  - the distinct responsibilities it holds, named
  - the proposed split: new function names and target files
  - the risk, and existing test coverage
- **Covers:** the owner's explicit ask ("no 200-line function doing 3 things"). This is P06/P07's
  worklist.
- **Done when:** 100% of flagged functions have a split plan.

### P03.3 — Duplication and consistency

- **Do:**
  1. Run `jscpd` over `server/src`, `client/src` and `packages/shared/src`.
  2. Catalogue inconsistent patterns: record mappers, pagination (cursor vs offset), error shaping,
     date handling, audit calls, idempotency usage, query-key naming, and form handling.
  3. Choose one pattern for each.
- **Done when:** the duplication clusters and "one way to do it" decisions are in F03.

### P03.4 — Correctness review per module

- **Do:** Run `/code-review` at high effort on each module, plus a manual checklist:
  - transaction boundaries
  - idempotency keys on every write
  - race conditions (double redeem, double stamp, concurrent swaps)
  - time boundaries (block overlap 13:30–14:00, midnight in event tz)
  - null and optional handling
  - pagination correctness
  - error code accuracy
  - audit completeness (every mutation)

  For every confirmed bug, write a failing test and commit it as skipped.

- **Done when:** every module is reviewed, and each bug has an id, severity, repro test and fix phase.

### P03.5 — Multi-instance correctness

- **Do:** Run two server processes against one database and verify PF-01 (auth caches), PF-02
  (rate limiter), the settings refresh skew, and scheduled jobs running on every worker. Write each
  repro as an integration test that starts two app instances.
- **Done when:** PF-01 and PF-02 are confirmed or closed with evidence.

### P03.6 — Test gap analysis

- **Do:**
  1. Read the coverage report from P00.6.
  2. List the routes with no integration test, the use cases with no unit test, and the screens
     with no e2e.
  3. Rank the gaps by risk: capture paths and auth first.
- **Covers:** P06.1/P07.1 characterisation tests.
- **Done when:** the gap list is in F03.

### P03.7 — Client review

- **Do:** Review the data-fetching patterns (inline vs hooks), query keys, cache invalidation after
  mutations, form handling, error and empty states, outbox and session edge cases, bundle size
  (`next build` output), and the service worker precache list.
- **Done when:** the findings are in F03.

### P03.8 — Shared package review

- **Do:** Map each DTO to its module, and flag contracts duplicated between client and server.
  Identify what becomes generated (Cedar action catalogue, settings registry types), and which
  enums become data (from F01).
- **Done when:** the shared-package plan is in F03.

### P03.9 — Audit-branch code review

- **Do:** Review the 5 audit-branch commits specifically (7.7k lines, partly work-in-progress per
  its own commit message): roster CSV, audit log, the security audit middleware and CloudWatch
  shipping.
- **Done when:** the findings are in F03.

### P03.10 — Write up

- **Do:**
  1. Summarise F03: bug count by severity, refactor backlog size, and the top structural problems.
  2. Update the statuses of PF-01, PF-02, PF-10 and PF-13.
- **Done when:** F03 is complete.

## Exit criteria

- Every long function has a split plan, every module has a target home, and every bug has a
  committed (skipped) repro test.

## Phase report

_Fill in on completion._
