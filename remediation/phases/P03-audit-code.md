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

**Status: done (2026-09-25).** 10 of 10 steps done. No product code changed:
`git diff d4f6399..HEAD -- server/src client/src packages ops scripts` is empty. P03 added skipped
tests only (`server/tests/{integration,unit}/repro/`, `client/tests/repro/`).

### Summary

`findings/F03-code-quality.md` holds the module map with a target for all 359 exported
declarations, a split plan for all 97 long functions, twelve "one way to do it" decisions, a
per-module correctness review, multi-instance, test-gap, client, shared-package and audit-branch
reviews: **42 findings, 3 High, 20 Medium, 19 Low**, a ranked table and seven structural problems
for the owner. **50 skipped repro tests** reproduce every bug on `main` that can be reproduced
(`run-repros.sh` shows all 50 failing today), including the six P02 bugs it was asked to carry.
Headline: the role rules are enforced on the admin screen's path only, so a Deputy can make
themselves an Admin through the roster import (F03-001); paper tallies merge on import (F03-012);
queued captures are parked for good after a session lapse or a restart (F03-033); five races lose
every run; and the per-process state assumed by caches, limits, settings and jobs breaks with more
than one worker (PF-01, PF-02 confirmed).

| Step   | Status  | Outcome                                                                                                                                                            |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P03.1  | ✅ done | `module-map.mjs`: 47 units, 359 exports each with a target (Appendix A); SVG graphs; PF-10 measured (57/32/33); 27 dead exports; matrix oddities located           |
| P03.2  | ✅ done | `backlog.mjs`: 97 of 97 flagged functions have a split plan (H 35, M 37, L 25), Appendix B; 18 long files mapped                                                   |
| P03.3  | ✅ done | `jscpd`: 32 clones, 1.3 %; ten clusters; twelve patterns with one way each; F03-029                                                                                |
| P03.4  | ✅ done | every module reviewed against the checklist; F03-001…028 with 38 skipped repros; F02-002/006/027/032 root-caused; `CardStatus.LOST` intent confirmed; PF-20 traced |
| P03.5  | ✅ done | two app instances in one test: PF-01 and PF-02 confirmed; F03-030 (settings skew), F03-031 (purge double-writes)                                                   |
| P03.6  | ✅ done | `test-gaps.mjs`: 23 of 95 routes untested, 81 functions never run, 0 use-case unit tests, 17 of 29 screens without e2e; 11 ranked gaps                             |
| P03.7  | ✅ done | F02-010 and F02-011 root-caused with repros, F02-032's client half; F03-032…037; bundle 613 KB gzip                                                                |
| P03.8  | ✅ done | `shared-map.mjs`: DTO → module map, 7 duplicated contracts, 3 generated artefacts, 4 enums to data; F03-038                                                        |
| P03.9  | ✅ done | audit branch: fixes F03-001, F02-002, F03-025 and audit pagination; F03-039…042; facts for PF-14                                                                   |
| P03.10 | ✅ done | F03 summary and ranked table; PF-01, PF-02, PF-10, PF-13 statuses; PF-20 updated; F02's LOST row corrected                                                         |

**Exit criteria:** every long function has a split plan ✅ (97/97); every module has a target home
✅ (every export, Appendix A); every bug has a committed skipped repro ✅ for every bug on `main`
that can have one. The exceptions are stated in F03: F03-029 and F03-037 are measurements,
F03-034 is a design question, and F03-039…042 are in audit-branch code not on `main` (each says
what its test must assert).

### Still open (not blocking P04)

- **Before P05:** D-01, D-03, D-07/D-10, D-08, D-12, the fate of `feat/audit-cloudwatch` (PF-14,
  now with P03.9's facts), and the owner questions in F01 § Summary. P03 adds none of its own; it
  adds two design points for P05 (F03-034 which captures queue offline; F03-028 the lost-card rule).
- **For P04:** F03-001, F03-009, F03-010 and F03-042 are security-relevant and P04 re-checks them
  in the wider authorization and session review; the audit branch's `infra/` and IAM files are
  P04's.

### Deviations from plan

- **`/code-review` per module (P03.4)** was not run: the skill reviews a diff and there is none.
  Every module was read in full against the checklist instead, and each suspected bug had to fail a
  test before it was filed.
- **Races as repeated rounds.** A single concurrent round lost only some runs, so each race test
  runs five rounds (or loops) and fails every run; each was run three times.
- **Two workers in one process.** P03.5 loads the app twice with `vi.resetModules()` rather than
  starting two server processes; each copy has its own caches, limiter, settings and jobs, which is
  what separates workers, and the tests stay in the normal suite.
- **Tools outside the repo.** `jscpd` and the WebAssembly Graphviz renderer were installed in a
  scratch directory, not added as dependencies; the commands are in `reports/P03/README.md`.
- **Next 16 prints no per-route sizes**, so the bundle was measured from `.next/static/chunks` and
  the client reference manifests.
- **Audit-branch repros** cannot run on `main`; P03.9 records each test to write with the code.
- **Checks:** all green: lint (0 errors, the 131 expected guard warnings), typecheck,
  `format:check`, `npm test` (server 521 passed + 44 skipped; client 19 passed + 6 skipped) and
  `npm run build`. e2e was not re-run: no product code changed.

### Metrics before → after

| Measure                      | End of P02      | End of P03                        |
| ---------------------------- | --------------- | --------------------------------- |
| Lint errors / guard warnings | 0 / 131         | 0 / 131                           |
| Functions > 50 / files > 300 | 97 / 18         | 97 / 18                           |
| Guard counts (`arch:report`) | `P02-arch.json` | identical                         |
| Tests (server / client)      | 521 / 19        | 521 + 44 skipped / 19 + 6 skipped |
| Findings                     | F02: 32         | F03: 42                           |

Snapshots: `reports/metrics/P03.json` and `P03-arch.json` (identical to P02 apart from timestamps).

### Findings added

F03-001…042 in `findings/F03-code-quality.md`. PF-01, PF-02, PF-10, PF-13 confirmed and PF-20
updated in `preliminary.md`. F02-002, F02-006, F02-010, F02-011, F02-027, F02-032 reproduced and
root-caused; none re-filed.

### Follow-ups for later phases

- **P06:** un-skip each server repro in the commit that fixes it (ranked table in F03); work the
  P03.2 backlog in the module-map order; apply the P03.3 decisions; F03-001 and F03-012 first.
- **P07:** client repros (F02-010, F03-032, F03-033, F03-035, F03-036), the client half of the
  backlog, F03-037 and F03-038.
- **P06.1 / P07.1:** characterise the P03.6 ranked gaps first (hosted sign-in, capture screens,
  corrections, safety).
- **P10.3, P15.2, D-09:** the multi-instance defects (PF-01, PF-02, F03-030, F03-031, F03-042).
- **P12:** F02-032 and F03-010 together (grace window and conditional rotation).

### Commits

`6a40065` module map · `a26403c` backlog · `979eb53` duplication · `4ae80c7` correctness repros ·
`0fc8049` multi-instance · `f4daa42` test gaps · `53ce12e` client · `998f301` shared ·
`c588817` audit branch · `2809bc4` summary, plus the `chore(remediation): P03.x done` tracker
commits and the phase close.
