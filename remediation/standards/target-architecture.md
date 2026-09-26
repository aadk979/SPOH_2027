# Target architecture

**Status: final** (P05.8 and P05.9, 2026-09-26), signed off by the owner at G1 (2026-09-26). It is binding
from P06. Each section names the ADR in `docs/adr/` that decided it. A change needs a new ADR, not
an edit here.

---

## 1. Domains

| Context         | Modules                                                                          | Owns                                             |
| --------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Platform**    | identity, access, settings, scheduler, audit, notifications, media, organisation | who you are, what you may do, config, time, logs |
| **Event setup** | events, eventDays, shifts, stations, taxonomy, content                           | the shape of an event: created, cloned, archived |
| **People**      | people, memberships, assignments, attendance, swaps, briefings                   | who is working, where, when                      |
| **Capture**     | registration, footfall, missionCards, gifts                                      | the three counts plus redemption                 |
| **Safety**      | incidents, lostPersons, lostFound                                                | incidents and people/items                       |
| **Operations**  | dashboard, dataHealth, announcements, fallback, reports                          | watching, telling, recovering, reporting         |

Today's `admin`, `me`, `roster` and `shift` modules dissolve into these. `admin` is a UI area,
not a domain.

## 2. Data model (ADR-001, ADR-002, ADR-003, ADR-004)

```
Organisation ─┬─ OrganisationMembership (person, MEMBER | PLATFORM_ADMIN)
              ├─ Person (cognitoSub, name, email, phone, active) — reused across events
              ├─ Setting (scope: platform) + SettingChange
              └─ Event (slug, name, venue, timezone, locale, status, dayBoundaryMinutes, branding)
                   ├─ EventDay ─ Shift (materialised instants) ─ ShiftTemplate (HH:MM, endsNextDay)
                   ├─ StationType (capability flags) ─ Station ─ StationTag (many-to-many)
                   ├─ CaptureCategory (code, label, order, active)
                   ├─ EventMembership (person, role, portfolio, reportsTo, status, mfaRequired)
                   ├─ RolePermission (role × action → Cedar Role.grants), role labels
                   ├─ ShiftAssignment (membership × shift × station), Attendance, SwapRequest, BriefingSlot
                   ├─ Registration, FootfallTick, MissionCard, CardStampEvent, GiftType, GiftRedemption
                   ├─ Incident, LostPersonAlert/Summary, LostFoundItem
                   ├─ Announcement, FallbackWindow, ImportBatch
                   ├─ VisitorField + VisitorRecord (only when visitorDataMode = allowlist)
                   ├─ ContentDocument (draft/published versions; published copies in S3)
                   ├─ Setting (scope: event | station) + SettingChange
                   └─ ScheduledAction
Platform tables: AuditLog (eventId nullable), IdempotencyRecord (eventId nullable),
RefreshSession and PushSubscription (per person), RateLimitCounter (unlogged)
```

- **Every event-owned row carries `eventId`**, children included. References are composite
  `(eventId, parentId)` foreign keys, so a row cannot point into another event. Repository
  functions take an `EventScope`, and a Prisma extension refuses an unscoped query (ADR-001 §2).
- **Codes are stable, labels are free.** Referenced taxonomy rows are deactivated, never deleted
  (ADR-002 §1). The invariant enums are listed in ADR-002 §2.
- **Every personal column declares a data class**, which drives retention, readers and logging
  (ADR-002 §5, ADR-003 §8).
- Capture rows carry `rehearsal` (ADR-004 §2).

## 3. Request lifecycle (ADR-001, ADR-003, ADR-005)

```
request ─▶ requestId ─▶ rate limit (Postgres counter; per person, or per IP on failures for sign-in)
        ─▶ authenticate (API-issued token only; local provider in dev)
        ─▶ event context: /api/v1/events/:eventId → event + active membership (cached, bus-invalidated),
           404 for an unknown or inaccessible event
        ─▶ validate (zod, from @spoh/shared)
        ─▶ authorize: EntityBuilder → {principal, action, resource, context}
                      → DecisionCache → AvpAuthorizer (or LocalCedarAuthorizer when degraded, per group)
        ─▶ use case: tx { idempotency ▸ domain rules ▸ repo writes (EventScope) ▸ audit ▸ pg_notify } ▸ post-commit effects
        ─▶ response ({ data } or { data, meta }; X-Settings-Version header)
```

## 4. Authorization (ADR-005)

- **Cedar schema** in `packages/access-policies`: `Membership` principals in events, `Person`
  principals for platform actions. Resources are `in` their `Event` (and `Station`). There are 65
  actions in 8 functional groups (`Capture`, `Correct`, `Safety`, `Self`, `Report`, `Manage`,
  `Configure`, `Platform`), plus `Editable` and `Write`.
- **Policy layers:**
  1. generated per-action grants, driven by the per-event role's `grants` (**data**:
     `RolePermission`);
  2. station scope;
  3. locked guardrail `forbid`s;

  plus self-service, the attendance gate and platform admin.

- The app **never writes policies**. CDK deploys the static set to the AVP store per environment,
  and the image bundles the same files.
- **Server decisions:** AVP `IsAuthorized` behind a 30 s decision cache. Local Cedar is used when
  AVP is degraded, for `Capture`, `Self` and `Safety`. `Correct`, `Manage`, `Configure` and
  `Platform` fail closed.
