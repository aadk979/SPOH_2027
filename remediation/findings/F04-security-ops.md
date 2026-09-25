# F04 — Security and operational readiness (P04)

Audit D: how secure and how operable the system is today, judged **from the repository only**.
D-13 forbids using this environment's AWS credentials and any audit request to the live staging
site, so nothing here comes from the AWS account or from `spoh2027.duckdns.org`. The code on
`main` is the baseline (D-05). The deployed topology, IAM policies and runbooks exist only on the
unmerged audit branch (`319d06d`, read with `git show`), and every claim about the deployment is
marked _repo says_ or turned into a question for the owner (§ P04.7).

Finding format and severity scale: [`README.md`](README.md). IDs `F04-001…` are new. Earlier IDs
(`PF-`, `F01-`…`F03-`) are re-checked here, not re-filed.

**Evidence added in P04**

| Artefact                                              | What it shows                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `reports/P04/routes.mjs` → `routes.json`, `routes.md` | every route with its full middleware chain (P04.3)                   |
| `server/tests/integration/repro/security.test.ts`     | skipped repros for F04-004/005/006/013; four ownership guards active |
| `client/tests/repro/outbox.test.ts` (P04 block)       | skipped repro for F04-003                                            |
| `reports/P04/README.md`                               | commands for gitleaks, the load test, PF-14 and the licence check    |

---

## Summary (P04.10)

_Filled in at P04.10._

---

## P04.1 — Threat model

### System context

```
                         internet (campus Wi-Fi NAT, mobile data)
                                        │  TLS (Let's Encrypt, certbot on the box)
   ┌────────────────────────────────────▼───────────────────────────────────┐
   │ Lightsail small_3_0, ap-southeast-1 (repo says: one box, audit branch) │
   │   nginx ──/api/──▶ spoh-server (PM2 cluster, 2 workers) ──TLS──▶ Postgres (Docker, 127.0.0.1)
   │         └─/────▶ spoh-client (Next.js)                                 │
   │   server/.env: DB password, SESSION_SIGNING_SECRET, IAM user access keys │
   └──────────┬──────────────────────────────┬───────────────────────────────┘
              │ IAM user keys                │ (backup daemon: credentials unknown, § P04.8)
              ▼                              ▼
   Cognito pool ap-southeast-1_9bwl2nGF7   S3 spoh2027-backups-665146708212
   CloudWatch /spoh2027/* (audit branch)   S3 media bucket (unset on the audit branch's env)
   DNS: duckdns, updated by hand            Web Push: browser vendors' push services
```

### Actors

| Actor                        | Reaches                                                                           | What they can do today                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Volunteer                    | own session; capture routes for the station they are rostered on now              | capture, raise alerts and incidents, log lost-and-found items, read announcements addressed to them                                |
| IC                           | any station's capture, voids, adjustments, station roster                         | writes anywhere (station-scope bypass is audited), reads every station's roster **with phone numbers**                             |
| Coordinator (Deputy / Chief) | roster, swaps, fallback, reports; Chief: provisioning, config                     | a Deputy can edit roster rows, and through the import grant any role, Admin included (F03-001)                                     |
| Lead                         | read-only dashboards, reports, audit                                              | reads the audit log (emails, IPs, user agents)                                                                                     |
| Admin                        | everything                                                                        | provisions, changes settings, reads audit; the root admin opens attendance                                                         |
| Anonymous internet           | `/healthz`, `/readyz`, `/api/v1/auth/*`, the client, SSH on 22                    | open sign-in flows; exhaust the per-IP auth limits (F04-006); hit `/readyz` unthrottled                                            |
| Stolen or shared phone       | whatever session is live: 15-minute access token in memory, 30-day refresh cookie | keep acting until the session is revoked (up to 60 s more, F03-009); send the last person's queued captures as their own (F04-003) |
| Malicious insider            | a volunteer or coordinator account; an operator with SSH or `.env`                | read PII beyond need; with host access, the IAM keys, DB and backups (F04-010, F04-015)                                            |

Data subjects who are not actors: visitors, including the children described in lost-person
alerts. **D-04 makes "no visitor PII" a per-event option**, so the model assumes an event where
registrations may carry names and contact details.

### Assets

| Asset                           | Where it lives                                                                                                                     | Why it matters                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Roster PII                      | `Volunteer` (name, email, phone, Cognito sub); audit `after` payloads; backups                                                     | students' contact details                                                                |
| Lost-person descriptions        | `LostPersonAlert` (purged 24 h after resolution); idempotency replays; backups                                                     | descriptions of children; the purge is a promise to parents (F04-013)                    |
| Lost-and-found notes and photos | `LostFoundItem.holderNote`, S3 media objects                                                                                       | can identify an owner                                                                    |
| Visitor PII (future, D-04 on)   | registrations, when an event enables it                                                                                            | in scope for the design; nothing collects it today                                       |
| Counts integrity                | registrations, footfall, stamps, redemptions, fallback imports                                                                     | the event's outcome figures; three counts that must not merge unless the event allows it |
| Audit log                       | `AuditLog`; CloudWatch on the audit branch                                                                                         | the only record of who did what; must survive the people it records                      |
| Credentials                     | IAM user keys, `SESSION_SIGNING_SECRET`, DB password, VAPID private key, refresh tokens, Cognito passwords, SSH key, DuckDNS token | each one is a way in (§ P04.5)                                                           |
| Event-day availability          | one box, one database, one operator                                                                                                | an outage on 7 January loses counts that cannot be recaptured                            |

### Trust boundaries (STRIDE)

**B1 — Browser ↔ API** (internet, TLS terminated by nginx)

| Threat                 | Today                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | API-issued HS256 access token (15 min) plus a rotating, httpOnly refresh cookie scoped to `/api/v1/auth`. Raw Cognito access tokens are also accepted and skip revocation (F04-001). Dev sign-in refused in production by two guards. |
| Tampering              | Strict zod schemas on every body, query and param that has one; server-stamped times; idempotency keys; station scope from the roster, never from the client.                                                                         |
| Repudiation            | Audit row in the same transaction as each mutation (gaps: F03-018). A replayed outbox entry is recorded against whoever is signed in when it is sent (F04-003).                                                                       |
| Information disclosure | Generic 500s, no stack traces. IDOR gaps: station rosters with phones (F04-004), announcements by id (F04-005). CSP allows inline script, so an XSS would reach the in-memory token (F04-007).                                        |
| Denial of service      | Per-IP limits on the unauthenticated auth routes collapse a campus NAT into one bucket (F04-006); limits are per worker (PF-02); `/readyz` is unthrottled and touches the database (F04-008).                                         |
| Elevation of privilege | Capability matrix in middleware, role read from the roster on every request. The roster import and provisioning grant any role (F03-001).                                                                                             |

