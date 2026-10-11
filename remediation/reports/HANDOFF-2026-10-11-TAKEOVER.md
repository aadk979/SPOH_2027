# Takeover checkpoint — 11 October 2026

Owner requested a written handoff and another agent's prompt at about 13:10
Singapore / 05:10 UTC. Feature work stops at this checkpoint. The already-running
full local CI process is left running. This is the authoritative continuation
checkpoint; the evening handoff and ADMIN-IN-PROGRESS note are history.

## Read first and protect the workspace

Read this file, `docs/adr/ADR-011-build-first-verify-after.md`,
`remediation/reports/P08/aws-teardown-2026-10-10.md`, then the resume protocol in
`remediation/README.md`, `remediation/DECISIONS.md`,
`remediation/standards/engineering-standards.md`, the current phase and
`client/AGENTS.md`. Read git log and tracker status before editing. Do not restart
completed work from an older handoff.

- Work **only** in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`.
  The inherited desktop cwd is sibling `V1`, which has an unfinished merge.
  Set V1-main explicitly on every command; do not inspect or modify sibling V1.
- Branch `main`, HEAD and origin/main are `126b8f3`
  (`126b8f38c199411de8d8edaf4962908716cde780`). Previous application commit
  `6755db3` had green GitHub CI run `38056722817`; `126b8f3` recorded its twelve
  finished steps. This continuation made **no new commit or push**.
- The current foundation/P13 application batch is already staged: **374 files,
  20,268 insertions, 385 deletions**, before these takeover documentation edits.
  Preserve it. Do not pull over it, reset, clean, replace the checkout or invent
  a second worktree. `git commit` includes everything staged. Run
  `git diff --cached --stat` immediately before any eventual commit.
- D-11 authorizes verified commits and pushes directly to main. No PR/branch
  process is needed. ADR-011/D-23 require a large source batch with only lint and
  typecheck while writing, then authored/affected suites, **one full local run
  of every CI step**, one push and exact-pushed-SHA GitHub CI green. A concrete
  failure or missed requirement justifies a grouped repair and another full run.
  Coverage floors and assertions stay unchanged.
- AWS is torn down; nothing has been deployed or recreated. Deploy/infra/browser
  workflows remain dispatch-only. Deferred staging, browser acceptance, soak,
  load and sign-off criteria belong in P16.8. Green code CI closes build steps.
- Keep P12.8 owner approvals and the **28 October go decision**, production
  creation, live rebuild and cutover. P12.2 is recorded under D-08, not SES work.
  Ask only about money, production, unrecoverable data and open product rules;
  otherwise follow the documented recommendation and record it as assumed.
- D-10 baseline is approximately $100/month for staging plus production, without
  WAF. January Plus/WAF/Multi-AZ is an optional owner-controlled cost increase.
- `.local/` contains secrets and personal data. Never commit, upload or share it.
  Local log and synthetic rendering paths below are references for private local
  inspection, not artifacts to publish.

## Runtime and database

PowerShell example, always from V1-main:

```powershell
$env:PATH = 'C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main\.local\node24-bin;C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
$env:DATABASE_URL = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test'
$env:SPOH_SKIP_DOTENV = '1'
node -v
npm exec --no --call 'node -v'
```

Both Node and npm child runtime must be Node **24.19.0**. The local launcher
wrapper prevents installed npm from choosing Node 25. Docker container
`spoh2027-postgres` listens on 5435. Tests use **only `spoh2027_test`**; never
migrate, reset or seed real `spoh2027`. Every Prisma command must explicitly carry
the test URL and `SPOH_SKIP_DOTENV=1`, even generate/diff commands.

Bare `bash` resolves WSL on this machine and fails. The full command is:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' .local/ci-local.sh
$exitCode = $LASTEXITCODE
exit $exitCode
```

