# P15 — Security hardening and production environment

| Field             | Value            |
| ----------------- | ---------------- |
| Gate              | G5               |
| Depends on        | P14              |
| Decisions         | D-07, D-08, D-14 |
| Changes behaviour | **Yes**          |
| Size              | L                |

## Purpose

Close every remaining security finding, prove isolation and authorization with automated tests,
stand up production from the same CDK code, and move off the Lightsail box without losing data.

## Context for a fresh session

- Input: `findings/F04-security-ops.md` and `findings/BACKLOG.md` (open High and Blocker items).
- Production must be created from the same stacks as staging. No hand-made resources.
- Cutover touches live data and real users. Every step here is confirmed with the owner first.

## Steps

### P15.1 — Close High and Blocker findings

- **Do:** Fix every open High and Blocker item from F04 and BACKLOG, each with a test.
- **Done when:** BACKLOG shows zero open High or Blocker security items.

### P15.2 — Shared rate limiting (fixes PF-02)

- **Do:**
  1. A rate-limit store per ADR-003/D-14 (Postgres by default), keyed by person and IP, with the
     tiers from platform settings.
  2. Align the WAF rate-based rules with it.
  3. Add the multi-instance test.
- **Done when:** limits hold across instances.

### P15.3 — Headers, CSP, CORS and cookies

- **Do:**
  1. A strict CSP (nonces for Next), HSTS preload readiness, and a CORS allowlist from infra
     config.
  2. Cookie domain and SameSite for the production domain.
  3. Verify with an automated header test against staging.
- **Done when:** the header test is green, and securityheaders-style checks show A.

### P15.4 — Isolation and IDOR suite

- **Do:** Extend the P09 cross-event suite to cross-station and cross-person cases, generated from
  the route inventory: every id-taking route × foreign ids × every role.
- **Done when:** it runs in CI with zero leaks.

### P15.5 — Authorization regression and monitoring

- **Do:**
  1. The generated route × role × phase matrix from P11 runs in CI against the deployed policy store
     for staging (nightly).
  2. Denial-spike and policy-change alarms, since policy changes are audited and notified to admins.
- **Done when:** the nightly job is green, and the alarms are wired.

### P15.6 — Secrets and credentials

- **Do:**
  1. Rotation for DB credentials (Secrets Manager) and the signing secrets (a dual-key window).
  2. Remove IAM user keys from every host (PF-12). Retire the Lightsail IAM user after cutover.
  3. Enable CloudTrail, GuardDuty and Security Hub foundational checks if P04.7 found them off
     (with the owner's approval, because of cost).
- **Done when:** no long-lived application keys exist, and rotation is rehearsed once.

### P15.7 — Data protection and retention

- **Do:**
  1. Per-event retention settings enforced by scheduler handlers: lost-person purge, roster PII
     after archive + N days, photos, idempotency, sessions.
  2. Audit log retention in the DB and in CloudWatch.
  3. Export and erasure of a person's data on request.
- **Done when:** retention tests pass with time travel, and there is a documented data map.

### P15.8 — Production stand-up and cutover

- **Do:**
  1. Deploy the prod stage (sizing per ADR-008).
  2. Rehearse on staging: restore the latest Lightsail backup into RDS, run the P09 migrations, and
     verify totals with the P09.4 script.
  3. Write the cutover runbook: freeze, final dump, restore, verify, DNS switch, smoke, and a
     rollback path to the Lightsail box.
  4. Execute it in a window the owner chooses.
- **Done when:** production serves the event domain, the totals match, and Lightsail is kept
  read-only until the owner approves decommissioning.

### P15.9 — Security review

- **Do:**
  1. Walk the OWASP ASVS L2 checklist.
  2. Run `/security-review` on the full diff since the baseline tag, and a dependency audit.
  3. Fix the findings.
- **Done when:** the checklist is recorded in F04 § _Final_, with no open High items.

### P15.10 — Report

- **Do:** Write the report: security posture before/after, cost of prod, and the cutover record.
- **Done when:** the exit criteria hold.

## Exit criteria

- There are no open High or Blocker security findings, and isolation and authorization are proven
  in CI.
- Production runs from CDK with rotated secrets and no static keys, and cutover is done with
  verified data.

## Phase report

_Fill in on completion._
