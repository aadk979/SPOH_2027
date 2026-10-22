# SPOH 2027 agent entry point

Read these first:

1. [Current event release plan](docs/EVENT_RELEASE_PLAN.md) — owner-approved launch scope, 22 October 2026 (D-25 / ADR-012).
2. [Current handoff](remediation/reports/HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) — actual source, tests, blockers and next actions.
3. [Continuation prompt](remediation/reports/TAKEOVER-PROMPT-2026-10-22.md).

The current chat's user instructions take precedence. For launch policy, the 22 October amendment supersedes conflicting older ADR-009/010/011 criteria, phase checklists, tracker notes and .local handoffs. Historical files remain evidence of what happened; their requirement lists are not current launch gates. The five gates E1–E5 define readiness for this short event. Do not resume the 5,043-obligation ledger campaign as a prerequisite to browser testing or launch. Preserve the ledger; do not mark unexecuted work passed.

## Workspace and preservation

- Work ONLY in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`. Every shell explicitly uses that workdir. NEVER inspect/touch sibling V1, regardless of inherited cwd.
- No delegation, branches/worktrees/PRs, reset, clean, amend or partial commits. Delivery is one coherent direct-main candidate. Do not commit/push/deploy merely to document this amendment.
- Preserve the original eleven staged summary-day candidate files byte-for-byte until deliberately revised with appropriate tests. This documentation task authorizes the additional documented Markdown/tracker delta. An old clean-tree/exactly-eleven-total-files guard is superseded for those document changes, not arbitrary source changes.
- Preserve old hash-bound evidence/controllers. Use `.local/p16-event-release-documentation-v1-20261022.json` for document preimages/postimages and `.local/p16-event-release-preservation-v1-20261022.mjs` for the amended working-copy guard. Do not rewrite the old freeze or historical outcomes.

## Execution boundaries

- CI-first testing is permitted: focused local checks and exact candidate review, one coherent main push, full exact-SHA CI with its isolated PostgreSQL 17 service, then staging only after CI succeeds. Local Docker/Whole29 before the push is not a launch prerequisite. Do not weaken CI, coverage floors, DB guards, auth or lifecycle rules.
- Original seven identities/private profiles and five retained staging fixtures only. No new invitations/identities, password resets, MFA enrollment, forced expiry/early renewal, fixture/lifecycle mutation, real-data/source SQL, new paid resources or resizing without applicable explicit authority. Narrower launch scope does not grant those actions.
- USD125 ceiling, full USD75.26332 reserve, USD0.22 retained allocations, USD50 alert. Last actual cost/runtime observations are from 21 October and stale on 22 October. Recheck actual eligibility within an authorized finite scope before cloud work; old receipts do not create a live campaign.
- Production creation/cutover, real identities/data and outward messages retain owner authorization. Keep the 28 October 2026 owner decision date. Do not send messages to others.
- Actual native exit codes only; null/missing is UNKNOWN. Preserve failures/partials. Never print credentials, cookies, MFA, private sessions, raw business bodies or data-font URLs.
- Node24.19/npm11.11; PATH begins workspace `.local/node24-bin` then `C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`. TEMP/TMP use workspace `.local/tmp`. Local DATABASE_URL and TEST_DATABASE_URL are `postgresql://spoh:spoh@localhost:5435/spoh2027_test`; SPOH_SKIP_DOTENV=1. CI uses only its job-isolated localhost5432/spoh2027_test. Tests never touch dev/staging/production data.
- Finite unique controllers at most60minutes; hidden background helpers. No elevation, WSL shutdown, factory reset, volume deletion or global/display/lid power changes. Earlier socket deletion was rejected by automatic approval review as “blocked by policy”; no alternate-tool bypass.

Report actual defects/journeys and E1–E5 states. Checklist closures, documents, historical green CI and plan-only exit0 are not new functional acceptance. Reuse unchanged evidence after source-applicability checks. Stop repeating unchanged Docker timeouts or large historical reports; continue concrete eligible work.
