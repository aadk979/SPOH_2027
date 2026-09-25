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

_Fill in on completion: summary, deviations from plan, metrics before → after, follow-ups, commits._
