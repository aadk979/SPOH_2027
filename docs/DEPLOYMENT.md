# SPOH 2027 — deployment

**Audience:** whoever provisions and operates the AWS account.
**Prerequisite:** an AWS account, and a decision on §0 before anything is created.

Two environments, both mandatory. The dry runs on **18 Nov 2026** and
**4 Jan 2027** run against staging, so dry-run data never contaminates the real
dataset and a bad deploy on 5 January cannot take down the event.

---

## 0. Decide these first

Provisioning before these are settled means doing it twice.

| Question                                            | Why it blocks                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| **Who owns the AWS account after graduation?**      | If SPOH 2028 reuses this, it cannot sit in a personal account.          |
| **Does SP IT need to approve deployment?**          | Approval timelines are rarely short. Ask now, even with no visitor PII. |
| **Which AWS region?**                               | `ap-southeast-1` (Singapore) throughout this document.                  |
| **Own phones or shared tablets at fixed stations?** | Changes how many Cognito accounts exist and how they are handed out.    |

---

## 1. What gets created

```
                   ┌──────────────┐
   volunteers ───► │  CloudFront  │ ──► S3   (client: static Next.js export)
                   └──────┬───────┘
                          │  /api/*
                   ┌──────▼───────┐
                   │  App Runner  │ ──► RDS Postgres 17  (private subnet)
                   │  (server)    │ ──► Cognito User Pool (verify only)
                   └──────────────┘
```

**Recommended: App Runner, not Lambda.** A container stays warm, so there is no
cold start on a booth tap — which is exactly where latency is most visible.
Lambda is cheaper at idle, but the load is four spiky days and 361 quiet ones,
and a 400ms cold start in front of a queue costs data. If cost is decisive, use
Lambda with provisioned concurrency of 1 during the event window only.

| Resource          | Staging            | Production                               |
| ----------------- | ------------------ | ---------------------------------------- |
| RDS Postgres 17   | `db.t4g.micro`     | `db.t4g.small`, Multi-AZ off             |
| App Runner        | 0.25 vCPU / 0.5 GB | 1 vCPU / 2 GB, min 1 instance            |
| Client hosting    | Amplify Hosting    | Amplify Hosting or S3 + CloudFront       |
| Cognito User Pool | separate pool      | separate pool                            |
| Backups           | 7-day automated    | 7-day automated + manual daily snapshots |

Two separate Cognito pools. A staging token must never authenticate against
production, and sharing a pool is the easiest way to make that possible.

---

## 2. Database

```sql
CREATE DATABASE spoh2027;
CREATE USER spoh_app WITH PASSWORD '...';
GRANT CONNECT ON DATABASE spoh2027 TO spoh_app;
```

The application user needs DML on the application schema and nothing else — it
never needs `CREATE DATABASE` or superuser. Migrations run as a separate
deploy step, not at application boot: a container that migrates on start will
race itself the moment there are two instances.

`DATABASE_URL` **must** include `sslmode=require` in production. `config/env.ts`
refuses to boot without it, so this is a check you cannot skip by accident.

```
postgresql://spoh_app:...@spoh-prod.xxxxx.ap-southeast-1.rds.amazonaws.com:5432/spoh2027?sslmode=require
```

Set `DATABASE_POOL_MAX` with the instance count in mind. The ceiling is
`instances × pool size` against the Postgres `max_connections`. Default is 25,
which is right for one or two App Runner instances on a `t4g.small`.

---

## 3. Cognito

### Staging is already provisioned

Created in `ap-southeast-1`, account `665146708212`, and verified end to end.

|            |                                                              |
| ---------- | ------------------------------------------------------------ |
| User pool  | `ap-southeast-1_9bwl2nGF7` (`spoh2027-staging`)              |
| App client | `23uft7mvtnrno1uunsc5lp0h2v` (public SPA, no secret)         |
| Users      | booth, counter, ic, chief, lead — matching the seeded roster |

Pool and client ids are **not secrets**. They ship in the browser bundle of any
Cognito SPA, which is why they sit in `.env.example` rather than in Secrets
Manager.

