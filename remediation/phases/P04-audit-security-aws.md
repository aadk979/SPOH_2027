# P04 — Audit D: security and AWS production readiness

| Field             | Value |
| ----------------- | ----- |
| Gate              | G0    |
| Depends on        | P00   |
| Decisions         | D-13  |
| Changes behaviour | No    |
| Size              | L     |

## Purpose

Know exactly how secure and how operable the system is today, in the repo and in the AWS account,
so P08/P11/P12/P15 fix the real gaps rather than generic ones.

## Context for a fresh session

- **Do not call AWS and do not query the live staging site.** The owner's answer to D-13 forbids
  using this container's AWS credentials, and allows staging access only for the P00.9 smoke test.
  P00.8 (the AWS inventory) was skipped for that reason. Everything in this phase is judged from the
  repo: code, `.env.example` files, scripts such as `server/scripts/verify-cognito.mjs`,
  `ops/backup/`, and the Lightsail notes in `infra/` if present.
- D-04 was answered: the three counts and no-PII rules become **per-event options**, not fixed
  invariants. The threat model must treat an event with PII enabled as in scope.
- Existing controls worth keeping:
  - refresh rotation with reuse detection
  - origin check and JSON-only on cookie routes
  - an in-memory access token
  - roster-authoritative roles
  - audit in the same transaction
  - lost-person purge
  - a 15-minute backup daemon
- Output: `findings/F04-security-ops.md`.

## Steps

### P04.1 — Threat model

- **Do:** Write a STRIDE model covering:
  - **actors:** volunteer, IC, coordinator, admin, anonymous internet, a stolen phone, a
    malicious insider
  - **assets:** roster PII, lost-person descriptions, counts integrity, audit log, credentials
  - **trust boundaries:** browser ↔ API, API ↔ DB, API ↔ AWS, admin ↔ policies
- **Done when:** the model, and the top risks ranked by likelihood × impact, are in F04.

### P04.2 — Authentication and sessions

- **Do:** Review:
  - **Cognito pool:** password policy, MFA, advanced security, token lifetimes, hosted UI domain,
    callback/logout URLs, self-signup off
  - **server sessions:** refresh rotation, family revocation, cookie flags and scope, CSRF
    defences, the local provider's production guard
  - **client:** token handling, silent refresh races
  - **device revocation**
- **Done when:** the findings are in F04.

### P04.3 — Authorization

- **Do:**
  1. Generate the route inventory: method, path, middleware chain, capability, station scope.
  2. Check that every route is covered.
  3. Test for IDOR by accessing records by id across stations.
  4. List every place a check happens outside middleware (admin guardrails, attendance gating).
  5. Note what changes when data becomes event-scoped: cross-event access must be impossible.
- **Covers:** the P11 policy design input.
- **Done when:** the route/permission table and the IDOR results are in F04.

### P04.4 — Input, output and transport

- **Do:** Review:
  - validation coverage per route
  - error leakage (stack traces, internal ids)
  - helmet and CSP
  - CORS allowlist
  - rate limits (verify PF-02)
  - S3 presign conditions (content type, size, key prefix, expiry)
  - web push payloads
  - QR and PIN handling
- **Done when:** the findings are in F04.

### P04.5 — Secrets and configuration

- **Do:**
  1. Run `gitleaks` over the full history.
  2. List where each secret lives today (`.env` on the host, explicit IAM keys per PF-12).
  3. Record rotation ability and blast radius per secret.
- **Done when:** the findings are in F04. Any leaked secret is reported to the owner **immediately**,
  not at phase end.

### P04.6 — Data protection

- **Do:**
  1. Build the PII inventory (roster: name, email, phone; lost-person descriptions; photos).
  2. Check retention enforcement (the purge job), backup encryption and access, audit log
     integrity and retention, and CloudWatch log retention.
  3. Record data residency: everything in `ap-southeast-1`?
- **Done when:** the findings are in F04.

### P04.7 — AWS account review (read-only)

> **Blocked by D-13: no AWS calls.** Do not use the credentials in this environment. Instead, write
> the list below into F04 as **questions for the owner**, noting anything the repo itself answers
> (IAM policy JSON under `ops/`, bucket names, pool ids). Then mark the step `skipped` with that
> note, unless the owner has since changed D-13.

- **Do:** Review:
  - the IAM users, roles and policies the app uses (least privilege? long-lived keys?)
  - S3 bucket policies and public access
  - Cognito app client settings
  - Lightsail firewall
  - CloudWatch log groups and retention
  - Budgets and cost anomaly detection
  - CloudTrail on or off
  - GuardDuty and Security Hub status
  - the root account MFA, **only as a question to the owner**
- **Done when:** the findings are in F04.

