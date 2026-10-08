# ADR-010 — Delivery cadence and prerequisite sequencing

| Field      | Value                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | Accepted by the owner's 6 October 2026 instruction to fix and implement the faster process                                                                  |
| Applies to | Remaining remediation delivery, CI and staging; product scope and production approvals remain                                                               |
| Supersedes | Whole-phase start ordering and repeated deployment of documentation in the resume protocol; historical no-subagent restriction for bounded independent work |

## Context

Each main push previously ran the complete application checks and then built,
migrated and deployed staging, including documentation and acceptance evidence.
The generated catalogue editor's latest full backend measurement alone took
605.89 seconds. Separate evidence pushes repeated the delivery cycle without
changing the accepted application.

Whole-phase ordering also has a dependency knot: P11 depends on P10, while P10's
LIVE/archive acceptance needs later policy and P13.6 readiness work; P13 itself
depends on P10, P11 and P12. These are dependencies between concrete capabilities,
not a reason to hold all policy/checklist implementation until P10 closes.

## Decision

### Checks and deployment

- Main pushes and PRs classify the complete comparison range. A narrow allowlist
  covers root onboarding/README, Markdown under docs/remediation, tracker metadata
  and specifically named sanitized staging evidence JSON. Pricing artifacts,
  coverage floors, code, tests, workflow/configuration and unknown paths require
  full CI. Missing history requires full CI too.
- Every run retains delivery safety tests, tracker validation, whitespace checks
  where the comparison is available, and the existing secret scan. Full runs retain
  lint/types/build, package coverage with unchanged floors, architecture/hardcoding
  guards and dependency auditing.
- Automatic staging releases require successful main push CI from this repository
  and a range/head-bound classification artifact. Docs-only runs do not build,
  acquire AWS credentials or enter the deployment queue. Missing or mismatching
  acceptance evidence prevents automatic deployment.
- Main CI is isolated by commit SHA, so docs cannot cancel outstanding code checks.
  Eligible cloud deployments are serialized with a retained pending queue.
  Before cloud mutation, source ancestry and the current staging image are checked:
  documentation after a source release is allowed; newer application changes,
  identical/obsolete releases and divergent histories cannot cause an automatic
  rollback. Explicit manual deployment/rollback retains its existing path,
  including releases predating these helpers.
- A pending manual deployment holds automatic releases. Completed manual deployments
  (including failed attempts, whose partial effects need recovery) fence automatic CI
  already in flight; cancelled/skipped intents do not. Under the deployment lock,
  repository history is compared with the triggering CI's creation timestamp. Missing
  history fails closed. Later accepted application work can deploy normally; a docs
  push cannot resume an older fenced release.
- Record acceptance against the tested source SHA and deployed image. Later docs
  may advance main without changing that image. Do not create a fresh application
  release merely to make a documentation SHA match staging.

### Implementation cadence

- Choose a usable feature milestone with explicit acceptance criteria. Keep logical
  commits green, prepare related changes and tracker notes together, and push a
  verified milestone once. Do not push after every preparatory edit or log entry.
- During iteration, run affected checks first. Before release, run required affected
  browser/visual/security checks and the full CI gate. Reuse unchanged full-package
  measurements and deployed evidence when their inputs and prerequisites are
  unchanged. Refactors retain the existing full before/after requirement.
- After a failure, diagnose and rerun the failing/affected checks first. Repeat a
  broader gate when a repair changes its inputs, a run was invalid, or an unresolved
  regression justifies it. Never accept the failed run or lower coverage floors.
- Independent workers may review or implement non-overlapping modules. The core
  agent coordinates file ownership, generated outputs, Git commits and cloud work.
  Shared-database integration suites and browser suites stay serial; builds/Prisma
  generation cannot run beside those suites.

### Prerequisites and completion

P11.1–P11.3 may start from the accepted P05 Cedar bench, completed P09 model and
P10 settings/cache/scheduler contracts before all P10 exit criteria close.
P13.6's server readiness contract and item evaluators may similarly advance to
unblock P10 lifecycle work. Read the relevant ADRs and verify these concrete inputs
first. Use the existing tracker override only for these named prerequisite steps:

```text
node remediation/tools/progress.mjs start P11.1 --force --note "ADR-010 prerequisite work; P09 done and current P10 contracts reviewed; P10 and G3 remain open"
```

Use the corresponding step ID and verified prerequisite note for P11.2, P11.3 or
P13.6. The owner extended the list to P11.4 and P11.5 on 8 October 2026 (D-19): the
authorizer may be built and deployed unenforced, and the role grants stored and read,
before P10 closes. P11.5's enforcement still ships only after the owner approves its
release plan, because it changes who may do what. This is permission to start bounded dependency work, not permission to force
completion or bypass an open owner decision. Unavailable readiness evidence fails
closed; LIVE/archive guards and current authorization remain enforced.

P11 adapters/enforcement and subsequent P12/P13 integration start only after their
actual policy, lifecycle and identity contracts are ready. Keep partial steps,
phase exit criteria and G3–G5 open until verified. Scope is not deleted: retain the
approved staged G3/go-no-go milestone and later P13–P16 work. Production creation,
cutover, real-pool changes and post-event cleanup retain their existing boundaries.

## Verification and consequences

Dependency-free temporary-Git tests cover classification, complete push ranges,
source-to-doc renames, missing history, evidence mismatch and release ordering.
Workflow lint and a real full CI/deployment followed by documentation CI verify
the rollout. Deployment evidence is written to the latest handoff after observation.

Documentation acceptance is cheaper while application acceptance remains intact.
Separate main CI runs can use more runners if several code milestones are pushed
at once; batch pushes and independent implementation rather than repeated releases.
The retained deployment queue is bounded at 100 pending jobs and source ordering
is rechecked because dispatch order is not deployment order; see
[GitHub's concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
