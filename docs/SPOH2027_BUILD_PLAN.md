# SPOH 2027 Event Operations System — Build Plan

**Audience:** the coding agent implementing this project.
**Source of truth for scope:** `SPOH2027_Ops_System_Brief.md` (product brief). This document is the engineering plan derived from it.
**Status:** ready to implement.

---

## 0. How to use this document

Work through **Part 12 — Build Phases** in order. Each phase has a deliverable list and acceptance criteria. Do not start a phase before the previous phase's acceptance criteria pass.

Rules that apply to every phase:

1. **Do not invent scope.** If something isn't in this document or the brief, stop and ask rather than guessing.
2. **Never store visitor personal data.** See §3.2. This is a hard constraint, enforced by schema, lint rule and test.
3. **Every write endpoint is idempotent.** See §7.4.
4. **No secrets in the repo.** Everything through environment variables, `.env` gitignored, `.env.example` committed.
5. **Server and client are separate deployables** with no shared runtime and no shared build. They share only generated types (§2.3).
6. Commit at the end of each numbered task with a conventional-commit message.

---

## 1. System overview

A four-day event operations platform for Singapore Polytechnic Open House 2027 (School of Computing). It captures three deliberately separate datasets — visitor registrations, room footfall, and Mission Card journeys — and supports volunteer coordination, safety incident handling, and gift inventory.

### 1.1 Scale

- ~200 volunteers across 4 days
- 2 shifts/day (09:30–14:00, 13:30–18:00)
- Peak concurrent app users: ~80
- Expected write volume: 30–60k rows total across the event
- 5 counted rooms, 3 course stations, 1 sign-up booth, 1 Mission Complete area

This is a **small** system. Do not over-engineer it. No microservices, no message queues, no Kubernetes, no second database. A single Express app and a single Postgres database are correct at this scale.

### 1.2 The three counts (load-bearing domain rule)

| Count        | Table                            | Unit                                    | Never                      |
| ------------ | -------------------------------- | --------------------------------------- | -------------------------- |
| Registration | `Registration`                   | 1 row = 1 registered visitor + category | joined to footfall         |
| Footfall     | `FootfallTick`                   | 1 row = 1 body entering a room          | treated as unique visitors |
| Mission Card | `MissionCard` + `CardStampEvent` | 1 card = 1 journey (may be a family)    | equated to headcount       |

There is **no foreign key** between `Registration` and `FootfallTick`. There is no `totalVisitors` field anywhere. Any API that returns a count returns it with an explicit `unit` discriminator (`"registrations" | "roomEntries" | "cards"`).

---

## 2. Repository structure

Monorepo, npm workspaces. Two independently deployable apps.

```
spoh2027/
├── package.json                 # workspaces root, shared scripts only
├── .nvmrc                       # 20
├── .editorconfig
├── .gitignore
├── README.md
├── docs/
│   ├── BUILD_PLAN.md            # this file
│   ├── PRODUCT_BRIEF.md
│   ├── API.md                   # generated from OpenAPI, do not hand-edit
│   └── RUNBOOK.md               # event-day operational runbook
├── packages/
│   └── shared/                  # types + zod schemas ONLY. No runtime deps.
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── enums.ts         # VisitorCategory, Role, StationCode, ...
│           ├── dto/             # zod schemas, one file per resource
│           └── types.ts         # inferred types re-exported
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── index.ts             # entrypoint, starts http server
│   │   ├── app.ts               # express app factory (testable, no listen)
│   │   ├── config/
│   │   │   └── env.ts           # zod-validated process.env, fail fast
│   │   ├── middleware/
│   │   │   ├── auth.ts          # Cognito JWT verify -> req.auth
│   │   │   ├── rbac.ts          # requireGroup / requireStationScope
│   │   │   ├── idempotency.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── requestId.ts
│   │   │   └── validate.ts      # zod body/query/params validator
│   │   ├── modules/             # one folder per domain module
│   │   │   ├── registration/    # router.ts, service.ts, repo.ts, *.test.ts
│   │   │   ├── footfall/
│   │   │   ├── missionCard/
│   │   │   ├── gift/
│   │   │   ├── incident/
│   │   │   ├── lostPerson/
│   │   │   ├── lostFound/
│   │   │   ├── roster/
│   │   │   ├── announcement/
│   │   │   ├── dashboard/
│   │   │   ├── report/
│   │   │   └── fallbackImport/
│   │   ├── lib/
│   │   │   ├── prisma.ts        # singleton client
│   │   │   ├── audit.ts
│   │   │   ├── logger.ts        # pino
│   │   │   └── errors.ts        # AppError hierarchy
│   │   └── openapi.ts           # spec assembled from zod schemas
│   └── tests/
│       ├── integration/
│       └── setup.ts
└── client/
    ├── package.json
    ├── next.config.js
    ├── tsconfig.json
    ├── public/
    │   ├── manifest.json
    │   └── icons/
    ├── src/
    │   ├── app/                 # Next.js App Router
    │   ├── components/
    │   ├── features/            # mirrors server modules
    │   ├── lib/
    │   │   ├── api.ts           # typed fetch wrapper
    │   │   ├── auth.ts          # Cognito session handling
    │   │   ├── outbox.ts        # IndexedDB write buffer
    │   │   └── sw.ts            # service worker registration
    │   └── styles/
    └── tests/
```

### 2.1 Why a monorepo but separate deployables

The client and server deploy independently (client to S3/CloudFront or Amplify Hosting, server to Lambda or App Runner). The monorepo exists solely so `packages/shared` can be the single definition of every DTO. The client must **never** import from `server/`, and the server must **never** import from `client/`. Enforce with ESLint `no-restricted-imports`.

### 2.2 Tooling