### P04.8 — Operational readiness

- **Do:** Assess:
  - monitoring and alerting: what pages a human today?
  - backup/restore RPO and RTO (the last rehearsal?)
  - the deploy and rollback procedure and its duration
  - capacity: repeat the load test locally at 100 and 300 clients
  - runbooks, the on-call path on event day, and single points of failure (the single box)
- **Done when:** the findings are in F04.

### P04.9 — Dependencies

- **Do:** `npm audit`, `npm outdated`, and licence check (`license-checker`). Record the pinned
  versions that block upgrades.
- **Done when:** the findings are in F04.

### P04.10 — Write up

- **Do:**
  1. Summarise F04 by severity.
  2. List anything that needs action **before** the programme (for example, a leaked credential or
     a public bucket), raised with the owner immediately.
- **Done when:** F04 is complete.

## Exit criteria

- The threat model, route/permission table, account inventory and ops assessment are written, and
  every finding has a severity and a fix phase.

## Phase report

**Status: done (2026-09-25).** 9 of 10 steps done, P04.7 skipped under D-13 (its checklist became
33 owner questions). No product code changed: `git diff 8d65a3e..HEAD -- server/src client/src
packages ops` is empty. P04 added skipped repros and four guard tests
(`server/tests/integration/repro/security.test.ts`, a block in `client/tests/repro/outbox.test.ts`),
two probe scripts under `reports/P04/`, and portability fixes to two metrics tools.

### Summary

`findings/F04-security-ops.md` holds a STRIDE threat model over five trust boundaries with 14
ranked risks, a route inventory of all 98 routes with their full middleware chains (Appendix A),
IDOR results, a secret inventory with rotation and blast radius, a PII inventory with retention,
33 AWS and ownership questions, an operational-readiness assessment with local load, restore and
PF-14 measurements, and a dependency review: **25 findings, 0 Blocker, 8 High (3 to verify),
11 Medium, 6 Low**. **No leaked secret** (gitleaks over 116 commits plus targeted greps), and
nothing in the repo suggests a public bucket (Q-S2 settles it). The headline is operability,
not intrusion:

- a campus network signs in about ten people a minute (F04-006);
- nothing pages anyone (F04-017);
- off-site backups are unproven on the one box (F04-018, F04-019);
- lost-person descriptions outlive the purge (F04-013);
- long-lived IAM keys can reset any volunteer's password (F04-010).

