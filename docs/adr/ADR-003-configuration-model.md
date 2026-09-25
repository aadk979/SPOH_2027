# ADR-003 — Configuration model, cache bus, shared state and retention

| Field     | Value                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Proposed (P05.4, 2026-09-26)                                                                                                                                                                                                                  |
| Decisions | D-14 = A, Postgres (design). Q-P3 (renameable vocabulary) and Q-P4 (locale per event): **assumed**. The wording of the lost-person promise: **assumed**                                                                                       |
| Resolves  | PF-01, PF-07, F03-030, F03-009 (cross-instance half), F03-021, F03-032 (live half), F02-005, F02-017, F02-021, F01-052, F01-009, F01-037, F01-038, F01-039, F04-009, F04-011, F04-013 (rule), F04-014, PF-02 and F03-042 (the store), F01-051 |
| Builds in | P08.6, P10.1, P10.2, P10.3, P10.4, P10.7, P10.8, P13.3, P13.4, P15.2, P15.7                                                                                                                                                                   |

## Context

- **Settings today** (F01 § Runtime settings audit): 16 keys in `AppSetting`, one global scope,
  and a cache per process reloaded every 60 s, so another instance sees a change up to a minute
  later (F03-030). Clients read the settings once per page load (F03-032). There is one audit row
  per save and no per-key history, revert or schedule. Saving sends every field and marks all of
  them "changed" (F02-005). Resetting a key is not atomic with its audit row (F03-021).
- **Env** (F01 § Env audit): 34 server keys, of which 19 are infra, 5 secrets and **10 are
  settings** that need a restart to change (PF-07). Attendance does nothing until
  `ATTENDANCE_ROOT_EMAIL` is set and the server restarted (F02-017). The 5 client keys are
  inlined at build time, so each environment needs its own image.
- **Per-process state** (PF-01, PF-02, F03-042): the auth caches, the rate limiter and the
  security-event dedupe are per process. With several instances, a deactivated volunteer keeps
  access for up to 60 s, and limits multiply by the number of instances.
- **Secrets** are lines in one plaintext file, with no owner or rotation (F04-011).
- **Retention:** only lost-person fields have a retention period (F04-014). Even those survive in
  the idempotency replay store and in 400 days of dumps (F04-013).

## Decision

### 1. The settings registry

`server/src/platform/settings/registry.ts` is the **only** definition of a setting. Each entry has:

| Field                                   | Meaning                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `key`                                   | dotted, stable (`capture.undoWindowSeconds`)                                                                         |
| `scopes`                                | where it may be set: `platform`, `event`, and `station` for the few keys that allow a station override               |
| `schema`                                | a zod schema with bounds. The bounds are the safety net (F01-052: `alert.pollSeconds` is 2–30)                       |
| `default`                               | the compiled default, so an empty table is a working system (kept from today)                                        |
| `label`, `description`, `unit`, `group` | UI copy. `description` says what changing it does                                                                    |
| `class`                                 | `operational`, `security` or `privacy`. The class picks the Cedar action (ADR-005) and whether a value may be logged |
| `lockedIn`                              | lifecycle states in which the key cannot change (ADR-004). For example, `visitorDataMode` is locked from `LIVE` on   |
| `schedulable`                           | whether a change can be scheduled (ADR-004)                                                                          |
| `clientVisible`                         | whether the client receives it                                                                                       |

A build step generates the types and metadata into `@spoh/shared/generated/settings`. The admin
settings screen (P10.8) is rendered from that metadata, not written by hand. A unit test asserts
that every key has a description, bounds and a class.

**Keys.** The 15 existing keys minus `eventName` (now `Event.name`) and `shiftBlocks` (now
`ShiftTemplate`, ADR-002), plus the proposed keys in F01 § Runtime settings audit, with these
changes:

- `product.countsMayMerge` and `product.visitorPersonalData` become `product.countsMode` and
  `product.visitorDataMode` (ADR-002 §4).
