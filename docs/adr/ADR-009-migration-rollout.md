# ADR-009 — Migration, rollout and the 28 October go/no-go

| Field     | Value                                                                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Proposed (P05.10, 2026-09-26)                                                                                                                                                             |
| Decisions | D-01 = C, staged with a go/no-go on 28 Oct (owner). D-12 = migrate as Event #1 (**assumed**). Q-P5: a `release/january` branch for the fallback line, one exception to D-11 (**assumed**) |
| Resolves  | PF-14 (the migration history), F02-001's data path, F04-020 (cutover without a rebuild on the box), F03-033 and F04-003 across the upgrade, F02 § Journey 6 requirement 7 for Event #1    |
| Builds in | P06.12, P09.1, P09.4, P09.7, P09.8, P09.10, P12.8 (new), P15.8, P16.6, P16.7                                                                                                              |

## Context

- **The calendar:** volunteer training on **4 Nov 2026**, Dry Run #1 on **18 Nov**, Dry Run #2
  on **4 Jan 2027**, the event on **6–9 Jan**.
- **D-01 C:** the platform core (G3) must be green on staging by **28 Oct** for volunteers to train
  on it on 4 Nov. Otherwise training and January run on the current system plus critical fixes,
  and the programme continues for the next event.
- **Today's system** is the audit branch (`319d06d`) on one Lightsail box at `spoh2027.duckdns.org`.
  It holds the real roster, and Cognito holds the real identities. Its database has one migration
  that `main` lacks, `20260922000000_audit_severity_and_security_events`: two enum types, five
  defaulted or nullable `AuditLog` columns and three indexes (PF-14, verified in P04.8).
- **Offline phones** hold queued captures in IndexedDB, **per origin**. A new domain is a new
  origin (ADR-006, ADR-008), so a queue left on the old origin never reaches the new one.

## Decision

### 1. Schedule, and an honest read of it

| By         | Milestone                                                                       |
| ---------- | ------------------------------------------------------------------------------- |
| 7 Oct      | **G1**: design signed off                                                       |
| 8–10 Oct   | P06.12: the January safety-net fixes on the unrefactored code (cherry-pickable) |
| 16 Oct     | G2 (P06, P07); staging on AWS (P08) in parallel                                 |
| 27 Oct     | P09–P12 on staging                                                              |
| **28 Oct** | **go/no-go** (§2)                                                               |
| 29–31 Oct  | on **go**: production cutover (§5); on **no-go**: the fallback line (§3)        |
| 4 Nov      | training: on production in `REHEARSAL` (go), or on the current system (no-go)   |
| 18 Nov     | Dry Run #1                                                                      |
| Nov–Dec    | P13–P16 (go), or the programme continues toward the next event (no-go)          |
| 4, 6–9 Jan | Dry Run #2 and the event                                                        |

**The read:** P06–P12 are about 75 steps, three of them phases sized XL. There are about 15 working
days from G1 to 28 Oct. **A go on 28 Oct is possible but not likely.** So this ADR treats the no-go
path as a real plan, not a footnote. Its first piece, P06.12, runs first in P06 whichever way the
decision goes.

### 2. Go/no-go criteria for 28 October

**Go** only if **every** item holds on staging, deployed from `main` by the pipeline:

1. All suites green (unit, integration, client, e2e, policy), lint and arch guards clean for the
   P06/P07 scope. The P06.12 and P06.13 fixes are merged.
2. The Event #1 migration (P09.4) is proven on a **restored copy of the Lightsail database**: row
   counts and totals per category, station and day are identical.
3. The cross-event isolation suite passes for 100 % of routes (P09.7). The route × role matrix
   passes (P11.5).
4. Capture p95 is under 300 ms at twice the expected peak, on staging sized like production for
   event days (P11.9).
5. AVP is authoritative on staging, and the degraded mode is demonstrated.
6. Deactivation and role changes reach every instance within 2 s (P10.3).
7. The outbox upgrade test passes: a capture queued by today's build is delivered after the upgrade
   (§6).