Use no resume/skip arguments: the gate is every CI step in one run, judged by the
actual exit code. Avoid parallel database suites while this runner is active.
AWS region is ap-southeast-1; future Git Bash `aws logs` commands need
`MSYS_NO_PATHCONV=1`. `gh` is absent. Read GitHub CI with the REST API for
`aadk979/SPOH_2027`, filtering workflow `ci.yml` by the exact pushed `head_sha`.

## Work preserved and completed in this continuation

The interrupted agent's foundation batch was preserved and repaired rather than
reimplemented. Detailed reports are
`BATCH-2026-10-11-FOUNDATION.md` and `P13/admin-build-2026-10-11.md`.

### Foundation and identity

- Open fallback reminders use the scheduler and an event setting (default
  30 minutes), stop when closed and reach the declarer/coordinators. After the
  late-sync grace, archive-ready reminders reach active organization platform
  admins. The remaining private periodic timers moved into the scheduler.
- Audit shipping copies committed rows to CloudWatch with an ordered cursor,
  byte/span limits, oversize-row handling and HTTP-200 partial rejection handling.
  At-least-once shipment leaves its cursor on failed delivery. CDK grants the app
  only create-stream/put-events access to its audit group.
- Lifecycle and report-snapshot schedule producers and pending cancellation now
  have screens and server permission/state/version checks.
- The dispatch-only browser workflow is authored but has never been run.
- Stage-owned Cognito pools replace the deleted pool reference. Production has
  retention/deletion protection, managed sign-in and an opt-in Plus flag.
  D-24 records this as assumed. A restored database needs reprovisioning and new
  passwords; the recovery tool remains P15.8 build work, not completed work.
- Three content foreign-key on-update declarations were aligned with existing
  SQL (`NoAction`); no migration was needed for that alignment.

### P13 setup, stock, staffing and operations

- Setup screens cover station types/capabilities/tags, stations, categories,
  event days, templates, exceptions and safe day removal. Strong structural
  changes recheck current authority/phase under locks and preserve omitted values.
- Gift creation/editing and reasoned derived stock adjustments have screens;
  opening stock remains immutable.
- Staffing includes the assignment board, assignment/unassignment, reviewed CSV
  import, escalation, swap request/decision/withdrawal and briefing slots/waves.
- Correction screens support recent registration/footfall picks, reasoned voids,
  paper totals and card lookup/void/replacement. Incident follow-ups/status,
  filtered audit and guided close-out/archive/clone are reachable.
- A route-to-client inventory exposed and filled counts/data-health, explicit
  physical card issue, private found-item photo viewing, frozen report history/
  downloads and manual retained visitor-value reads. Sensitive reads partition
  caches by person; permission loss/hide drops their displayed private state.
- New administrative writes use retry receipts. Documented legacy no-key callers
  remain compatible; legacy card current-authority/receipt hardening is P15.
- Phone/laptop browser specs for setup, staffing, correction, close-out, scheduling
  and stock/printing are authored. None were executed; P16 owns execution.

### Grouped print repair after the first green full run

Final review found missing print acceptance criteria, so the whole print repair
was grouped before committing:

- Generation uses `Card.GenerateBatch`; saved list/detail/download use read-only
  `Report.Export`, including archive and readers without generation authority.
- Generation takes event, current membership, receipt and sorted selected-card
  locks. It freezes exact codes, event name, batch labels and configured stamping
  station names. Batch generation was ordered event-before-receipt to avoid a
  lock inversion. Upload/SQL rollback and permission-revocation cases are covered.
- Private PDF/ZIP uploads have unique conditional object keys. Public receipts
  expose no storage keys or QR payloads. A committed upload followed by SQL rollback
  is private/inaccessible and expires under the existing 90-day lifecycle (assumed).
- Three additive migrations add audit shipment, print receipts and immutable
  membership/context. They were applied **only** to the test DB. The last is
  `20261011130000_card_print_membership`, with a cardinality check allowing empty
  legacy context. Legacy details show unknown history instead of current labels.
- Saved history has event-scoped keyset pagination and strict query bounds.
  Details retain frozen labels/selection after relabels or live-card deletion.
  Downloads fence person/event/permission/unmount changes, revoke object URLs and
  discard unauthorized cached private records. Foreign cursor/path and missing
  IDs have the same safe behavior.