- `attendance.rootMembershipId` (event scope) replaces `ATTENDANCE_ROOT_EMAIL` (F02-017, F01-037).
  It is picked from the event's members in the UI.
- `attendance.pinAllowedOffNetwork` (event scope, F04-009): new events default to `false`. Event
  #1 is migrated with `true`, which is today's behaviour, and the go-live checklist flags it.
  Every attendance row records whether the device was on the trusted network.
- `vocabulary.*` (event scope, Q-P3, **assumed**): a short fixed list of product terms an event may
  rename, such as `vocabulary.missionCard` ("Mission Card"). Routes, code and API names keep the
  platform terms.
- **Station overrides** are allowed only for `alerts.silentStationMinutes` and
  `alerts.implausibleTapsPerMinute`, the two thresholds that differ by station (F01 § settings).

### 2. Storage, resolution and history

- **`Setting`** (`scope`, `scopeId`, `eventId` nullable, `key`, `value` JSON, `version`,
  `updatedAt`, `updatedByPersonId`), unique on (`scope`, `scopeId`, `key`). `scopeId` is the
  organisation, event or station id. Station-scoped rows also carry `eventId`, so the ADR-001
  guard applies to them.
- **`SettingChange`** (`scope`, `scopeId`, `eventId`, `key`, `version`, `before`, `after`,
  `reason`, `source`: `USER`, `SCHEDULE`, `REVERT`, `RESET`, `CLONE` or `MIGRATION`,
  `actorPersonId`, `scheduledActionId`, `createdAt`). History is append-only.
- **Resolution:** station → event → platform → compiled default. A layer is consulted only if the
  key allows that scope. A stored value that fails its schema is skipped, logged as an error, and
  shown as a warning on the settings screen. The next layer applies, as today.
- **Writes** go through one use case, `changeSetting`, in one transaction. It checks the
  permission (ADR-005), checks `lockedIn` against the event's state, and requires
  `expectedVersion`: a stale write returns 409, so two admins cannot silently overwrite each
  other. It then upserts the row, appends the `SettingChange`, writes the audit row (F03-021) and
  publishes on the bus. It reads the clock through `platform/time`.
- **Revert** writes a new version whose value is an earlier version's. History is never
  rewritten. **Reset** deletes the override and records the change.
- **The client sends only the keys that changed** (F02-005). The screen shows "default",
  "overridden here" or "inherited from the event" per key, with a reset button beside each
  override.

### 3. The cache bus (D-14 = A)

`server/src/platform/events` runs Postgres `LISTEN`/`NOTIFY` on channels `settings`, `access`,
`membership` and `session`.

- **Publishing happens inside the writing transaction** (`SELECT pg_notify(…)`). Postgres delivers
  a notification only when its transaction commits, so no instance ever acts on a change that was
  rolled back. The payload is small JSON (`{eventId, key, version}` or `{personId}`), well under
  the 8 KB limit.
- **Each instance holds one dedicated listener connection**, outside the Prisma pool. It must not
  go through RDS Proxy, which pins or breaks `LISTEN`. ADR-008 has no proxy.
- **Subscribers** are the settings cache, the membership and session caches (PF-01, F03-009) and,
  later, the decision cache (ADR-005). Each one evicts what the message names.
- **When the bus fails:**

  | Condition          | Behaviour                                                                                                                                                                                                                                                              |
  | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | listener connected | invalidation within about a second (target under 2 s, P10.3)                                                                                                                                                                                                           |
  | listener lost      | reconnect with backoff (1 s doubling to 30 s). Meanwhile the **membership and session caches bypass** (every request reads the database), and the settings cache drops to a 5 s TTL. `/readyz` stays up and reports `bus: degraded`. A metric feeds an alarm (ADR-008) |
  | reconnected        | a full refresh of every cache, then normal operation                                                                                                                                                                                                                   |
  | always             | a full settings refresh every 60 s, as the backstop                                                                                                                                                                                                                    |

  Security-relevant state (sessions, memberships) therefore **fails safe**: slower, never stale.

