# Target architecture (draft; finalised in P05)

This is the shape the programme builds towards. Everything marked **(ADR)** is decided in P05 and
may change there. After sign-off this file is updated to match the ADRs and becomes binding.

---

## 1. Domains

| Context         | Modules                                                            | Owns                                             |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| **Platform**    | identity, access, settings, scheduler, audit, notifications, media | who you are, what you may do, config, time, logs |
| **Event setup** | events, eventDays, shifts, stations, taxonomy, content             | the shape of an event: created, cloned, archived |
| **People**      | people, memberships, assignments, attendance, swaps, briefings     | who is working, where, when                      |
| **Capture**     | registration, footfall, missionCards, gifts                        | the three counts plus redemption                 |
| **Safety**      | incidents, lostPersons, lostFound                                  | incidents and people/items                       |
| **Operations**  | dashboard, dataHealth, announcements, fallback, reports            | watching, telling, recovering, reporting         |

Today's `admin`, `me`, `roster` and `shift` modules dissolve into these. `admin` is a UI area,
not a domain.

## 2. Data model (ADR-001, ADR-002)

```
Organisation ─┬─ Event (slug, name, venue, timezone, status, branding)
              │    ├─ EventDay (date, label, flags)
              │    ├─ ShiftTemplate (name, start, end) ─ Shift (day × template)
              │    ├─ Station (name, code, type, capabilities, location)
              │    ├─ CaptureCategory (code, label, order)          ← was enum VisitorCategory
              │    ├─ StationType / StationTag                       ← was StationKind / CourseCode
              │    ├─ GiftType, CardBatch, MissionCard
              │    ├─ ContentDocument (guide, brief, journey, map; S3 assets)
              │    ├─ EventMembership (person, role, portfolio, reportsTo)
              │    ├─ Assignment (membership × shift × station), Attendance, Swap, BriefingSlot
              │    ├─ Registration, FootfallTick, CardStampEvent, GiftRedemption (eventId on every row)
              │    ├─ Incident, LostPersonAlert/Summary, LostFoundItem
              │    ├─ Announcement, FallbackWindow, ImportBatch
              │    ├─ Setting (scope: event | station), ScheduledAction
              │    └─ RolePermission (role × action set → Cedar policy id)
              ├─ Person (identity sub, name, email, phone) — global, reused across events
              └─ Setting (scope: platform)
AuditLog, IdempotencyRecord, RefreshSession, PushSubscription — platform tables, carry eventId where relevant
```

- Every event-owned row carries `eventId`. Repos filter by it, and indexes lead with it.
- The API is path-scoped: `/api/v1/events/:eventId/registrations` **(ADR)**. A request can never
  address two events.
- Client routes live under an event segment (`/e/[event]/…`) **(ADR)**, with an event switcher for
  people who hold memberships in more than one event.

## 3. Request lifecycle

```
request ─▶ requestId ─▶ authenticate (Cognito JWT / local in dev)
        ─▶ resolve event + membership (cached, invalidated on the cache bus)
        ─▶ validate (zod)
        ─▶ authorize: PEP builds {principal, action, resource, context}
                      ─▶ Authorizer (AVP, or local Cedar in dev/test/degraded)
        ─▶ use case: tx { idempotency ▸ domain rules ▸ repo writes ▸ audit } ▸ post-commit events
        ─▶ response (typed DTO)
```

## 4. Authorization (ADR-005)

- **Cedar schema**: entity types `Person`, `Role`, `Event`, `Station`, `EventDay`, plus resource
  types per domain (`Registration`, `Incident`, …). **Actions** are the capability catalogue,
  grouped (`Capture`, `Correct`, `Safety`, `Manage`, `Configure`, `Report`).
- **Principal attributes** (built per request): `rank`, `memberships`, `onShiftStations` (live),
  `attendanceVerifiedToday`.
- **Context**: `eventPhase`, `onTrustedNetwork`, `now`.
- **Policy layers**:
  1. role policies (editable per event, D-03)
  2. station-scope policy (capture only where you are on shift; roles flagged `anyStation` bypass)
  3. **locked guardrails** as `forbid` policies (no acting on yourself or a peer/superior, no
     granting rank ≥ your own, no capture when the event is CLOSED/ARCHIVED, no config writes
     outside SETUP/REHEARSAL for non-admins…)
- Policies are source-controlled in `packages/access-policies/`, deployed to the AVP policy store by
  CDK, and tested locally with Cedar WASM. Admin edits go through the app, which writes AVP and an
  audit row.
- The client asks `/me/permissions` (BatchIsAuthorized) for affordances and never evaluates policy itself.

## 5. Configuration and scheduling (ADR-003, ADR-004)

- A **settings registry** of typed definitions (key, scope, schema, default, description, unit,
  required action) is generated into `@spoh/shared` for the admin UI.
- Resolution order: station override → event → platform → compiled default. Every write keeps
  history and can be reverted.
- The **cache bus** is Postgres `LISTEN/NOTIFY` on `settings`, `access`, `membership` and `session`
  channels, so every instance invalidates within about a second. A periodic refresh is the backstop.
- **Event lifecycle**: `DRAFT → READY → REHEARSAL → LIVE → CLOSED → ARCHIVED`, with guarded
  transitions and side effects.
- The **scheduler** is a `ScheduledAction` table with a worker (`SKIP LOCKED`, retries, idempotent
  handlers, audit). Modules register handlers.

## 6. Server tree

```
server/src/
├── main.ts                    process entry: config → platform → app → listen → jobs
├── app/                       composition root: createApp, route registry, module wiring
├── config/                    env schema (infra + secrets only), split per concern
├── platform/
│   ├── db/  http/  access/  audit/  idempotency/  settings/  scheduler/
│   ├── events/ (cache bus)  time/  logger/  errors/  aws/
└── modules/<domain>/          see engineering-standards §3
```

## 7. Client tree

```
client/src/
├── app/                       thin routes; /e/[event]/… segment (ADR)
├── features/<domain>/         api.ts, queries.ts, screens/, components/, model/, index.ts
├── shared/ui  shared/lib  shared/hooks
└── navigation/registry.ts     single source for every nav surface
```

## 8. Packages

```
packages/
├── shared/            contracts (zod DTOs by domain), errorCodes, invariant enums, generated/
└── access-policies/   schema.cedarschema, policies/*.cedar, templates/, tests (Cedar WASM)
infra/
└── cdk/               CDK app: stacks per concern, stages per environment
```

## 9. AWS topology (ADR-008; D-07 option A shown)

```
Route 53 ─ ACM ─ CloudFront + WAF
                     │
                    ALB (HTTPS)
             ┌───────┴────────┐
      ECS Fargate: api   ECS Fargate: web (Next.js standalone)
             │  ▲
             │  └─ Secrets Manager (DB creds, signing keys, VAPID) · SSM Parameter Store
             ├─▶ RDS Postgres 17 (PITR, AWS Backup, KMS)
             ├─▶ Amazon Verified Permissions (policy store per env)
             ├─▶ Cognito user pool (imported, retained) ─ SES (DKIM) for invites
             ├─▶ S3: media · content · exports · backups (BPA, KMS, lifecycle)
             └─▶ CloudWatch: logs (app, audit) · metrics · alarms ─▶ SNS (email/SMS)
GitHub Actions ─ OIDC ─▶ ECR push ─▶ migrate task ─▶ ECS deploy (staging auto, prod approved)
```
