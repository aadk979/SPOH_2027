# Decisions

Questions whose answers change the plan. Each has options, a recommendation and the phases it
blocks. Answers are recorded in `progress.json` with
`node remediation/tools/progress.mjs decide D-01 --answer "…"`, and summarised here under **Answer**.

**Owner: you** means only the product owner can answer. **Owner: design** means P05 decides with the
recommendation as default, and you can override it.

Audits (P00–P04) can run with every decision open, except where a step says otherwise.

---

### G1 — Design sign-off

- **Answer:** **Approved 2026-09-26 by the owner.** The owner delegated every open item to the
  recommendations already written in the ADRs, so everything marked **assumed** in ADR-001…009 is
  accepted, and all nine ADRs are **Accepted**. What that settles:
  - D-07, D-08, D-10, D-12 and the D-13 amendment, below.
  - The product questions in `findings/BACKLOG.md` § Product questions, **as written**:
    - Q-P1: a merged total shows only beside the three counts; visitor PII is a per-event allowlist
      with a retention period.
    - Q-P2: shifts may cross midnight, with a day-boundary hour (default 04:00).
    - Q-P3: a short list of product labels is renameable per event.
    - Q-P4: locale per event, defaulting to the organisation's (`en-SG`).
    - Q-P5: **yes**. `release/january` may exist, cut from `319d06d`, for P06.12 cherry-picks only.
    - Q-P6: the lost-person wording in ADR-003 §8.
    - Q-P7: **yes**. P11.9 may create a throwaway AVP policy store and delete it in the same session.
    - Q-P8: **yes**. With D-13 amended, the agent runs the read-only `describe-user-pool` and
      `describe-user-pool-client` itself before P12.1.
    - Q-P9: about US$130 for January 2027 only (see D-10).
  - The PIN fallback default (`attendance.pinAllowedOffNetwork` off for new events, ADR-003 §1), PF-11 (ADR-007 §7: the missing brief and build plan are
    not recovered) and the permission changes C1–C13 in `reports/P05/cedar/CHANGES.md`.
- **From now on** the ADRs in `docs/adr/` and `standards/*.md` are binding. Changing a design means
  an ADR edit, noted in the phase report.

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
- **Answer:** **C** (owner, 2026-09-26). Staged, with a go/no-go on 28 Oct. If G3 is green on staging by
  then, 4 Nov training runs on the new platform. Otherwise training and January run on
  `baseline/pre-remediation` plus critical fixes, and the programme continues for the next event.

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
- **Answer:** **A** (owner, 2026-09-25). Many events in one deployment for one organisation, with an
  `Organisation` row as the schema root.

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
- **Answer:** **A** (owner, 2026-09-26). A fixed role catalogue, renameable per event. Admins edit which
  actions each role may perform, per event, and the guardrail policies are locked.

### D-04 — Product invariants

- **Owner:** you
- **Blocks:** P05, P09
- **Question:** Are "the three counts never merge" and "no visitor personal data" fixed rules for every
  event, or options per event?
- **Recommendation:** Fixed for every event. They are why the system is trustworthy. Making them
  toggles makes every report and export conditional.
- **Answer:** **Configurable per event** (owner, 2026-09-25), against the recommendation. Both rules
  become per-event options, so P05 and P09 design every report, export and screen for both modes.
  P01 classifies them as `event-setting`, not `invariant`.

### D-05 — Which branch is the baseline

- **Owner:** you
- **Blocks:** P00.2
- **Facts:** `origin/feat/audit-cloudwatch` is `main` plus 5 commits and fast-forwards cleanly.
  The commits are CloudWatch audit shipping, security events, audit log and roster-import screens,
  and Lightsail infrastructure and runbooks. Its commit messages describe it as what runs on
  `spoh2027.duckdns.org`.
- **Recommendation:** Fast-forward the working branch to it, so the programme starts from what is deployed.
- **Answer:** **Stay on the current branch** (owner, 2026-09-25). The audit branch is not merged, so its CloudWatch audit shipping, audit-log and roster-import screens, Lightsail infra, runbooks and `infra/scripts/smoke-test.sh` are not in the baseline. P00.2 records this instead of fast-forwarding.
  **Follow-up** (owner, 2026-09-26): the audit branch stays unmerged and is not dropped. Later phases
  mine it for code (CloudWatch audit shipping, security events, the audit-log and roster-import
  screens, infra runbooks), reworked to the target design, rather than merging it.

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
- **Answer:** **A, with one change** (design, ADR-005, accepted at G1). AVP `IsAuthorized` is
  authoritative behind a decision cache (30 s for writes, 60 s for reads) that the bus invalidates.
  Local Cedar takes over when AVP is degraded, for capture, self-service and safety; correct,
  manage, configure and platform actions fail closed. **UI affordances use the local engine**,
  because `BatchIsAuthorized` costs US$150 per million requests.

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
- **Answer:** **The ADR-008 lean topology** (owner, G1, 2026-09-26). Fargate + RDS, reshaped to fit D-10:
  - API Gateway HTTP API with Cloud Map instead of an ALB;
  - one Fargate ARM service serving the API and a static-export client;
  - RDS Postgres 17 `db.t4g.micro`, single-AZ, resized for event days;
  - no NAT and no interface endpoints;
  - staging parked when idle.

  It costs US$36–97 a month (`reports/P05/pricing/cost.md`).

