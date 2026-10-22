# Admin batch continuation — 11 October 2026

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


Status while the last card-print criteria are being completed. This is newer than the
10 October evening handoff. It does not claim a verified commit or phase closure.

## Workspace and delivery

- Work only in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`. The inherited
  desktop working directory is sibling `V1`; never use it.
- `main` and `origin/main` remain `126b8f3`. The complete foundation/admin batch
  is staged; no new commit or push has been made by this continuation.
- ADR-011/D-23 apply: large build batches, affected suites, full Node 24 local
  CI, then one application push and exact-head GitHub CI. Floors stay unchanged.
- Prepend both `.local/node24-bin` and the owner's Node 24 runtime. The wrapper
  is needed because the installed Windows npm launcher otherwise runs Node 25.
- Docker tests use only `spoh2027_test` on port 5435. Every Prisma command needs
  the test `DATABASE_URL` and `SPOH_SKIP_DOTENV=1`. Never touch real `spoh2027`.
- AWS remains deleted. Deploy/infra/browser workflows are dispatch-only;
  production creation, live rebuild and cutover retain owner approvals.
- `.local/` stays ignored and contains secrets/personal data. Never commit it.

## Built in the staged batch

The interrupted agent's foundation changes were preserved: scheduler reminders,
lifecycle/report schedule producers and cancellation, CloudWatch audit copying,
owned Cognito pools and the dispatch-only browser workflow. Audit shipping now
handles CloudWatch byte/span limits, oversize rows and HTTP-200 partial rejection.

P13 now has station types/tags/categories/templates/exceptions/day removal,
gift administration, private PDF/ZIP card printing, assignment/import/escalation
board, swaps/withdrawal, briefing slots, recent-record corrections, incident
follow-ups, filtered audit and guided close-out/archive/clone. Strong structure
changes recheck current authority and phase under transaction locks; new writes
have retry receipts. Migrations add audit shipment, card print export and immutable
historical print membership/rendering context.

The route-to-client inventory also required separate counts/data-health views,
explicit physical card issue, private found-item photo viewing, frozen report
history/downloads and manual retained visitor-value reads. Counts caches are
partitioned by person and unmounted on permission loss. Visitor values are
discarded on hide. Runtime asset callers and duplicate read projections are
documented exceptions in `clientRouteCoverage.test.ts`.

Browser specs are authored for structure, staffing, corrections and close-out
at phone/laptop sizes. They have not been executed; P16.1 owns that campaign.

## Validation currently known

- Global lint, all workspace typechecks and architecture checks passed before
  the full run. Structure/admin, staffing, printing, gift, recent-correction and
  inventory focused server suites passed after their fixture fixes.
- Focused client suites passed: structure/corrections/close-out/audit, stock and
  printing, counts/card issue, private records and snapshot history.
- Full runner started 03:15 UTC / 11:15 Singapore on 11 October, via
  `bash .local/ci-local.sh`; its stdout log has the `20261011-p13` suffix and
  detailed step log the `20261011T0315Z` timestamp. Read exit codes, not silence.
- Full run has passed install/build/generated checks, lint/typecheck/client
  build, architecture/hardcoding, test-only migrations, shared and policy tests.
- **CDK failed two 30-second synth timeouts** in `httpMonitoring.test.ts` and
  `operationsMonitoring.test.ts`; 102 assertions passed. No actual assertion
  failure was reported. Limit synth workers (recommended two) and rerun the CDK
  suite after the full run finishes. Do not weaken assertions or coverage.
- The full run finished **exit 1** at about 11:42 Singapore. Server tests had
  four failures among 2,971 tests: station/day/gift create fixtures still used
  LIVE, and the raw swap fixture omitted membership IDs. The lock assertions
  stay intact; the fixtures are being repaired in the structure lane.
- Client tests had four navigation-registry failures among 875 tests. Four
  registered screens lacked composition pages (audit, corrections, incidents,
  close-out), and three expected navigation lists need their intentional new
  entries. The client lane is repairing these.
- Coverage files were absent because failed suites suppress reports by default.
  Root enabled `reportOnFailure` in both app configs; floors are unchanged.
- Dependency audit and secret-history passed. Staged secret scanning found two
  generic-api-key false positives in random test receipt UUIDs. Those were replaced
  with obvious valid fake UUIDs, without a broad scanner exception.
- Root capped CDK synth workers at two; all 104 focused infrastructure tests passed.
- **The repaired full run started 03:44 UTC and finished exit 0.** Its detailed log
  is `.local/ci-local-20261011T0344Z.log`; the stdout log has the `p13-final` suffix.
  Server: 2,969 passed, two existing skips, 236 files. Client: 881 passed, 95 files.
  Coverage lines/branches: server 96.79/87.75%, client 79.22/71.73%, shared
  93.17/82.19%. Every floor and both secret scans passed; floors were not lowered.
- Final review found print criteria missed by that green code: archive downloads
  used a Write permission; exact selection metadata, event/batch labels and
  stamping-station labels were absent. The source is now unfrozen for one grouped
  print repair. It uses `Report.Export`, selected-card locks and frozen rendering
  metadata, with bundled OFL Noto fonts for Chinese/Latin/Tamil labels. The additive
  migration is applied only to `spoh2027_test`; production/AWS remain untouched.
  Its focused suites and final full run are still required before the application
  commit/push. Do not treat the earlier green run as verification of these changes.
- The grouped print suites passed 11 units and 22 integration cases, including
  authority revocation, issue/print ordering, immutable context and upload/SQL rollback.
  Independent Poppler rendering then found invalid embedded CJK CFF subsets: logical
  extraction passed while Chinese glyphs displayed boxes. The repair replaces that
  asset with pinned Noto Sans SC TrueType at regular weight and adds embedded-glyph
  checks. A mixed-width wrapping invariant also needs its focused regression. The
  synthetic multilingual fixture and renders remain ignored intermediates.
  All four synthetic pages subsequently rendered correctly with no Poppler warnings;
  the new embedded-glyph regression and wrap regression pass among 12 focused units.
  A final documented gap is being closed in the same grouped print repair: saved
  exports need a list/detail/download view after navigation or refresh, including
  Report.Export readers without generation permission. The scoped API/contracts
  pass lint/typecheck. The grouped server print suites pass all 140 assertions after
  adding both history routes to the cross-event inventory; 36 focused client and four
  shared contract assertions pass. Phone/laptop stock and print browser journeys are
  authored but not executed. The final complete CI run is now the remaining local
  gate before this application's commit/push; no P14 source edits should run alongside it.

## Next work

1. Finish the grouped print repair and affected suites, then establish a
   green exit code before committing. Review `git diff --cached --stat` immediately
   before commit because every staged file is included. Watch the pushed SHA
   through the GitHub REST API; `gh` is not installed.
2. Fill foundation/admin reports, reconcile P08/P10/P12.1/.7 and P13 build
   closures only with green code CI evidence. P12.2 is the recorded D-08 reduced
   implementation; P12.8 remains the owner's 28 October go/no-go/cutover.
3. P14 has real remaining code. Prepared lanes (no source edits started):
   - Root: entity detail homes, filtered record drill-downs and global search.
     Use static-export-friendly `/entity?kind=...&id=...` and `/records?kind=...`
     query routes, preserving event date/rehearsal/station/person/category/stage.
     ImportBatch currently has no durable links to imported capture rows or its
     fallback window. Add explicit scoped provenance for new imports; never
     pretend timestamp/source coincidence is an exact historical relationship.
   - Client lane: dashboard links, shared states/confirmations/toasts, glossary
     and admin control help. Coordinate shell/provider/nav changes with root.
   - Notification lane: durable private centre and read state, preferences,
     transactional producers and retention; defaults urgent only. Include
     fallback/archive reminders and platform-only archive recipients safely.
   - Branding lane: existing branding JSON, approved S3 assets, public manifests,
     runtime/static HTML metadata, shell/sign-in/TV and frozen exports.
     Send BUILD only after the current application batch is verified and pushed.
4. P15 still needs shared Postgres rate limiting, actual static-export CSP hashes,
   expanded isolation/authority regressions, alarms/nightly staging verification,
   deployed dual-key rotation wiring, restored-pool reprovisioning tool, data map
   and ASVS/full-baseline review. Legacy card generate/void/reissue still need
   current authority, row locks and durable receipts in that security batch.
5. Only after all feature builds close, recreate authorised staging and run P16
   in ADR-011 §7 order. Ask only at actual cost/production/irrecoverable-data/open
   product-rule boundaries. Never claim staging, soak, load or owner sign-off
   from green local or GitHub unit/integration CI.

Read git log and `node remediation/tools/progress.mjs status` before editing;
this note is a checkpoint and may be superseded by later commits/results.