| Concern          | Choice                                                            |
| ---------------- | ----------------------------------------------------------------- |
| Runtime          | Node 20 LTS                                                       |
| Language         | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true`  |
| Package manager  | npm workspaces                                                    |
| Server framework | Express 4                                                         |
| ORM              | Prisma 5                                                          |
| DB               | PostgreSQL 15                                                     |
| Validation       | Zod (shared between client and server)                            |
| Auth             | AWS Cognito User Pool + `aws-jwt-verify`                          |
| Logging          | pino + pino-http                                                  |
| Testing          | Vitest (unit + integration), Supertest, Playwright (e2e, minimal) |
| Client           | Next.js 14+ App Router, React 18                                  |
| Client state     | TanStack Query + Zustand for local UI state                       |
| Styling          | Tailwind CSS                                                      |
| Lint/format      | ESLint + Prettier, enforced in CI                                 |

### 2.3 Shared types contract

`packages/shared` contains **only** zod schemas and inferred types. Zero runtime dependencies other than `zod`. Both apps import from it. The server derives its OpenAPI spec from these schemas; the client derives its fetch types from them. There is exactly one definition of every request and response shape.

---

## 3. Domain constraints

### 3.1 Roles

Mirrors the committee hierarchy from the brief.

| Role               | Cognito group       | Scope                                                          |
| ------------------ | ------------------- | -------------------------------------------------------------- |
| Volunteer          | `Volunteer`         | Write only to their assigned station, current shift            |
| IC (In-Charge)     | `IC`                | Read + write their team's data, correct records, reissue cards |
| Deputy Coordinator | `DeputyCoordinator` | Read all, write within portfolio, approve swaps                |
| Chief Coordinator  | `ChiefCoordinator`  | Full read/write, declare fallback windows, run imports         |
| Lead               | `Lead`              | Full read, reports, no operational write                       |
| Admin              | `Admin`             | System administration, seeding, user management                |

Group membership grants a **capability tier**. Station scoping is _not_ in Cognito — it lives in the `Volunteer` and `ShiftAssignment` tables, keyed by Cognito `sub`. This is deliberate: station assignment changes hourly, Cognito group membership does not.

### 3.2 No visitor personal data — enforced, not just promised

Hard rules the implementation must uphold:

1. **No free-text field is exposed in any visitor-facing capture flow.** Registration takes a category enum and nothing else.
2. `MissionCard.shortCode` and `MissionCard.id` are random and carry no derivation from any person.
3. `Incident.description` is free-text but is an **IC-and-above** field, labelled in the UI "describe the event, not the person".
4. `LostPersonAlert` holds a description, and is the sole exception. It is **purged on resolution** — see §5.9.
5. A CI test asserts no Prisma model contains a field named or matching `/name|email|phone|nric|ic_num|address|school|dob/i` on any visitor-scoped model. Volunteer models are explicitly allowlisted.

### 3.3 Time

- All timestamps stored UTC as `timestamptz`.
- All display in `Asia/Singapore`.
- The **server** stamps `recordedAt` on receipt. Clients additionally send `clientRecordedAt`; both are stored. Reports use `recordedAt` unless the record came from a fallback import.

---

## 4. Environment configuration

`server/.env.example`:

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://spoh:spoh@localhost:5432/spoh2027
LOG_LEVEL=debug

# Cognito
COGNITO_REGION=ap-southeast-1
COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# CORS — comma separated, exact origins, no wildcards
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_DEFAULT=300
RATE_LIMIT_MAX_CAPTURE=1200

# S3 (media archive, phase 3)
S3_MEDIA_BUCKET=
AWS_REGION=ap-southeast-1
```