- **Clients** learn about changes without a reload (F03-032). Every API response carries
  `X-Settings-Version: <eventVersion>`. When it differs from the client's copy, the client
  refetches its settings. Dashboards already poll, so a change reaches an open screen within one
  poll.

### 4. Shared state for rate limits (D-14 = A)

- A Postgres **`UNLOGGED`** table `RateLimitCounter(key, windowStart, count)`. One statement per
  request (`INSERT … ON CONFLICT … DO UPDATE … RETURNING count`) increments the counter, or
  resets it when the window has passed. Unlogged means the counters are lost if the database
  crashes, which is acceptable for counters and makes each write cheap.
- **Keys:** a person id for signed-in routes, and the client IP for the anonymous routes.
  `/auth/login` and `/auth/callback` are keyed on **failures** from an IP, not on attempts, so a
  room of people on one campus NAT can sign in (F04-006). The tiers come from the `rateLimit.*`
  platform settings.
- The **security-event dedupe** (F03-042) uses the same table.
- A scheduler handler (ADR-004) prunes old windows. If ADR-008's edge has WAF rate-based rules,
  they sit above these limits as a coarse flood guard.
- **Why not ElastiCache or DynamoDB:** at this scale (hundreds of users, a few hundred requests a
  second at peak), one indexed upsert is not a load on RDS. Another managed service costs money
  every month (D-10) and is one more thing to fail on event day. Revisit if a load test (P16.2)
  shows the counter as a hotspot.

### 5. Env: infrastructure and secrets only

| Where                                                    | Keys                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **env** (task definition or dev machine)                 | `NODE_ENV`, `PORT`, `AUTH_PROVIDER`, `AWS_REGION`, `LOCAL_AUTH_SECRET` (dev only; production refuses to start with it)                                                                                                                                                                                           |
| **SSM Parameter Store** `/spoh/<env>/…`, injected by ECS | `LOG_LEVEL`, `DATABASE_POOL_MAX`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`, `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_CROSS_SITE`, `S3_MEDIA_BUCKET`, `S3_CONTENT_BUCKET`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` |
| **Secrets Manager** `spoh/<env>/…`, injected by ECS      | `DATABASE_URL` (built from the RDS-managed secret, which rotates), `SESSION_SIGNING_SECRET`, `ATTENDANCE_SIGNING_SECRET`, `VAPID_PRIVATE_KEY`                                                                                                                                                                    |
| **settings registry**                                    | `ACCESS_TOKEN_TTL_SECONDS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_{DEFAULT,CAPTURE,SENSITIVE,ADMIN}`, `ATTENDANCE_SP_CIDRS` (event: trusted networks), `S3_UPLOAD_TTL_SECONDS`, `S3_MAX_UPLOAD_BYTES`                                                                                                          |
| **event setting**                                        | `ATTENDANCE_ROOT_EMAIL` → `attendance.rootMembershipId`                                                                                                                                                                                                                                                          |
| **removed**                                              | `SHIFT_HOURS_ALWAYS_OPEN` → the `REHEARSAL` lifecycle state (ADR-004)                                                                                                                                                                                                                                            |

- CDK writes the SSM parameters from its outputs (P08.6). Every secret has an `owner` and a
  `rotation` tag. The signing secrets rotate with a dual-key window: the app verifies with the
  current and the previous key, and signs with the current one (P15.6). `server/.env.example`
  lists every remaining key (F01-051).
- **Client configuration is served at runtime**, not inlined at build. `GET
/api/v1/client-config` (public, cached for 5 minutes) returns the Cognito ids, the hosted-UI
  domain and the environment label. The API is same-origin behind the edge (ADR-008), so the
  client needs no API base URL. **One image runs in staging and production**, and production gets
  exactly the image staging tested. The five `NEXT_PUBLIC_*` keys are deleted.

### 6. Locale and time