- PDF labels now use bundled OFL Noto Latin/Tamil and pinned Noto Sans SC TrueType
  at regular weight, with grapheme fallback, shaping and logical ActualText.
  Independent Poppler rendering found the original CJK CFF asset produced boxes
  despite valid extraction; it was replaced, not excused. Embedded-glyph tests
  check actual glyph outlines. Docker includes the assets.
- A synthetic 8-card fixture with 20 long Latin/Chinese/Tamil station labels
  generated four A4 pages (130,591 bytes); all four were visually inspected and
  rendered without Poppler warnings, clipping or missing glyphs. These synthetic
  QA intermediates remain ignored in `.local/`.
- A strict stock/print browser fixture and phone/laptop journeys cover PDF/ZIP
  bytes, uncertain writes/retries, saved archive history, paging and denied access.
  They are authored acceptance coverage, not an executed browser result.

## Verification evidence and the active blocking run

1. The original full run at 03:15 UTC exited 1. Repairs included two CDK synth
   timeouts (workers capped at two), LIVE-vs-DRAFT structure fixtures, missing swap
   membership IDs, four missing composition pages/navigation lists, reporting
   coverage on test failure, and two scanner false positives changed to obviously
   fake valid receipt UUIDs. Assertions/floors were not weakened.
2. The repaired full run at **03:44 UTC exited 0**. Log:
   `.local/ci-local-20261011T0344Z.log`. Server 236 files, 2,969 passed and two
   existing skips; client 95 files, 881 passed; CDK 104 passed. Lines/branches:
   server 96.79/87.75%, client 79.22/71.73%, shared 93.17/82.19%. Every floor and
   both secret scans passed. **This result predates the final print repair.**
3. Final grouped print focused evidence: **140 server assertions**, **36 client
   assertions** (23 history/download cases), **four shared contract assertions**.
   The server group first exposed missing history routes in the isolation inventory;
   the inventory was repaired and its ten tests then passed. Do not mistake the
   initial grouped process exit 1 for an unresolved isolation failure.
4. The new complete run started at **04:52 UTC / 12:52 Singapore**. Unified exec
   session **12120** was still running at the last check, **05:13 UTC**. Session IDs may not be
   usable in a new chat; inspect the logs and operating-system process first.
   Stdout: `.local/ci-local-20261011-p13-print-final.log`.
   Detailed steps: `.local/ci-local-20261011T0452Z.log`.
   Git Bash parent process IDs observed: 56116 and 64540. PIDs are only hints;
   verify they still refer to this run, never terminate unrelated Node processes.
5. That current run passed tracker tests/validation, classification, install,
   shared build, generated settings/actions, pricing/Firebase, Prisma generate,
   lint, typecheck, client build, architecture report, hardcoding, test-only
   migration, shared tests (278), policy tests (85), CDK tests (104).
   **Architecture enforcement exited 1** with a confirmed dependency cycle:
   `cardPrintLayout.ts -> renderCards.ts -> cardPrintLayout.ts`.
6. Server coverage is still running. It has reported one failure in the nine-test
   `server/tests/unit/cardPrinting.test.ts` suite:
   `refuses unsupported graphemes and a station grid larger than a physical A4 card`
   took 8,702 ms. **The final diagnostic has not yet printed.** A timeout is a
   hypothesis, not a confirmed diagnosis. Client/coverage/security final results
   and the overall exit code of this run are not yet known.

No source/test changes should be made until the active run finishes. Collect all
failures and repair them as one group. Current recommended fixes, not yet applied:

- Move `PrintableCard` from `application/renderCards.ts` into a pure domain type
  leaf (the existing `domain/printContext.ts` is suitable). Import it from the leaf
  in both renderer and layout. Type-only cycles still violate architecture.
