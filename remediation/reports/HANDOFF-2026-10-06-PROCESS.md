# SPOH handoff — 6 October 2026: faster delivery process

## Authority and scope

The owner instructed: "fix the process and implement the new and give a prompt to
give the next core agent to continue." The delivery changes in
[ADR-010](../../docs/adr/ADR-010-delivery-process.md) are authorized. This handoff
supersedes old delivery cadence, orientation and no-subagent instructions. Product
scope, correctness, data protections and production approvals remain intact.

Work only in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`, even if the chat
starts in sibling V1. Leave V1 unchanged. D-11 permits verified commits/pushes to
main with step trailers. No reset, clean or overwriting unexpected drafts.

Read this file, ADR-010, current progress, decisions/standards and the relevant phase
and implementation reports. Use historical handoffs only when a concrete feature
requires their detailed constraints. Read client/AGENTS.md and the relevant installed
Next.js guide before client edits.

## Current product checkpoint

- Tracker: 105/171 steps closed (102 done, three skipped), nine of 17 phases closed.
  P00–P07 and P09 done; P08/P10 open; current P10.8. G0–G2 passed, G3–G5 open.
- Before this process change, main/origin/main matched
  `76960c415ec8305a0680f417d925391688269950`. Staging's accepted application image
  was that exact release on task revision 132; its application source matches the
  previously accepted catalogue restore source. Check current Git/cloud facts on resume.
- Normal Cognito login/reload/sign-out, announcement and capture scheduling, and
  generated settings read/history/restore were accepted. Do not reimplement them.
- Generated catalogue editing and text normalization remain **uncommitted**.
  Preserve all inherited client/settings, generated/shared, registry-test and
  generator changes plus `P10/operational-catalogue-edit-ui.md`.
- Current editor evidence: 595 client checks, 2,309 server checks with four existing
  skips, 178 shared checks and unchanged coverage floors; final static/CSP and
  workspace type checks passed. The combined browser run passed 19 journeys,
  including all eight new editor journeys, and failed one existing phone/station
  restore journey with HTTP 429 responses. This failure is unresolved acceptance,
  not an excuse to ignore rate limiting or mark the feature done.
- Logs: `.local/catalogue-edits-browser-first-20261005.log`,
  `.local/catalogue-edits-final-workspace-types-20261005.log`, and the detailed editor
  report. Playwright trace/error context remain under client/test-results. Editor
  visuals and exact staging acceptance remain unfinished. The previous run ended
  at its usage limit, not an owner-controlled blocker.

## Continue by usable milestones

1. **Finish the retained settings editor.** Diagnose the phone restore's 429 trace
   and fixture cleanup; rerun affected browser checks first. Complete reviewed
   visual acceptance, required checks and one source/tracker push. Full CI and one
   exact-image normal Cognito staging acceptance gate the milestone. A later evidence
   commit uses the lightweight documentation path, retaining the accepted source SHA.
2. **Advance prerequisites in parallel.** Independently review/implement P08 pipeline,
   cost or observability work, P11.1–P11.3 using the existing Cedar bench, and P13.6
   readiness contracts/item evaluators. ADR-010 records the narrowly authorized
   tracker start override; do not force completion or bypass owner decisions.
3. **Finish remaining operational behavior.** Broader scheduling, legacy runtime
   consumer migration, lifecycle/readiness and archive/retention dependencies stay
   visible. Avoid another generic framework; use the approved registry, scheduler,
   guarded writer and existing transaction core.
4. Complete actual policy/enforcement and identity prerequisites, then remaining
   admin/UX/security/final readiness. Keep the approved G3/go-no-go milestone separate
   from later polish and formal post-January programme closure. No feature is silently
   dropped and no unsupported finish date is promised.

The core agent assigns non-overlapping file ownership and is the sole Git/cloud
coordinator. Shared database/browser suites and generated outputs cannot be written
concurrently. During implementation use affected checks; reuse evidence only when
its inputs are unchanged. Never lower floors or waive a failure to obtain speed.

## Runtime and owner boundaries

- Prepend Node 24 from
  `C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`.
- Inspect Docker and actual listener/process state before recovery. Preserve the
  original `v1_spoh-pgdata` volume and recoverable runtime quarantines.
- PostgreSQL localhost:5435. Never reset, seed or migrate real local `spoh2027`.
  Integration: `spoh2027_test`; E2E: `spoh2027_rehearsal_shift_e2e_test`; visual:
  frozen `spoh2027_visual_test`. Run shared-DB/browser suites serially; no build or
  Prisma generation during them. Restart visual API before full visual checks,
  review baseline changes, then restore the normal preview.
- Preview launchers `.local/e2e-api.ps1` and `.local/dev-client.ps1`; expected
  ports API4012/client3001. Inspect actual processes before stopping anything.
- Staging credentials in ignored `.local/staging-smoke-identity.json`; never print
  or commit them. Use legitimate, bounded fixtures and normal Cognito workflows.
- Preserve current authority checks, scope isolation, reviewed versions, stable retry
  intent, event-first lock ordering, private receipts, purge guards and fail-closed
  lifecycle/readiness behavior.
- Owner accepted installed Chrome instead of actual iOS Safari. External device
  delivery and production Firebase/session behavior remain unverified.
- Production creation/cutover requires the 28 October go decision; existing Lightsail
  stays protected. Real Cognito-pool changes and scaling dates retain their approvals.
  No Route53/ACM/SES. Ask for alarm/budget email or Firebase IDs only when needed at
  actual deployment; do not block independent work on future inputs. Production
  sessions must work without third-party refresh cookies.

## Process rollout verification

Local verification passes 24 isolated-Git delivery safety tests, focused ESLint,
formatting, tracker validation, whitespace checks and redacted secret scans. All
18 inherited editor files match their original SHA-256 fingerprints. Tests cover
mixed/multi-commit ranges, runtime-to-doc renames, unknown inputs, missing/mismatched
evidence, release ordering and manual deployment fencing. The manual-conclusion
regression failed before the guard fix and passes afterward.

Actionlint 1.7.12 validates the rest of both workflows but predates GitHub's documented
`queue: max` property. A temporary copy omitting only that property passes lint.
GitHub accepted the actual retained-queue workflow and executed its jobs successfully.

Process source commit `75ceb60d0954b635668d783b1dbcc04f7ae5b2db` is pushed to main.
[Full CI 37342645280](https://github.com/aadk979/SPOH_2027/actions/runs/37342645280)
passed all five jobs: classification/tracker, lint/types/build, tests/coverage,
architecture/hardcoding, and dependency audit/secret scan. No application gate
was lowered or omitted.

Documentation probe `facd9143db56a24c4a41acbce7f36e5a5a252b0b` was pushed while
source CI was running. Its
[CI 37342816751](https://github.com/aadk979/SPOH_2027/actions/runs/37342816751)
passed in 27 seconds, retaining delivery tests/tracker checks and secret scanning
while all three expensive application jobs were skipped. Its
[release check 37342876706](https://github.com/aadk979/SPOH_2027/actions/runs/37342876706)
passed in 13 seconds with image and migration/deployment jobs skipped. Source CI
continued and passed, proving the docs push neither cancelled it nor stole its release.

The application
[deployment 37343472764](https://github.com/aadk979/SPOH_2027/actions/runs/37343472764)
selected the accepted source and built its image despite main advancing through
documentation. Migration, service movement and smoke passed at **00:55:55 Singapore
on 6 October**. CloudFormation is UPDATE_COMPLETE with the exact source image;
the sole running task is revision **133**, RUNNING/HEALTHY with image tag
`75ceb60d0954b635668d783b1dbcc04f7ae5b2db` and digest
`sha256:efe4ee9446decf486c66b313950aae8667b177a703ad0a5276343a2d91911aed`.
A workflow_run's own head_sha can be the newer docs commit;
verify the triggering CI head and actual release image rather than that field alone.

The sanitized [rollout evidence](P08/staging-delivery-process-evidence-2026-10-06.json)
records these observed results. Application server/client/shared source is unchanged
from the preceding accepted product checkpoint; no editor staging acceptance is
claimed. All 18 inherited editor drafts remain byte-identical. Product steps and
G3–G5 remain open. Later evidence/main commits need not redeploy this image.