### D-08 — Domain and email

- **Owner:** you
- **Blocks:** P08.5, P12.2
- **Question:** Which domain should production use (a school subdomain, or one you register in Route 53)?
  Can we send invite emails from it through SES? duckdns cannot carry DKIM for SES.
- **Recommendation:** A real domain in Route 53 with ACM certificates and SES with DKIM.
- **Answer:** **A domain in Route 53, with ACM certificates and SES + DKIM** (owner, G1, 2026-09-26).
  The owner has not named the domain yet. The CDK config carries a placeholder, which the P08 report
  flags. P08.5 and P12.2 build against the placeholder, and the owner supplies the name before
  cutover.

### D-09 — Scheduler engine

- **Owner:** design (P05)
- **Blocks:** P10
- **Options:**
  - **A.** A Postgres-backed job table with a worker (`FOR UPDATE SKIP LOCKED`). It is transactional
    with the change that schedules it, runs identically in dev and test, and needs no new infrastructure.
  - **B.** EventBridge Scheduler invoking an internal endpoint or Lambda.
- **Recommendation:** **A.** Schedules are event data. They must be listed, edited, cancelled and
  audited in the app, and must work in tests without AWS.
- **Answer:** **A** (design, ADR-004, accepted at G1). A `ScheduledAction` table claimed with
  `FOR UPDATE SKIP LOCKED` under a lease. The handler, its completion and its audit row commit
  together. Retries back off, then dead-letter with an alarm.

### D-10 — AWS budget and environments

- **Owner:** you
- **Blocks:** P05, P08
- **Question:** What is the monthly ceiling? Do you want staging and production (recommended), plus
  an optional ephemeral dev stack?
- **Answer:** **US$100/month** (owner, 2026-09-26), covering staging and production together, with
  no ephemeral dev stack (confirmed at G1). **Q-P9:** about US$130 is allowed for **January 2027
  only**, to add Cognito Plus, RDS Multi-AZ for event week and WAF (ADR-008 §6). US$100 applies to
  every other month.

### D-11 — Branch and review workflow

- **Owner:** you
- **Blocks:** P00.2
- **Options:**
  - **A.** One pull request per phase into `main`, reviewed by you, merged before the next phase starts.
  - **B.** Continuous work on the working branch, with a PR at each gate.
- **Recommendation:** **A.** Each phase is a reviewable, revertible unit.
- **Answer:** **Work directly on `main`** (owner, amended 2026-09-25). No feature branches, pull
  requests or tags. Every step is committed to `main` and pushed to `main`. The first answer, A, was
  used once: PR #1 carried the plan and P00 and was merged.

### D-12 — Existing data

- **Owner:** you
- **Blocks:** P09.4
- **Question:** Should the current roster, stations, cards and records be migrated into "SPOH 2027" as
  Event #1, or should the new platform start empty and have the event set up through the new admin UI?
- **Recommendation:** Migrate. The roster and the Cognito identities are real, and re-inviting
  everyone is avoidable friction.
- **Answer:** **Migrate** (owner, G1, 2026-09-26). The current data becomes "SPOH 2027", Event #1
  (ADR-001, ADR-009).

### D-13 — Access for testing

- **Owner:** you
- **Blocks:** P00.8, P00.9, P04.7
- **Question:**
  - May audits use the live staging site (`spoh2027.duckdns.org`)?
  - May audits use the AWS credentials present in this environment, read-only?
  - May P00.9 run `infra/scripts/smoke-test.sh`, which creates and deactivates a test volunteer?
- **Recommendation:** Yes to read-only, and yes to the smoke test on staging only.
- **Answer:** **Partial** (owner, 2026-09-25). Allowed: P00.9 may run the smoke test against staging. Not allowed: other audit requests to the live staging site, or use of this container's AWS credentials, so P00.8 and P04.7 stay blocked.
  **Amended** (owner, G1, 2026-09-26): the agent may use the AWS CLI and this environment's AWS
  credentials. Creating billable resources stays within ADR-008's cost plan. Nothing on the live
  Lightsail site is changed without the owner.

### D-14 — Shared state for rate limits and caches

- **Owner:** design (P05)
- **Blocks:** P10.3, P15.2
- **Options:**
  - **A.** Postgres. A rate-limit table, with `LISTEN/NOTIFY` for cache invalidation.
  - **B.** ElastiCache (Valkey).
  - **C.** DynamoDB.
- **Recommendation:** **A** at this scale (hundreds of users, not hundreds of thousands). No new
  moving part to operate on event day.
- **Answer:** **A** (design, ADR-003, accepted at G1). Postgres: a `LISTEN`/`NOTIFY` cache bus,
  published inside the writing transaction, and an `UNLOGGED` rate-limit counter table. ElastiCache
  and DynamoDB were rejected on cost and moving parts.
