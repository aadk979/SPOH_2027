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

- Use AWS **read-only**. The P00.8 inventory is the starting point.
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

_Fill in on completion._