8. A restore from RDS point-in-time recovery has been rehearsed once, with its time recorded.
9. A test alarm has reached the owner's phone. The AWS Budget is set.
10. Cost Explorer shows staging within its share of D-10.
11. The production Cognito pool is either imported with an empty `cdk diff`, or deliberately left
    reference-only for the event (Q-P8).
12. Invites are ready: SES production access granted, **or** the training cohort fits Cognito's
    default sender (owner action A4).

**No-go** if any item fails. The owner decides, and the decision and its reasons are recorded in
`progress.json` (P12.8).

### 3. The no-go path (the fallback line)

- **What runs:** today's deployed line (`319d06d`) plus the P06.12 fixes, on Lightsail, for training
  and January.
- **Where the fixes live (Q-P5, assumed):** a branch **`release/january`**, cut from `319d06d`,
  holding **only** P06.12 cherry-picks. It is the one exception to D-11 (`main` only), and
  `reports/P06/january-fixes.md` records each fix's status. Nothing else is committed to it, and
  it is deleted after the event.
- **Deploy:** the audit branch's own runbook (`git show 319d06d:infra/runbooks/deploy.md`).
  `release/january` knows the audit branch's migration, so `db:deploy` is safe on that database.
- **Owner actions A1–A7** (BACKLOG) protect that line: the sign-in limit, alerting, backups, the
  IAM key.
- **The programme continues** on `main` toward the next event, with no calendar pressure. P13–P16
  proceed.

### 4. Existing data becomes Event #1 (D-12, assumed)

1. **Adopt the audit branch's migration byte for byte** into `main` (P09.1, step 0), with the
   matching `schema.prisma` fields. The migration history on the restored production database then
   equals `main`'s, and `prisma migrate deploy` is clean. The audit-branch features that use those
   columns are brought in later (P11.5 security denials, P13.7 audit screen), as the D-05 follow-up
   says.
2. **The P09 migrations**, expand → migrate → contract, create the organisation and Event #1 "SPOH
   2027" (`Asia/Singapore`, `en-SG`), the taxonomy rows (ADR-002 §Migration), the memberships
   (ADR-001), the settings (ADR-003) and the role permissions from `default-grants.json` (ADR-005).
3. **Verification:** `reports/P09/verify-totals` runs before and after on a restored copy. Counts
   per table, and totals per category, station, day and source, must be identical. The same script
   runs at cutover.
4. If the owner chooses **start empty** instead, step 2 creates the organisation and persons only,
   and Event #1 is set up in the admin UI (P13). The persons keep their Cognito identities either
   way.

### 5. Production cutover (on go: 29–31 Oct)

The production stack exists from this point (ADR-008 §3), not from P15, so that training runs on
it.

1. **Announce** to the committee: the date, the new address, "open the app and let it sync".
2. **Drain:** for 24 h the old site shows a banner asking every phone to sync. The owner watches
   the audit log for late captures.
3. **Freeze:** the Lightsail API goes read-only. An nginx rule on the box answers every non-GET
   `/api/` request with 503 and "We've moved to ⟨new address⟩". No code change is needed on the old
   line.
4. **Final dump** on Lightsail, restored into production RDS.
5. **Migrate:** `prisma migrate deploy` (§4.1), then the P09 data migration, then the totals check.
   If the totals differ, **stop** and stay on Lightsail.
6. **Smoke** production with the pipeline smoke test and one real sign-in per role.
7. **Switch:** the old domain serves a redirect page to the new address. Installed PWAs are
   re-added from the new address; the training brief covers it.
8. **Rollback:** until the owner approves decommissioning, Lightsail stays read-only with its data,
   and rollback is "lift the freeze and point people back". Anything written on production after
   the switch is not carried back. Before Dry Run #1 that is only `REHEARSAL` data and roster edits,
   which the rollback note lists for re-entry.

`P15.8` becomes hardening and decommissioning: the Lightsail box, its IAM user and the DuckDNS
record are retired after Dry Run #1, with the owner's approval.

### 6. Queued captures across the upgrade