**B2 — API ↔ Postgres** (loopback, TLS, one role)

| Threat                 | Today                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Password auth, the password in `server/.env` (F04-011).                                                          |
| Tampering              | The app role owns every table, `AuditLog` included, and can update or delete audit rows (F04-015).               |
| Repudiation            | Audit rows are mutable by the role that writes them; the off-host copy exists only on the audit branch.          |
| Information disclosure | Dumps every 15 minutes carry every PII column, purged descriptions included, for 400 days (F04-013).             |
| Denial of service      | Pool 25 per worker × 2 workers against `max_connections=100`: fits; a third worker or the backup job narrows it. |
| Elevation of privilege | The app role can run DDL (it runs the migrations).                                                               |

**B3 — API ↔ AWS** (long-lived IAM user keys, repo says)

| Threat                 | Today                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | Static access keys in `.env` work from any network (F04-010).                                                                                                                                                                  |
| Tampering              | The app may set retention on its own log groups (`logs:PutRetentionPolicy`), so it can shorten its own audit trail (F04-015).                                                                                                  |
| Repudiation            | Whether CloudTrail is on is unknown (P04.7 question).                                                                                                                                                                          |
| Information disclosure | `AdminGetUser` and `ListUsers` on the whole pool.                                                                                                                                                                              |
| Denial of service      | Cognito admin API throttling during a bulk roster import; CloudWatch rejection stops audit shipping for good (F03-040).                                                                                                        |
| Elevation of privilege | `AdminAddUserToGroup`, `AdminResetUserPassword` and `AdminEnableUser` on the whole pool: whoever holds the keys can make any account an Admin in Cognito (the roster still decides roles, but a reset password is a takeover). |

**B4 — Admin ↔ policies** (today the compiled capability matrix; after P11, Cedar on AVP)

| Threat                 | Today                                                                                          | What P11 must add                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Spoofing               | Admin accounts are ordinary Cognito users; whether MFA is required is unknown (F04-002).       | MFA for every role that edits policy or roster                      |
| Tampering              | The matrix changes only by deploy. Settings changes are audited, with gaps (F03-018, F03-021). | versioned policies, audited edits, locked guardrail policies (D-03) |
| Repudiation            | `settings.update` rows record the patch, not always the before state (F03-018).                | before/after on every policy change                                 |
| Information disclosure | `audit.read` shows emails, IPs and user agents to Leads.                                       | field-level minimisation for read-only roles                        |
| Denial of service      | A settings change can close every capture window (shift hours) with no guardrail.              | guardrails that no event admin can lift                             |
| Elevation of privilege | A Deputy reaches Admin through the roster import (F03-001).                                    | role grants checked by policy on every path, not per screen         |

**B5 — Operator ↔ host** (added: the deployment has one)

SSH is open to `0.0.0.0/0` on port 22 with a single ed25519 key held on one laptop (repo says;
`provision-single.sh` advises narrowing it by hand). Deploys build on the production box
(F04-020). The DuckDNS token, if the updater was installed as documented, is sent with
`curl -k` (F04-012).

### Top risks, ranked

Likelihood and impact on a 1–5 scale; score = L × I. "Event" means Dry Run #1 or 6–9 January.

| Rank | Risk                                                                                           | L   | I   | Score | Findings                  |
| ---- | ---------------------------------------------------------------------------------------------- | --- | --- | ----- | ------------------------- |
| 1    | Volunteers cannot sign in on event morning because the campus NAT shares one rate-limit bucket | 4   | 4   | 16    | F04-006, PF-02            |
| 2    | A failure goes unnoticed because nothing pages a human                                         | 4   | 4   | 16    | F04-017                   |
| 3    | The single box fails during the event and takes the database with it                           | 3   | 5   | 15    | F04-019, F04-020          |
| 4    | Captured data is lost because off-host backups were never proven on the deployed host          | 3   | 5   | 15    | F04-018                   |
| 5    | Lost-person descriptions (and, with D-04, visitor PII) outlive the promised purge              | 4   | 3   | 12    | F04-013, F04-014, F04-016 |
| 6    | The leaked or copied IAM keys hand over the Cognito pool (password resets, group changes)      | 2   | 5   | 10    | F04-010, F04-011          |
| 7    | A Deputy, or a stolen coordinator account, grants itself Admin                                 | 2   | 5   | 10    | F03-001, F04-002          |
| 8    | An admin account without MFA is phished                                                        | 2   | 5   | 10    | F04-002                   |
| 9    | A shared or stolen phone acts as, or credits captures to, the wrong person                     | 3   | 3   | 9     | F04-003, F03-009, F04-001 |
| 10   | Counts are wrong: paper tallies merge, duplicate stamps, races                                 | 3   | 3   | 9     | F03-012, F03-007, F03-028 |
| 11   | An insider reads PII beyond need (phones of every station, audit payloads)                     | 3   | 2   | 6     | F04-004, F04-005, F04-015 |
| 12   | An XSS turns into full session takeover                                                        | 1   | 5   | 5     | F04-007                   |
| 13   | DNS hijack through the DuckDNS token, then a valid certificate for the event hostname          | 1   | 5   | 5     | F04-012                   |
| 14   | The audit trail is altered or shortened by whoever controls the app                            | 1   | 4   | 4     | F04-015                   |

The shape: the most likely harms on event day are **availability and operability** (ranks 1–4),
not break-ins. The worst confidentiality harm is the one the product explicitly promises against
(rank 5).

---

## P04.2 — Authentication and sessions

### Controls verified in code