| Step   | Status    | Outcome                                                                                                                                              |
| ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P04.1  | ✅ done   | STRIDE over browser–API, API–DB, API–AWS, admin–policies and operator–host; 8 actors, 8 assets (D-04's PII mode in scope); 14 risks ranked           |
| P04.2  | ✅ done   | 13 controls verified; F04-001, F04-002, F04-003 (client repro), F04-023; F03-009/010, F02-032, PF-01 re-confirmed                                    |
| P04.3  | ✅ done   | `routes.mjs`: 98 routes, every data route gated; 12 rules outside middleware listed for P11; IDOR: 4 fail (F04-004, F04-005, F04-024), 4 guards hold |
| P04.4  | ✅ done   | 10 areas; F04-006 (repro), F04-007, F04-008, F04-009, F04-025; PF-02's security impact small, its availability impact is F04-006                     |
| P04.5  | ✅ done   | gitleaks + greps: no leak; 14 secrets with location, rotation, blast radius; F04-010 (PF-12 confirmed), F04-011, F04-012                             |
| P04.6  | ✅ done   | PII inventory; purge, backups, audit and log retention, residency; F04-013 (repro), F04-014, F04-015, F04-016                                        |
| P04.7  | ⏭ skipped | D-13: no AWS calls. 33 questions with repo-known facts in F04 § P04.7                                                                                |
| P04.8  | ✅ done   | load test 100/300 clients, poll probe, dump/restore timing, PF-14 verified; F04-017…021                                                              |
| P04.9  | ✅ done   | `npm audit` 0; outdated grouped; 5 blocking pins; licences acceptable; F04-022                                                                       |
| P04.10 | ✅ done   | F04 summary, ranked table, 7 actions for the owner before the programme                                                                              |

**Exit criteria:** threat model ✅; route/permission table ✅ (Appendix A); account inventory
⏭ replaced by the owner questions (D-13), with everything the repo answers filled in; ops
assessment ✅; every finding has a severity and a fix phase ✅ (25/25).

### Needs the owner before P05

- **The seven actions** in F04 § Summary. First: Q-S2 (public access) and Q-R1 (root MFA). Then
  proving off-site backups (Q-I3, Q-L2), and the sign-in limit before training on 4 Nov.
- **The P04.7 questions**, which confirm or close F04-002, F04-010, F04-015, F04-018 and F04-023.
- **Still open from before:** D-01, D-03, D-10 (they block P05), D-07, D-08, D-12, and the fate of
  `feat/audit-cloudwatch` (PF-14; P04.8 showed the baseline deploys safely onto its schema).

### Deviations from plan

- **Environment.** This session ran on the owner's Windows laptop, not the cloud container: a
  separate worktree of `main` (`../V1-main`), because the usual checkout was on
  `feat/audit-cloudwatch` with an unfinished merge of `main`, which was left untouched. Postgres was
  the existing Docker container, using scratch databases (`spoh2027_p04`, `spoh2027_pf14_test`,
  dropped afterwards) and the suite's own `spoh2027_test`; the developer's `spoh2027` database was
  not touched.
- **Node 25.** The laptop runs Node 25, which dependency-cruiser refuses, so `arch:report` ran
  under a temporary Node 24 from npx. The two metrics tools also failed on Windows paths and on
  spawning `npx`; both are fixed (`cd49de4`) and reproduce P03's snapshots exactly.
- **Load figures are an upper bound.** The load test ran on a 16-core laptop against one API
  process with request logging off; the deployed box has 2 vCPU shared with Postgres. P04 also
  probed the polls, which the script does not cover (F04-021).
- **gitleaks and the licence checker** were run from a scratch directory and npx, not added as
  dependencies; commands are in `reports/P04/README.md`.
- **`progress.json` formatting.** `progress.mjs` writes JSON that prettier reflows; from P04.1 to
  P04.9 the file was committed unformatted, so `format:check` was red on it. P04.10 re-formatted
  it. Run `npx prettier --write remediation/progress.json` after each tracker update.
- **Checks at phase end:** lint 0 errors (the same 131 guard warnings), typecheck clean, prettier
  clean, server 525 passed + 50 skipped, client 19 passed + 7 skipped. The server count is P03's
  521 + 44 plus the 4 guard tests and 6 skipped repros. e2e was not re-run: no product code changed.

### Metrics before → after

| Measure                      | End of P03                        | End of P04                        |
| ---------------------------- | --------------------------------- | --------------------------------- |
| Lint errors / guard warnings | 0 / 131                           | 0 / 131                           |
| Functions > 50 / files > 300 | 97 / 18                           | 97 / 18                           |
| Guard counts (`arch:report`) | `P03-arch.json`                   | identical                         |
| Tests (server / client)      | 521 + 44 skipped / 19 + 6 skipped | 525 + 50 skipped / 19 + 7 skipped |
| Findings                     | F03: 42                           | F04: 25                           |

Snapshots: `reports/metrics/P04.json` and `P04-arch.json` (identical to P03 apart from timestamps).

### Findings added

F04-001…025 in `findings/F04-security-ops.md`. PF-12 confirmed from the repo (F04-010); PF-14
verified and its status updated in `preliminary.md`; PF-01, PF-02, F03-001, F03-009, F03-010,
F02-032, F03-031 and F03-040 re-checked, not re-filed.

### Follow-ups for later phases

- **P05:** retention schedule and the wording of the lost-person promise (F04-013, F04-014);
  a PII classification for D-04 (F04-016); event scoping enforced below the handlers, by a
  repository guard or row-level security (P04.3); whether off-campus PIN attendance is an event
  setting (F04-009).
- **P06:** replay store for PII endpoints (F04-013); announcement audience and IC targeting
  (F04-005, F04-024); `sid`↔`sub` binding (F04-011); push endpoint allowlist (F04-025); limits on
  the six unthrottled routes (F04-008). Un-skip each repro in its fixing commit.
- **P07:** outbox ownership (F04-003, with F03-033); same-origin notification URLs (F04-011).
- **P08:** Cognito as code (F04-002), task roles instead of keys (F04-010), secrets store (F04-011),
  audit roles and log groups by IaC (F04-015), alerting (F04-017), managed database with PITR
  (F04-018), topology (F04-019), image-based deploy and rollback (F04-020), Dependabot (F04-022).
- **P11/P12:** station-scoped reads (F04-004), API-issued tokens only (F04-001), SES (F04-023).
- **P15/P16:** CSP nonces (F04-007), sign-in limits keyed on failures (F04-006), load test with the
  real poll mix on the target size (F04-021), a timed restore rehearsal (F04-018).

### Commits

`dbcd5a9` threat model · `6e67e81` authentication · `04b3611` authorization · `f92ff0d` input and
transport · `89a1926` secrets · `dd17a53` data protection · `45211fd` AWS questions ·
`5070209` operational readiness · `4e5d521` dependencies · `a6ad515` summary · `cd49de4` metrics
tools on Windows, plus the `chore(remediation): P04.x done` tracker commits and the phase close.
