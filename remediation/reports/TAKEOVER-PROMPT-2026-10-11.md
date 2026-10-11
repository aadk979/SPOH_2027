Continue the SPOH 2027 remediation programme until every feature is built, then
run the verification campaign. Work ONLY in
`C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`; never inspect or modify sibling
`V1` (unfinished merge), even if the inherited cwd points there. D-11 authorizes
verified commits and pushes directly to main.

Read first, in order: `remediation/reports/HANDOFF-2026-10-11-TAKEOVER.md`,
`docs/adr/ADR-011-build-first-verify-after.md`,
`remediation/reports/P08/aws-teardown-2026-10-10.md`, then the remediation README
resume protocol, DECISIONS.md, engineering standards, current phase and
client/AGENTS.md. Check git log, git status and
`node remediation/tools/progress.mjs status` before editing. Older handoffs are
history. Preserve the dirty/staged checkout; do not pull/reset/clean it.

Immediate state: main/origin/main remain 126b8f3. Foundation/P13 source is built
and staged (374 files before takeover docs), but NOT committed or pushed. An
earlier full run was green; the final print/history repair came afterwards and
needs its own gate. Full CI session 12120 started 04:52 UTC on 11 October and was
still running at the handoff. Inspect private logs
`.local/ci-local-20261011-p13-print-final.log` and
`.local/ci-local-20261011T0452Z.log`; avoid a second DB suite or source mutation
until it finishes. Confirm the actual exit code. Known failures: a type-only
cycle cardPrintLayout -> renderCards -> cardPrintLayout, and one oversized-grid
cardPrinting unit case (final diagnostic pending). The handoff gives recommended
grouped repairs and exact completed focused-test evidence. Do not treat the
older green run as verifying these latest changes.

ADR-011/D-23: large batches; source with only lint/typecheck, then authored/touched
suites, then ONE complete local `bash .local/ci-local.sh` under Node 24, judged by
exit code, then ONE push and exact-head GitHub CI green. Concrete failures justify
a grouped repair/repeat; never run full CI per feature or lower coverage floors.
Before committing run `git diff --cached --stat`: every staged file is included.
`gh` is absent; use GitHub REST for aadk979/SPOH_2027 and exact pushed head_sha.

Environment: prepend V1-main\.local\node24-bin AND
`C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`.
Verify node and npm child runtime are Node24.19.0. Bare bash is broken WSL: use
`& 'C:\Program Files\Git\bin\bash.exe' .local/ci-local.sh` with no skip/resume
arguments. Docker spoh2027-postgres is localhost:5435. Tests use ONLY
spoh2027_test. Every Prisma command needs explicit
DATABASE_URL=postgresql://spoh:spoh@localhost:5435/spoh2027_test and
SPOH_SKIP_DOTENV=1. Never migrate/reset/seed real spoh2027. `.local/` contains
secrets/personal data: never commit or share it.

After current local/GitHub gates, reconcile code-complete P08/P10/P12.1/.7/P13
steps and reports. P12.2 follows D-08 (no SES); P12.8 retains owner approvals.
Next build the entire P14 batch, then P15. Detailed P14/P15 plans and policy
review are untracked/unstaged in their report directories, with NO P14/P15 source
built yet. Keep those future plans out of the current application commit. Follow
the concrete policy/link corrections in workspace-policy-review, not stale plan
assumptions. Use disjoint subagent lanes where useful; root owns central schema,
contracts/exports, app wiring, scheduler/nav and shared dependency lockfiles.

AWS remains torn down; nothing deploys during feature builds, and deploy/infra/
browser workflows are dispatch-only. Staging/soak/load/owner criteria go to P16.8
while code closes on green CI. After ALL feature builds, recreate authorized
staging and run ADR-011 §7 order: granular API P16.10, full regression P16.1,
deferred acceptance P16.8, 24-hour soak P16.9, load P16.2, drills P16.3, restore
P16.4, then remaining report/handover gates. Reconcile old browser ports/test DB
guards before executing. Region ap-southeast-1; Git Bash aws logs needs
MSYS_NO_PATHCONV=1.

Production creation, cutover, live-site rebuild and actual restored-person
recovery wait for the owner, including 28 October go decision. Ask only about
money, production, unrecoverable data and open product rules; otherwise take the
documented recommendation and record assumed. D-10's baseline has no WAF. Keep
updates short and plain. Persist through all remaining authorized work; do not
stop with a partial report or merely offer to continue.
