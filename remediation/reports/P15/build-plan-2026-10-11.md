# P15 build plan — 11 October 2026

Planning while foundation/P13 CI runs; no P15 implementation or acceptance is
claimed. Build P14 first. ADR-011 keeps browser/staging execution in P16.

## Shared rate limiting and denial audit

Replace process-local quota Maps with one UNLOGGED PostgreSQL counter table as
ADR-003 requires. Namespace each tier, failed sign-in and denial deduplication;
sharing the old keys without a namespace would mix independent quotas. Hash
subjects, index expiry and namespace/subject, and retain a generation identifier.
Use atomic parameterised UPSERTs, not read then write. Sample ServerClock once.
Reset/decrement must be awaited, clamped and fenced to the charged generation.

Express rate-limit's decrement callback has no generation argument. Carry the
request charge through AsyncLocalStorage so an old successful response cannot
decrement a newly reset window. A failed decrement conservatively retains its
charge. Database failure returns explicit SERVICE_UNAVAILABLE; never fall back
to an in-memory quota. Preserve person/IP, organisation, settings and failed-only
sign-in semantics. Cleanup deletes only expired rows in bounded indexed batches.

For denied requests, the first counter claim and security audit belong in the
same transaction: audit failure must not consume the only audit claim. Keep each
request's denial log, cross-event key separation and the pending-set settle seam.
No active-key eviction. Cover independent apps/pools, concurrent exact counts,
generation/reset/expiry races, settings changes, quotas, rollback and outages.

Baseline edge protection is HTTP API throttling plus application quotas. ADR-008
does not require WAF in the baseline; D-10 permits the optional production WAF
during January only. Correct stale P08 wording rather than invent a paid baseline.

## Static CSP and current authority

Hash the inline scripts actually produced by the Next static export. A server
nonce cannot protect prebuilt bootstrap scripts. Inspect Express static serving,
Firebase hosting configuration and Next configuration together, including event
path remapping and header size. Branding uses approved linked theme CSS/assets,
escaped metadata and bundled runtime code, with no new inline bootstrap.

Legacy card generation, void and reissue still need current permission checks,
event/card lock ordering and durable UUID receipts. Inspect print-selection versus
issue races too. Preserve capture-phase rules and completed replay semantics.
Expand role/event/station/person isolation, including the intentional distinction
between IC counts at other stations and restricted foreign-station rosters.

## Identity restoration (P15.8, D-24)

Replace the unsafe legacy sync-cognito-subs loop with an import-safe,
default-dry-run reprovision command and public recovery service. Require explicit
database, skip-dotenv, target pool/organisation, operator evidence and reason.
Dry run performs no journal writes or mail; output IDs and counts without emails,
subjects, passwords or tokens. The historical script auto-loads dotenv, collapses
email collisions, prints identifiers and performs unaudited direct subject writes;
retire it or delegate it to the safe planner.

A durable recovery item journal binds targetPool/person, expected old subject,
email/profile digest, operation/run IDs and provider/rebind/invitation progress.
Do not use short-lived generic IdempotencyRecord retention for multi-day recovery.
Eligible people are not erased/deactivated and have ACTIVE/INVITED memberships in
non-archived events of the organisation, or its platform administrator standing.
Preserve people, memberships, roles and all event record foreign keys.

Apply rechecks current operator platform authority under Person/OrganisationMember
locks and target eligibility/profile/CAS, then commits CREATE_STARTED before the
external call. Cognito AdminCreateUser uses MessageAction SUPPRESS, no forced alias,
role groups or password grants. Reconcile retries with the journal and exact
normalised account identity; reject collisions and unknown/mismatched accounts.
After the provider call, recheck authority and profile, then atomically rebind the
subject, audit, revoke refresh sessions, clear pending encrypted provider tokens,
invalidate authentication handoffs and publish cache invalidation with BOUND.
Never blindly create/delete or adopt accounts on a last-write email Map.

An explicit invitation stage starts only after BOUND. Use Cognito's default sender
under D-08, with pool-wide UTC-day allowance (default 50) reserved and INVITE_STARTED
committed before external delivery. Add an explicit target-pool quota seam. Do not
refund ambiguous attempts or automatically resend ACCEPTED/DELIVERY_UNKNOWN.
Provider acceptance is not proof of mailbox delivery. Intentional resend consumes
another reservation. No SES. Actual restore/new-pool/reinvite execution retains
P16.8 and P12.8 owner controls.

Test suppressed creation, collision/redaction/planning, account-created then DB
rollback resume, competing workers, revoked authority/profile changes during the
provider call, subject uniqueness, atomic session/handoff invalidation, preserved
record IDs and concurrent cross-event/ambiguous invitation quota reservations.
All database tests use spoh2027_test only.

## Remaining security work and report

Add denial/policy-change monitoring and dispatch-only nightly staging permission
checks. Wire previous session-signing keys into deployed tasks and document bounded
session/database rotation. Paid CloudTrail/GuardDuty/SecurityHub choices retain
their recorded approval rules; production creation/cutover remains P12.8.

Reconcile High/Blocker backlog items against actual code and evidence; complete the
data map, immutable audit privilege checks, privacy/export/erasure and retention.
Review ASVS L2 and the full diff from baseline/pre-remediation (d2497b6). A
/security-review capability is not currently available: use an independent manual
review and record that limitation truthfully, without claiming the command ran.

Build the entire security batch before its touched suites and single full local
CI run, then one application push and exact-SHA GitHub CI. Do not lower coverage
floors, infer staging acceptance from CI, or execute a production recovery tool.