- Each event has a `locale` (Q-P4, **assumed**) that defaults to the organisation's (`en-SG` for
  SP) and a `timezone` (ADR-001). All formatting takes both from the event, never from the device
  or a constant.
- Domain and application code read time only through the injected `Clock` (engineering-standards
  §7). `EventClock` adds the event's zone, day boundary and shift lookups (ADR-004). The timezone
  library is chosen in ADR-007.

### 7. Content

- A **`ContentDocument`** per event holds the brief, journey, map and briefing points, with
  `draft` and `published` versions. The schema is F01 § Content audit's draft, with
  `programmeId` replaced by a `StationTag` reference (ADR-002). All text is plain text with length
  limits, so nothing renders HTML.
- **Publishing** freezes a version. It writes `content/<eventId>/<version>.json` and the map
  images to the S3 content bucket and bumps the event's content version. The client and service
  worker load it from the same-origin, immutable path `/content/<eventId>/<version>.json` (served
  from S3 by the edge, ADR-008). The existing rule that the service worker never caches `/api/`
  stays intact.
- The service worker precaches the latest published version and its images, keeps the previous
  one until the new one is stored, and precaches the brief, journey and map screens (P13.4). The
  budget is 2 MB in total.

### 8. Retention schedule (F04-014)

Every purge is a scheduler handler (ADR-004): idempotent, audited with counts, and never
deleting operational counts.

| Data                                                         | Kept                                                                                                                                                                        | Setting (scope)                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Lost-person description, clothing, age (`visitor-transient`) | until `lostPersonPurgeHours` (24) after resolution                                                                                                                          | `privacy.lostPersonPurgeHours` (event) |
| Idempotency records                                          | 7 days. **PII-bearing endpoints store no response body**: they store the created id and status, and a replay re-reads the row after any purge (F04-013)                     | `platform.idempotencyRetentionDays`    |
| Allowlisted visitor fields (`visitor-personal`, ADR-002)     | each field's `retentionDays` after `CLOSED`                                                                                                                                 | per field                              |
| Lost-and-found photos (`media`)                              | 30 days after `CLOSED`                                                                                                                                                      | `privacy.mediaRetentionDays` (event)   |
| Staff personal data on memberships of an archived event      | phone and notes cleared 365 days after `ARCHIVED`. A person with no remaining membership is anonymised; their audit rows keep the id and the `actorSub`                     | `privacy.staffRetentionDays` (event)   |
| Refresh sessions                                             | 30 days after expiry or revocation                                                                                                                                          | `security.refreshSessionDays`          |
| Push subscriptions                                           | removed after a 404 or 410, or 90 days unused                                                                                                                               | —                                      |
| Rate-limit counters                                          | the current window only                                                                                                                                                     | —                                      |
| Audit log (database)                                         | 400 days after the event is `ARCHIVED`. Platform rows: 400 days. The app cannot delete them (F04-015, ADR-008)                                                              | fixed; changing it needs a migration   |
| Audit log (CloudWatch)                                       | 400 days                                                                                                                                                                    | infra (ADR-008)                        |
| Application logs                                             | 30 days. No personal data except ids, by the logging rules                                                                                                                  | infra (ADR-008)                        |
| Exports in S3                                                | 90 days                                                                                                                                                                     | infra (lifecycle rule)                 |
| Database backups                                             | point-in-time recovery 7 days, daily snapshots 35 days, plus **one archive snapshot per event**, taken after close-out and after the lost-person purge has run, kept 1 year | infra (ADR-008)                        |

Long-term backup copies are therefore taken only **after** the purge, so no copy kept beyond 35
days can hold a lost-person description. That closes F04-013's "400 days of dumps". The promise
to families (**wording assumed**, P05.11) becomes: _"A description is removed 24 hours after the
case is resolved, and backup copies containing it expire within 35 days."_

## Options considered

