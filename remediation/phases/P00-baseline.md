# P00 — Baseline, tooling and branch reconciliation

| Field             | Value            |
| ----------------- | ---------------- |
| Gate              | G0               |
| Depends on        | —                |
| Decisions         | D-05, D-11, D-13 |
| Changes behaviour | No               |
| Size              | M                |

## Purpose

Start from a known, measured, reproducible state that matches what is deployed, with a tagged safety
net and the measuring tools every later phase uses to prove progress.

## Context for a fresh session

- Read `remediation/baseline.md`. It holds the measurements from planning. This phase re-measures after
  reconciliation.
- Environment recipe: `remediation/README.md` → _Environment bootstrap_ (no Docker; local Postgres 16).
- The audit branch `origin/feat/audit-cloudwatch` is a strict fast-forward of `main`.

## Scope

**In:** branch reconciliation, the baseline tag, a green lint baseline, full test/e2e/build runs,
metrics, report-only architecture guards, read-only AWS inventory, staging smoke.
**Out:** any product code change.

## Steps

### P00.1 — Reproducible environment

- **Do:**
  1. Follow the bootstrap recipe from a clean checkout and confirm every command works.
  2. Add `scripts/dev-db-local.sh`, which wraps the Postgres-without-Docker recipe so no one has to
     retype it.
- **Covers:** future sessions start in minutes, not by rediscovery.
- **Done when:** the recipe runs end to end in a fresh container, and the script is committed and
  referenced from the README.

### P00.2 — Reconcile branches (needs D-05)

- **Do:**
  1. `git merge --ff-only origin/feat/audit-cloudwatch` on the working branch and push.
  2. Re-read `ONBOARDING_AND_FEATURES.md`, `docs/USER_MANAGEMENT.md`, `docs/AUDIT_LOG.md` and
     `infra/README.md` from the merged tree.
  3. Note any facts that change `baseline.md`.
- **Covers:** the programme starts from what is deployed.
- **Done when:** the working branch contains `319d06d`, and `baseline.md` has an _After reconciliation_
  section.

### P00.3 — Safety-net tag (after P00.2)

- **Do:**
  1. `git tag -a baseline/pre-remediation -m "…"` on the reconciled commit and push the tag.
  2. Document in `remediation/README.md` how to deploy the tag with the existing
     `infra/runbooks/deploy.md`.
- **Covers:** the event never depends on the programme finishing (D-01 C).
- **Done when:** the tag is on origin and the rollback instructions are written.

### P00.4 — Green lint baseline (confirm with owner)

- **Do:**
  1. Ask the owner about `test/do-inference.mjs`, which is unrelated to the product.
  2. Delete it, or move it outside the linted tree, as they choose.
- **Covers:** PF-03. CI lint goes green, so later red lint always means a real regression.
- **Done when:** `npm run lint` exits 0.

### P00.5 — Full baseline run

- **Do:**
  1. Run lint, typecheck, server unit, server integration, client unit and `npm run build`.
  2. Run Playwright e2e against locally running apps with a seeded DB.
  3. Record counts, durations and any flake in `baseline.md`.
- **Covers:** the "before" numbers that P06/P07 must reproduce exactly.
- **Done when:** every suite has a recorded result, and any failure is written up in
  `findings/preliminary.md`.

### P00.6 — Metrics snapshot

- **Do:**
  1. `node remediation/tools/code-metrics.mjs --json > remediation/reports/metrics/P00.json` on the
     reconciled tree.
  2. Add a coverage run (`vitest --coverage`) and store the summary in `reports/metrics/P00-coverage.json`.
- **Covers:** the refactor-debt and coverage baseline.
- **Done when:** both files are committed.

### P00.7 — Architecture guards in report-only mode

- **Do:**
  1. Add ESLint rules as **warnings**: `max-lines-per-function`, `max-lines`, `complexity`,
     `max-depth`, `max-params` (limits from `engineering-standards.md` §2).
  2. Add `dependency-cruiser` with a config describing the target boundaries (§3/§4) and a
     `npm run arch:check` script.
  3. Add a CI job that prints both reports without failing.