`client/.env.example`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_COGNITO_REGION=ap-southeast-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_ENV_LABEL=development
```

`src/config/env.ts` parses `process.env` with zod at boot and **throws on missing or malformed values**. The server must not start with a partially valid config.

---

## 5. Data model

Full `server/prisma/schema.prisma`. Implement exactly this; extend only with approval.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum VisitorCategory {
  SEC_1
  SEC_2
  SEC_3
  SEC_4
  SEC_5
  GRADUATED_AWAITING_RESULTS
  PARENT_GUARDIAN
  OTHER
}

enum StationKind {
  SIGNUP_BOOTH
  WELCOME_LOUNGE
  COURSE_STATION
  MISSION_COMPLETE
  WELCOME_PARTY
  OTHER
}

enum CourseCode {
  DAAA
  DCDF
  DCS
  DCITP
}

enum CommitteeRole {
  VOLUNTEER
  IC
  DEPUTY_COORDINATOR
  CHIEF_COORDINATOR
  LEAD
  ADMIN
}

enum DataSource {
  APP
  FALLBACK_SHEET
  PAPER
  MANUAL_ADJUSTMENT
}

enum ShiftBlock {
  MORNING   // 09:30 - 14:00
  AFTERNOON // 13:30 - 18:00
}

enum SwapStatus {
  REQUESTED
  APPROVED
  REJECTED
  CANCELLED
}

enum IncidentType {
  INJURY
  ILLNESS
  NEAR_MISS
  SAFETY_CONCERN
  CROWD_CONCERN
  EQUIPMENT
  OTHER
}

enum IncidentSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum IncidentStatus {
  OPEN
  ACKNOWLEDGED
  RESOLVED
}

enum LostPersonStatus {
  ACTIVE
  RESOLVED_FOUND
  RESOLVED_OTHER
}

enum LostFoundStatus {
  HELD
  CLAIMED
  UNCLAIMED_AT_CLOSE
  DISPOSED
}

enum CardStatus {
  UNISSUED
  ISSUED
  COMPLETED
  VOIDED
  LOST
}

enum AnnouncementPriority {
  INFO
  OPERATIONAL
  URGENT
}

// ─────────────────────────────────────────────
// REFERENCE / CONFIG
// ─────────────────────────────────────────────

model EventDay {
  id          String   @id @default(cuid())
  date        DateTime @db.Date
  label       String   // "Sec 4 Tour Day 1", "Open House Day 2"
  isPublicDay Boolean  @default(true)
  isTourDay   Boolean  @default(false)
  createdAt   DateTime @default(now())

  shiftAssignments ShiftAssignment[]
  briefingSlots    BriefingSlot[]

  @@unique([date])
}

model Station {
  id           String      @id @default(cuid())
  code         String      @unique  // "DAAA_STATION", "SIGNUP_BOOTH"
  name         String
  kind         StationKind
  courseCode   CourseCode?
  floor        String?
  countsEntry  Boolean     @default(false) // is this a footfall-counted room
  issuesStamp  Boolean     @default(false)
  active       Boolean     @default(true)
  sortOrder    Int         @default(0)

  registrations    Registration[]
  footfallTicks    FootfallTick[]
  stampEvents      CardStampEvent[]
  shiftAssignments ShiftAssignment[]
  incidents        Incident[]
  redemptions      GiftRedemption[]

  @@index([kind, active])
}

// ─────────────────────────────────────────────
// PEOPLE (committee only — never visitors)
// ─────────────────────────────────────────────

model Volunteer {
  id           String        @id @default(cuid())
  cognitoSub   String        @unique
  displayName  String
  email        String        @unique
  phone        String?
  role         CommitteeRole @default(VOLUNTEER)
  portfolio    String?       // for DCs: "Operations & Crowd Management"
  reportsToId  String?
  active       Boolean       @default(true)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  reportsTo    Volunteer?  @relation("Hierarchy", fields: [reportsToId], references: [id])
  directReports Volunteer[] @relation("Hierarchy")

  shiftAssignments ShiftAssignment[]
  registrations    Registration[]
  footfallTicks    FootfallTick[]
  stampEvents      CardStampEvent[]
  redemptions      GiftRedemption[]
  incidentsRaised  Incident[]        @relation("IncidentReporter")
  lostPersonAlerts LostPersonAlert[]
  lostFoundItems   LostFoundItem[]
  announcements    Announcement[]
  auditLogs        AuditLog[]
  swapsRequested   ShiftSwapRequest[] @relation("SwapRequester")
  swapsTargeted    ShiftSwapRequest[] @relation("SwapTarget")
  briefingSlots    BriefingSlot[]

  @@index([role, active])
}

model ShiftAssignment {
  id          String     @id @default(cuid())
  volunteerId String
  stationId   String
  eventDayId  String
  block       ShiftBlock
  roleLabel   String     // "Usher", "Counter", "Lead Facilitator"
  checkedInAt  DateTime?
  checkedOutAt DateTime?
  createdAt   DateTime   @default(now())

  volunteer Volunteer @relation(fields: [volunteerId], references: [id])
  station   Station   @relation(fields: [stationId], references: [id])
  eventDay  EventDay  @relation(fields: [eventDayId], references: [id])
  swapRequests ShiftSwapRequest[]

  @@unique([volunteerId, eventDayId, block])
  @@index([stationId, eventDayId, block])
}

model ShiftSwapRequest {
  id           String     @id @default(cuid())
  assignmentId String
  requesterId  String
  targetId     String
  status       SwapStatus @default(REQUESTED)
  reason       String?
  decidedById  String?
  decidedAt    DateTime?
  createdAt    DateTime   @default(now())

  assignment ShiftAssignment @relation(fields: [assignmentId], references: [id])
  requester  Volunteer       @relation("SwapRequester", fields: [requesterId], references: [id])
  target     Volunteer       @relation("SwapTarget", fields: [targetId], references: [id])

  @@index([status])
}

model BriefingSlot {
  id          String    @id @default(cuid())
  eventDayId  String
  startsAt    DateTime
  briefierId  String?
  waveSize    Int       @default(20)
  completedAt DateTime?
  notes       String?

  eventDay EventDay   @relation(fields: [eventDayId], references: [id])
  briefier Volunteer? @relation(fields: [briefierId], references: [id])

  @@index([eventDayId, startsAt])
}

// ─────────────────────────────────────────────
// COUNT 1 — REGISTRATION  (no PII, ever)
// ─────────────────────────────────────────────

model Registration {
  id               String          @id @default(cuid())
  category         VisitorCategory
  stationId        String
  recordedById     String
  groupId          String?         // links members of one family/group
  missionCardId    String?         // optional link, nullable by design
  source           DataSource      @default(APP)
  recordedAt       DateTime        @default(now())
  clientRecordedAt DateTime?
  idempotencyKey   String          @unique
  voided           Boolean         @default(false)
  voidedReason     String?

  station     Station      @relation(fields: [stationId], references: [id])
  recordedBy  Volunteer    @relation(fields: [recordedById], references: [id])
  missionCard MissionCard? @relation(fields: [missionCardId], references: [id])

  @@index([recordedAt])
  @@index([category, recordedAt])
  @@index([groupId])
}

// ─────────────────────────────────────────────
// COUNT 2 — FOOTFALL  (never joined to Registration)
// ─────────────────────────────────────────────

model FootfallTick {
  id               String     @id @default(cuid())
  stationId        String
  recordedById     String
  quantity         Int        @default(1) // >1 only for manual/fallback entry
  source           DataSource @default(APP)
  recordedAt       DateTime   @default(now())
  clientRecordedAt DateTime?
  timeBlockStart   DateTime?  // set for fallback/paper block entries
  idempotencyKey   String     @unique
  voided           Boolean    @default(false)

  station    Station   @relation(fields: [stationId], references: [id])
  recordedBy Volunteer @relation(fields: [recordedById], references: [id])

  @@index([stationId, recordedAt])
  @@index([recordedAt])
}

// ─────────────────────────────────────────────
// COUNT 3 — MISSION CARD
// ─────────────────────────────────────────────

model MissionCard {
  id           String     @id @default(cuid())
  shortCode    String     @unique // 6 chars, printed, ambiguity-free alphabet
  qrPayload    String     @unique
  status       CardStatus @default(UNISSUED)
  issuedAt     DateTime?
  completedAt  DateTime?
  voidedAt     DateTime?
  reissuedFromId String?
  batchLabel   String?    // print batch
  createdAt    DateTime   @default(now())

  reissuedFrom MissionCard?  @relation("Reissue", fields: [reissuedFromId], references: [id])
  reissues     MissionCard[] @relation("Reissue")
  stampEvents  CardStampEvent[]
  registrations Registration[]
  redemptions  GiftRedemption[]

  @@index([status])
}

model CardStampEvent {
  id               String     @id @default(cuid())
  missionCardId    String
  stationId        String
  recordedById     String
  source           DataSource @default(APP)
  recordedAt       DateTime   @default(now())
  clientRecordedAt DateTime?
  idempotencyKey   String     @unique

  missionCard MissionCard @relation(fields: [missionCardId], references: [id])
  station     Station     @relation(fields: [stationId], references: [id])
  recordedBy  Volunteer   @relation(fields: [recordedById], references: [id])

  @@unique([missionCardId, stationId])
  @@index([recordedAt])
}

// ─────────────────────────────────────────────
// GIFTS
// ─────────────────────────────────────────────

model GiftType {
  id             String   @id @default(cuid())
  name           String   @unique
  initialStock   Int
  lowStockThreshold Int   @default(50)
  active         Boolean  @default(true)

  redemptions GiftRedemption[]
  adjustments GiftStockAdjustment[]
}

model GiftRedemption {
  id               String     @id @default(cuid())
  giftTypeId       String
  missionCardId    String?
  stationId        String
  recordedById     String
  source           DataSource @default(APP)
  recordedAt       DateTime   @default(now())
  idempotencyKey   String     @unique
  voided           Boolean    @default(false)

  giftType    GiftType     @relation(fields: [giftTypeId], references: [id])
  missionCard MissionCard? @relation(fields: [missionCardId], references: [id])
  station     Station      @relation(fields: [stationId], references: [id])
  recordedBy  Volunteer    @relation(fields: [recordedById], references: [id])

  @@index([giftTypeId, recordedAt])
}

model GiftStockAdjustment {
  id         String   @id @default(cuid())
  giftTypeId String
  delta      Int
  reason     String
  createdById String
  createdAt  DateTime @default(now())

  giftType GiftType @relation(fields: [giftTypeId], references: [id])
}

// ─────────────────────────────────────────────
// SAFETY
// ─────────────────────────────────────────────

model Incident {
  id          String           @id @default(cuid())
  type        IncidentType
  severity    IncidentSeverity
  status      IncidentStatus   @default(OPEN)
  stationId   String?
  locationNote String?
  description String           // the EVENT, not the person
  reportedById String
  occurredAt  DateTime
  reportedAt  DateTime         @default(now())
  idempotencyKey String        @unique

  station    Station?  @relation(fields: [stationId], references: [id])
  reportedBy Volunteer @relation("IncidentReporter", fields: [reportedById], references: [id])
  followUps  IncidentFollowUp[]

  @@index([status, severity])
  @@index([reportedAt])
}

model IncidentFollowUp {
  id         String   @id @default(cuid())
  incidentId String
  note       String
  authorId   String
  createdAt  DateTime @default(now())

  incident Incident @relation(fields: [incidentId], references: [id])
}

// TRANSIENT by design. See §5.9 — purged to LostPersonSummary on resolve.
model LostPersonAlert {
  id            String           @id @default(cuid())
  status        LostPersonStatus @default(ACTIVE)
  approxAge     String?
  descriptionText String?
  clothingText  String?
  lastSeenStationId String?
  lastSeenAt    DateTime?
  raisedById    String
  raisedAt      DateTime         @default(now())
  resolvedAt    DateTime?
  purgedAt      DateTime?

  raisedBy     Volunteer @relation(fields: [raisedById], references: [id])
  acknowledgements LostPersonAck[]

  @@index([status])
}

model LostPersonAck {
  id        String   @id @default(cuid())
  alertId   String
  volunteerId String
  ackedAt   DateTime @default(now())

  alert LostPersonAlert @relation(fields: [alertId], references: [id])

  @@unique([alertId, volunteerId])
}

// What survives after purge — analytics only.
model LostPersonSummary {
  id                String   @id @default(cuid())
  raisedAt          DateTime
  resolvedAt        DateTime
  resolutionMinutes Int
  outcome           LostPersonStatus
  ackCount          Int
  createdAt         DateTime @default(now())
}

model LostFoundItem {
  id           String          @id @default(cuid())
  itemLabel    String
  categoryLabel String?
  foundStationId String?
  foundAt      DateTime
  holderNote   String?         // "held at Mission Complete desk"
  photoKey     String?         // S3 key
  status       LostFoundStatus @default(HELD)
  loggedById   String
  claimedAt    DateTime?
  createdAt    DateTime        @default(now())

  loggedBy Volunteer @relation(fields: [loggedById], references: [id])

  @@index([status])
}

// ─────────────────────────────────────────────
// COMMS
// ─────────────────────────────────────────────

model Announcement {
  id            String               @id @default(cuid())
  body          String
  priority      AnnouncementPriority @default(INFO)
  targetRole    CommitteeRole?
  targetStationId String?
  targetEventDayId String?
  requiresAck   Boolean              @default(false)
  authorId      String
  createdAt     DateTime             @default(now())
  expiresAt     DateTime?

  author Volunteer @relation(fields: [authorId], references: [id])
  acks   AnnouncementAck[]

  @@index([createdAt])
}

model AnnouncementAck {
  id             String   @id @default(cuid())
  announcementId String
  volunteerId    String
  ackedAt        DateTime @default(now())

  announcement Announcement @relation(fields: [announcementId], references: [id])

  @@unique([announcementId, volunteerId])
}

// ─────────────────────────────────────────────
// OPERATIONS / INTEGRITY
// ─────────────────────────────────────────────

model FallbackWindow {
  id          String     @id @default(cuid())
  tier        Int        // 3 = google sheets, 4 = paper
  startedAt   DateTime
  endedAt     DateTime?
  stationId   String?    // null = event-wide
  declaredById String
  reason      String
  createdAt   DateTime   @default(now())

  @@index([startedAt])
}

model ImportBatch {
  id          String     @id @default(cuid())
  source      DataSource
  targetTable String
  rowCount    Int
  fileName    String?
  importedById String
  importedAt  DateTime   @default(now())
  notes       String?
}

model AuditLog {
  id          String   @id @default(cuid())
  actorId     String?
  actorSub    String?
  action      String   // "registration.void", "card.reissue"
  entityType  String
  entityId    String?
  before      Json?
  after       Json?
  ip          String?
  userAgent   String?
  requestId   String?
  createdAt   DateTime @default(now())

  actor Volunteer? @relation(fields: [actorId], references: [id])

  @@index([entityType, entityId])
  @@index([createdAt])
}

model IdempotencyRecord {
  key         String   @id
  endpoint    String
  actorSub    String
  responseBody Json
  statusCode  Int
  createdAt   DateTime @default(now())

  @@index([createdAt])
}
```