- **UI affordances:** `/events/:id/me/permissions` on the local engine, never `BatchIsAuthorized`
  (US$150 per million). The client never evaluates policy itself.
- Intentional changes from the old matrix: `remediation/reports/P05/cedar/CHANGES.md` (C1–C13).

## 5. Configuration, lifecycle and scheduling (ADR-003, ADR-004)

- The **settings registry** (key, scopes, schema with bounds, default, copy, class, `lockedIn`,
  `schedulable`, `clientVisible`) is the only definition of a setting, generated into
  `@spoh/shared/generated/settings`. Resolution: station → event → platform → compiled default.
  Writes are optimistic (`expectedVersion`). History is append-only, with revert and reset.
- **Cache bus:** Postgres `LISTEN`/`NOTIFY` on `settings`, `access`, `membership`, `session` and
  `event.state`, published inside the writing transaction. If the listener is lost, membership and
  session caches bypass and the settings TTL drops to 5 s. A 60 s full refresh is the backstop.
- **Env holds infrastructure and secrets only.** SSM and Secrets Manager inject them in AWS.
  Client configuration is served at run time, so one image runs in every environment.
- **Lifecycle:** `DRAFT → READY ⇄ REHEARSAL`, `READY → LIVE → CLOSED → ARCHIVED`, with
  `CLOSED → LIVE` within 48 h. Guards and the go-live checklist are the same functions. After the
  close, queued captures recorded before it sync during a grace period.
- **Scheduler:** `ScheduledAction` claimed with `FOR UPDATE SKIP LOCKED` under a lease. The handler,
  its completion and its audit commit together. Retries back off, then dead-letter with an alarm.
  External effects are post-commit and idempotent. Per-instance **local ticks** are only for cache
  maintenance.
- **Retention** per data class, run by scheduler handlers. Long-term backups are taken only after
  the purge (ADR-003 §8).

## 6. Server tree (ADR-007)

```
server/src/
├── main.ts                    process entry: config → platform → app → listen → worker
├── app/                       composition root: createApp, route registry, module wiring
├── config/                    env schema (infra + secrets only), split per concern
├── platform/
│   ├── db/ (Prisma client + EventScope extension)   http/ (middleware, event context)
│   ├── identity/ (token verification, session open, MFA gate)
│   ├── access/ (Authorizer: AVP + local Cedar, EntityBuilder, DecisionCache)
│   ├── audit/  idempotency/  settings/ (registry, resolver)  scheduler/ (worker, local ticks)
│   ├── events/ (cache bus)  ratelimit/  time/ (Clock, EventClock)  logger/  errors/  aws/
└── modules/<domain>/          index.ts · http/ · application/ · domain/ · data/ · jobs.ts
```

## 7. Client tree (ADR-001, ADR-005, ADR-007)

```
client/src/
├── app/                       thin routes: /sign-in, /events, /account, /e/[event]/…
├── features/<domain>/         api.ts, queries.ts (keys prefixed by eventId), screens/, components/, model/, index.ts
├── shared/ui  shared/lib (api client, session with tab locks, outbox, runtime config)  shared/hooks  shared/shell
└── navigation/registry.ts     the one source for every nav surface; visibility from /me/permissions
```

Offline: registration, footfall, stamps, redemptions and incident reports queue. Lost-person
alerts never do (ADR-007 §5). The service worker precaches the shell, the capture screens and the
published content version. It never caches `/api/`.

## 8. Packages (ADR-005, ADR-007)

```
packages/
├── shared/            contracts (zod DTOs by domain), errorCodes, invariants/, time/, generated/
└── access-policies/   schema.cedarschema, policies/*.cedar, tools/generate-grants, default-grants.json, CHANGES.md, tests
infra/
└── cdk/               CDK app: stacks per concern, stages per environment (ADR-008)
```

## 9. AWS topology (ADR-008)

Chosen to fit D-10's US$100/month for staging and production together. Costs are in
`remediation/reports/P05/pricing/cost.md`.

```
Route 53 ─ ACM ─ API Gateway HTTP API (custom domain, stage throttling)
                        │ VPC link
                 Cloud Map ─▶ ECS Fargate ARM64 "app" (API + static client, one image)
                                public subnets, inbound only from the VPC link; no NAT, no interface endpoints
                        ├─▶ RDS PostgreSQL 17 (t4g.micro; t4g.small on event days; single-AZ; PITR; AWS Backup)
                        ├─▶ Verified Permissions (policy store per env) · Cognito (prod: existing pool; staging: own)
                        ├─▶ S3 (gateway endpoint): media · content · exports · backups (imported)
                        ├─▶ Secrets Manager · SSM · SES (DKIM)
                        └─▶ CloudWatch Logs (app 30 d, audit 400 d) · 12 alarms ─▶ SNS (email, SMS in event weeks)
GitHub Actions ─ OIDC ─▶ ECR ─▶ migrate task ─▶ ECS deploy (staging on push; prod after approval)
Staging: parked when idle. Budget alerts at 80 % and 100 % of US$100.
```

Priced options, not in the baseline: Cognito Plus, RDS Multi-AZ for event week, and WAF (with
CloudFront Pro), under Q-P9.