- **Covers:** every later phase can show violations going down. P06/P07 flip the guards to errors.
- **Done when:** `npm run arch:check` and `npm run lint` report counts, and the CI job exists.

### P00.8 — Read-only AWS inventory (needs D-13)

- **Do:** With the SDK (there is no CLI):
  1. `sts:GetCallerIdentity`.
  2. Cognito `DescribeUserPool`, `ListGroups`, `DescribeUserPoolClient` for `ap-southeast-1_9bwl2nGF7`.
  3. S3 `ListBuckets` (names only), plus `GetBucketVersioning`, `GetPublicAccessBlock` and
     encryption on the backups bucket.
  4. `lightsail:GetInstances`.
  5. `logs:DescribeLogGroups`.
  6. `verifiedpermissions:ListPolicyStores`.
  7. Write the results (no secrets) to `findings/F04-security-ops.md` § _Inventory_.
- **Covers:** what exists before designing what should.
- **Done when:** the inventory is written, and the caller identity and permissions are known.

### P00.9 — Staging smoke (needs D-13)

- **Do:**
  1. Run `infra/scripts/smoke-test.sh` against `spoh2027.duckdns.org`.
  2. Record which of its 36 endpoints pass.
- **Covers:** the deployed system's actual state, not the repo's.
- **Done when:** the results are in `baseline.md`.

## Verification

```bash
npm run lint && npm run typecheck && npm run build
npm run test:unit --workspace server && npm run test:integration --workspace server
npm run test --workspace client && npm run test:e2e --workspace client
npm run arch:check
node remediation/tools/code-metrics.mjs
```

## Exit criteria

- The working branch is reconciled and tagged, and lint is green.
- Every suite is measured, with results and metrics committed.
- Guards run in CI in report-only mode.
- The AWS inventory is recorded.

## Risks

- **The audit branch carries uncommitted-then-committed work-in-progress** (its commit message says
  so). Mitigation: P03 reviews it like any other code, and nothing about it is assumed correct.
- **Postgres 16 locally vs 17 in production.** Mitigation: CI runs 17. Anything that passes locally
  but fails in CI is investigated rather than dismissed.

## Phase report

**Status: done (2026-09-25).** 7 steps done and 2 skipped because D-13 rules them out.

### Summary

The environment is reproducible (`scripts/dev-db-local.sh`), and lint is green for the first time
since `22e38ae`. Every suite has been measured, including e2e and coverage for the first time. The
architecture guards run in report-only mode locally and in CI. The baseline is `main` (`d2497b6`),
not the deployed audit branch: that was the owner's choice (D-05), and its consequences are recorded
as PF-14. The safety net `baseline/pre-remediation` is on origin as a branch at `d2497b6`.

