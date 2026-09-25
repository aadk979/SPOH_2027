# Remediation programme

This directory is the plan, the tracker and the memory for turning the SPOH 2027 codebase into a
reusable, event-agnostic, production-grade event operations platform on AWS.

It is written so that **a fresh session with no conversation history can pick up exactly where the
last one stopped.** If you are that session, follow [Resuming](#resuming-read-this-first-in-a-fresh-session)
before doing anything else.

---

## What the programme delivers

1. **One platform for any event.** Nothing event-specific in code, seed data or env files. Events,
   days, shifts, stations, visitor categories, gifts, content and people are data, created and
   cloned from the admin UI.
2. **Live configuration and scheduling.** Settings change at runtime with history and revert.
   Lifecycle transitions, announcements, capture windows and setting changes can be scheduled.
3. **Policy-based access control on Amazon Verified Permissions.** Cedar policies replace the
   compiled role matrix. Admins manage role permissions per event, and safety guardrails stay locked.
4. **A connected, polished product.** Every entity has a page, every dashboard number drills down,
   and every server feature has a screen.
5. **A modular codebase.** Single-purpose functions and files, a layered module structure, and
   boundaries enforced by lint and architecture tests, not by convention.
6. **Production on AWS as code.** CDK-defined environments, a CI/CD pipeline, managed Postgres,
   secrets in Secrets Manager, observability, and rehearsed restore.

The two product rules in the root `README.md` (the three counts never merge; no visitor personal
data) are carried through unchanged unless decision **D-04** says otherwise.

---

## Layout

```
remediation/
├── README.md                 you are here: programme overview + resume protocol
├── progress.json             machine-readable tracker; the source of truth for status
├── DECISIONS.md              open questions for the owner, with options and recommendations
├── baseline.md               measured state of the codebase on 2026-09-25, before any change
├── standards/
│   ├── engineering-standards.md   the rules every phase follows (SRP, size limits, layering, tests)
│   └── target-architecture.md     target folder structure and system shape (draft until P05)
├── phases/                   one file per phase: purpose, scope, steps, exit criteria, report
│   └── P00 … P16
├── findings/                 audit outputs (P01–P04) and the consolidated backlog (P05)
│   ├── README.md                  finding format and severity scale
│   └── preliminary.md             issues already observed while planning, to verify in audits
├── reports/                  per-phase metrics snapshots and artefacts
└── tools/
    ├── progress.mjs          status / start / done / decide / sync / log for progress.json
    └── code-metrics.mjs      long-function and long-file report (refactor debt)
```

---

## Phases

| ID  | Phase                                                                         | Gate | Changes behaviour  |
| --- | ----------------------------------------------------------------------------- | ---- | ------------------ |
| P00 | [Baseline, tooling and branch reconciliation](phases/P00-baseline.md)         | G0   | no                 |
| P01 | [Audit A: hardcoding and configuration](phases/P01-audit-hardcoding.md)       | G0   | no                 |
| P02 | [Audit B: admin and role journeys](phases/P02-audit-journeys.md)              | G0   | no                 |
| P03 | [Audit C: code quality, architecture, bugs](phases/P03-audit-code.md)         | G0   | no                 |
| P04 | [Audit D: security and AWS readiness](phases/P04-audit-security-aws.md)       | G0   | no                 |
| P05 | [Target design and sign-off](phases/P05-design-signoff.md) ⛔ owner sign-off  | G1   | no                 |
| P06 | [Server modular refactor](phases/P06-server-refactor.md)                      | G2   | no (pure refactor) |
| P07 | [Client and shared refactor](phases/P07-client-refactor.md)                   | G2   | no (pure refactor) |
| P08 | [AWS foundation and delivery pipeline](phases/P08-aws-foundation.md)          | G3   | infra only         |
| P09 | [Event model and configurable taxonomy](phases/P09-event-model.md)            | G3   | yes                |
| P10 | [Live configuration, lifecycle, scheduling](phases/P10-config-scheduling.md)  | G3   | yes                |
| P11 | [Authorization on Verified Permissions](phases/P11-authorization-avp.md)      | G3   | yes                |
| P12 | [Identity: Cognito and memberships](phases/P12-identity-cognito.md)           | G3   | yes                |
| P13 | [Admin and event setup experience](phases/P13-admin-setup.md)                 | G4   | yes                |
| P14 | [Interlinking and UX polish](phases/P14-interlinking-polish.md)               | G4   | yes                |
| P15 | [Security hardening and production environment](phases/P15-security-prod.md)  | G5   | yes                |
| P16 | [Verification, load, dry-run readiness, handover](phases/P16-verification.md) | G5   | no                 |

### Gates

| Gate | Meaning                                                                      | Passes when                                    |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| G0   | Facts established: baseline measured, audits written                         | P00–P04 done, owner has answered D-01…D-13     |
| G1   | **Design signed off by the owner**; nothing after this starts without it     | P05 done, sign-off recorded in progress.json   |
| G2   | Clean architecture, identical behaviour                                      | P06–P07 done, all suites green, zero lint debt |
| G3   | Platform core: multi-event, live config, PBAC, identity, deployed to staging | P08–P12 done                                   |
| G4   | Product complete: every feature reachable and interlinked                    | P13–P14 done                                   |
| G5   | Production ready                                                             | P15–P16 done, go/no-go signed                  |

### Dependencies

```
P00 ─┬─ P01 ─┐
     ├─ P02 ─┤
     ├─ P03 ─┼─ P05 (sign-off) ─┬─ P06 ─┬─ P09 ─┬─ P10 ─┐
     └─ P04 ─┘                  │  P07 ─┘       └─ P11 ─┼─ P12 ─ P13 ─ P14 ─ P15 ─ P16
                                └─ P08 (parallel with P06/P07; P09+ deploy to staging) ┘
```

P01–P04 can run in any order after P00. P08 can start as soon as P05 is signed off.

### Proposed calendar (depends on D-01)

The hard dates are volunteer training on **4 Nov 2026**, Dry Run #1 on **18 Nov 2026**,
Dry Run #2 on **4 Jan 2027** and the event on **6–9 Jan 2027**. The recommended plan (D-01 option C):

| By         | Target                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| 3 Oct      | G0: audits written, decisions answered                                  |
| 7 Oct      | G1: design signed off                                                   |
| 16 Oct     | G2: refactor complete; staging on AWS live (P08)                        |
| **28 Oct** | **Go/no-go**: G3 green on staging, or train on the baseline ref instead |
| 11 Nov     | G4: admin setup and polish                                              |
| 16 Nov     | G5 core: security hardening, prod stood up, restore rehearsed           |
| 18 Nov     | Dry Run #1 on the new platform                                          |
| Dec        | Fixes from Dry Run #1, remaining P14/P16 items                          |

The baseline ref `baseline/pre-remediation` (created in P00) stays deployable throughout as the
safety net. The event never depends on the programme finishing.

### Safety net: deploying the baseline ref

`baseline/pre-remediation` is a **branch** at `d2497b6`, which is `main` before any remediation
change (D-05 kept the baseline on `main`). It holds product code only, with no `remediation/`
directory. It is a branch rather than a tag because this session's GitHub access refuses tag pushes
(HTTP 403). It was created through the GitHub API from `main` while `main` was `d2497b6`. Treat it as
read-only: never commit or push to it. The commit `d2497b6` is the real rollback target, and
`git rev-parse origin/baseline/pre-remediation` must print it.

The deploy runbook is **not in this tree**. It lives on the audit branch:
`git show 319d06d:infra/runbooks/deploy.md`. To run January on the baseline, follow that runbook's
_Steps_ with `<branch>` = `baseline/pre-remediation` (or `d2497b6`), with two differences:

1. **Do not run step 4 (`npm run db:deploy`) against a database that the audit branch has
   migrated**, which includes staging. That database has
   `20260922000000_audit_severity_and_security_events` applied, and the baseline does not know that
   migration. The migration only adds enum types, nullable or defaulted `AuditLog` columns and indexes,
   so the baseline build runs against it unchanged, as the runbook's _Rolling back_ section says. Never reverse the migration: that
   loses the audit rows written since. Whether `prisma migrate deploy` tolerates the unknown
   migration is to be verified in P04 (PF-14).
2. **Verification:** `/healthz` and `/readyz` as in the runbook. The runbook's smoke test is also
   audit-branch only (`git show 319d06d:infra/scripts/smoke-test.sh`), and it expects the
   audit-branch endpoints `/api/v1/audit/facets` and `/api/v1/audit/sink`, which the baseline does
   not serve. Expect those checks to fail against the baseline.

On a **fresh** host or database the baseline deploys with the runbook unchanged, `db:deploy` included.
Going from the baseline back to the audit branch is an ordinary deploy of `319d06d`.

---

## Resuming (read this first in a fresh session)

1. **Get oriented**
   ```bash
   cd /home/user/SPOH_2027
   git fetch origin && git status          # be on the working branch named in progress.json
   node remediation/tools/progress.mjs status
   ```
2. **Read, in order:** this file → `DECISIONS.md` (check nothing you need is still open) →
   `standards/engineering-standards.md` → the current phase file (its **Context for a fresh
   session** section first, then the current step).
3. **Bootstrap the environment** if `node_modules` is missing. See [Environment bootstrap](#environment-bootstrap).
4. **Work one step at a time:**
   ```bash
   node remediation/tools/progress.mjs start P06.3
   # … do the step, run the phase's verification commands …
   git commit -m "refactor(station): …" -m "Remediation-Step: P06.3"
   node remediation/tools/progress.mjs done P06.3 --commit $(git rev-parse --short HEAD) --note "what changed"
   git add remediation/progress.json && git commit -m "chore(remediation): P06.3 done"
   git push -u origin <branch>
   ```
5. **At the end of a phase:** fill in the phase file's **Phase report** section, snapshot metrics to
   `reports/metrics/<phase>.json`, run `progress.mjs done P06`, commit, push, then tell the owner
   the phase is done and that this is a good moment to clear context.
6. **Never** start a phase whose dependencies are not `done`, never pass G1 without the owner's
   recorded sign-off, and never change behaviour in P06/P07.

If `progress.json` and the git history disagree, trust git: inspect the commits carrying the
`Remediation-Step:` trailer (`git log --grep "Remediation-Step"`), then correct the JSON.

---

## Environment bootstrap

This cloud container has **no Docker daemon**. Postgres 16 binaries are installed. The project targets
Postgres 17, and the full suite passed on 16 at baseline.

```bash
cd /home/user/SPOH_2027
npm ci
npm run build:shared
cp -n server/.env.example server/.env
cp -n client/.env.example client/.env.local
(cd server && npx prisma generate)

# Local Postgres on :5435 (matches server/.env.example); idempotent, initialises on first run
scripts/dev-db-local.sh start
```

Checks (all green at baseline apart from lint, see `baseline.md`):

```bash
npm run lint && npm run typecheck
npm run test:unit --workspace server          # 233 at baseline
npm run test:integration --workspace server   # 288 at baseline, creates spoh2027_test itself
npm run test --workspace client               # 19 at baseline
node remediation/tools/code-metrics.mjs       # refactor debt (raw line counts)
npm run arch:report                           # guard counts per rule (size + boundaries)
npm run arch:check                            # every boundary violation
```

End-to-end tests use the pre-installed Chromium. Playwright 1.62 pins a newer build than the one in
`/opt/pw-browsers`, so point it at the installed binary. Never run `playwright install`.

```bash
(cd server && npm run db:deploy && npm run db:seed)        # never db:reset: Prisma blocks it for agents
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY npm run dev &   # API :4010, client :3000
CI=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e --workspace client
```

AWS credentials are present in this container's environment. Audits (P00, P04) use them
**read-only**. Nothing is created in AWS before P08, and only after G1.
