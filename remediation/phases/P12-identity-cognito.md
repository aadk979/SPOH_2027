# P12 — Identity: Cognito hardening and membership lifecycle

| Field             | Value         |
| ----------------- | ------------- |
| Gate              | G3            |
| Depends on        | P08, P09, P11 |
| Decisions         | D-08          |
| Changes behaviour | **Yes**       |
| Size              | L             |

## Purpose

Make the Cognito pool production-grade and managed as code. Pace invites through Cognito's default
sender under the owner's amended D-08 (no SES). Turn
people management into a clear lifecycle: invite → active → deactivated → archived, per event, with
immediate effect everywhere.

## Context for a fresh session

- Design: ADR-006. Person and EventMembership exist from P09.3.
- **10 October teardown supersedes the former live-pool status:** the owner deleted both pools,
  including `ap-southeast-1_9bwl2nGF7`. See [the teardown record](../reports/P08/aws-teardown-2026-10-10.md).
  Staging's synthetic pool is recreated only for P16. Production identity recreation/configuration
  remains behind P12.8; a reference to the deleted pool does not complete P12.1.
- Pool settings are source targets until P16 observes recreated staging. The deleted pool cannot
  be imported or described as though it still exists; production differences remain under P12.8.
- The audit branch brought roster CSV import (`packages/shared/src/rosterCsv.ts`) and a provisioning UI.

## Steps

### P12.1 — Pool configuration as code

- **Do:** Import the pool into CDK (`cdk import`, or keep a reference, per ADR-006). Set:
  - password policy, and self-signup off
  - MFA optional at pool level, **required by the app for admin-tier roles** (enforced at session
    open)
  - threat protection (advanced security)
  - token lifetimes aligned with server sessions
  - managed login branding, and callback/logout URLs per environment
- **Done when:** `cdk diff` on identity is empty after import, and the settings are applied on staging.
- **ADR-011:** the staging, soak, load or sign-off part of _Done when_ runs in P16.8. The step
  closes when its code and tests are green in CI; AWS remains torn down until P16.

### P12.2 — Default-sender invites (reduced by D-08)

- **Owner amendment:** D-08, 30 September 2026, explicitly requires Cognito's default sender,
  no SES, no Route 53 and no paid mailing service. The original SES/DKIM/sandbox and app-sent
  event-membership email requirements are removed, not deferred as unfinished SES features.
- **Do:** Configure the default-sender invitation template and thirty-day temporary passwords;
  pace invite/resend batches within the application allowance shared across the pool.
- **Done when:** code and quota/template tests are green in CI; a synthetic staging invite/resend
  arrives through the default sender in P16.8. No DKIM or SES claim is required under D-08.
- **ADR-011:** the staging, soak, load or sign-off part of _Done when_ runs in P16.8. The step
  closes when its code and tests are green in CI; AWS remains torn down until P16.

### P12.3 — Membership lifecycle

- **Do:** Use cases:
  - invite a person to an event, creating the identity if new and reusing it if existing
  - resend an invite
  - accept, via first sign-in (records `acceptedAt`)
  - change role, which goes through P11 guardrails
  - deactivate a membership, which revokes sessions for that event, drops push, and publishes on
    the bus
  - deactivate a person across all events, which also disables the Cognito user
  - reactivate
  - archiving the event ends all memberships

  Each is audited.

- **Done when:** the use-case tests pass, and deactivation takes effect across instances in under
  2 s (P10.3).

### P12.4 — Provisioning UX

- **Do:** In the event's People area:
  - single invite form
  - CSV import with preview/apply (the audit-branch parser behind the shared plan/apply pipeline)
  - bulk actions (resend, deactivate, change role)
  - a "last seen" and "invite pending" status
  - person detail showing memberships across events (for platform admins)
- **Done when:** e2e covers importing 50 people, fixing 3 errors in the preview, applying, and
  resending one invite.

### P12.5 — Sessions and devices

- **Do:**
  1. A "Your devices" screen (list and revoke).
  2. Admin "sign out everywhere" for a person.
  3. An idle timeout for admin-tier roles (a platform setting).
  4. Session open checks MFA for admin tiers and membership active status.
- **Done when:** e2e covers revoking a device and forcing sign-out.

### P12.6 — Cognito groups

- **Do:**
  1. Per ADR-006 §7: stop creating role groups, since memberships and policies are
     authoritative. No group is kept. Platform-admin status lives in `OrganisationMembership`.
  2. A migration script removes stale group memberships (dry-run first).
- **Done when:** no code reads Cognito groups for authorization.

### P12.7 — Verify and report

- **Do:** Run all suites plus a real Cognito sign-in e2e on staging (MFA enrolment for an admin
  test user), and write the report.
- **Done when:** the exit criteria hold.

### P12.8 — Go/no-go (28 Oct) and production cutover

- **Do:**
  1. Check the twelve criteria in ADR-009 §2 on staging, with evidence per item, and walk the owner
     through them. The owner decides. Record it: `progress.mjs log` plus a note on this step.
  2. **On go:** create production from the same CDK (ADR-008 §3). Rehearse the cutover once on
     staging, then run it (ADR-009 §5): announce, drain, freeze (nginx), final dump, restore,
     migrate, `verify-totals`, smoke, switch. Every step is confirmed with the owner first.
  3. **On no-go:** deploy `release/january` (the P06.12 cherry-picks, Q-P5) to Lightsail with the
     audit branch's runbook, after the owner approves. The programme continues without the
     calendar.
- **Done when:** the decision is recorded, and either production serves the new address with
  identical totals, or the fallback line is deployed.

## Exit criteria

- The pool configuration is managed as code; recreating production retains P12.8's approvals.
  Invites use Cognito's default sender within D-08's allowance; SES is explicitly excluded.
- Admin tiers require MFA, and the membership lifecycle is complete, audited and immediate.

## Phase report

[Identity build report, 10 October 2026](../reports/P12/identity-build-2026-10-10.md).
Implementation and batch CI are still pending completion; P12.1 and P12.8 remain open.