### 5.9 Lost person purge job

A scheduled task (cron in-process for the event, or an EventBridge rule) runs every 15 minutes:

- For each `LostPersonAlert` with `status != ACTIVE` and `resolvedAt < now() - 24h` and `purgedAt IS NULL`:
  1. Create a `LostPersonSummary` row with the derived metrics.
  2. Null out `approxAge`, `descriptionText`, `clothingText`.
  3. Set `purgedAt`.
- The purge is also runnable on demand by `ChiefCoordinator` via `POST /admin/purge-lost-person`.

Reports read from `LostPersonSummary` only. No report ever reads `LostPersonAlert` description fields.

### 5.10 Seed data

`prisma/seed.ts` must create: 4 `EventDay` rows (6–9 Jan 2027), all `Station` rows (signup booth, welcome lounge, DAAA/DCDF/DCS stations, mission complete, welcome party, T19 foyer), gift types, an `Admin` volunteer, and in non-production a set of fake volunteers across every role for testing. Seed must be idempotent (`upsert`, never `create`).

---

## 6. Authentication & RBAC

### 6.1 Cognito setup

One User Pool, one App Client (public SPA client, no client secret).

**User Pool configuration:**

- Sign-in: email
- MFA: optional, enforced for `ChiefCoordinator`, `Lead` and `Admin` groups
- Password policy: min 12 chars, requires upper/lower/number (only applies to accounts that use passwords)
- Advanced security: enabled (`ENFORCED` in production) — gives you compromised-credential detection free
- Token validity: access token 60 min, ID token 60 min, refresh token 12 hours

> **12-hour refresh is deliberate.** A shift is 4.5 hours; 12 hours covers a full day without a re-login, and expires overnight so a lost phone stops working by the next morning.

**Groups** (create with a `precedence` so the highest privilege wins):

| Group               | Precedence |
| ------------------- | ---------- |
| `Admin`             | 0          |
| `Lead`              | 10         |
| `ChiefCoordinator`  | 20         |
| `DeputyCoordinator` | 30         |
| `IC`                | 40         |
| `Volunteer`         | 50         |

**Volunteer onboarding.** Do not use open self-signup — `AllowAdminCreateUserOnly = true`. Accounts are provisioned from the roster:

1. Chief/Admin uploads or enters the roster (name, email, role, station).
2. Server calls `AdminCreateUser` + `AdminAddUserToGroup`, and creates the matching `Volunteer` row with `cognitoSub`.
3. Volunteer receives an invite email and signs in with email + the temporary code, then sets a password once.

This keeps everything inside Cognito, keeps group membership authoritative, and prevents anyone outside the roster from getting an account. If a lower-friction flow is wanted later, add Cognito's passwordless email OTP — do **not** hand-roll a join-code auth system.

### 6.2 Token verification middleware

`server/src/middleware/auth.ts`:

- Use `aws-jwt-verify` (`CognitoJwtVerifier`), configured for `tokenUse: "access"`, the pool id and client id from env. The library caches JWKS; construct the verifier **once at module load**, never per request.
- Read the bearer token from `Authorization: Bearer <token>`.
- On success attach:

```ts
req.auth = {
  sub: string,
  groups: CommitteeRole[],   // from cognito:groups
  volunteerId: string,       // looked up from Volunteer table, cached 60s
  role: CommitteeRole,       // highest-precedence group
}
```

- On failure: `401` with a generic body. Never echo the token or the verification error detail to the client; log the detail server-side with the request id.
- If the token verifies but no `Volunteer` row matches the `sub`: `403` with `code: "NOT_PROVISIONED"`.

**Never trust any client-supplied role, volunteerId or stationId for authorization.** The only identity input is the verified token.

### 6.3 RBAC

Two layers.

**Layer 1 — capability, from the Cognito group.** `requireRole(minRole)` middleware, comparing precedence.

**Layer 2 — station scope, from the database.** `requireStationScope()` asserts that for a capture write, the target station matches an active `ShiftAssignment` for this volunteer on today's `EventDay` and current block. `IC` and above bypass station scope but the bypass is written to `AuditLog`.

Capability matrix — implement this table literally as a test fixture:

| Capability                         | Volunteer | IC  | DC  | Chief | Lead | Admin |
| ---------------------------------- | :-------: | :-: | :-: | :---: | :--: | :---: |
| Create registration (own station)  |    ✅     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Create footfall tick (own station) |    ✅     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Create card stamp (own station)    |    ✅     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Redeem gift                        |    ✅     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Void a record                      |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Manual count adjustment            |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Reissue / void mission card        |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Report incident                    |    ✅     | ✅  | ✅  |  ✅   |  ✅  |  ✅   |
| Resolve incident                   |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Raise lost-person alert            |    ✅     | ✅  | ✅  |  ✅   |  ✅  |  ✅   |
| Resolve lost-person alert          |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Log lost & found item              |    ✅     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Read own shift + station data      |    ✅     | ✅  | ✅  |  ✅   |  ✅  |  ✅   |
| Read station dashboard             |    ❌     | ✅  | ✅  |  ✅   |  ✅  |  ✅   |
| Read event-wide dashboard          |    ❌     | ❌  | ✅  |  ✅   |  ✅  |  ✅   |
| Approve shift swap                 |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Edit roster                        |    ❌     | ❌  | ✅  |  ✅   |  ❌  |  ✅   |
| Send announcement (station)        |    ❌     | ✅  | ✅  |  ✅   |  ❌  |  ✅   |
| Send announcement (event-wide)     |    ❌     | ❌  | ✅  |  ✅   |  ❌  |  ✅   |
| Declare fallback window            |    ❌     | ❌  | ✅  |  ✅   |  ❌  |  ✅   |
| Run fallback import                |    ❌     | ❌  | ❌  |  ✅   |  ❌  |  ✅   |
| Generate / export reports          |    ❌     | ❌  | ✅  |  ✅   |  ✅  |  ✅   |
| Provision users                    |    ❌     | ❌  | ❌  |  ✅   |  ❌  |  ✅   |
| Read audit log                     |    ❌     | ❌  | ❌  |  ✅   |  ✅  |  ✅   |

Every ❌ must have a passing integration test asserting `403`.

### 6.4 Client-side auth

- Use `aws-amplify/auth` (v6) or `amazon-cognito-identity-js` in the Next.js client.
- **Access token in memory; refresh token in an httpOnly, Secure, SameSite=Strict cookie** set by a Next.js Route Handler acting as a thin BFF for the token exchange. Do not put tokens in `localStorage`.
- Client-side role checks are for **UI affordance only** — hiding a button. Every check is re-enforced on the server.
- On `401`, attempt one silent refresh, then redirect to sign-in preserving the return path.

---

## 7. API design

### 7.1 Conventions

- Base path `/api/v1`
- JSON only, `Content-Type: application/json`
- Success: `200`/`201` with the resource. Collection responses are `{ data: T[], meta: {...} }`.
- Error envelope, uniform:

```json
{ "error": { "code": "STATION_SCOPE_DENIED", "message": "Human readable", "requestId": "01H..." } }
```

- Never leak stack traces, SQL, or Prisma error text to the client in production.
- All request bodies, query params and path params validated by a zod schema from `packages/shared`. A route without a validator fails code review.
- Counting endpoints always return `unit` explicitly, e.g. `{ "value": 412, "unit": "roomEntries" }`.

### 7.2 Endpoint surface

**Auth / session**

```
GET    /api/v1/me                          → profile, role, today's assignment, capabilities
POST   /api/v1/me/check-in                 → check in to current shift
POST   /api/v1/me/check-out
```

**Registration**

```
POST   /api/v1/registrations               → single tap. body: {category, stationId, idempotencyKey, clientRecordedAt}
POST   /api/v1/registrations/group         → body: {members:[{category,count}], stationId, missionCardShortCode?, idempotencyKey}
POST   /api/v1/registrations/:id/void      → IC+. body: {reason}
GET    /api/v1/registrations/summary       → query: eventDayId?, stationId?, from?, to?, groupBy=category|hour
```

**Footfall**

```
POST   /api/v1/footfall/ticks              → body: {stationId, idempotencyKey, clientRecordedAt}
POST   /api/v1/footfall/bulk               → IC+. body: {stationId, quantity, timeBlockStart, source, idempotencyKey}
POST   /api/v1/footfall/ticks/:id/void     → IC+
GET    /api/v1/footfall/summary            → query: stationId?, from?, to?, bucket=15m|30m|1h
GET    /api/v1/footfall/live               → current counts per station + last-activity timestamp
```

**Mission cards**

```
GET    /api/v1/cards/:shortCode            → status + stamp list
POST   /api/v1/cards/:shortCode/issue      → booth. links to registration group
POST   /api/v1/cards/:shortCode/stamps     → body: {stationId, idempotencyKey}
POST   /api/v1/cards/:shortCode/void       → IC+. body:{reason}
POST   /api/v1/cards/:shortCode/reissue    → IC+. returns new card
GET    /api/v1/cards/funnel                → issued→stamped→completed→redeemed
POST   /api/v1/cards/batch                 → Admin. generate+print batch, returns CSV of shortCode+qrPayload
```

**Gifts**

```
GET    /api/v1/gifts                       → types with stock remaining
POST   /api/v1/gifts/redemptions           → body: {giftTypeId, cardShortCode?, stationId, idempotencyKey}
POST   /api/v1/gifts/:id/adjust            → IC+. body:{delta, reason}
GET    /api/v1/gifts/summary
```

**Safety**