| Topic              | Chosen                                                               | Rejected, and why                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache invalidation | Postgres `LISTEN`/`NOTIFY`, with a TTL backstop and fail-safe bypass | a shorter TTL only: every instance hits the database more, and changes still lag. SNS or EventBridge fan-out: a new moving part, and messages outside the database transaction. Redis pub/sub: requires ElastiCache |
| Rate-limit store   | Postgres `UNLOGGED` table (D-14 A)                                   | ElastiCache (D-14 B): about US$12–25/month per environment and a new failure mode. DynamoDB (D-14 C): cheap, but a second data store, credentials and a latency path for every request                              |
| Settings storage   | rows plus append-only history, optimistic concurrency                | AWS AppConfig: good for feature flags, but per-event and per-station scopes, per-key permissions and history already need the app's own tables                                                                      |
| Client config      | served at runtime by the API                                         | build-time `NEXT_PUBLIC_*`: one image per environment, so production never runs the tested artefact                                                                                                                 |
| Content            | versioned JSON document, published to S3 and precached               | markdown files in the repo: a release per wording change (today's problem). Rows per paragraph: harder to version and to precache as one unit                                                                       |
| Long-term backups  | archive snapshot after the purge                                     | monthly snapshots on a fixed calendar: they capture live lost-person descriptions (F04-013)                                                                                                                         |

## Consequences

- Every operational value can change live, is audited, and can be reverted and scheduled. The env
  holds only infrastructure and secrets (PF-07).
- Deactivation, role changes and revocation take effect on every instance within about 2 s, and
  never later than the next request if the bus is down (PF-01, F03-009).
- One extra database connection per instance, for the listener.
- Rate limiting adds one small write per request. The capture path is the hot one. P11.9 and
  P16.2 measure it.
- Production and staging run the same image. `client-config` becomes part of the public API
  surface, so it must never carry a secret, and a test asserts it.
- The lost-person promise gets more precise wording, which the owner approves (P05.11).

## How it is tested

- **Registry:** every key has a description, bounds and a class. The generated shared types
  match. A value outside bounds is refused by the API.
- **Resolution and history:** table-driven tests over the four layers. Revert and reset create
  new versions. A stale `expectedVersion` gets 409. The setting row, change row and audit row
  commit together or not at all.
- **Cache bus** (P10.3, the P03.5 two-instance harness): a deactivation on instance A is refused
  on instance B within 2 s. With the listener killed, B reads through to the database at once, and
  a settings change reaches B within 5 s. After reconnect, a full refresh.
- **Rate limits** (P15.2): limits hold across two instances. Fifty sign-ins from one IP with no
  failures are not refused. Twenty failures are.
- **Env:** `config/env.ts` has no key from the registry list. Production refuses to boot with
  `LOCAL_AUTH_SECRET` or `AUTH_PROVIDER=local`. `client-config` contains no key named
  `*SECRET*` or `*PRIVATE*`.
- **Retention** (P15.7): time-travel tests per row of §8. After a purge, no table, idempotency
  record or audit value contains the purged text.

## Migration

1. **P10.1–P10.2:** create `Setting` and `SettingChange`, and copy every `AppSetting` row into a
   platform or event setting (Event #1) with a `MIGRATION` change record. `AppSetting` is dropped
   in the same phase, after a release reads only the new tables.
2. **P10.3:** the bus and the cache subscribers. The 60 s refresh stays as the backstop.
3. **P10.4:** move the ten env settings into the registry and events. For each deployed
   environment, the current env value becomes the first stored value, so behaviour does not
   change. Then remove the keys from `config/env.ts`, `.env.example` and the task definitions.
4. **P08.6:** SSM parameters and secrets exist before P10.4 needs them. The server reads them as
   env, injected by ECS, so the code does not change when the source changes.
5. **P13.3–P13.4:** content moves from `client/src/content/` into Event #1's `ContentDocument`
   (published as version 1), and the compiled content is deleted.
6. **P15.7:** the retention handlers, the archive snapshot, and the new promise wording.