| Control                               | Where                                                         | Result                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API access token                      | `modules/auth/tokens.ts`                                      | ✅ HS256, algorithm pinned, `iss`/`aud` checked, 15 min, carries only `sub` and `sid`. Role and scope come from the roster on every request.                                                                                      |
| Signing key in production             | `config/env.ts`, `tokens.ts`                                  | ✅ `SESSION_SIGNING_SECRET` required (≥ 32 chars); two guards.                                                                                                                                                                    |
| Refresh token                         | `modules/auth/service.ts`                                     | ✅ 256-bit opaque, stored as SHA-256, rotated on every use, 30-day expiry (`refreshSessionDays`).                                                                                                                                 |
| Reuse detection and family revocation | `rotateSession`                                               | ✅ A rotated token presented again revokes the family and is audited. ⚠️ Concurrent refreshes fork the family (F03-010, re-confirmed); two tabs sign the person out everywhere (F02-032).                                         |
| Refresh cookie                        | `modules/auth/router.ts:57`                                   | ✅ `httpOnly`, `path=/api/v1/auth`, `SameSite=Lax` in the same-origin topology (`None; Secure` only when cross-site). `Secure` depends on `NODE_ENV=production`, which the audit branch's PM2 file sets.                          |
| CSRF on cookie routes                 | `assertTrustedOrigin`, JSON-only                              | ✅ POST/DELETE need an allowed `Origin` (or none) and `application/json`, which forces a preflight the allowlist refuses.                                                                                                         |
| Hosted UI hand-off                    | `/auth/login`, `/auth/callback`                               | ✅ Authorization code + PKCE (S256), 256-bit `state` in a 5-minute httpOnly cookie, compared before the exchange; the token is verified by the same verifier as every request.                                                    |
| Local provider in production          | `env.ts` superRefine, `localProvider.ts`, `devAuth/router.ts` | ✅ Three guards, all keyed on `NODE_ENV`. A box started with `NODE_ENV=development` and `AUTH_PROVIDER=local` would accept any roster email with no password; the audit branch's PM2 file and runbook set production and Cognito. |
| Client token handling                 | `client/src/lib/session.ts`                                   | ✅ Access token in memory only, never in storage; one in-flight refresh per tab. `aws-amplify` is a dependency but unused (F03-037), so Cognito tokens never reach the browser.                                                   |
| Sign-out                              | `signOut()`                                                   | ✅ Clears memory, then revokes the row and clears the cookie. Offline sign-out leaves the row live until expiry (documented). ⚠️ The outbox is not cleared (F04-003).                                                             |
| Revocation latency                    | `requireAuth` session cache                                   | ⚠️ Up to 60 s per worker after a revoke (F03-009, re-confirmed), and a revoke on one worker never reaches the other (PF-01).                                                                                                      |
| Deactivation                          | `admin/service.ts:deactivateVolunteer`                        | ✅ Roster flag, every session revoked, Cognito user disabled (optional flag), cache cleared. ⚠️ Cache cleared on the handling worker only (PF-01).                                                                                |
| Device list and remote sign-out       | `GET/DELETE /auth/sessions`                                   | ✅ Scoped to the caller in the query (guard test in `repro/security.test.ts`). No screen yet (PF-09).                                                                                                                             |

### Cognito pool: what the repo says, and what it cannot

Repo says (audit branch runbook and `server/.env.example`): pool `ap-southeast-1_9bwl2nGF7`,
public app client `23uft7mvtnrno1uunsc5lp0h2v` (no secret; PKCE), Hosted UI prefix domain
`spoh2027-livetest.auth.ap-southeast-1.amazoncognito.com`, callback
`https://spoh2027.duckdns.org/api/v1/auth/callback`, logout `/sign-in`, OAuth flow `code`, scopes
`openid email`, and explicit auth flows `ALLOW_ADMIN_USER_PASSWORD_AUTH`,
`ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_SRP_AUTH`. Accounts are created with `AdminCreateUser`
and a Cognito-sent invite (`identity/provider.ts`); a comment says self-signup is disabled.

Not in the repo, so turned into owner questions (P04.7, Q-C1…Q-C9): password policy, MFA,
threat protection (advanced security), token lifetimes, user-existence errors, token revocation,
self-signup, the email sender and its quota, temporary-password validity, deletion protection.

### Findings

#### F04-001 — The API accepts raw Cognito access tokens, which skip revocation

- **Severity:** Medium
- **Area:** `server/src/middleware/auth/index.ts:176–189` (`requireAuth`, second token shape)
- **Evidence:** When a bearer token is not an API-issued token, `requireAuth` verifies it as a
  Cognito access token and proceeds with no session row. The app client allows
  `ALLOW_USER_SRP_AUTH` (runbook), so anyone with a volunteer's password and the public client id
  can obtain such a token outside the Hosted UI and call the API with it.
- **Impact:** "Sign out this device", the device list and reuse detection do not apply to those
  tokens; they live for the pool's access-token lifetime (default 60 min, unknown here). It is also
  a second authentication path to reason about in P11/P12.
- **Fix:** Accept only API-issued tokens in `requireAuth`; keep provider verification at
  `POST /auth/session` and the callback. Drop `ALLOW_USER_SRP_AUTH` (and
  `ALLOW_ADMIN_USER_PASSWORD_AUTH` unless a script needs it) from the app client. Integration tests
  then mint session tokens instead of provider tokens.
- **Phase:** P12 (with F03-009/F03-010)
- **Status:** open

#### F04-002 — The Cognito pool's security settings are unrecorded, and the runbook's client update resets them

- **Severity:** High (to verify, P04.7 Q-C1…Q-C9)
- **Area:** Cognito pool `ap-southeast-1_9bwl2nGF7`; `infra/runbooks/deploy.md` § "If the Cognito
  callback breaks" (audit branch)
- **Evidence:** No pool or client configuration exists as code. The runbook's
  `update-user-pool-client` call sets callbacks, flows and scopes only; as the runbook itself
  notes, the API replaces the whole client configuration, so running it resets token validity,
  `PreventUserExistenceErrors`, `EnableTokenRevocation` and read/write attributes to defaults.
  Whether admins need MFA is unknown.
- **Impact:** An Admin or Chief account protected by a password alone is the shortest path to every
  roster row and every setting (risk 8). An unrecorded pool cannot be rebuilt, reviewed or diffed.
- **Fix:** Import the pool and client into CDK (P08) with: MFA required for every role above
  Volunteer (TOTP), threat protection on in enforcement mode, `PreventUserExistenceErrors=ENABLED`,
  token revocation on, access token 15–60 min, admin-only user creation, deletion protection.
  Replace the runbook command with a CDK deploy.
