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