- If the final grid failure is the suspected timeout, fix the work bound rather
  than merely increasing the timeout. Before shaping every label at three sizes,
  reject a station count whose minimum physical layout cannot fit A4. Current
  lower bound is `16 + 84 + 8 + ceil(stationCount / 2) * (28 + 6) + 28` against
  `PAGE_HEIGHT - 2 * PAGE_MARGIN` (841.89 - 68). Use shared layout constants and
  the existing actionable validation error. This rejects the impossible 100-
  station fixture quickly without rejecting a legitimate dense 30-station card.
  Inspect actual diagnostics before selecting a fix.
- Run focused lint/typecheck/architecture and affected tests after all repairs;
  then **one corrected full runner, without resume arguments**. Fill both batch
  reports with the actual final gate, inspect cached stat, commit/push once and
  watch exact-head GitHub CI green. Nothing currently authorizes claiming this
  staged application verified by its earlier green run.

## Tracker and immediate closure work

Tracker at handoff: current **P13 / P13.10**. P00–P07/P09/P11 done; P08 8/11,
P10 6/9, P12 5/8, P13 2/10. P14/P15/P16 not started. No open recorded decisions.
Tracker is intentionally behind unverified source. Do not mark pending builds done.

After the application commit is green, reconcile P08.5–P08.11, P10.5/.7–.9,
P12.1/.7 and P13's code-complete steps/reports with that evidence. P12.2 remains
the D-08 recorded reduced implementation, P12.8 remains an owner hold. Carry
closure documentation into the next feature batch rather than creating needless
documentation deployment cycles.

## P14 and P15 preparation: plans, not implementations

All nine plan/review files below are **untracked and unstaged**. Do not silently
include them in the current foundation/P13 application commit. No P14 or P15
application source, schema or tests have been built. They are inputs for the next
large batches, after the current application's local and GitHub gates.

P14 files in `remediation/reports/P14/`:

- `build-plan-2026-10-11.md` — whole-phase lanes/dependencies.
- `workspace-build-plan-2026-10-11.md` — scoped entity homes, filtered records,
  search and source-owned public facades.
- `workspace-policy-review-2026-10-11.md` — exact Cedar resources, concrete
  aggregate/link corrections, archive/private visibility and related-link inventory.
- `client-build-plan-2026-10-11.md` — dashboard predicates, shared feedback/states,
  confirmations/help/glossary and links.
- `notification-build-plan-2026-10-11.md` — durable private centre/preferences,
  transactional producers, push delivery and retention.
- `branding-build-plan-2026-10-11.md` — approved publication/assets, public brand,
  manifest/head/theme/shell/sign-in/TV and frozen export integration.
- `browser-build-plan-2026-10-11.md` — route inventory, strict fixtures, phone/laptop
  light/dark and loading/error/denied/empty/keyboard/accessibility coverage.

Important P14 corrections recorded by review:

- `/entity`, `/records` and `/search` must work with static export using query
  parameters. Typed URL builders preserve date/rehearsal/source/station/person/
  category/stage filters. Records reproduce the source aggregate exactly.
- `Self.Read` uses the caller's Membership, `People.Read` the Event; do not invent
  Cedar resources/actions or use a Write action as saved-history read authority.
  IC foreign-station counts must not expose the foreign restricted roster/device
  identity currently bundled in station dashboard data. Gate/split those facets.
- Last-hour ranges crossing midnight must not intersect today's date. Welfare
  long-shift warnings remain one per person with the earliest open check-in.
  Staffing gap source and drill-down must share materialized-shift identity.
- Footfall totals include imports but APP-device breakdown must distinguish them.
  Stamps/funnel/issued/completed/redeemed have different exact source predicates.
  Gift ledger balance is all-history in its exact rehearsal/live pool.
- Build the missing reasoned retained `GiftRedemption` void under existing
  `Record.Void` if presenting correction for flagged redemptions. Stock adjustment
  does not void a redemption. Inspect lock order and add UUID/audit/current-authority
  handling. No such void route currently exists.
- Add durable event-scoped capture-to-ImportBatch/window provenance for new imports.
  Never infer exact old ownership from timestamps. Safe undo is atomic/retained,
  checks every Record.Void plus import permission and refuses unknown legacy ownership.
