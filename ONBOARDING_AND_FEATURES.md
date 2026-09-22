# SPOH 2027 — Onboarding, Authorization & Feature Report

Generated from a direct read of the codebase (`server/`, `client/`, `packages/shared/`) on 2026-09-21. This is a snapshot, not a spec — if the code changes, re-derive from source rather than trusting this file.

---

## 1. TL;DR

- **Onboarding is roster-based provisioning, not self-signup.** A Chief Coordinator or Admin creates a volunteer's account (one at a time, or in bulk via CSV import). There is no "sign up" page anywhere in the product.
- **Authorization is RBAC, not PBAC/ABAC — with one deliberate exception.** Six fixed roles map to a hand-written capability matrix. On top of that, a second, narrower layer adds an attribute check (is this person rostered at this station, right now?) for the four "capture" actions only. See §3 for why the codebase explicitly rejects a pure role-precedence model.
- **The system is an event-day operations tool** for a school's open-house/volunteer program: visitor registration counts, room footfall counts, a "Mission Card" passport-stamp game, gift redemption, safety incident/lost-person handling, shift rostering, live dashboards, and paper/offline fallback reconciliation.

---

## 2. Onboarding: how an account comes to exist

### 2.1 Principle

> "Self-signup is disabled: accounts exist because someone is on the roster, not because they found the sign-in page." — `server/src/modules/identity/provider.ts`

There is no registration form. `client/src/app/sign-in/page.tsx` explicitly has no "create account" affordance. An account is created by an administrator through one of two paths:

### 2.2 Path A — Single volunteer provisioning

`POST /api/v1/roster/volunteers` (capability: `user.provision`, Chief/Admin only, heavily rate-limited because it sends real invite emails and mints identities).

Flow (`server/src/modules/roster/service.ts::provisionVolunteer`):

1. Refuse a requested role at or above the caller's own (`ROLE_ESCALATION_DENIED`).
2. **If the email is already on the roster:** refuse with `409 VOLUNTEER_EXISTS` (pointing at the existing row, and saying whether they are deactivated). Editing goes through `PATCH /admin/volunteers/:id`, where the current values are on screen — "adding" an existing IC with the form's default role would otherwise demote them silently.
3. Look up `reportsToEmail` if given (must be on the roster and active, or the request is rejected).
4. Call `identityProvider.ensureUser({ email, displayName, role })`, which:
   - In production/staging (Cognito): creates a Cognito user in the pool, adds them to the Cognito group matching their role (`ADMIN`→`Admin`, `LEAD`→`Lead`, etc.), and Cognito emails them an invite + temporary password. If the Cognito user already exists (previous pool, or a failed earlier commit) the existing `sub` is fetched and no invite is sent — the response reports `identityCreated: false`.
   - In local dev: derives a deterministic fake `sub` from a SHA-256 of the email — no real account, no email sent.
5. Create the `Volunteer` row (`cognitoSub`, `displayName`, `email`, `phone`, `role`, `portfolio`, `reportsToId`).
6. Write an audit log entry (`user.provision`).
7. Invalidate the 60-second in-memory volunteer cache for that subject so the change is visible on the person's very next request.

Client surface: `client/src/app/admin/users/page.tsx` → **Add a volunteer**. The same screen offers _Resend invite_ / _Send a password reset_ (`POST /admin/volunteers/:id/resend-invite`) for the "I never got the email" case, and per-person shift management.

### 2.3 Path B — Bulk roster CSV import

`POST /api/v1/roster/import` (capability: `roster.edit` — wider than provisioning, see §3.4). Body is a list of rows (email, displayName, role, phone, portfolio, reportsToEmail, and optionally stationCode/eventDate/block to also create a shift assignment in the same pass).

Key mechanics (`importRoster` in the same file; the full edge-case map is in `docs/USER_MANAGEMENT.md`):

