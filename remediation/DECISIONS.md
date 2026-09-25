# Decisions

Questions whose answers change the plan. Each has options, a recommendation and the phases it
blocks. Answers are recorded in `progress.json` with
`node remediation/tools/progress.mjs decide D-01 --answer "…"`, and summarised here under **Answer**.

**Owner: you** means only the product owner can answer. **Owner: design** means P05 decides with the
recommendation as default, and you can override it.

Audits (P00–P04) can run with every decision open, except where a step says otherwise.

---

### D-01 — Go-live date and release strategy

- **Owner:** you
- **Blocks:** P05, P16
- **Question:** Does the new platform have to run Dry Run #1 (18 Nov 2026) and the January event, and is 4 Nov
  training the real code-freeze?
- **Options:**
  - **A.** Whole programme before Dry Run #1. Highest risk: roughly seven weeks for everything.
  - **B.** Run January 2027 on the current system with targeted fixes only, and ship the new platform
    for the next event. Lowest risk to January, but this event gets none of the benefits.
  - **C.** Staged, with a go/no-go on 28 Oct. The platform core (G3) must be green on staging by
    28 Oct to train volunteers on it on 4 Nov. Otherwise training and January run on the baseline tag
    plus critical fixes, and the programme continues for the next event.
- **Recommendation:** **C.** It commits to the ambitious date without betting the event on it.
- **Answer:** _open_

### D-02 — Reuse model (tenancy)

- **Owner:** you
- **Blocks:** P05, P09
- **Options:**
  - **A.** Many events in one deployment, one organisation (SP SoC). Events are created, cloned and
    archived. Several can exist at once, for example next year's in setup while this year's is live.
  - **B.** Multi-organisation, SaaS-style. Every row is scoped to an organisation, with its own admins and
    branding. Adds a tenant layer to every query, policy and screen.
  - **C.** One event per deployment, reset or cloned each year.
- **Recommendation:** **A**, with an `Organisation` row as the root of the schema so that B becomes
  additive later rather than a migration of every table.
- **Answer:** _open_

### D-03 — How flexible roles are

- **Owner:** you
- **Blocks:** P05, P11
- **Options:**
  - **A.** A fixed role catalogue (Volunteer, IC, Deputy, Chief, Lead, Admin, renameable per event).
    Admins edit which actions each role may perform, per event. Guardrail policies are locked.
  - **B.** Fully custom roles. Admins create roles, name them and compose permissions from scratch.
  - **C.** Fixed roles and fixed permissions. This is today's model, moved to Cedar.
- **Recommendation:** **A.** Most of the flexibility, and far fewer ways to lock yourself out or
  hand volunteers admin powers. B can be added on the same Cedar model later.
- **Answer:** _open_

### D-04 — Product invariants

- **Owner:** you
- **Blocks:** P05, P09
- **Question:** Are "the three counts never merge" and "no visitor personal data" fixed rules for every
  event, or options per event?
- **Recommendation:** Fixed for every event. They are why the system is trustworthy. Making them
  toggles makes every report and export conditional.
- **Answer:** _open_

### D-05 — Which branch is the baseline

- **Owner:** you
- **Blocks:** P00.2
- **Facts:** `origin/feat/audit-cloudwatch` is `main` plus 5 commits and fast-forwards cleanly.
  The commits are CloudWatch audit shipping, security events, audit log and roster-import screens,
  and Lightsail infrastructure and runbooks. Its commit messages describe it as what runs on
  `spoh2027.duckdns.org`.
- **Recommendation:** Fast-forward the working branch to it, so the programme starts from what is deployed.
- **Answer:** _open_

### D-06 — How Verified Permissions is evaluated

- **Owner:** design (P05)
- **Blocks:** P11
- **Options:**
  - **A.** AVP is authoritative. `IsAuthorized` runs per request behind a short-lived decision cache,
    `BatchIsAuthorized` supplies UI affordances, and dev/test run the same policies locally
    through Cedar WASM.
  - **B.** Policies live in AVP (admin-editable) but are synced to the server and evaluated locally
    with Cedar WASM on every request. AVP is the store; the server is the engine.
  - **C.** AVP on every request, no cache.