- **Phase:** P08 (as code), P12 (policy)
- **Status:** open

#### F04-003 — A queued capture is sent under whoever signs in next on that phone

- **Severity:** Medium
- **Area:** `client/src/lib/outbox.ts` (`enqueue`, `flush`), `client/src/lib/session.ts:signOut`
- **Evidence:** Outbox entries carry no owner, and `signOut()` leaves them in IndexedDB. The next
  flush sends them with the current access token, and the server stamps the capture with the
  current caller (`captureActorFrom(req)`). Repro: `client/tests/repro/outbox.test.ts`, "does not
  send one volunteer's queued capture under the next volunteer's sign-in" (skipped, fails today).
- **Impact:** On a shared or handed-over phone, captures are credited to the wrong person (the
  audit trail says Alex tapped what Sam tapped). If Alex is not rostered at Sam's station the
  entry is refused with 403 and parked for good (F03-033), so the capture is lost instead.
- **Fix:** Store the volunteer id on each entry; flush only the current volunteer's entries; on
  sign-out, show what is still queued and let the person send it first or discard it.
- **Phase:** P07 (with F03-033)
- **Status:** open

#### F04-023 — Invites may hit Cognito's default email quota and expire before training

- **Severity:** High (to verify, P04.7 Q-C6, Q-C7)
- **Area:** `server/src/modules/identity/provider.ts` (`AdminCreateUser` with
  `DesiredDeliveryMediums: ['EMAIL']`)
- **Evidence:** Nothing configures an SES sender, and D-08 notes duckdns cannot carry DKIM for
  SES. A pool on Cognito's default email sender is limited to 50 emails a day per account, and a
  temporary password expires after 7 days by default.
- **Impact:** A roster import of a full cohort (200+ people) fails partway once the quota is
  spent, and anyone invited more than a week before they first sign in cannot use their invite.
  Both surface on training day (4 Nov).
- **Fix:** Answer Q-C6/Q-C7 now. If the default sender is in use: provision in batches under the
  quota, set temporary-password validity to cover the gap to training, and move to SES with a real
  domain (D-08).
- **Phase:** P12.2 (SES, D-08); interim action before training
- **Status:** open

### Re-checked

- **F03-009** (revoked session keeps working up to a minute) and **PF-01** (other workers never
  hear of it): confirmed by reading `requireAuth`; together they make a revoke best-effort under
  PM2 cluster mode. Fix stays P06/P10.3.
- **F03-010** and **F02-032** (refresh races): confirmed; `rotateSession` updates by id without
  `revokedAt IS NULL`. Fix stays P12.

---

## P04.3 — Authorization

### Route inventory