- **Dry-run by default.** Unless `commit: true` is set, the entire import runs inside a database transaction that is deliberately thrown away (`DryRunRollback`) at the end — so a 200-row import can be previewed, including which rows would fail, without writing anything.
- **One row per shift.** Rows are folded into people by email first; a person with three shifts is counted once. Person fields come from their first row; later rows fill blanks and are reported where they disagree.
- **The caller's rank applies per person.** Their own row, anyone at or above their level, a role at or above their level, and (for a Deputy, who holds `roster.edit` but not `user.provision`) anyone not yet on the roster are all _skipped and reported_, not applied. Deactivated people are never reinstated by a file. A skipped person can still be given shifts if they exist and are active.
- **Three passes.** People first, so `reportsToEmail` can name somebody later in the file (or on the roster); then reporting lines, cycle-checked inside the transaction; then shifts, one per row.
- **Identities are minted outside the transaction** (Cognito calls are network I/O; holding a DB transaction open across 200 of them would be a long lock for no benefit), and only on commit. A dry run uses a per-person placeholder subject that is rolled back.
- Per-row issues (unknown or closed station, unconfigured day, malformed shift row, unresolvable manager, duplicate shift, refused person) are collected into `issues[]`, and every row gets an entry in `outcomes[]` saying what will happen to the person and to the shift.
- On commit, one audit-log entry records the counts; anyone whose role changed has their sessions revoked, as a single edit would.
- Client surface: `client/src/app/admin/users/import/page.tsx`, which parses the file in the browser against the same schema (Excel pastes, quoted names, `7/1/2027`, `DC`, `AM`) and reports bad lines by spreadsheet line number before sending. `GET /admin/volunteers/export.csv` writes the roster in the same format for the export → edit → import round trip. (`client/src/app/chief/imports/page.tsx` is the _fallback tally_ import, a different thing.)

**Escalation guardrails on both paths** (`server/src/modules/admin/service.ts`):

- An admin cannot edit or deactivate **their own** account (`SELF_MUTATION_DENIED`) — a Chief who fat-fingers their own demotion at 9am on event day has no one to undo it.
- An admin cannot act on, or grant, a role **at or above their own rank** (`ROLE_ESCALATION_DENIED`) — otherwise `user.provision` would effectively be "permission to become Admin."
- Changing `reportsToId` is checked for cycles (`assertNoReportingCycle`) because `GET /me` walks that chain and a loop would hang the request every volunteer makes at boot.

### 2.4 Signing in for the first time

- **Cognito path (staging/prod):** the volunteer clicks the invite email, sets a password on Cognito's hosted UI, then the client's sign-in page hands off to `GET /api/v1/auth/login`. The client posts the resulting `providerAccessToken` to `POST /api/v1/auth/session`, which verifies it against the pool and opens an SPOH session.
- **Local dev path:** the sign-in page just takes a roster email (`client/src/app/sign-in/page.tsx`); the server mints and immediately verifies its own token for that person's `cognitoSub` (`localAuthIssuer`), which exercises the same verification code path as Cognito rather than skipping it.
- Either way, **being able to authenticate and being allowed in are treated as two different questions** — `openSession` re-checks the roster (`loadVolunteer`) even though the credential was already verified, so a Cognito account that exists but has no `Volunteer` row (or has been deactivated) is rejected with `NOT_PROVISIONED` / `ACCOUNT_INACTIVE`.

### 2.5 Session mechanics (what "signed in" actually means)

`server/src/modules/auth/service.ts` + `server/src/modules/auth/router.ts`:

