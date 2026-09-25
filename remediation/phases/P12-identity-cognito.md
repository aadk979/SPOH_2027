# P12 — Identity: Cognito hardening and membership lifecycle

| Field             | Value    |
| ----------------- | -------- |
| Gate              | G3       |
| Depends on        | P09, P11 |
| Decisions         | D-08     |
| Changes behaviour | **Yes**  |
| Size              | L        |

## Purpose

Make the Cognito pool production-grade and managed as code. Send branded invites through SES. Turn
people management into a clear lifecycle: invite → active → deactivated → archived, per event, with
immediate effect everywhere.

## Context for a fresh session

- Design: ADR-006. Person and EventMembership exist from P09.3.
- The pool `ap-southeast-1_9bwl2nGF7` is live and holds real identities. **Never replace it.** Any
  CDK change to it is reviewed with `cdk diff` and confirmed with the owner.
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

### P12.2 — SES for invites (needs D-08)

- **Do:**
  1. SES domain identity with DKIM, and a configuration set with bounce and complaint handling.
  2. Cognito sends through SES.
  3. Invite and reset templates carry the organisation and event name.
  4. Leave the SES sandbox for production.
- **Done when:** a staging invite arrives, branded, passing DKIM.

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
  1. Per ADR-006: stop creating role groups, since the roster and policies are authoritative.
     Keep a single `PlatformAdmin` group, if the ADR says so, for break-glass console visibility.
  2. A migration script removes stale group memberships (dry-run first).
- **Done when:** no code reads Cognito groups for authorization.

### P12.7 — Verify and report

- **Do:** Run all suites plus a real Cognito sign-in e2e on staging (MFA enrolment for an admin
  test user), and write the report.
- **Done when:** the exit criteria hold.

## Exit criteria

- The pool is managed as code without replacement, and invites come from SES.
- Admin tiers require MFA, and the membership lifecycle is complete, audited and immediate.

## Phase report

_Fill in on completion._