Verify it, or any other environment, in one command:

```bash
cd server
VERIFY_EMAIL=booth@spoh2027.test VERIFY_PASSWORD=...   node scripts/verify-cognito.mjs --api https://staging-api.example
```

It checks self sign-up is off, the password policy, all six groups and their
precedence, that the client has no secret, the token lifetimes — and then proves
a real token works against the API, a forged one is rejected, and the
development sign-in route is not mounted. **Run it before each dry run and
before 6 January.**

Production needs its own pool. A staging token must never authenticate against
production.

### Creating a pool from scratch

One User Pool per environment, one App Client (public SPA, **no client secret**).

```
Sign-in:            email
Self sign-up:       DISABLED  (AllowAdminCreateUserOnly = true)
MFA:                optional; enforce for ChiefCoordinator, Lead, Admin
Password policy:    min 12 chars, upper + lower + number
Advanced security:  ENFORCED in production
Access token:       60 minutes
ID token:           60 minutes
Refresh token:      12 hours
```

**12 hours is deliberate.** A shift is 4.5 hours; 12 covers a full day without a
re-login and expires overnight, so a phone lost on the 7th stops working on the
8th.

**Self sign-up must stay disabled.** Accounts exist because somebody is on the
roster. The server enforces the same rule from the other side — a valid token
with no `Volunteer` row gets `403 NOT_PROVISIONED` — but two locks are better
than one on the door that decides who can write to the counts.

Create the groups with precedence, lowest number winning:

| Group               | Precedence |
| ------------------- | ---------- |
| `Admin`             | 0          |
| `Lead`              | 10         |
| `ChiefCoordinator`  | 20         |
| `DeputyCoordinator` | 30         |
| `IC`                | 40         |
| `Volunteer`         | 50         |

```bash
aws cognito-idp create-group --user-pool-id "$POOL" --group-name Admin --precedence 0
aws cognito-idp create-group --user-pool-id "$POOL" --group-name Lead --precedence 10
aws cognito-idp create-group --user-pool-id "$POOL" --group-name ChiefCoordinator --precedence 20
aws cognito-idp create-group --user-pool-id "$POOL" --group-name DeputyCoordinator --precedence 30
aws cognito-idp create-group --user-pool-id "$POOL" --group-name IC --precedence 40
aws cognito-idp create-group --user-pool-id "$POOL" --group-name Volunteer --precedence 50
```

Group names are PascalCase and the roles in the database are SCREAMING_SNAKE.
The mapping lives in exactly one place: `server/src/middleware/auth/cognitoProvider.ts`.

> **Note on precedence.** Cognito precedence orders groups; it does not grant
> permissions. The system authorises from a capability matrix, not from rank —
> `Lead` outranks `Volunteer` and is still forbidden from creating a
> registration. Changing a group's precedence changes nothing about what
> anybody may do.

### Switching the app onto Cognito