- **Same origin (the old build talking to the new API):** the old paths
  (`/api/v1/registrations` …) are **aliases** of Event #1's paths, an internal rewrite that keeps
  the body and the idempotency key (ADR-001). **The aliases stay until seven days after the event
  closes** (the outbox window), then P16.7 removes them. They do not end at P09.10.
- **The new build on first load** migrates stored outbox entries to Event #1's paths and stamps
  them with `eventId`. Entries without a `personId` (queued before F04-003's fix) are shown to the
  signed-in person: "These N captures were queued on this phone before the update. Send them as
  you, or discard?" Nothing is sent under someone else's name silently.
- **Across origins** (the domain change), nothing can move a queue between origins, so the drain
  (§5.2) exists to empty the queues first. The redirect page on the old origin checks its own
  IndexedDB, and if anything is still queued it says so and offers to send it before redirecting.
  Until the freeze, the old API still accepts it.

### 7. Migration rules (every phase from P09)

- **Expand → migrate → contract**, in separate releases. Every release runs against the schema of
  the release before it, and the previous image can be redeployed until the contract step.
- **No in-place renames and no type changes.** Add the new column, backfill, switch reads and
  writes, then drop the old column in a contract step.
- **`NOT NULL` in two steps:** add nullable with a default, backfill, then constrain.
- **Indexes** use `CREATE INDEX CONCURRENTLY` on tables over 10,000 rows.
- **Backfills** run in batches of 1,000 inside a scheduled action (ADR-004), never in the
  migration's own transaction, when a table is large.
- **Migrations run** as a one-off ECS task before the service update (ADR-008). A failed migration
  stops the deploy.
- **A lint on new migration files** refuses `DROP`, `RENAME` and `ALTER … TYPE` unless the file
  name carries `_contract_` and the commit names its expand step.
- **Event freeze:** from 28 Oct to 16 Jan, **no contract migration on production** unless the owner
  approves it. Expand-only changes are allowed.

## Options considered

| Topic                  | Chosen                                                                             | Rejected, and why                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When production starts | at the 28 Oct go, with the cutover then                                            | at P15 (mid-Nov): training on 4 Nov would run on staging with real people, which ADR-006 rules out, or on the old system. Two systems holding roster data for two weeks               |
| Audit-branch migration | adopt it byte for byte                                                             | a new `main` migration that does the same: the history would diverge from the production database and `migrate deploy` would fail. Resetting the history: loses the proof of what ran |
| Fallback fixes         | a `release/january` branch of cherry-picks (Q-P5)                                  | committing to `baseline/pre-remediation`: it is the read-only safety net (P00.3). Deploying from `main`: after P06 it is a different codebase                                         |
| Outbox window          | aliases until 7 days after the event                                               | removing them at P09.10: phones that were offline across the upgrade in November would lose captures                                                                                  |
| Rollback after cutover | Lightsail read-only until decommissioned, with post-switch data re-entered by hand | two-way sync: complexity with no users to justify it before the event                                                                                                                 |

## Consequences

- The fallback line is ready before it is needed, because P06.12 runs first either way.
- Production exists five weeks earlier than planned, so it costs money from November (ADR-008's
  November column already includes it).
- The domain change costs every volunteer one reinstall. The training brief covers it.
- Destructive migrations wait until after the event.

## How it is tested

- `verify-totals` on a restored copy of the Lightsail database: identical before and after
  (P09.4). The same script runs at cutover (§5.5).
- The outbox upgrade test (P09.8): a fixture of today's IndexedDB with queued captures is loaded
  by the new build and delivered to Event #1, with the owner prompt for entries without a person.
- The alias contract test: every old path answers exactly as the Event #1 path does, until the
  alias removal in P16.7.
- A cutover rehearsal on staging (P12.8): restore, migrate, verify, smoke, timed.
- The migration lint in CI (P08.9).

## Migration

This ADR's own changes to the plan:

- **P09.1:** step 0 adopts the audit-branch migration.
- **P09.10:** keeps the database contract, but the alias removal moves to P16.7.
- **New P12.8:** "Go/no-go (28 Oct) and production cutover".
- **P15.8:** becomes hardening and decommissioning.
- **P16.6:** records the dry-run readiness against these criteria.