```
POST   /api/v1/incidents
GET    /api/v1/incidents                   → IC+. filters: status, severity, from, to
POST   /api/v1/incidents/:id/follow-ups
POST   /api/v1/incidents/:id/status        → IC+

POST   /api/v1/lost-person                 → raise alert, broadcasts
GET    /api/v1/lost-person/active
POST   /api/v1/lost-person/:id/ack
POST   /api/v1/lost-person/:id/resolve     → IC+

POST   /api/v1/lost-found
GET    /api/v1/lost-found                  → filters: status, q
POST   /api/v1/lost-found/:id/claim
```

**Roster**

```
GET    /api/v1/roster/me
GET    /api/v1/roster/station/:stationId   → IC+
GET    /api/v1/roster/gaps                 → DC+. understaffed stations right now
POST   /api/v1/roster/swaps
POST   /api/v1/roster/swaps/:id/decide     → IC+
GET    /api/v1/roster/briefing-slots       → today's wave roster
POST   /api/v1/roster/briefing-slots/:id/complete
POST   /api/v1/roster/import               → DC+. CSV upload
```

**Announcements**

```
POST   /api/v1/announcements               → IC+ (station scope) / DC+ (event-wide)
GET    /api/v1/announcements                → scoped to caller
POST   /api/v1/announcements/:id/ack
```

**Dashboard**

```
GET    /api/v1/dashboard/live              → DC+. everything on one payload, ~2s poll
GET    /api/v1/dashboard/station/:id       → IC+
GET    /api/v1/dashboard/data-health       → DC+. silent stations, stale devices
```

**Reports / integrity**

```
GET    /api/v1/reports/summary             → DC+. full post-event dataset
GET    /api/v1/reports/export              → DC+. query: format=xlsx|csv|pdf
POST   /api/v1/fallback-windows            → DC+. declare
POST   /api/v1/fallback-windows/:id/close  → DC+
POST   /api/v1/imports/registrations       → Chief. CSV from fallback sheet
POST   /api/v1/imports/footfall            → Chief
GET    /api/v1/audit                       → Chief/Lead
```

**Health**

```
GET    /healthz                            → liveness, no auth, no db
GET    /readyz                             → readiness, checks db, no auth, no detail leaked
```

### 7.3 Live dashboard transport

Poll `GET /api/v1/dashboard/live` every 3 seconds. Do **not** build WebSockets for this — the payload is small, the client count is under 20, and polling is dramatically simpler to operate and debug on event day.

The one exception is **lost-person alerts**, which need to reach every device fast. Use Web Push (VAPID) for those, with a 10-second poll of `/lost-person/active` as the guaranteed fallback. Push is best-effort; the poll is the contract.

### 7.4 Idempotency

Every `POST` that creates a record requires an `idempotencyKey` in the body (client-generated UUIDv4, stored per capture action in the outbox before the first send attempt).

Middleware behaviour:

1. Look up `IdempotencyRecord` by key. If present and `endpoint` + `actorSub` match, return the stored response verbatim.
2. If present but endpoint or actor differs → `409 IDEMPOTENCY_KEY_REUSE`.
3. Otherwise process, then store the response.
4. Records older than 7 days are pruned by a daily job.

This makes the client's retry-on-failure loop safe, which is what makes the local write buffer possible without duplicate counts.

---

## 8. Security requirements

Non-negotiable. Each is a checklist item with a test.

### 8.1 Transport & headers

- HTTPS only in all deployed environments; HSTS with `max-age=31536000; includeSubDomains`
- `helmet()` on the server with default protections enabled
- Next.js `headers()` config setting CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying geolocation/microphone (camera **allowed** — needed for QR scanning)
- CSP: no `unsafe-eval`; `unsafe-inline` for styles only if Tailwind's runtime requires it, scripts nonce-based

### 8.2 CORS

- Explicit origin allowlist from `CORS_ALLOWED_ORIGINS`. No `*`. No reflecting the `Origin` header.
- `credentials: true` only for the token-exchange route.

### 8.3 Input validation

- Zod on every route, `.strict()` on all object schemas so unknown keys are rejected rather than ignored
- Body size limit `100kb` for JSON, separate multipart limit for CSV import (`5mb`) and photo upload (`10mb`)
- File uploads: validate magic bytes, not just the extension or the declared MIME type
- All queries through Prisma. `$queryRaw` is banned except with `Prisma.sql` tagged templates, and any use requires a comment justifying it.

### 8.4 Rate limiting

- `express-rate-limit`, keyed on `auth.sub` when authenticated, IP otherwise
- Default: 300 req/min. Capture endpoints (registration tap, footfall tick): 1200/min — a booth volunteer at peak genuinely taps fast, and throttling them corrupts your data.
- Auth-adjacent and import endpoints: 20/min
- Behind a proxy, set `app.set('trust proxy', 1)` and verify the real client IP is being used

### 8.5 Authorization

- Default deny. Every router mounts `requireAuth` before any handler; there is no unauthenticated route other than `/healthz` and `/readyz`.
- Station scope checked server-side on every capture write (§6.3)
- IDOR protection: never accept a `volunteerId` in a body for attribution — always use `req.auth.volunteerId`

### 8.6 Secrets & config

- No secrets in the repo, ever. `.env` gitignored; `.env.example` documents every key with a dummy value.
- Production secrets in AWS Secrets Manager or SSM Parameter Store, injected as env vars
- Run `npm audit --audit-level=high` in CI; fail the build on high or critical
- Add `gitleaks` (or equivalent) as a pre-commit hook

### 8.7 Logging & audit

- pino, structured JSON, with `requestId` on every line
- **Redact by default**: `authorization`, `cookie`, `password`, `token`, `idempotencyKey` never appear in logs
- `AuditLog` written for every: void, manual adjustment, card reissue/void, incident status change, lost-person resolve, roster edit, fallback declaration, import, station-scope bypass by an IC+, and user provisioning
- Audit writes are in the same transaction as the mutation. If the audit write fails, the mutation fails.

### 8.8 Data protection

- CI test asserting no visitor-scoped Prisma model has a PII-shaped field (§3.2 rule 5)
- Lost-person purge job implemented and tested (§5.9)
- Postgres encryption at rest (RDS default), TLS in transit (`sslmode=require` in production `DATABASE_URL`)
- S3 media bucket: block all public access, SSE-S3 encryption, presigned URLs with 15-minute expiry, and a lifecycle rule transitioning to Glacier 30 days after the event
- Database backups: RDS automated backups, 7-day retention; take a manual snapshot on 5 Jan 2027 and after each event day

### 8.9 Dependency & supply chain

- Lockfile committed, `npm ci` in CI
- Dependabot or Renovate enabled
- No dependency added without justification in the PR description

---

## 9. Client specification (Next.js)

### 9.1 Approach

Next.js 14+ App Router, deployed as a **static export or standalone SPA-style build**. Server Components are used only for shell rendering — all event data is fetched client-side with TanStack Query, because every data view is live and user-scoped. Do not build server-side data fetching that proxies the API; the client talks to the Express API directly.

Route Handlers (`app/api/...`) are used for exactly one thing: the Cognito token exchange that sets the httpOnly refresh cookie (§6.4).