- On sign-in the server returns a **short-lived access token** (kept only in an in-memory JS variable on the client — never `localStorage`) and sets an **httpOnly `spoh_refresh` cookie**, scoped narrowly to `/api/v1/auth` so it's never attached to a capture request.
- **Refresh rotation with reuse detection:** every `/auth/refresh` call revokes the old refresh-token row and issues a new one in the same `familyId`. If an already-rotated token is ever presented again, the server assumes the cookie leaked, revokes the **entire family** (every device), and forces re-sign-in — because there's no way to tell which of the two holders is the attacker.
- **CSRF defense** on the cookie-bearing endpoints: an explicit `Origin` allowlist check (`assertTrustedOrigin`) plus JSON-content-type (which forces a CORS preflight a form POST can't trigger).
- Client-side (`client/src/lib/session.ts`): a silent-refresh timer fires ~60s before expiry; concurrent 401s share one in-flight refresh promise (rotation is single-use, so two parallel refreshes would revoke each other); `bootstrapSession()` recovers a session from the cookie on page load without ever bouncing to sign-in before that recovery call has even left the device.
- **Deactivation takes effect immediately, not at token expiry:** `deactivateVolunteer` flips `active=false`, revokes every live `RefreshSession` for that person, deletes their push subscriptions, and (optionally) disables the Cognito account — all three, because skipping any one leaves a half-locked-out account.
- A **60-second in-memory cache** (`volunteerCache` / `sessionCache` in `server/src/middleware/auth/index.ts`) maps `cognitoSub → {role, active}` so the hot path (every request) isn't a DB round trip per tap; it's invalidated explicitly on provisioning, role changes, and deactivation.

---

## 3. Authorization model: RBAC (with a capability matrix), not PBAC

### 3.1 Direct answer

It is **Role-Based Access Control**, implemented as an explicit **role → capability matrix**, not attribute/policy-based access control (PBAC/ABAC) in the general sense. Six fixed roles exist (`packages/shared/src/enums.ts`):

```
ADMIN (precedence 0, most privileged)
LEAD (10)
CHIEF_COORDINATOR (20)
DEPUTY_COORDINATOR (30)
IC (40)
VOLUNTEER (50, least privileged)
```

There **is** one narrow, deliberately-scoped attribute check layered on top (station + time-of-shift), covered in §3.3 — but the primary/only general-purpose authorization primitive is the capability matrix, not a policy engine evaluating arbitrary user/resource/environment attributes.

### 3.2 Why not plain role-precedence RBAC either

The code is explicit that a simpler "is this role at least X" precedence check would be **wrong** here (`packages/shared/src/capabilities.ts`):

> "`Lead` outranks `Volunteer` (precedence 10 vs 50) yet must NOT be able to create a registration — the Lead is a read-and-report role. Any middleware that asked 'is the caller at least a Volunteer?' would wrongly admit a Lead."

So `CAPABILITY_MATRIX` is a literal `Record<Capability, CommitteeRole[]>` — 25 capabilities, each with an explicit allow-list of roles, with **absence = hard deny**:

| Capability                  | Volunteer | IC  | Deputy Coord. | Chief Coord. | Lead | Admin |
| --------------------------- | :-------: | :-: | :-----------: | :----------: | :--: | :---: |
| `registration.create`       |    ✅     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `footfall.create`           |    ✅     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `card.stamp`                |    ✅     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `gift.redeem`               |    ✅     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `record.void`               |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `count.adjust`              |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `card.reissue`              |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `incident.report`           |    ✅     | ✅  |      ✅       |      ✅      |  ✅  |  ✅   |
| `incident.resolve`          |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `lostPerson.raise`          |    ✅     | ✅  |      ✅       |      ✅      |  ✅  |  ✅   |
| `lostPerson.resolve`        |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `lostFound.log`             |    ✅     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `own.read`                  |    ✅     | ✅  |      ✅       |      ✅      |  ✅  |  ✅   |
| `dashboard.station.read`    |    ❌     | ✅  |      ✅       |      ✅      |  ✅  |  ✅   |
| `dashboard.event.read`      |    ❌     | ❌  |      ✅       |      ✅      |  ✅  |  ✅   |
| `swap.approve`              |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `roster.edit`               |    ❌     | ❌  |      ✅       |      ✅      |  ❌  |  ✅   |
| `announcement.station.send` |    ❌     | ✅  |      ✅       |      ✅      |  ❌  |  ✅   |
| `announcement.event.send`   |    ❌     | ❌  |      ✅       |      ✅      |  ❌  |  ✅   |
| `fallback.declare`          |    ❌     | ❌  |      ✅       |      ✅      |  ❌  |  ✅   |
| `fallback.import`           |    ❌     | ❌  |      ❌       |      ✅      |  ❌  |  ✅   |
| `report.generate`           |    ❌     | ❌  |      ✅       |      ✅      |  ✅  |  ✅   |
| `user.read`                 |    ❌     | ❌  |      ✅       |      ✅      |  ✅  |  ✅   |
| `user.provision`            |    ❌     | ❌  |      ❌       |      ✅      |  ❌  |  ✅   |
| `config.manage`             |    ❌     | ❌  |      ❌       |      ✅      |  ❌  |  ✅   |
| `audit.read`                |    ❌     | ❌  |      ❌       |      ✅      |  ✅  |  ✅   |

Roles are effectively three tiers with distinct shapes, not a clean ladder:

- **Volunteer** — pure capture (register, count, stamp, redeem) plus reporting incidents/lost persons.
- **IC** (in-charge of a station) — everything a Volunteer does, plus voiding/adjusting/reissuing at their station, resolving incidents/lost persons, station dashboard, approving swaps, sending station announcements.
- **Deputy Coordinator / Chief Coordinator** — portfolio/event-wide oversight: roster editing, event-wide announcements, fallback declaration, provisioning (Chief only), config (Chief only).
- **Lead** — a deliberately _sideways_ role: outranks Volunteer numerically but holds almost none of the capture capabilities. It exists for reporting/oversight (`report.generate`, `dashboard.event.read`, `audit.read`, `user.read`) plus the two universally-open ones (`incident.report`, `lostPerson.raise`).
- **Admin** — held by every capability; the superuser/break-glass role.

Role precedence (`ROLE_PRECEDENCE`/`roleMeets`) is used **only** for two narrow, non-authorization purposes: picking the highest Cognito group for display, and the admin-service escalation guardrails in §2.3 (`outranks`). It is explicitly documented as "never use this in place of `requireCapability`."

### 3.3 Layer 2 — station scope (the one attribute-based piece)

Four "capture" capabilities (`registration.create`, `footfall.create`, `card.stamp`, `gift.redeem`) are **also** gated by `requireStationScope` (`server/src/middleware/rbac.ts`), which checks:

- Is there a `ShiftAssignment` row for `(this volunteer, this station, an event day matching today in Singapore time, a shift block that is running right now)`?

This is genuinely attribute-based (subject × resource × time), but it's scoped to exactly four write endpoints, checked against the live database (not baked into the token, because station assignment changes hourly), and role plays into it only as a **bypass**: IC-and-above can write to any station (they're the ones who fix a station that's gone wrong), and that bypass is explicitly recorded on `req.auth.stationScopeBypass` so it shows up in reconciliation rather than being indistinguishable from a normal on-shift write.

### 3.4 Enforcement points, end to end

1. **Server, every request:** `requireAuth` (default-deny; the only unauthenticated routes are `/healthz`, `/readyz`, and the session-opening endpoints under `/auth`) resolves `role` **from the database roster row**, not from the JWT's Cognito groups — "the roster is authoritative: a group added in the Cognito console without a matching roster change must not silently grant capabilities." A mismatch is logged as a warning but the roster always wins.
2. **Server, per-route:** `requireCapability('x.y')` middleware — the single authorization predicate (`roleHasCapability`).
3. **Server, per-write:** `requireStationScope()` for the four capture endpoints only.
4. **Server, per-service:** a few hand-written business rules that a generic capability check can't express (self-mutation denial, role-escalation denial, reporting-cycle prevention — all in `admin/service.ts`, §2.3).
5. **Client:** the same `CAPABILITY_MATRIX` (imported from `packages/shared`) is read by the client **purely to decide which UI tiles to render** — explicitly documented as "UI affordance only." It is not trusted for authorization; every mutating request is re-checked server-side.

---

## 4. Features and how they work

The product is a real-time operations layer for a one/two-day open-house event, organized around a hard invariant stated at the top of `schema.prisma`:

> **The three counts never merge.** `Registration`, `FootfallTick`, and `MissionCard`/`CardStampEvent` are separate tables with no FK joining them, and there is no `totalVisitors` column anywhere. One Mission Card can represent four humans.

And a second one:

> **No visitor personal data, ever**, except the transient `LostPersonAlert` (purged to an anonymized `LostPersonSummary` on resolution — a CI test enforces this).

### 4.1 Registration (`registration.create` / `record.void`)

Count #1: sign-up-booth taps against one of 8 `VisitorCategory` buttons (Sec 1–5, graduated-awaiting-results, parent/guardian, other). Optionally links to a `groupId` (a family sharing one Mission Card) and a `missionCardId` (best-effort; a failed card link must never block the count). Station-scoped write; IC+ can void with a reason. Client: `client/src/app/capture/registration/` (single + `group/` variants).

### 4.2 Footfall (`footfall.create` / `count.adjust` / `record.void`)

Count #2: room-entry taps at `countsEntry` stations. `quantity` defaults to 1 but can be >1 for manual clicker totals or fallback block entries. Never joined to Registration. Client: `client/src/app/capture/footfall/`.

### 4.3 Mission Card (`registration.create` to link, `card.stamp`, `card.reissue`)

Count #3, and the event's "passport game": a printed card with a short code + QR (`MissionCard`), stamped once per `issuesStamp` station (`CardStampEvent`, unique on `(missionCardId, stationId)`), progressing `UNISSUED → ISSUED → COMPLETED`. `card.reissue` (IC+) handles lost/damaged cards, linking the new card back to the old via `reissuedFromId` so the funnel isn't double-counted. `missionCard/service.ts` also computes the live **funnel** (issued/completed/redeemed + per-stage counts) consumed by the dashboard. Client: `client/src/app/capture/stamp/`.

### 4.4 Gifts (`gift.redeem` / `count.adjust`)

Redemption against a `GiftType` with `initialStock` and `lowStockThreshold`; stock is derived (`initialStock − redemptions + manual adjustments`), never a mutable counter column — `GiftStockAdjustment` rows carry a signed `delta` and a reason, so every stock change is itself an audit trail. Client: `client/src/app/capture/redeem/`.

### 4.5 Safety — Incidents (`incident.report` / `incident.resolve`)

Any signed-in committee member (including Lead) can report an `Incident` (type/severity/status, optional station, free-text description — "describes the event, not the person"). IC+ resolves and adds `IncidentFollowUp` notes. Client: `client/src/app/safety/incident/new/`.

### 4.6 Safety — Lost Person (`lostPerson.raise` / `lostPerson.resolve`)

The one place visitor-adjacent PII briefly exists: `LostPersonAlert` (approx age, free-text description/clothing, last-seen station/time). Anyone can raise it and everyone acknowledges (`LostPersonAck`, drives `LostPersonBanner.tsx` as an event-wide banner). IC+ resolves it, at which point the alert is purged and replaced by a `LostPersonSummary` row that keeps only aggregate/analytics fields (raised/resolved timestamps, resolution minutes, outcome, ack count) — every report reads the summary, never the alert. Client: `client/src/app/safety/lost-person/new/`, `client/src/features/lostPerson/useActiveAlerts.ts`.

### 4.7 Safety — Lost & Found (`lostFound.log`)

Physical items (not people): `LostFoundItem` with status `HELD → CLAIMED / UNCLAIMED_AT_CLOSE / DISPOSED`, optional photo via S3 (see §4.13). Client: `client/src/app/safety/lost-found/`.

### 4.8 Roster & Shifts (`roster.edit`, `swap.approve`, `own.read`, `dashboard.event.read`)

`ShiftAssignment` ties a volunteer to a station/day/block (`MORNING`/`AFTERNOON`), with check-in/out timestamps. `ShiftSwapRequest` lets a volunteer propose swapping with a named target; IC+ approves/rejects. `BriefingSlot` schedules pre-event briefing waves. The dashboard's staffing panel surfaces **staffing gaps** (stations with no one rostered for the current block) and **long shifts** (someone checked in far longer than their block) computed live in `shift/service.ts`. Client: `client/src/app/shift/`, `client/src/app/brief/`.

### 4.9 Live Dashboard (`dashboard.station.read`, `dashboard.event.read`)

No WebSockets — a single JSON payload polled every 3 seconds ("under twenty dashboard clients... polling is dramatically simpler to operate and debug at 10am on 7 January"). Two views:

- **Event-wide** (`getLiveDashboard`): today's registrations (total + by category + last-hour), footfall by station, the Mission Card funnel, gift stock, safety counts (open/critical incidents, active lost-person alerts), staffing (on-shift/checked-in/gaps/long-shifts), and **data health**.
- **Station-scoped** (`getStationDashboard`, IC's own station): the same figures broken down **per device/volunteer**, including a `rateAnomaly` flag when someone's taps-per-minute exceeds a configurable threshold — "usually means someone is tapping to catch up rather than counting as visitors arrive," which is how double-counting becomes visible before it becomes a reconciliation headache.
- **Data health** (`getDataHealth`): silent stations (no footfall in N minutes during event hours), stale devices (checked-in but no capture recently), and whether a fallback window is currently open. This is described in the code as mattering "more than any server metric" — the API can be perfectly healthy while a room silently stops counting.
  Client: `client/src/app/ic/`, `client/src/app/chief/`, `client/src/app/tv/` (a big-screen view), `client/src/features/dashboard/useDashboard.ts`.

### 4.10 Announcements (`announcement.station.send`, `announcement.event.send`)

Broadcast messages with a `priority` (`INFO`/`OPERATIONAL`/`URGENT`), optionally targeted by role/station/event-day, optionally requiring acknowledgement (`AnnouncementAck`). IC sends station-scoped, DC/Chief send event-wide. Client: `client/src/app/inbox/`.

### 4.11 Fallback & Reconciliation (`fallback.declare`, `fallback.import`)

A structured "we're degraded, here's how" mechanism (`fallback/service.ts`), for when the app itself can't be trusted at a station (tier 3 = Google Sheets, tier 4 = paper):

- **Declare** a `FallbackWindow` (event-wide or per-station) — only DC/Chief, "individual volunteers deciding to switch systems is how the same visitor ends up counted in three places." Only one open window per scope is allowed at a time.
- **Close** it later, computing `durationMinutes`.
- **Import** the paper/sheet data back in afterward (`fallback.import`, Chief/Admin only) via `importRegistrations`/`importFootfall`: dry-run by default, content-derived idempotency keys (so re-running a failed import after a partial failure creates nothing new), every imported row tagged `DataSource = FALLBACK_SHEET | PAPER` so no report can mistake it for a live app tap, and any report covering an overlapping time range is required to say the data is approximate rather than silently blend it.
  Client: `client/src/app/chief/fallback/`.

### 4.12 Reports (`report.generate`)

Post-event / mid-event export generation (`report/service.ts`, `report/export.ts`) — aggregates the three counts, safety summaries, staffing — for DC/Chief/Lead/Admin. Client: `client/src/app/reports/`.

### 4.13 Media (`own.read` to get an upload URL, `lostFound.log` to attach)

Presigned S3 access only — the file itself never passes through the API server (`media/service.ts`, `media/router.ts`). Used for lost-and-found item photos.

### 4.14 Push Notifications (`own.read`)

Web Push (RFC 8030) subscription management (`PushSubscription` model, `notification/service.ts`). Best-effort delivery — the live dashboard poll is the actual contract, push is a convenience layer on top. A subscription is dropped after repeated delivery failures or an explicit 404/410 from the push service.

### 4.15 Audit Log (`audit.read`)

Every mutating action across every module writes an `AuditLog` row (actor, action string like `registration.void`/`card.reissue`, entity type/id, before/after JSON snapshots, IP, user-agent, request id) via a shared `writeAudit()` helper called inside the same DB transaction as the mutation. `actorId` is `SetNull` on delete (audit must outlive the roster) while `actorSub` is retained so a removed volunteer's actions stay attributable. Readable by Chief/Lead/Admin. Client: part of `client/src/app/chief/`.

### 4.16 Admin (`user.read`/`user.provision`/`roster.edit`/`config.manage`)

Split deliberately by capability rather than by page (`admin/router.ts`):

- **Volunteers** — list/get (`user.read`), edit/deactivate/reactivate (`user.provision`).
- **Assignments** — create/delete (`roster.edit`).
- **Stations** — list (including inactive)/create/update (`config.manage`); toggling `issuesStamp` changes what "complete" means for every card in flight, so it's audited.
- **Event Days** — list (`user.read`, since roster import needs it), create/update (`config.manage`).
- **Gift Types** — create/update (`config.manage`).
- **Runtime Settings** (`AppSetting` table) — shift-block times, silence thresholds, implausible-tap-rate, retention windows. Readable by anyone signed in (`own.read` — "the tuning of a school open house, not a secret"), writable only by `config.manage`. Lets a coordinator retune the system during a dry run without a redeploy; unset keys fall back to compiled defaults.
  Client: `client/src/app/admin/users/`, `client/src/app/admin/settings/`.

### 4.17 Client architecture notes (PWA / offline)

- **Offline write buffer** (`client/src/lib/outbox.ts`), explicitly _not_ "offline-first architecture" but ordinary resilience for ordinary failure modes (sleep mid-tap, a dead Wi-Fi spot). Every capture is enqueued to IndexedDB **before** the network attempt (optimistic UI), tagged with the idempotency key it will always retry under (so the server collapses replays to one row — a flaky connection can never inflate a count). A 2-second "undo grace" delays the first send so a mis-tap can be cancelled client-side before it's ever transmitted; only an IC can void an already-settled record. Backoff on failure (1s→2s→4s→…→30s capped), parked as `failed` after 10 attempts for an IC to salvage by hand via a diagnostics panel (`toClipboardText`). Flush triggers: coming back online, tab regaining visibility, and a 15s backstop interval.
- **Session recovery** — see §2.5.
- **Service worker** (`client/public/sw.js`) — PWA installability/caching shell.

---

## 5. Cross-cutting integrity mechanisms

- **Idempotency everywhere writes happen.** Every capture table has a unique `idempotencyKey`; `IdempotencyRecord` additionally caches full request/response pairs so retried POSTs return the original response rather than erroring or duplicating.
- **Referential integrity is real, not conventional.** Every foreign key is an actual Prisma relation (explicitly not "an id column populated by convention") — "a dangling actor on a stock adjustment or a fallback declaration is precisely the row that matters during reconciliation."
- **Deliberate referential-action choices per relation**: `Restrict` where deleting a parent would orphan operational history, `Cascade` only where a child is meaningless without its parent, and a single `SetNull` (`AuditLog.actorId`) so the audit trail outlives the roster.
- **Singapore-time-aware shift logic** (`server/src/lib/time.ts`) — station scoping, "is a block running now," and dashboard "within event hours" all resolve against Singapore local time regardless of server/client timezone.