`node remediation/reports/P04/routes.mjs` parses every router, folds in router-level `use(...)`
middleware and writes `reports/P04/routes.json` and the table in
[Appendix A](#appendix-a--route-inventory-p043). It reads the argument list with balanced brackets,
so middleware on its own line is not missed.

| Measure                                 | Count | Notes                                                                                                                |
| --------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| Routes                                  | 98    | 95 under `/api/v1` (P02's count) plus `/healthz`, `/readyz` and the local-only `/dev-auth/sign-in`                   |
| Unauthenticated                         | 8     | all intended: health ×2, the five session-opening auth routes, dev sign-in (mounted only with `AUTH_PROVIDER=local`) |
| Authenticated, no capability            | 7     | `/auth/sessions` ×2 (own rows), `/attendance` ×4 (rules in the service), `GET /stations` (any signed-in person)      |
| Capability-gated                        | 83    | 26 capabilities from `@spoh/shared/capabilities.ts`                                                                  |
| Station-scoped                          | 6     | the capture writes: registration ×2, footfall tick and bulk, card stamp, gift redemption                             |
| Mutations with no validator             | 5     | none takes input: attendance start/challenge, auth refresh, auth sign-out, lost-found close-out                      |
| No rate limit                           | 6     | health ×2, `/me` ×3, `GET /stations` (F04-008)                                                                       |
| Middleware the parser did not recognise | 0     |                                                                                                                      |

**Coverage:** every route that reads or writes event data sits behind `requireAuth` (router-level
`use`) and either a capability or a rule in its service. No route is authenticated-only by
accident: the seven without a capability were each read and are either self-scoped or public to
every signed-in person by design.

### Decisions made outside middleware

The P11 policy design has to carry all of these; today each lives in one service.

| Rule                                                           | Where                                                    | Note for P11                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Account active; role read from the roster                      | `middleware/auth/index.ts`                               | principal attributes                                                                    |
| IC and above bypass station scope, and the bypass is audited   | `middleware/rbac.ts:requireStationScope`                 | a policy with an audited "override" context                                             |
| Who may edit whom: no self-edit, must outrank the target       | `admin/service.ts:loadTarget`, `assertCanActOn`          | guardrail policy; **not applied on the roster import path** (F03-001)                   |
| Event-wide announcement needs Deputy+; station target any IC   | `announcement/service.ts:45`                             | resource = station; the IC's own station is not checked (F04-024)                       |
| Announcement acknowledgement                                   | `announcement/service.ts:130`                            | no audience check (F04-005)                                                             |
| Only your own shift: check-in/out, swap request                | `me/service.ts:loadOwnAssignment`, `shift/service.ts:65` | holds (guard tests added)                                                               |
| Check-in needs today's verified attendance and a running block | `me/service.ts:101`                                      | time-bound condition                                                                    |
| Briefing slot: only the assigned briefer                       | `shift/service.ts:223`                                   | inverted from its comment (F03-016)                                                     |
| Attendance: root admin by env email; issuer rules; campus IP   | `attendance/service.ts`                                  | root becomes an event-membership flag (F01, PF-07); IP condition becomes policy context |
| Session revoke: own sessions only                              | `auth/service.ts:revokeOwnSession`                       | holds (guard test added)                                                                |
| Push unsubscribe: own endpoint only                            | `notification/service.ts:282`                            | holds                                                                                   |
| Media read: `lost-found/` prefix, no `..`                      | `media/service.ts:readUrl`                               | any signed-in person; keys are random UUIDs                                             |

### IDOR results

Two volunteers, two ICs and a Chief on stations A and B, all rostered for the current block.
Tests in `server/tests/integration/repro/security.test.ts`.

| Probe                                                       | Result today           | Verdict                                                      |
| ----------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| IC of A reads `GET /roster/station/B`                       | 200 with phone numbers | ❌ F04-004                                                   |
| Volunteer of A acknowledges B's station announcement by id  | 200 with the message   | ❌ F04-005                                                   |
| Volunteer acknowledges a Chief's IC-only announcement by id | 200 with the message   | ❌ F04-005                                                   |
| IC of A sends an URGENT announcement to station B           | 201                    | ❌ F04-024                                                   |
| Volunteer checks into B's volunteer's shift                 | 403                    | ✅ guard test                                                |
| Volunteer requests a swap of someone else's shift           | 403                    | ✅ guard test                                                |
| Volunteer revokes another person's session by id            | 404, row untouched     | ✅ guard test                                                |
| Volunteer captures at a station they are not rostered on    | 403                    | ✅ guard test                                                |
| IC voids, adjusts or resolves at any station                | allowed                | by design (IC+ corrects anywhere; audited)                   |
| Any role reads any lost-and-found item and its photo URL    | allowed                | by design (one lost-and-found desk); keys unguessable        |
| Any role acknowledges any lost-person alert                 | allowed                | by design (alerts go to everyone)                            |
| Anyone issues a Mission Card from any station               | allowed                | no station scope on `/cards/:code/issue`; covered by F01-050 |

Record ids are 25-character cuids, so none of the ❌ rows can be enumerated blind, but ids
travel in lists, audit rows and URLs, so they are not secrets.

### What changes when data becomes event-scoped (input to P09 and P11)

Nothing is event-scoped today (PF-04), so there is no cross-event boundary to test. When D-02's
`Organisation → Event` root lands:

1. **Every lookup by id must carry the event.** A route that loads `…/:id` must match
   `{ id, eventId }`, never `{ id }` alone; otherwise every ✅ above becomes a cross-event ❌.
   Enforce it below the handlers: a repository helper that requires `eventId`, or Postgres
   row-level security keyed on a per-transaction `app.event_id` (decide in P05).
2. **Roles become memberships.** `Volunteer.role` is global; P11/P12 need
   `(person, event) → role`, so a Chief of one event is nobody in the next.
3. **Station scope includes the event** (stations belong to an event) and the time window uses
   the event's timezone (F01, PF-06).
4. **Reads are scoped too:** dashboards, reports, exports, the audit log, announcements, the
   lost-person feed and settings all filter by event.
5. **Keys and caches include the event:** idempotency keys (today global), the volunteer and
   session caches, rate-limit keys.
6. **A cross-event test matrix** (every route × "record from another event" → 404) joins P11's
   route × role matrix.

### Findings

#### F04-004 — An IC can read any station's roster, phone numbers included

- **Severity:** Medium
- **Area:** `server/src/modules/roster/router.ts` (`GET /roster/station/:stationId`),
  `roster/repo.ts:80–94`
- **Evidence:** `dashboard.station.read` (IC, Deputy, Chief, Lead, Admin) is the only check; the
  response carries `volunteerPhone` for every person on the station. Repro: `repro/security.test.ts`,
  "does not give an IC another station's roster phone numbers" (skipped, fails today).
- **Impact:** Every IC can collect the phone numbers of the whole cohort. Students' contact details
  reach people who do not need them (risk 11).
- **Fix:** Scope ICs to stations they are rostered on (or run) for the event; return phone numbers
  only to the person's own IC and to coordinators.
- **Phase:** P11 (policy), P06 (response shape)
- **Status:** open

#### F04-005 — Acknowledging an announcement returns it to people it was not addressed to

- **Severity:** Low
- **Area:** `server/src/modules/announcement/service.ts:130` (`acknowledgeAnnouncement`)
- **Evidence:** The ack loads the announcement by id and returns it, with no audience check.
  Repro: two skipped tests in `repro/security.test.ts` (station-targeted and role-targeted).
- **Impact:** Anyone holding an id reads a message meant for another station or for ICs only,
  and is recorded as having acknowledged it, which corrupts the "who has seen this" count.
- **Fix:** Apply the inbox's audience filter to the ack and answer 404 outside it.
- **Phase:** P06
- **Status:** open

#### F04-024 — An IC can send an urgent announcement to any station, not only their own

- **Severity:** Low
- **Area:** `server/src/modules/announcement/service.ts:38–50`
- **Evidence:** The rule's comment says an IC "may address their own station", but the code only
  refuses an IC who names no station. Repro: "lets an IC address only the station they run"
  (skipped; answers 201 today).
- **Impact:** An IC can push an urgent notice ("close the booth") to another station's phones.
  Audited, so recoverable, but it is the wrong person giving orders on event day.
- **Fix:** Check that the IC is rostered on or runs the target station; Deputy and above keep any
  station.
- **Phase:** P06 (rule), P11 (policy)
- **Status:** open

---

## P04.4 — Input, output and transport

### Review

| Area                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation coverage   | ✅ Every route that takes a body, query or param validates it (Appendix A, "Validated"). Every `*Request`, `*Query` and `*Params` schema in `@spoh/shared` is `.strict()` (the two import schemas through their factory), so unknown keys such as `role` or `volunteerId` are refused. Body limit 100 kB (`app.ts`).                                                                                                                                                               |
| Error leakage         | ✅ One error handler; non-`AppError`s become a generic 500 with the request id, the cause only in the log. 404s echo method and path, validation errors echo zod paths and messages; neither carries internals. Known gap: unique violations answer 500 instead of 409 (F03-002).                                                                                                                                                                                                  |
| Helmet on the API     | ✅ `default-src 'none'; frame-ancestors 'none'`, HSTS one year with subdomains in production (no `preload`), `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Resource-Policy: same-site`, `x-powered-by` off.                                                                                                                                                                                                                                                    |
| Client headers        | ⚠️ CSP from `next.config.ts` allows `script-src 'self' 'unsafe-inline'` in production (F04-007). `nosniff`, referrer policy, `Permissions-Policy` (camera self only) and HSTS are set. No `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `client/src`.                                                                                                                                                                                                                        |
| CORS                  | ✅ Exact allowlist, `credentials: true`, wildcard refused in production, requests without `Origin` allowed (same-origin and non-browser callers). Methods and headers are listed, not reflected.                                                                                                                                                                                                                                                                                   |
| Rate limits           | ⚠️ Authenticated routes are keyed on the subject (the limiter runs after router-level `requireAuth`); the unauthenticated auth routes fall back to the client IP, so a campus NAT shares one bucket (F04-006). Limits are per worker (PF-02). Six routes have none (F04-008).                                                                                                                                                                                                      |
| Proxy trust           | ✅ `TRUST_PROXY_HOPS` from config, not `true`; nginx appends `X-Forwarded-For` (repo says `TRUST_PROXY_HOPS=1`). Left at the default `0` behind nginx, every client is `127.0.0.1`: one rate-limit bucket for the whole event and QR attendance refused for everyone (the campus-IP check reads `req.ip`).                                                                                                                                                                         |
| S3 presigned uploads  | ✅ Presigned POST with a server-built key (`lost-found/yyyy/mm/dd/<uuid>.<ext>`), `content-length-range` 1…`S3_MAX_UPLOAD_BYTES` (10 MB), `Content-Type` pinned to jpeg/png/webp, 300 s expiry. Reads are presigned GETs for the same prefix, 300 s. Gaps: no server-side-encryption condition (bucket default applies, Q-S3), nothing ties an upload to a record, so abandoned uploads are never cleaned (F04-014), and the app's IAM policy has no S3 permissions at all (Q-I2). |
| Web Push              | ✅ VAPID, payloads encrypted to the device; lost-person pushes carry no description. ⚠️ An urgent announcement's preview is in the payload and shows on lock screens. ⚠️ The endpoint is any URL, so the server will POST to whatever a volunteer registers (F04-025).                                                                                                                                                                                                             |
| QR and PIN attendance | ✅ HS256 token with a domain-separated key, `jti` bound to a stored challenge, 5-minute expiry checked twice, issuer re-validated at use, the verifier cannot verify themselves, 5 attempts per 5 minutes per person under an advisory lock, a 10-digit PIN stored as an HMAC, rotation invalidates the previous QR and PIN. ⚠️ The PIN path has no on-campus requirement (F04-009).                                                                                               |
| Transport             | ✅ TLS at nginx with certbot's defaults (repo says). Postgres TLS on loopback with `sslmode=require`, which encrypts but does not verify the server; fine on loopback, not once the database is on another host (P08: `verify-full` or RDS's CA).                                                                                                                                                                                                                                  |

### PF-02 re-checked for security impact

Confirmed in P03.5 that limits multiply by the worker count. For security the effect is small:
passwords are checked by Cognito, not by the API, so the sensitive limit guards the Hosted UI
hand-off, dev sign-in (local only) and the attendance endpoints, which have their own
per-person attempt counter. Brute force against passwords is Cognito's to stop (Q-C3, threat
protection). The availability effect is the one that matters, and it is the flip side of F04-006.

### Findings

#### F04-006 — One campus network can sign in only about ten people a minute

- **Severity:** High
- **Area:** `server/src/middleware/rateLimit.ts:17–24` (IP fallback), `modules/auth/router.ts`
  (`/auth/session`, `/auth/login`, `/auth/callback` on `sensitiveRateLimit`)
- **Evidence:** Unauthenticated requests are keyed by IP, and the sign-in routes share the
  sensitive ceiling of 20 per minute. A Hosted UI sign-in costs two requests (`/login` and
  `/callback`), so one NAT address gets about ten sign-ins a minute per worker. Repro:
  `repro/security.test.ts`, "lets a morning rush of volunteers sign in from one campus address":
  thirty volunteers from one address, the 21st onwards get 429 (skipped, fails today).
- **Impact:** At a briefing where everyone is told to sign in, most of the room is refused and
  retries keep the bucket full. The file's own comment warns about shared Wi-Fi egress, but only
  the authenticated routes avoid it. Risk 1.
- **Fix:** Before training (4 Nov): raise `RATE_LIMIT_MAX_SENSITIVE` for the deployed box, or move
  `/auth/login` and `/auth/callback` to their own higher limit. In P15.2: key sign-in limits on
  failures (not successes), per account where known, with a shared store (PF-02).
- **Phase:** config change before training; P15.2
- **Status:** open

#### F04-007 — The production CSP allows inline script, and an XSS would own the session

- **Severity:** Medium
- **Area:** `client/next.config.ts:14–31`
- **Evidence:** `script-src 'self' 'unsafe-inline'` in production (the comment explains why:
  Next's inline bootstrap scripts). The access token is in page memory, and same-origin script can
  call `POST /api/v1/auth/refresh` with the httpOnly cookie attached and read the new token. No
  injection sink was found in `client/src`.
- **Impact:** CSP is the second line of defence and is currently absent for script; one XSS
  (a dependency, a future rich-text field) would act as the victim for as long as their tab is
  open.
- **Fix:** Nonce-based CSP with `'strict-dynamic'` through Next middleware (accepting dynamic
  rendering on authenticated pages), or hashes for the static bootstrap. Add a CSP report
  endpoint.
- **Phase:** P15
- **Status:** open

#### F04-008 — Six routes are unthrottled, and `/readyz` queries the database on every call

- **Severity:** Low
- **Area:** `server/src/modules/health/router.ts`, `modules/me/router.ts`,
  `modules/station/router.ts`
- **Evidence:** Appendix A: `/healthz`, `/readyz`, `GET /me`, `POST /me/check-in`,
  `POST /me/check-out` and `GET /stations` have no limiter. `/readyz` is public through nginx
  (`location = /readyz`) and runs `SELECT 1` each time.
- **Impact:** Anyone on the internet can make the API spend a pool connection per request; the
  authenticated three are bounded by the caller's own session.
- **Fix:** Serve `/readyz` only to the load balancer or from a short cache; add the default limit
  to the other four.
- **Phase:** P08 (health checks behind the ALB), P06 (limits)
- **Status:** open

#### F04-009 — The PIN fallback lets someone mark attendance from anywhere

- **Severity:** Low
- **Area:** `server/src/modules/attendance/service.ts:314` (campus check applies to `QR` only)
- **Evidence:** The QR path requires both phones on the configured SP network; the PIN path
  requires nothing about location, by design, so it works when the campus Wi-Fi does not.
- **Impact:** A verifier who reads their PIN out over chat verifies someone who is not there;
  attendance and the check-in that follows (F02-017) become claims, not observations.
- **Fix:** Make it an event setting (PIN allowed off-campus: yes/no), record the network on each
  attendance row, and flag off-campus PIN attendance in the IC console.
- **Phase:** P10 (setting), P13 (console)
- **Status:** open

#### F04-025 — A push endpoint can be any URL, so the server will POST wherever a volunteer asks

- **Severity:** Low
- **Area:** `packages/shared/src/dto/notification.ts:23` (`endpoint: z.url()`),
  `server/src/modules/notification/service.ts:192–215`
- **Evidence:** Any `http(s)` URL is stored as a subscription, with no limit on how many one person
  registers. Every dispatch POSTs to all of a recipient's endpoints in parallel with no timeout.
- **Impact:** A blind server-side request primitive (POST, encrypted body, no response returned)
  towards loopback or private addresses, and a way to make each lost-person alert fan out into
  thousands of outbound requests from the one box.
- **Fix:** Accept only `https` endpoints on the known push services (FCM, Mozilla, Apple, Windows),
  cap subscriptions per person, and set a send timeout.
- **Phase:** P06 (validation), P15 (egress policy)
- **Status:** open

<!-- appendices -->

---

## Appendix A — Route inventory (P04.3)

Generated by `node remediation/reports/P04/routes.mjs` from `main`. Roles: V Volunteer, I IC, D Deputy, C Chief, L Lead, A Admin; "all" means any signed-in person.

| Method | Path                                         | Auth   | Rate limit | Capability                | Roles | Station scope | Validated    | Idempotent |
| ------ | -------------------------------------------- | ------ | ---------- | ------------------------- | ----- | ------------- | ------------ | ---------- |
| GET    | `/healthz`                                   | **no** | **none**   | —                         | —     |               | —            |            |
| GET    | `/readyz`                                    | **no** | **none**   | —                         | —     |               | —            |            |
| POST   | `/api/v1/auth/session`                       | **no** | sensitive  | —                         | —     |               | body         |            |
| GET    | `/api/v1/auth/login`                         | **no** | sensitive  | —                         | —     |               | —            |            |
| GET    | `/api/v1/auth/callback`                      | **no** | sensitive  | —                         | —     |               | —            |            |
| POST   | `/api/v1/auth/refresh`                       | **no** | default    | —                         | —     |               | —            |            |
| DELETE | `/api/v1/auth/session`                       | **no** | default    | —                         | —     |               | —            |            |
| GET    | `/api/v1/auth/sessions`                      | yes    | default    | —                         | all   |               | —            |            |
| DELETE | `/api/v1/auth/sessions/:id`                  | yes    | default    | —                         | all   |               | params       |            |
| GET    | `/api/v1/me`                                 | yes    | **none**   | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/me/check-in`                        | yes    | **none**   | own.read                  | all   |               | body         |            |
| POST   | `/api/v1/me/check-out`                       | yes    | **none**   | own.read                  | all   |               | body         |            |
| GET    | `/api/v1/attendance`                         | yes    | default    | —                         | all   |               | —            |            |
| POST   | `/api/v1/attendance/start`                   | yes    | sensitive  | —                         | all   |               | —            |            |
| POST   | `/api/v1/attendance/challenge`               | yes    | sensitive  | —                         | all   |               | —            |            |
| POST   | `/api/v1/attendance/submit`                  | yes    | sensitive  | —                         | all   |               | body         |            |
| GET    | `/api/v1/stations`                           | yes    | **none**   | —                         | all   |               | —            |            |
| POST   | `/api/v1/registrations`                      | yes    | capture    | registration.create       | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/registrations/group`                | yes    | capture    | registration.create       | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/registrations/:id/void`             | yes    | default    | record.void               | IDCA  |               | params+body  |            |
| GET    | `/api/v1/registrations/summary`              | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/footfall/ticks`                     | yes    | capture    | footfall.create           | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/footfall/bulk`                      | yes    | default    | count.adjust              | IDCA  | yes           | body         | yes        |
| POST   | `/api/v1/footfall/ticks/:id/void`            | yes    | default    | record.void               | IDCA  |               | params+body  |            |
| GET    | `/api/v1/footfall/summary`                   | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| GET    | `/api/v1/footfall/live`                      | yes    | default    | dashboard.station.read    | IDCLA |               | —            |            |
| POST   | `/api/v1/incidents`                          | yes    | default    | incident.report           | all   |               | body         | yes        |
| GET    | `/api/v1/incidents`                          | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/incidents/:id/follow-ups`           | yes    | default    | incident.resolve          | IDCA  |               | params+body  |            |
| POST   | `/api/v1/incidents/:id/status`               | yes    | default    | incident.resolve          | IDCA  |               | params+body  |            |
| POST   | `/api/v1/lost-person`                        | yes    | default    | lostPerson.raise          | all   |               | body         | yes        |
| GET    | `/api/v1/lost-person/active`                 | yes    | capture    | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/lost-person/:id/ack`                | yes    | capture    | own.read                  | all   |               | params       |            |
| POST   | `/api/v1/lost-person/:id/resolve`            | yes    | default    | lostPerson.resolve        | IDCA  |               | params+body  |            |
| GET    | `/api/v1/roster/me`                          | yes    | default    | own.read                  | all   |               | —            |            |
| GET    | `/api/v1/roster/station/:stationId`          | yes    | default    | dashboard.station.read    | IDCLA |               | params+query |            |
| POST   | `/api/v1/roster/volunteers`                  | yes    | sensitive  | user.provision            | CA    |               | body         |            |
| POST   | `/api/v1/roster/import`                      | yes    | sensitive  | roster.edit               | DCA   |               | body         |            |
| POST   | `/api/v1/roster/swaps`                       | yes    | default    | own.read                  | all   |               | body         |            |
| GET    | `/api/v1/roster/swaps`                       | yes    | default    | own.read                  | all   |               | —            |            |
| GET    | `/api/v1/roster/swaps/pending`               | yes    | default    | swap.approve              | IDCA  |               | —            |            |
| POST   | `/api/v1/roster/swaps/:id/decide`            | yes    | default    | swap.approve              | IDCA  |               | params+body  |            |
| GET    | `/api/v1/roster/briefing-slots`              | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/roster/briefing-slots/:id/complete` | yes    | default    | own.read                  | all   |               | params+body  |            |
| GET    | `/api/v1/roster/gaps`                        | yes    | default    | dashboard.event.read      | DCLA  |               | —            |            |
| POST   | `/api/v1/cards/batch`                        | yes    | sensitive  | user.provision            | CA    |               | body         |            |
| GET    | `/api/v1/cards/funnel`                       | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| GET    | `/api/v1/cards/:shortCode`                   | yes    | capture    | card.stamp                | VIDCA |               | params       |            |
| POST   | `/api/v1/cards/:shortCode/issue`             | yes    | capture    | registration.create       | VIDCA |               | params+body  | yes        |
| POST   | `/api/v1/cards/:shortCode/stamps`            | yes    | capture    | card.stamp                | VIDCA | yes           | params+body  | yes        |
| POST   | `/api/v1/cards/:shortCode/void`              | yes    | default    | card.reissue              | IDCA  |               | params+body  |            |
| POST   | `/api/v1/cards/:shortCode/reissue`           | yes    | default    | card.reissue              | IDCA  |               | params+body  |            |
| GET    | `/api/v1/gifts`                              | yes    | default    | gift.redeem               | VIDCA |               | —            |            |
| POST   | `/api/v1/gifts/redemptions`                  | yes    | capture    | gift.redeem               | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/gifts/:id/adjust`                   | yes    | default    | count.adjust              | IDCA  |               | params+body  |            |
| GET    | `/api/v1/gifts/summary`                      | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/announcements`                      | yes    | default    | announcement.station.send | IDCA  |               | body         |            |
| GET    | `/api/v1/announcements`                      | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/announcements/:id/ack`              | yes    | default    | own.read                  | all   |               | params       |            |
| GET    | `/api/v1/dashboard/live`                     | yes    | default    | dashboard.event.read      | DCLA  |               | —            |            |
| GET    | `/api/v1/dashboard/data-health`              | yes    | default    | dashboard.event.read      | DCLA  |               | —            |            |
| GET    | `/api/v1/dashboard/station/:id`              | yes    | default    | dashboard.station.read    | IDCLA |               | params       |            |
| POST   | `/api/v1/lost-found`                         | yes    | default    | lostFound.log             | VIDCA |               | body         |            |
| GET    | `/api/v1/lost-found`                         | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/lost-found/:id/claim`               | yes    | default    | lostFound.log             | VIDCA |               | params+body  |            |
| POST   | `/api/v1/lost-found/close-out`               | yes    | default    | report.generate           | DCLA  |               | —            |            |
| GET    | `/api/v1/reports/summary`                    | yes    | sensitive  | report.generate           | DCLA  |               | query        |            |
| GET    | `/api/v1/reports/export`                     | yes    | sensitive  | report.generate           | DCLA  |               | query        |            |
| GET    | `/api/v1/audit`                              | yes    | default    | audit.read                | CLA   |               | query        |            |
| GET    | `/api/v1/admin/volunteers`                   | yes    | default    | user.read                 | DCLA  |               | query        |            |
| GET    | `/api/v1/admin/volunteers/:id`               | yes    | default    | user.read                 | DCLA  |               | params       |            |
| PATCH  | `/api/v1/admin/volunteers/:id`               | yes    | admin      | user.provision            | CA    |               | params+body  |            |
| POST   | `/api/v1/admin/volunteers/:id/deactivate`    | yes    | admin      | user.provision            | CA    |               | params+body  |            |
| POST   | `/api/v1/admin/volunteers/:id/reactivate`    | yes    | admin      | user.provision            | CA    |               | params       |            |
| POST   | `/api/v1/admin/assignments`                  | yes    | default    | roster.edit               | DCA   |               | body         |            |
| DELETE | `/api/v1/admin/assignments/:id`              | yes    | default    | roster.edit               | DCA   |               | params       |            |
| GET    | `/api/v1/admin/stations`                     | yes    | default    | config.manage             | CA    |               | —            |            |
| POST   | `/api/v1/admin/stations`                     | yes    | admin      | config.manage             | CA    |               | body         |            |
| PATCH  | `/api/v1/admin/stations/:id`                 | yes    | admin      | config.manage             | CA    |               | params+body  |            |
| GET    | `/api/v1/admin/event-days`                   | yes    | default    | user.read                 | DCLA  |               | —            |            |
| POST   | `/api/v1/admin/event-days`                   | yes    | admin      | config.manage             | CA    |               | body         |            |
| PATCH  | `/api/v1/admin/event-days/:id`               | yes    | admin      | config.manage             | CA    |               | params+body  |            |
| POST   | `/api/v1/admin/gift-types`                   | yes    | admin      | config.manage             | CA    |               | body         |            |
| PATCH  | `/api/v1/admin/gift-types/:id`               | yes    | admin      | config.manage             | CA    |               | params+body  |            |
| GET    | `/api/v1/admin/settings`                     | yes    | default    | own.read                  | all   |               | —            |            |
| PATCH  | `/api/v1/admin/settings`                     | yes    | admin      | config.manage             | CA    |               | body         |            |
| GET    | `/api/v1/notifications/config`               | yes    | default    | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/notifications/subscriptions`        | yes    | capture    | own.read                  | all   |               | body         |            |
| DELETE | `/api/v1/notifications/subscriptions`        | yes    | default    | own.read                  | all   |               | body         |            |
| GET    | `/api/v1/media/config`                       | yes    | default    | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/media/uploads`                      | yes    | sensitive  | lostFound.log             | VIDCA |               | body         |            |
| GET    | `/api/v1/media/url`                          | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/fallback/windows`                   | yes    | default    | fallback.declare          | DCA   |               | body         |            |
| POST   | `/api/v1/fallback/windows/:id/close`         | yes    | default    | fallback.declare          | DCA   |               | params+body  |            |
| GET    | `/api/v1/fallback/windows`                   | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/fallback/imports/registrations`     | yes    | sensitive  | fallback.import           | CA    |               | body         |            |
| POST   | `/api/v1/fallback/imports/footfall`          | yes    | sensitive  | fallback.import           | CA    |               | body         |            |
| POST   | `/api/v1/dev-auth/sign-in`                   | **no** | sensitive  | —                         | —     |               | body         |            |
