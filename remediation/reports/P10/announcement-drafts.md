# P10.7 — Private announcement draft foundation

An organiser can save, list, read and replace their own event's announcement drafts.
Drafts have a separate table: even URGENT content with acknowledgement enabled creates
no published announcement, inbox item, acknowledgement or external push. The existing
immediate-send path is unchanged. No scheduling endpoint or authoring screen is added.

The four endpoints under `/announcements/drafts` require current announcement sending
permission and return `no-store`. Reads and pagination cursors are private to the author
and event; missing, foreign and another author's ids return the same 404. ICs can prepare
only messages for a station where they are posted today, using the event's timezone/day
boundary. Server-owned attribution, event identity, publication fields and run times are
refused by the strict shared schemas.

Creation uses the existing retry-key protocol. The draft, real author/membership, audit
and id-only settled replay receipt commit together. A transport settlement failure after
commit cannot discard that receipt. Retrying the original request rebuilds the current
private draft rather than storing another copy of its text. Replacement requires the
expected version; concurrent edits have one winner and a stale edit returns 409. Identical
content makes no version or audit change. Audit records target/priority/expiry metadata,
body-change indication and an optional bounded reason, without copying unpublished text.

Mutations take Event UPDATE before rechecking current active membership/capability,
target scope, station authority and expiry. They sample the injected clock after waiting.
ARCHIVED drafts remain readable but cannot change. Faults during audit or settlement roll
back creation; update faults roll back both version and content. The additive 27th migration
creates only the draft table, indexes and foreign keys, including same-event membership,
station and day references. It does not rewrite existing announcement rows.

## Verification, 3 October 2026

- **47 shared checks** include 11 strict draft-contract cases; **548 server units** pass.
- **42 focused checks** first passed draft and existing communications behavior. Three
  further boundary cases and the complete route inventory then passed **34 checks** across
  draft/isolation files. New draft coverage totals 24 database cases, including privacy,
  paging, permissions, targeting, optimistic races, audit rollback, post-commit retry
  settlement and post-wait lifecycle/membership/role/clock changes.
- The initial full run passed 1,097 checks with four existing skips and failed only because
  the new endpoints were absent from the mandatory isolation inventory. Foreign draft
  read/update/create-target/cursor cases were added, including PUT support in its helper.
  The complete rerun passed **1,098 checks / four existing skips in 85 files**
  (350.97 seconds), including all 24 new draft cases and the complete route inventory.
- Workspace types, root lint, architecture (**911 modules / 3,936 dependencies**), hardcoding,
  generated settings, shared/server builds and changed formatting/diff checks pass. The
  initial focused implementation corrected the pagination sentinel, an invalid fixture
  membership status and concurrency setup: retry keys are reserved before holding Event
  so the race tests reach the mutation guard directly.

CI initially flagged the new contract test's random-looking literal retry UUID as
`generic-api-key`. It was synthetic, never an authentication credential. The fixture
now uses an obvious repeated-digit UUID. A full-history scan also found the same
synthetic fixture pattern in the older go-live override test; its literal was corrected
without changing lifecycle behavior. `.gitleaksignore` names only those two exact
historical commit/file/rule/line fingerprints; no file or rule is broadly excluded.
Local Gitleaks 8.30.1, downloaded into ignored workspace storage and checksum-verified
against the official release, verifies the history after this correction.

All local database work used guarded `spoh2027_test` on localhost:5435. The real local
`spoh2027` was not reset, seeded or migrated. The full run uses a temporary wake hold restored
in `finally`; no persistent power setting changes. No client layout, browser baseline or
infrastructure definition changed, so no new visual/client journey result is claimed.
Actual staging verification also passed at **18:49 SGT**, on exact deployed image
`4844360fa0f49adcfe10bcdc623aa1e9609c1c23`, with successful
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37116845053) and
[staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37117164613).
The stack is `UPDATE_COMPLETE`. Installed Chrome 154.0.8037.97 used normal Cognito
Authorization Code + PKCE and the existing legitimate synthetic admin membership.
Create/read/edit/list passed, stale version returned 409, retry rebuilt version 2,
the inbox stayed unchanged and acknowledgement was refused. Sign-out returned 204;
there were no app page errors. See [sanitized evidence](staging-draft-evidence-2026-10-03.json).
The first probe stopped on a hidden duplicate Cognito field before authentication;
visible-field selection fixed the probe. The synthetic private draft and immutable
receipts remain in staging; no announcement, invitation or push was requested.

P10.7 stays **in progress**. Timed publication needs durable delivery storage and a verified
handler before registration. External push must run after the publishing transaction;
exactly-once external delivery is not promised. Draft publication, lifecycle/retention
integration, schedule CRUD/timeline and the remaining action catalogue are still pending.