```
# server
AUTH_PROVIDER=cognito
COGNITO_REGION=ap-southeast-1
COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# client
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

That is the whole change. The development sign-in route stops being mounted,
and `config/env.ts` refuses to start with `AUTH_PROVIDER=local` when
`NODE_ENV=production`.

### Migrating an existing roster onto a pool

Roster rows created under the development provider carry a `local:...` subject.
Rewrite them to the real ones, matched by email, so everybody keeps their id,
their shifts and everything they have captured:

```bash
cd server
node scripts/sync-cognito-subs.mjs            # preview
node scripts/sync-cognito-subs.mjs --commit
```

Needed exactly once per environment. After that, new volunteers come in through
`POST /api/v1/roster/volunteers`, which creates the Cognito account and the
roster row together.

### What was verified against the real pool

Not configuration review — these were executed:

- A real access token from `ap-southeast-1_9bwl2nGF7` authenticates and resolves
  to the right roster row, role and station.
- The capability matrix holds under real tokens: a `Lead` is refused
  `registration.create`; an `IC` is refused the event-wide dashboard; a
  volunteer is refused the audit log.
- Station scoping holds: a booth volunteer posting a tick to DCDF gets
  `STATION_SCOPE_DENIED`.
- A Cognito account with no roster row gets `403 NOT_PROVISIONED`.
- `POST /roster/volunteers` really creates the Cognito user, sets the invite
  flow, and adds it to the right group.
- **Adding a volunteer to the `Admin` group in the Cognito console grants them
  nothing.** The token claimed `Admin`, the server kept them at `VOLUNTEER`,
  `/audit` and `/dashboard/live` both stayed 403, and the drift was logged. The
  roster is authoritative, not the identity provider.

---

## 4. Secrets

Nothing secret in the repository, ever. Production values live in AWS Secrets
Manager or SSM Parameter Store and are injected as environment variables.

| Secret              | Where           | Rotate                           |
| ------------------- | --------------- | -------------------------------- |
| `DATABASE_URL`      | Secrets Manager | On handover, and if ever exposed |
| `COGNITO_CLIENT_ID` | Parameter Store | Not secret, but keep it together |

`LOCAL_AUTH_SECRET` exists only in development and must never be set in a
deployed environment.

---

## 5. Deploying

```bash
npm ci
npm run build:shared
npx prisma migrate deploy --schema server/prisma/schema.prisma   # separate step
npm run build --workspace server
npm run build --workspace client
```

`prisma migrate deploy` applies pending migrations and never generates new
ones. It is idempotent and safe to run on every deploy.

**Migrations are forward-only.** Do not roll one back mid-event; correct
forward. A rollback that drops a column takes the data with it.

CI deploys to staging on merge to `main`. **Production is manual approval
only**, and is frozen from **5 January 2027** except through a documented
hotfix path.

---

## 6. Alarms

| Alarm            | Threshold | Means                                             |
| ---------------- | --------- | ------------------------------------------------- |
| API 5xx rate     | > 1%      | Something is broken. Trace by `requestId`.        |
| p95 latency      | > 1s      | Taps feel slow at the booth.                      |
| RDS CPU          | > 80%     | Unexpected at this volume. Investigate.           |
| RDS free storage | low       | Should never happen at 60k rows.                  |
| App Runner       | 0 healthy | The API is down. Consider a fallback declaration. |

**The `/chief` data-health panel is the more important monitor.** The API can be
perfectly healthy while a room records nothing for an hour, and no CloudWatch
metric will ever show that.

Health endpoints, both unauthenticated and neither leaking detail:

- `GET /healthz` — liveness. Touches nothing, so it cannot fail spuriously.
- `GET /readyz` — readiness. Checks Postgres.

Point the App Runner health check at `/healthz`. Using `/readyz` would recycle
the container during a brief database blip, which is the opposite of helpful.

---

## 7. Media archive (S3)

Not built yet — Phase 3 "nice to have" in the plan. When it is:

- Block all public access
- SSE-S3 encryption
- Presigned upload URLs, 15-minute expiry
- Lifecycle rule to Glacier 30 days after the event

Keep it separate from the analytics database. It is an asset library, not a
data system.

---

## 8. Load testing before the dry runs

Against **staging**, never production:

```bash
LOAD_TEST_API=https://staging-api.example \
  npm run load-test --workspace server -- --clients 100 --taps 20 --duration 60
```

It provisions 100 volunteer accounts in the `@loadtest.spoh2027.test` domain
and writes real rows. Clean them out afterwards — the command is printed when
the run finishes.

Budget: p95 under 300ms. Measured locally at 48ms.

---

## 9. Before each event day

- [ ] Manual RDS snapshot
- [ ] `/readyz` returns 200 on production
- [ ] Today's roster loaded, every volunteer provisioned
- [ ] Station kits: spare device, power bank, physical clicker, laminated
      fallback QR card, sealed paper pack
- [ ] `/chief/data-health` lists every counted room

Afterwards: another snapshot, and reconcile any fallback windows within 48 hours
while people still remember.