| Step  | Status    | Outcome                                                                                                |
| ----- | --------- | ------------------------------------------------------------------------------------------------------ |
| P00.1 | ✅ done   | Recipe re-run end to end; `scripts/dev-db-local.sh` verified on a fresh cluster                        |
| P00.2 | ✅ done\* | \*By D-05, no fast-forward. `baseline.md` § _After reconciliation_ replaces "contains `319d06d`"       |
| P00.3 | ✅ done\* | \*A branch, not a tag: tag pushes get HTTP 403 here. Created via the GitHub API; rollback docs written |
| P00.4 | ✅ done   | `test/do-inference.mjs` deleted (owner's choice); `npm run lint` exits 0                               |
| P00.5 | ✅ done   | All green except e2e: 23/26, with 3 real failures (PF-15, PF-16)                                       |
| P00.6 | ✅ done   | `P00.json` and `P00-coverage.json`; coverage provider installed                                        |
| P00.7 | ✅ done   | ESLint guards and dependency-cruiser (warn); `arch:check`, `arch:report`; CI job                       |
| P00.8 | ⏭ skipped | D-13 did not allow AWS credentials. Carried to P04.7, which has the same condition                     |
| P00.9 | ⏭ skipped | Not runnable under D-05/D-13 (audit-branch script, `aws` CLI, AWS credentials, chief password)         |

**Exit criteria:** reconciled (by decision) and tagged (as a branch) ✅, lint green ✅, suites
measured and committed ✅, guards in CI ✅. The AWS inventory is ❌ not recorded, by D-13.

### Still open (not blocking P00)

- **Before P01:** D-02 and D-04, which P01's classification depends on.
- **Before P05:** D-01, D-03, D-07/D-10, D-08 and D-12, plus what happens to
  `feat/audit-cloudwatch` (PF-14).
- **If D-13 is ever widened:** run the P00.8 inventory and the P00.9 smoke test then (P04.7).

**After P00:** everything was merged to `main`, and the owner changed D-11 to "`main` only". The CI
failures, the audit advisories, the three e2e failures and the harness items were then fixed on
`main`. See `baseline.md` § _Fixes on `main` after P00_.

### Deviations from plan

- **P00.2:** no reconciliation, by D-05. The deployed system is ahead of the baseline, including one
  migration (PF-14).
- **P00.3:** `baseline/pre-remediation` is a branch, because this session cannot push tags (HTTP 403)
  and no available API creates one. It was cut from `main` while `main` was `d2497b6`. The rollback
  docs point at the audit branch's runbook by commit and warn against `db:deploy` on a database the
  audit branch has migrated.
- **P00.8 / P00.9:** skipped under D-13. There is no AWS inventory and no smoke test of staging.
- **P00.5:** Playwright 1.62 cannot use the container's Chromium build without help, so
  `client/playwright.config.ts` gained an opt-in `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `db:reset` is
  refused for agents, so the dev DB was built with `db:deploy` and `db:seed` instead. The dev server
  ran with the AWS credentials removed from its environment (D-13).
- **P00.6:** `@vitest/coverage-v8` had never been installed, so coverage could not run. It is now a
  root dev dependency, with `test:coverage` scripts.
- **P00.7:** added `scripts/arch-report.mjs` (counts per rule) and `tsconfig.depcruise.json` (client
  alias resolution), neither of which the plan named.

### Metrics before → after

| Measure                       | Planning (`main`) | End of P00                                 |
| ----------------------------- | ----------------- | ------------------------------------------ |
| Lint errors                   | 8                 | **0** (plus 131 guard warnings, new)       |
| Server unit / integration     | 233 / 288         | 233 / 288                                  |
| Client unit                   | 19                | 19                                         |
| Client e2e                    | not run           | 23 of 26 passing                           |
| Build                         | not run           | pass (24 s)                                |
| Functions > 50 / files > 300  | 97 / 18           | 97 / 18 (no product code changed)          |
| Coverage, server (configured) | not measurable    | lines 78.4 %, branches 60.1 % (below gate) |
| Coverage, client              | not measurable    | lines 6.5 %                                |
| Boundary violations           | ≈ 30 cross-module | 149 across 5 rules, 0 cycles               |

Snapshots: `reports/metrics/P00.json`, `P00-coverage.json` and `P00-arch.json`.

### Findings added

PF-14 (deployed ≠ baseline), PF-15 (stale e2e test), PF-16 (320 px overlap), PF-17 (no e2e in CI),
PF-18 (coverage gate never enforced), PF-19 (CI dependency audit red on `main`) and PF-20 (harness
rough edges: root `npm test`, pg concurrent-query deprecation, 14 unformatted files). PF-03 is fixed
and PF-13 is checked.

### Follow-ups for later phases

- P03: PF-20's concurrent `client.query()` inside transactions. P04: PF-19's exploitability, and
  whether `prisma migrate deploy` tolerates the audit-branch migration (PF-14).
- P06/P07: run e2e by hand before and after each step until P08 puts it in CI (PF-17), and flip the
  P00.7 guards to errors as each count reaches zero.

### Commits

`ef82b25` decisions · `a3289c1` dev DB script · `616c70c` reconciliation record · `153b116` rollback
docs · `dca2dff` P00.3 blocked · `ef860f3` delete do-inference · `9300b43` Playwright executable ·
`4aa2e7b` baseline run · `c14d352` coverage tooling · `0322a8b` metrics snapshot · `dd21015` guards ·
`00e16a0` guard docs, plus the `chore(remediation): P00.x done` tracker commits and the phase close.