### 9.2 Route map

```
/                          → redirect based on role
/sign-in
/home                      → role-scoped volunteer home (§9.3)
/map                       → interactive T19 floor map
/journey                   → visitor journey diagram
/brief                     → what-do-I-say, course one-liners, five things
/shift                     → my shift, check in/out, swap request

/capture/registration      → booth. one-tap grid
/capture/registration/group
/capture/footfall          → the counter screen
/capture/stamp             → QR scan + manual code entry
/capture/redeem            → gift redemption

/safety/incident/new
/safety/lost-person/new
/safety/lost-found
/safety/lost-found/new

/ic                        → IC console: station roster, corrections, station dashboard
/ic/corrections
/dc                        → DC portfolio dashboard
/chief                     → live ops dashboard
/chief/data-health
/chief/fallback
/chief/imports
/chief/roster
/reports
/tv                        → fullscreen dashboard for the ops room display
```

### 9.3 The role-scoped home screen

`/home` renders in this order, always:

1. **Active lost-person alert banner** if any — full width, top, unmissable, with an Acknowledge button
2. **Urgent announcements** requiring acknowledgement
3. **My shift card** — station, block, my IC with tap-to-call, check-in state
4. **Role tiles** — only the capture actions this volunteer's current assignment permits
5. **Universal tiles** — Map, Journey, Brief, Report an incident, Alert button
6. **My five things** checklist (collapsible, persists dismissal per event day)

A Volunteer assigned to DCDF Station sees a Stamp tile and a Counter tile. A booth volunteer sees Registration. Nobody sees a tile they cannot use — the server would reject it anyway, but showing it wastes a tap and erodes trust in the app.

### 9.4 Capture screen requirements

These are the screens that determine whether the data is any good.

**Registration** (`/capture/registration`)

- 8 buttons in a 2×4 grid, each ≥ 88×88 CSS px, filling the viewport
- Tap → optimistic increment, haptic feedback (`navigator.vibrate(15)`), write to outbox, fire request
- Undo affordance for 10 seconds after each tap; undoing before the request settles cancels it, after it settles issues a void
- Persistent header: session total, booth total (polled), unsynced count
- **No confirmation dialogs. No submit button. No modal on success.**
- Screen wake lock (`navigator.wakeLock`) while the screen is active

**Footfall counter** (`/capture/footfall`)

- Single `+` button occupying ≥ 60% of the viewport
- Room name, current count, small undo
- Idle nudge toast after 20 minutes with no taps during event hours
- Auto-closes at shift end, requires explicit re-open

**Stamp scan** (`/capture/stamp`)

- Camera QR scanner (`@zxing/browser` or `html5-qrcode`), auto-starting
- Manual 6-char code entry always visible as an alternative, not hidden behind a toggle
- On scan: show the card's existing stamps, confirm the stamp for this station, done in one further tap
- Duplicate stamp for the same station shows a warning with an override, not a hard block

### 9.5 Local write buffer (outbox)

Not offline-first — ordinary resilience for sleeping phones, dead spots and transient failures.

`src/lib/outbox.ts`, backed by IndexedDB (`idb` package):

```ts
type OutboxEntry = {
  id: string; // == idempotencyKey
  endpoint: string;
  method: 'POST';
  body: unknown;
  clientRecordedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: 'pending' | 'sending' | 'failed';
};
```

Behaviour:

- Every capture write is enqueued **before** the network call. UI updates optimistically off the queue.
- A single flush loop drains the queue serially, with exponential backoff (1s, 2s, 4s, 8s, capped at 30s).
- Flush triggers: enqueue, `online` event, `visibilitychange` to visible, and a 15-second interval.
- Because every entry carries an idempotency key, retries can never double-count.
- The unsynced count is visible in the header at all times. If it exceeds 20, or the oldest entry is older than 5 minutes, show a persistent amber banner telling the volunteer to notify their IC.
- Entries that fail 10 times move to `failed` and are surfaced on a `/shift` diagnostics panel with an export-to-clipboard option, so an IC can salvage the counts manually.

### 9.6 PWA

- `manifest.json`: standalone display, portrait orientation, SoC-appropriate icons at 192/512px
- Service worker precaches the app shell, map images, journey diagram and brief content — so §9.3 items 5–6 work even with no network
- **The service worker must not cache API GET responses** for capture or dashboard data. Stale counts are worse than absent counts.
- Prompt to install on first visit for volunteers

### 9.7 Accessibility & field usability

- Minimum tap target 44×44 px; capture buttons far larger
- Colour is never the sole carrier of meaning (station status, sync state, alert severity all carry text or icon)
- Contrast ratio ≥ 4.5:1 — the venue is bright and phones will be at low brightness to save battery
- Full keyboard operability on IC and dashboard screens
- All interactive elements have accessible names; test with `axe-core` in CI

---

## 10. Testing requirements

| Layer       | Tool                                         | Requirement                                                                                                          |
| ----------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                                       | Every service function with branching logic. Focus on count aggregation, funnel calculation, idempotency, purge job. |
| Integration | Vitest + Supertest + Testcontainers Postgres | Every endpoint, happy path + auth failure + validation failure                                                       |
| RBAC        | Vitest                                       | The §6.3 matrix as a table-driven test. Every ❌ asserts 403.                                                        |
| Contract    | zod                                          | Shared schemas validated in both directions                                                                          |
| E2E         | Playwright                                   | Three flows only: booth registration tap-through, footfall count, lost-person raise→broadcast→ack→resolve            |
| A11y        | axe-core in Playwright                       | Home, registration, counter screens                                                                                  |

**Coverage floor: 80% on `server/src/modules` and `server/src/middleware`.** Do not chase coverage on generated code or config.

**Mandatory test cases** (write these explicitly, they encode the domain rules):

1. Registration and footfall totals for the same period are different numbers and are never summed by any endpoint.
2. Replaying a create request with the same idempotency key returns the identical response and creates exactly one row.
3. A Volunteer assigned to Station A gets 403 posting a tick to Station B.
4. An IC posting to a station outside their assignment succeeds **and** writes an `AuditLog` row.
5. A group registration of 1 Sec-4 + 2 Parents creates 3 `Registration` rows and 1 card link.
6. Voiding a registration excludes it from `summary` but leaves the row present.
7. A resolved lost-person alert older than 24h has its description fields nulled and a `LostPersonSummary` created.
8. A report covering a declared fallback window is flagged as containing non-app data.
9. `POST /cards/:code/stamps` twice for the same station returns a conflict-shaped warning response, not a duplicate row.
10. Gift redemption when stock is exhausted returns a domain error, not a 500.

---

## 11. Deployment

### 11.1 Environments

| Env        | Client                          | Server               | DB                                                |
| ---------- | ------------------------------- | -------------------- | ------------------------------------------------- |
| local      | `next dev` :3000                | `tsx watch` :4000    | Docker Postgres                                   |
| staging    | Amplify Hosting                 | App Runner or Lambda | RDS t4g.micro                                     |
| production | Amplify Hosting / S3+CloudFront | App Runner or Lambda | RDS t4g.small, Multi-AZ off, automated backups on |

