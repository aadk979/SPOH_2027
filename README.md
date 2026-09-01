# SPOH 2027 — Event Operations System

Volunteer operations for the Singapore Polytechnic School of Computing Open House,
**6–9 January 2027**.

- **Product brief:** [`docs/SPOH2027_Ops_System_Brief.md`](docs/SPOH2027_Ops_System_Brief.md) — the scope
- **Build plan:** [`docs/SPOH2027_BUILD_PLAN.md`](docs/SPOH2027_BUILD_PLAN.md) — the engineering plan
- **Design language:** [`docs/design.md`](docs/design.md) — tokens; see [Design](#design) for how it is applied
- **Runbook:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — event-day operations

**The deadline that matters is Dry Run #1 on 18 November 2026**, not the event.

---

## The two rules

Everything else in this repository is negotiable. These two are not.

### 1. The three counts never merge

| Count            | Table                            | Unit                          | Answers                 |
| ---------------- | -------------------------------- | ----------------------------- | ----------------------- |
| **Registration** | `Registration`                   | 1 row = 1 registered visitor  | who showed up           |
| **Footfall**     | `FootfallTick`                   | 1 row = 1 body entering a room| how busy, and when      |
| **Mission Card** | `MissionCard` + `CardStampEvent` | 1 card = 1 journey            | engagement / completion |

One Mission Card can be four humans. There is no foreign key between
`Registration` and `FootfallTick`, no `totalVisitors` column anywhere, and every
counting endpoint returns an explicit `unit` discriminator. If someone asks for
"total visitors", the system makes them choose which of the three they mean.

### 2. No visitor personal data

Registration writes a **category and a timestamp**. Nothing else. No names, no
contact details, no schools, no photographs of identifiable visitors. There is
no free-text field in any visitor-facing capture flow, because a field a
volunteer can type into is a field someone will type a name into.

`LostPersonAlert` is the single exception, and it is transient: 24 hours after
resolution the descriptive fields are nulled and an anonymised
`LostPersonSummary` is what survives. Every report reads the summary.

Both rules are enforced by tests, not by policy — see
`server/tests/unit/noPii.test.ts` and `server/tests/integration/capture.test.ts`.

---

## Getting started

Requires **Node 24** (see `.nvmrc`) and **Docker**.

```bash
npm ci
npm run build:shared          # both apps import @spoh/shared from its built output

cp server/.env.example server/.env
cp client/.env.example client/.env.local

npm run db:up                 # Postgres 17 on localhost:5435
npm run db:migrate --workspace server
npm run db:seed --workspace server

npm run dev                   # server :4010, client :3000
```

Open <http://localhost:3000> and sign in with a seeded roster email:

| Email                      | Role                | Station          |
| -------------------------- | ------------------- | ---------------- |
| `booth@spoh2027.test`      | Volunteer           | Sign-Up Booth    |
| `counter@spoh2027.test`    | Volunteer           | DCDF Station     |
| `ic@spoh2027.test`         | IC                  | Sign-Up Booth    |
| `dc@spoh2027.test`         | Deputy Coordinator  | —                |
| `chief@spoh2027.test`      | Chief Coordinator   | —                |
| `lead@spoh2027.test`       | Lead                | —                |
| `admin@spoh2027.test`      | Admin               | —                |

> **Port note.** The dev database is published on **5435** and the API on
> **4010** rather than the conventional 5432/4000, because both of those are
> commonly already occupied on a developer machine. Change them in
> `docker-compose.yml` and `server/.env` if you prefer.

### Authentication in development

The Cognito User Pool for this event **does not exist yet**. Rather than block
every other phase on it, authentication is a pluggable provider:

```
middleware/auth/
├── types.ts             the contract: a token in, { sub, groups } out
├── cognitoProvider.ts   staging and production — aws-jwt-verify
└── localProvider.ts     development only — HS256 tokens it signs itself
```

RBAC, station scoping, idempotency and audit are **identical** in both. Only
token verification differs. `config/env.ts` refuses to boot with
`AUTH_PROVIDER=local` when `NODE_ENV=production`, and `createLocalAuthProvider`
throws if constructed there anyway.

To switch to Cognito: fill in `COGNITO_*` in `server/.env`, set
`AUTH_PROVIDER=cognito`, and fill in `NEXT_PUBLIC_COGNITO_*` in the client. The
dev sign-in route stops being mounted at all.

---

## Layout

```
spoh2027/
├── packages/shared/     zod schemas + inferred types. One runtime dep: zod.
├── server/              Express 5 + Prisma 7 + Postgres 17
│   ├── prisma/          schema, migrations, idempotent seed
│   └── src/
│       ├── config/      zod-validated env, fails fast at boot
│       ├── middleware/  auth, rbac, idempotency, validate, rate limit, errors
│       ├── modules/     one folder per domain: router / service / repo
│       ├── jobs/        lost-person purge, idempotency prune
│       └── lib/         prisma, logger, errors, audit, time
└── client/              Next.js 16 App Router PWA
    └── src/
        ├── app/         routes
        ├── features/    mirrors server modules
        ├── lib/         api, session, outbox (IndexedDB write buffer)
        └── content/     briefing content as data, not markup
```

The monorepo exists **only** so `packages/shared` can be the single definition
of every DTO. The client must never import from `server/` and the server must
never import from `client/` — enforced by `no-restricted-imports` in
`eslint.config.mjs`, not by convention.

---

## Design

`docs/design.md` is an Apple-derived design language: one interactive blue, no
decorative chrome, generous whitespace, 44px touch targets, weight-300 CTAs.
It is the right voice for the reading surfaces — the brief, the map, the
dashboards — and its tokens are the Tailwind theme in `client/src/styles/globals.css`.

It is deliberately **overridden on the capture screens**, and the overrides are
documented in that file rather than hidden. A booth volunteer facing a queue is
looking at a dimmed phone in a bright hall, one-handed. There:

- capture buttons are ≥ 88px and weight 600, not 44px and weight 300
- the footfall `+` fills 60% of the viewport
- contrast is ≥ 4.5:1 and status is never carried by colour alone

Where the design language and BUILD_PLAN §9.4/§9.7 conflict, field usability
wins, because a missed tap is a visitor who never gets counted.

---

## Testing

```bash
npm run lint
npm run typecheck
npm run test:unit --workspace server         # 182 tests, no database needed
npm run test:integration --workspace server  #  90 tests, needs Postgres
npm run test --workspace client              #  14 tests, real IndexedDB
```

Integration tests run against a **real Postgres** — the count aggregations use
`date_trunc` and epoch bucketing that a substitute would not reproduce
faithfully. They freeze the clock to a known instant inside a shift block, since
station scoping asks "is this volunteer rostered here *now*".

`tests/helpers/db.ts` truncates every table and refuses to run unless the
connection string names something recognisably local or a test database.

The tests worth knowing about:

| Test                                  | Proves                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `unit/capabilities.test.ts`           | the §6.3 matrix, transcribed independently by hand        |
| `unit/noPii.test.ts`                  | no visitor-scoped model has a PII-shaped field            |
| `integration/rbac.test.ts`            | every ❌ in the matrix is a 403 on the wire               |
| `integration/capture.test.ts`         | the mandatory cases from BUILD_PLAN §10                   |
| `integration/lostPerson.test.ts`      | the purge actually purges                                 |
| `client/tests/outbox.test.ts`         | retries reuse the idempotency key, so they cannot duplicate |

---

## Status

| Phase | Scope                                          | State                        |
| ----- | ---------------------------------------------- | ---------------------------- |
| 0     | Foundations, schema, seed, CI                  | ✅ done                      |
| 1     | Auth, RBAC, `/me`, check-in, provisioning      | ✅ done (local auth provider)|
| 2     | Capture core, outbox, incidents, lost person   | ✅ done                      |
| 3     | Cards, gifts, dashboard, announcements, swaps  | not started                  |
| 4     | Fallback windows, imports, reports, hardening  | not started                  |
| 5     | Event readiness                                | not started                  |

Phases 0–2 are everything gated by Dry Run #1.

### Known gaps

- **Cognito is not provisioned.** Development runs on the local auth provider.
- **Briefing content is placeholder.** `client/src/content/brief.ts` needs
  sign-off from the Chief Coordinator and the course leads before the
  4 November training.
- **Floor map is text-only.** The T19 plan images are pending.
- **PWA icons are flat placeholders.** Replace with the SoC mark.
- **Seven foreign keys have no referential integrity** — reproduced exactly as
  BUILD_PLAN §5 specifies them; see the note at the top of `schema.prisma`.
- **Push notifications are not built.** The 10-second poll of
  `/lost-person/active` is the delivery mechanism, and it is the contract
  either way (BUILD_PLAN §7.3).

---

## Conventions

- Conventional Commits (`feat(footfall): add bulk entry endpoint`)
- No `any`. Use `unknown` and narrow.
- Comments explain **why**, not what. Every domain rule that looks arbitrary
  carries a pointer back to the brief or the plan.
- Every write endpoint is idempotent. Every mutation writes an audit row **in
  the same transaction** — if the audit write fails, the mutation fails.
