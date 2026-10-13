# P15 accepted; P16 next — 13 October 2026

Work only in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`.
Inherited cwd may be forbidden sibling V1: supply V1-main explicitly to every
command and use absolute edit paths. Preserve all tracked/untracked/staged
changes. No reset/clean/pull-over-edits, new checkout, feature branch, PR or tag.

## Accepted source and actual evidence

P14 remains accepted at `3bff8f868d1c8ac2510bff749d3f205e56ae36cd`,
CI38243217914 all five jobs green. P15's entire preserved batch was pushed
directly to main as `34fcb94dd60123408d31c6bf5d0db10cfb8adac2`
(373 files). CI38389769447 failed only the existing Unicode PDF inspection's
five-second deadline. The bounded two-test correction was pushed as
**`14baa68c2e947c4cdfee376f1e33aca6c1030b5e`**; every assertion and coverage
floor is retained. **CI38398631231 all five required jobs passed** at
`2026-10-13T13:02:37Z`.

The corrective Node24.19.0/npm full local gate ran all 27 steps without resume
and completed actual 0 at `2026-10-13T12:36:11.0926570Z`: server3801,
client1214, shared348, policies158, infrastructure128 = **5649 passed**, plus
two existing skips. All builds/guards/migration/audit/secrets passed; actual
staged scans were reviewed separately. Raw full coverage/LCOV and exact CI
evidence are preserved privately in `.local/`. Floors: server96.67/88.09,
client79.85/71.56, shared94.38/87.40 lines/branches. No lowered floor.

P15.1–P15.10 and phase P15 are done **as build work under ADR-011 §5**.
G4 is factually reconciled with accepted P13/P14 source; no owner UX sign-off
is invented. Tracker: 15/17 phases complete, 160 done plus three historical
skips of174 steps. P12.8, G3/G5 and production go remain held. P16 has no
accepted step at this checkpoint. Use the tracker and current git status for
subsequent P16 authoring, rather than treating this dated checkpoint as live.

Read the [delivery report](P15/delivery-2026-10-13.md),
[chronological evidence](P15/build-2026-10-12.md),
[manual review](P15/security-review-2026-10-13.md),
[ASVS register](P15/asvs-review-2026-10-13.md),
[identity runbook](P15/identity-recovery-runbook.md),
[operations runbook](P15/security-operations-runbook.md) and
[data map](P15/data-map.md). The 12 October handoff/source plans remain history;
their unfinished P15 source checklist has been implemented and tested. The
separate restored-operator path fixes deleted-pool administrator trust-root
recovery, with exact owner-reviewed existing authority and atomic invalidation.
No real recovery/reinvite ran. `/security-review` was unavailable; no new
independent audit, blanket ASVS L2 or zero operational High risk is claimed.

## Continue P16 in order

Read ADR-011, P16 phase, AWS teardown, decisions/standards, and client/AGENTS
plus the installed Next16 docs before client changes. FIRST repair the
inventory tool's `inventory_test` URL and historical P06 default overwrite;
retire/guard the obsolete P04 source parser without rewriting P04 snapshots.
Reconcile every legacy browser/visual DB/port/setup guard before execution.
Several still permit other `_test` databases, local sign-in or SQL fixture
promotion. Mocked UI specifications are not real provider/staging proof.
Legacy load scripts load `.env` and mint JWTs: do not use them as P16 proof.

Then recreate authorized lean staging: bootstrap → Spoh-DeployAccess → stacks
and accepted image. Keep dispatch-only deploy/infra/browser triggers until
actual acceptance. Use fresh synthetic fixtures, real HTTPS/Cognito and exact
source/build/policy/case attestations. Never truncate staging, restore real
data or use a fake JWT/dev-sign-in as operating proof. Order:
**P16.10 granular API → P16.1 browser/visual/regression → P16.8 deferred
acceptance → P16.9 actual24-hour soak → P16.2 load → P16.3 drills → P16.4
timed restore → documentation/readiness/closure.** Do not mark generated case
intent or a launched process as executed success.

The user delegated controlled synthetic test inbox/aliases: “errm up to u”.
Choose a controlled inbox with actual receipt access; preference is settled,
but no inbox/address/provider account was selected or created yet. Do not use
an uncontrolled public mailbox or send invitations to real people.

## Runtime and retained gates

Prepend `$PWD\.local\node24-bin` and
`C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`
to PATH. Use Node24/npm only; TEMP/TMP = V1-main/.local/tmp. For every local
Prisma/generator/test operation set both DATABASE_URL and TEST_DATABASE_URL
to `postgresql://spoh:spoh@localhost:5435/spoh2027_test`, SPOH_SKIP_DOTENV=1.
Only that pre-existing local DB is permitted; no shadow or other test database.
CI uses the same name on5432. P15 migration is already applied, 51 migrations.
DB suites remain serial. Complete gate:
`& 'C:\Program Files\Git\bin\bash.exe' .local/ci-local.sh` without arguments.
Bare bash resolves broken WSL. Actual completion/exit is required.

D-11: stage the whole coherent batch, secret-scan/review, immediately inspect
`git diff --cached --stat`, commit every staged file directly main and push.
Watch exact application-SHA CI with private helper
`node .local/github-exact-ci-status.mjs <fullSHA> --jobs`; gh is absent.
Later docs-only success cannot accept earlier code. Tracker CLI:
`node remediation/tools/progress.mjs`. Never publish `.local` secrets, private
backups, logs, personal data or tokens. No AWS/browser action occurred before
P15 acceptance.

D-10 remains US$100/month staging+production, no ephemeral dev stack; only
January2027 allows US$130/Plus/Multi-AZ/WAF. Reconcile new monitoring/audit
ingestion before recreation and measure actual cost. No SES, default Cognito
sender, pool-wide50/day invitation allowance. Paid detectors/current WAF,
production creation/cutover, irreversible real data, real restored-person
recovery/reinvite and retirement retain owner gates. P12.8 and28October go/no-go
are held. Frozen DB reports have no purge deadline/indefinite-retention approval;
provider/backup/S3-header/ASVS residuals remain explicit P16/owner work.
Do not retire aliases until seven days after actual event closure. Keep updates
short and continue authorized work without repeating settled preferences.