- **Recommendation:** **A**, with the local Cedar engine also serving as a degraded mode if AVP is
  unreachable during the event. Capture must not stop because a control-plane API throttles.
  Admin actions fail closed.
- **Answer:** _open_

### D-07 — Compute and hosting

- **Owner:** you (cost), design (shape)
- **Blocks:** P08
- **Options:**
  - **A.** ECS Fargate (API and Next.js containers) behind an ALB, with RDS Postgres 17. Managed,
    autoscaling, no servers to patch. Roughly US$90–160/month at event scale, and can be scaled
    down between events.
  - **B.** App Runner and RDS. Simpler, less control over networking, similar cost.
  - **C.** Stay on Lightsail (the two-box topology on the audit branch) with Lightsail managed
    Postgres. Cheapest (about US$50–80/month) but hand-operated.
- **Recommendation:** **A** for production, with staging on the same stack at minimum size.
  Figures are to be re-priced in P05 from the AWS Pricing API, not estimated.
- **Answer:** _open_

### D-08 — Domain and email

- **Owner:** you
- **Blocks:** P08.5, P12.2
- **Question:** Which domain should production use (a school subdomain, or one you register in Route 53)?
  Can we send invite emails from it through SES? duckdns cannot carry DKIM for SES.
- **Recommendation:** A real domain in Route 53 with ACM certificates and SES with DKIM.
- **Answer:** _open_

### D-09 — Scheduler engine

- **Owner:** design (P05)
- **Blocks:** P10
- **Options:**
  - **A.** A Postgres-backed job table with a worker (`FOR UPDATE SKIP LOCKED`). It is transactional
    with the change that schedules it, runs identically in dev and test, and needs no new infrastructure.
  - **B.** EventBridge Scheduler invoking an internal endpoint or Lambda.
- **Recommendation:** **A.** Schedules are event data. They must be listed, edited, cancelled and
  audited in the app, and must work in tests without AWS.
- **Answer:** _open_

### D-10 — AWS budget and environments

- **Owner:** you
- **Blocks:** P05, P08
- **Question:** What is the monthly ceiling? Do you want staging and production (recommended), plus
  an optional ephemeral dev stack?
- **Answer:** _open_

### D-11 — Branch and review workflow

- **Owner:** you
- **Blocks:** P00.2
- **Options:**
  - **A.** One pull request per phase into `main`, reviewed by you, merged before the next phase starts.
  - **B.** Continuous work on the working branch, with a PR at each gate.
- **Recommendation:** **A.** Each phase is a reviewable, revertible unit.
- **Answer:** _open_

### D-12 — Existing data

- **Owner:** you
- **Blocks:** P09.4
- **Question:** Should the current roster, stations, cards and records be migrated into "SPOH 2027" as
  Event #1, or should the new platform start empty and have the event set up through the new admin UI?
- **Recommendation:** Migrate. The roster and the Cognito identities are real, and re-inviting
  everyone is avoidable friction.
- **Answer:** _open_

### D-13 — Access for testing

- **Owner:** you
- **Blocks:** P00.8, P00.9, P04.7
- **Question:**
  - May audits use the live staging site (`spoh2027.duckdns.org`)?
  - May audits use the AWS credentials present in this environment, read-only?
  - May P00.9 run `infra/scripts/smoke-test.sh`, which creates and deactivates a test volunteer?
- **Recommendation:** Yes to read-only, and yes to the smoke test on staging only.
- **Answer:** _open_

### D-14 — Shared state for rate limits and caches

- **Owner:** design (P05)
- **Blocks:** P10.3, P15.2
- **Options:**
  - **A.** Postgres. A rate-limit table, with `LISTEN/NOTIFY` for cache invalidation.
  - **B.** ElastiCache (Valkey).
  - **C.** DynamoDB.
- **Recommendation:** **A** at this scale (hundreds of users, not hundreds of thousands). No new
  moving part to operate on event day.
- **Answer:** _open_