- Notification source transitions and notice rows commit together; external delivery
  runs afterwards. Preferences default urgent true/operational false. Existing urgent
  announcement delivery remains one owner, not duplicated. Historical reads retain
  current visibility and recipients, including platform admins without memberships.
- Branding publication uses strict versioned JSON and approved normalized PNG assets,
  no arbitrary remote URLs/CSS. Content.Edit/Publish and a minimal opt-in anonymous
  public branding projection are assumed recommendations to record under D-23,
  including a narrow ADR-001 public-brand exception. Event.name is the D-18 truth.
  Slugs are unique per organization, not globally: ambiguous public lookup is 404.
  Freeze approved branding into exports; never substitute live brand into old exports.
  Runtime/static metadata must preserve inline script bytes for P15 CSP hashes and
  service-worker cache keys must not leak one event's HTML brand into another.

P15 files in `remediation/reports/P15/`:

- `build-plan-2026-10-11.md` — UNLOGGED PostgreSQL atomic quotas with generation-
  fenced resets/decrements and fail-closed outages; transactional denial audit;
  legacy card current-authority/receipt/lock fixes; expanded isolation; rotation,
  alarms, privacy/data map and full ASVS/baseline review; recovered-pool tooling.
- `csp-build-plan-2026-10-11.md` — hash the actual Next-exported inline scripts
  without changing bytes, serve matching per-document Express/Firebase headers,
  replace remaining inline styles, budget headers and copy verified Docker artifacts.

The P15.8 recovered-pool tool must default dry-run, journal provider/DB boundaries,
preserve person IDs, recheck current platform authority/profile/sub CAS, revoke old
sessions and resume safely after ambiguous provider results. Invitation dispatch is
explicit and uses D-08's default sender and pool-wide UTC 50/day quota; no SES.
Actual restored production/person recovery remains owner-controlled acceptance.

## Verification campaign after all feature builds

ADR-011 §7 order: recreate authorized staging; P16.10 granular API suite; P16.1
full regression/browser/visual; P16.8 deferred acceptance; P16.9 24-hour soak;
P16.2 load; P16.3 drills; P16.4 restore. Finish remaining P16 handover/report gates
honestly with owner holds. Do not deploy before every feature build is finished.

Read-only campaign inventory found these hazards, not yet repaired:

- `remediation/tools/route-inventory.mjs` hardcodes `inventory_test` and defaults
  to overwriting a historical P06 artifact. Change its safe DB guard to the owner's
  sole test DB before running and choose an explicit new P16 output.
- Browser/visual helpers still refer to `spoh2027_visual_test` and
  `spoh2027_rehearsal_shift_e2e_test`; reconcile all to **spoh2027_test**. The
  dispatch workflow serves port 4012 but several specs/configs default to 3000.
- The generated route-role matrix is not complete actual HTTP behavior coverage;
  its probe subset must not be sold as P16.10's granular suite. Add independent
  composite-read authority and behavior tests as workspace routes are built.
- The P14 browser plan observes 52 existing composition pages, 48 event plus four
  global; old visual coverage is only 29 routes and light baselines. Strict typed
  fixtures must cover new routes/states and fail unknown API requests. Empty seeded
  pages alone do not prove the new features work.

A dedicated P16 planning subtask was interrupted by this handoff request. It did
not create a P16 report; do not assume such a file or completed campaign exists.

## Documentation and agent boundary

This checkpoint and `TAKEOVER-PROMPT-2026-10-11.md` were added at the owner's
request; the resume link was updated. They remain working-tree documentation,
not a verified application commit. Existing batch staging is preserved.

Previous subagents completed source/test lanes and read-only future plans. Their
work is already in this checkout. A fresh agent should launch new bounded lanes
only when useful, with disjoint ownership of central schema/app/nav files; do not
depend on old conversation IDs or on old agents being available. Keep updates
short/plain and continue until the user's original programme is handled.
