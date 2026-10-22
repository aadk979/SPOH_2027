# P16-012 — Restored compute readiness and granular structure cases

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


## Accepted preceding release

The invitation/drain/database batch was committed directly to main as
`46a1f156e866676036a92aefb685e438d79c01ee` and pushed once at `08:53:01.872Z`.
Its complete no-resume Node24.19.0/npm gate returned actual0 at `08:49:13.207Z`,
with5,844 passing tests, the same two existing skips and71 separate safety checks.
The final staged scan found no leaks in22,159 bytes; staged whitespace/stat review
immediately preceded the whole seven-file commit.
[Exact-SHA CI38538302393](https://github.com/aadk979/SPOH_2027/actions/runs/38538302393)
passed all five jobs, including actual image verification, observed at
`09:08:37.795Z`.

The access-stack template review permitted exactly one semantic change:
`ecs:DescribeServices` on the existing staging service ARN pattern. The original
comparison refused CDK's alphabetic action ordering; that observation and reviewer
source were preserved before correcting the expected order. The reviewed assembly
was applied exclusively to the access stack. Fresh template and actual IAM checks
passed, actual0 at `09:09:51.472Z`. No production permission, billable resource,
budget management or database configuration was added.

Fresh metadata retained the sole existing AWSCURRENT signing version, without
overlap, rotation or a secret-value read. One stable staging dispatch followed.
[Release38541130229](https://github.com/aadk979/SPOH_2027/actions/runs/38541130229)
passed all three jobs, migrations, service update and actual Smoke, observed at
`09:28:14.715Z`. Fresh metadata showed one completed ARM64 deployment at task
definition revision161. A paced policy attestation returned actual0 at
`09:30:07.249Z`: all73 statements, schema and task policy-ID/name map match source.
This is configuration attestation, not the complete nightly decision campaign.

## Real invitation and authentication results

The existing first volunteer was read back as INVITED, without a sign-in or
deactivation. Its exact provider subject, verified email, profile and immutable
operation marker matched the earlier shipped account-bind evidence. Its original
DELIVERY_UNKNOWN record and charged allowance remain intact.

A fresh intentional application resend returned200 and `sent: true`; exact receipt
replay returned the same outcome. The person was not recreated. Four other
lower-rank actors were provisioned through the application with201 responses.
Provider metadata proved the pending temporary-password identities. This stage
completed actual0 at `09:43:16.214Z`; provider acceptance alone was not called
mailbox delivery.

All five actual emails were subsequently read from their controlled inboxes,
with exact recipient, account reference, subject and provider-username checks.
The private reader initially assumed a bare account ID and a plain-text body;
actual messages used an account URI and HTML. Failed observations and earlier
reader sources were preserved. The corrected reader decoded the full HTML
without executing it and proved exactly one current message per actor, actual0
at `09:50:11.585Z`. It sent no additional messages. Credentials remain private.

The delivered credentials then completed real Cognito password-change journeys
for all five actors. DEPUTY_COORDINATOR, CHIEF_COORDINATOR and LEAD completed
actual authenticated software-MFA setup and verification. Each role received
its own full SID, matched the expected person and role through event `/me`, and
showed the expected confirmed provider/MFA standing. For the three enrollments,
restricted and replaced SIDs were refused. All five journeys completed actual0 at `09:52:48.166Z`.
The initial operator's earlier enrollment was retained and reused.

An operator cookie-recovery probe after long inactivity failed to produce handoff;
that failure remains preserved. Normal password and retained-TOTP sign-in then
passed at `09:40:19.148Z`, without reset or another enrollment. Later, after the
current API token actually expired, its protected request returned401 and
first-party cookie recovery/handoff200 issued a new full SID for the same person.
That distinct positive recovery proof returned actual0 at `09:57:28.440Z`.

## Partial granular API execution

The shared five canonical reads and five legacy aliases passed126 real HTTP
requests across all six roles, actual0 at `09:57:41.102Z`. They cover typed role
reads, exact refusals, missing/effectively forged authentication and46 query
validation requests from the23 committed bindings. The earlier53 first-event
requests remain accepted against9ace; that event and its receipt were retained.

Authorized API setup then passed42 requests at `10:01:06.557Z`: one type, tag and
category, two templates and stations,12 assignments, exact receipt/upsert replays
and typed readbacks. These are controlled DRAFT fixtures for later station-scope
and mutation cases. No staging host SQL or credential bypass was used.

The operator created one other synthetic event and provisioned its controlled
VOLUNTEER through the API, with an exact event-creation replay. Its real default-
sender email and password-change journey passed. The actor read its own event,
received404 for the first event and saw only its own event in `/events`.
This proof completed actual0 at `10:12:48.214Z`. There are now two synthetic DRAFT
events in the initial organisation and seven distinct controlled identities;
the operator belongs to both events. A foreign-organisation fixture is still
outstanding. No peer ADMIN identity was granted.

These results do not close P16.10 or prove all423 served/229 canonical routes.

## P16-012: remaining unpark defects

The frozen46a script restored desired count1 and returned immediately to the
workflow's non-retrying Smoke step. Three private regressions failed before
correction at `08:45:41.196Z`: premature completion, missing startup deadline and
failure to refuse a failed deployment.

The idle-cost unpark also submitted one accepted database start, then refused
the actual transient `configuring-enhanced-monitoring` state. Its failed journal
was preserved. Fresh scoped metadata/events proved AVAILABLE, encrypted/private
storage and MonitoringInterval0. An explicit reconciliation restored only ECS;
the database start was not repeated. That finish returned actual0 at
`09:15:03.577Z`, followed by six actual native smoke checks at `09:16:17.837Z`.
This maintenance restoration is not parking-workflow or soak acceptance.

Two further regressions failed against46a for that observed RDS transition and
resuming observation without another start. The repair now permits that known
startup transition, while retaining unsafe-state refusal and bounded polling.
After restoring compute it waits for desired/running counts1, pending count0
and one COMPLETED deployment. Failed, missing, foreign or externally changed
metadata refuses. It adds no monitoring operation or new IAM permission.
The private before/after sources and results remain preserved; all24 affected
preview tests passed at `09:18:38.851Z` without AWS or database execution.

## Structure-field corpus and remaining delivery

The new shared corpus covers11 canonical POST/PATCH body routes and both path
forms:278 invalid bindings,52 schema-accepted inputs with explicit HTTP outcomes,
and a corpus-integrity check. The resulting661 HTTP tests use actual stored SIDs
under CI's declared local provider, with full business/receipt/audit snapshots
on refusal and typed/persisted positive outcomes. The template fixture matches
staging's AM hours; partial edits that produce invalid merged hours must fail.

The private draft initially had two wrong expectations for omitted station tags;
the schema and HTTP response correctly default them to an empty list. Earlier
sources and failures were retained, and the corrected whole661-test draft passed
actual0 at `09:02:26.337Z` against only `spoh2027_test`. The promoted corpus pins
semantic statuses explicitly and checks typed error bodies. The promoted public
HTTP suite passed all661 tests and the three public power suites passed24, actual0
at `10:36:48.200Z`, under Node24.19.0/npm against only `spoh2027_test`.
Affected lint and server/infrastructure type checks also passed. The complete
29-step no-resume Node24.19.0/npm gate returned actual0 at `11:22:30.155Z`,
against only `spoh2027_test`. Server306 files passed4,629 tests with the same two
existing skips; client113 files passed1,220, shared28 files348, policies158 and
infrastructure27 files157:6,512 passing tests, plus71 separate safety checks.
Coverage passed unchanged floors: server96.68% lines/88.22% branches,
client80.23%/71.80%, shared94.38%/87.40%. Raw coverage and LCOV were captured
privately with per-file hashes. Both secret scans passed; dependency audit retains
the documented bundled CDK advisory exception through31 October. All six frozen
source hashes still matched after completion. Final staged review/secret scan,
direct-main push, exact-SHA CI and staging delivery remain required before
accepting this new batch.

The660 real field requests and other scope/lifecycle/expiry/quota obligations
remain to run against staging. Existing enrolled actors and fixture rows must be
reused with fresh real sessions; do not repeat temporary-password acceptance,
MFA enrollment, initial seeding or ambiguous invitation sends.

P16 continues in its documented order: granular API, full regression, deferred
acceptance, actual24-hour soak, load, drills, restore and handover. Manual power
workflows, actual alarm receipt, independent assurance, owner IA/copy/runbook/
unfamiliar-person reviews, cost/production/real-person gates and go/no-go remain.
All private credentials, mail bodies, keys, tokens and actor IDs stay under
ignored `.local/`. Coverage floors and the retained real snapshot remain untouched.