Staging is mandatory. The dry runs (18 Nov, 4 Jan) run against **staging**, not production, so dry-run data never contaminates the real dataset.

### 11.2 Server hosting choice

**Recommended: AWS App Runner.** A container, always warm, no cold-start latency on a booth tap, trivial deploy from a repo. Lambda + API Gateway is cheaper at idle but introduces cold starts exactly where latency is most visible.

If cost is decisive, use Lambda with provisioned concurrency of 1 during the event window only.

### 11.3 CI/CD

GitHub Actions, on every PR:

1. `npm ci`
2. lint + typecheck (`tsc --noEmit`) on all workspaces
3. `npm audit --audit-level=high`
4. gitleaks scan
5. unit + integration tests against a Postgres service container
6. build both apps

On merge to `main`: deploy to staging automatically. Production deploy is **manual approval only**, and is frozen from 5 Jan 2027 except for a documented hotfix path.

### 11.4 Event-day operational readiness

- Database snapshot before and after each event day
- CloudWatch alarms: API 5xx rate > 1%, p95 latency > 1s, RDS CPU > 80%, RDS free storage low
- A `/chief/data-health` view is the human monitor — silent stations and stale devices matter more than server metrics
- The runbook (`docs/RUNBOOK.md`) documents: how to declare a fallback window, how to import fallback CSVs, who to call, how to roll back a deploy

---

## 12. Build phases

Each phase ends with its acceptance criteria passing in CI and a demo against staging.

### Phase 0 — Foundations (target: 2 weeks)

- Monorepo, workspaces, TypeScript strict, ESLint/Prettier, CI pipeline green on an empty test suite
- Docker Compose with Postgres
- Prisma schema (§5) + initial migration + idempotent seed
- `config/env.ts` with zod validation, fails fast
- Express app factory, `/healthz`, `/readyz`, pino logging, request id, error handler
- Next.js shell, Tailwind, PWA manifest

**Accept when:** `npm run dev` starts both apps; migrations and seed run clean from empty; `/healthz` returns 200; CI is green.

### Phase 1 — Auth & RBAC (target: 2 weeks)

- Cognito User Pool + groups provisioned (document the config in `docs/`, or define in Terraform/CDK if the team is comfortable)
- `auth.ts` middleware with `aws-jwt-verify`
- `rbac.ts` with `requireRole` and `requireStationScope`
- `GET /me`, check-in/check-out
- Client sign-in flow, token handling per §6.4, protected route wrapper
- User provisioning endpoint + roster CSV import

**Accept when:** the §6.3 capability matrix test passes in full; an unprovisioned but valid token gets 403 `NOT_PROVISIONED`; tokens are absent from `localStorage`.

### Phase 2 — Capture core (target: 3 weeks) — **must be done by Dry Run #1, 18 Nov 2026**

- Registration (single + group), footfall ticks, void, summaries
- Idempotency middleware + `IdempotencyRecord`
- Audit logging on all mutations
- Outbox with backoff, unsynced indicator
- Registration and counter screens to the §9.4 spec
- Volunteer home, map, journey, brief content
- Incident reporting + lost-person raise/broadcast/ack/resolve

**Accept when:** a volunteer can complete a full shift — sign in, check in, capture 200 registrations and 200 ticks, report an incident, raise and resolve a lost-person alert — with the phone put to sleep mid-shift and no data lost or duplicated.

### Phase 3 — Cards, gifts, dashboard (target: 3 weeks) — **by Dry Run #2, 4 Jan 2027**

- Mission card model, batch generation with printable CSV, issue, stamp, void, reissue, funnel
- QR scanner and manual code entry
- Gift types, redemption, stock, low-stock alerts
- Live ops dashboard + data health + TV mode
- Announcements with targeting and acknowledgement
- Shift swaps, briefing wave roster, roster gaps

**Accept when:** the funnel reconciles end to end (issued ≥ stamped ≥ completed ≥ redeemed); the dashboard reflects a capture within 5 seconds; a silent station is flagged within 15 minutes.

### Phase 4 — Fallback, reporting, hardening (target: 2 weeks)

- Fallback window declaration and closure
- CSV importers for registration and footfall, source-tagged, with a dry-run preview before commit
- Report endpoints and XLSX/CSV/PDF export
- Reports annotate any period overlapping a fallback window
- Lost & found
- Lost-person purge job
- Full security checklist (§8) verified; penetration-style review of the auth and RBAC paths
- Load test: 100 concurrent capture clients, 20 taps/min each, p95 < 300ms

**Accept when:** every §8 checklist item is ticked with evidence; a fallback CSV imports and appears correctly annotated in the report; the load test passes.

### Phase 5 — Event readiness (Dec 2026 – Jan 2027)

- `docs/RUNBOOK.md` complete
- Production environment provisioned, snapshots configured, alarms live
- Roster loaded, accounts provisioned, join instructions distributed at the 4 Dec briefing
- Card batch generated and sent to print (**note: card print deadline gates Phase 3 — work backwards from it**)
- Deploy freeze from 5 Jan

---

## 13. Conventions

- **Commits:** Conventional Commits (`feat(footfall): add bulk entry endpoint`)
- **Branches:** `feat/`, `fix/`, `chore/` off `main`; PRs squash-merged
- **Naming:** `camelCase` in TS, `PascalCase` for Prisma models and React components, `SCREAMING_SNAKE` for enum values
- **Errors:** throw typed `AppError` subclasses; the error handler maps them to status codes. Never `res.status(500).send(err.message)`.
- **No `any`.** Use `unknown` and narrow. `// eslint-disable` requires a comment explaining why.
- **Comments explain why, not what.** Every domain rule that looks arbitrary (the three counts, the purge job, the idempotency requirement) gets a comment pointing back to this document.

---

## 14. Explicitly out of scope

Do not build these without a scope change:

- Any collection of visitor names, contact details, schools or photographs
- Visitor-facing accounts or a visitor-facing app
- Public-facing dashboards or live counts visible to visitors
- WebSocket infrastructure (see §7.3)
- A second datastore alongside Postgres
- Native mobile apps
- Automated social media posting
- Anything replacing the WhatsApp Safety Communications Chat — the app feeds it, it does not supersede it

---

## 15. Open questions for the Chief Coordinator

Flag these; do not decide them unilaterally.

1. Is the Mission Card design locked, and what is the print deadline? This gates Phase 3.
2. Fixed stations (booth, redemption) on shared tablets, or volunteer personal phones?
3. Does SP IT require review before a deployment on the student network?
4. Who owns the AWS account after handover?
5. Should footfall distinguish Sec-4 tour waves from public visitors, or is a single count per room sufficient?
6. Confirm the exact station list and which rooms require entry counting.
