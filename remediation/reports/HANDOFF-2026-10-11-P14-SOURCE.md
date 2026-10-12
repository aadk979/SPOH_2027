# Takeover checkpoint — P14 source, 11 October 2026

Owner requested documentation and a next-agent prompt at about **20:51 Singapore /
12:51 UTC**. Feature authoring stops here. This is the latest continuation record;
`HANDOFF-2026-10-11-TAKEOVER.md` is historical foundation/P13 context. Its repairs
and verification are complete; do not restart them.

## Protect the checkout and resume in order

- Work **only** in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`. The inherited
  cwd may point at sibling `V1`; never inspect or change it. Give every shell
  command an explicit V1-main workdir. Discover filenames with `rg --files`; use
  `rg -g '*.ts' directory`, not Windows path globs such as directory/*.ts.
- Read this record, ADR-011, the P08 AWS teardown record, README resume protocol,
  DECISIONS, engineering standards, current P14 phase, client/AGENTS and
  `P14/workspace-policy-review-2026-10-11.md` before editing.
- Branch main; **HEAD and origin/main** are
  `c00da9faefda04ac2984dac177e5903a8e3b0260`
  (`feat(operations): finish foundation and admin workspaces`). P14 is dirty and
  uncommitted. Before these new handoff docs: **314 tracked modified paths,
  269 untracked files, zero staged files**. Preserve every edit. See the
  [checkpoint file inventory](P14/checkpoint-files-2026-10-11.md).
- Never pull/reset/clean/discard or replace the checkout/create another worktree.
  D-11 authorizes verified commits/pushes directly to main. Immediately before
  commit run `git diff --cached --stat`; every staged file is included.
  `.local/` contains ignored secrets/personal data: never stage/upload/publish it.
- ADR-011/D-23: whole source batch with lint/typecheck only; author tests; run
  affected suites and grouped repairs; **one complete every-step local gate**
  under Node24 actual0; push once and watch exact-head CI. Concrete failures
  justify grouped repeats. Keep floors/assertions unchanged. Browser execution
  stays in P16.
- No P14 CI/DB suite was started. Root lint36419/typecheck46907 ended1; notification
  lane reported final server typecheck36493 ended0. At checkpoint no Node/bash
  process with a V1-main command line was found; still inspect processes/logs
  before starting a DB suite after takeover. No known active root exec remains.
- Client/structure agents were interrupted at the checkpoint. The notification
  and browser-fixture author hit a usage limit mid-authoring. Do not rely on old
  agents finishing unseen work; continue from saved files.

## Runtime and database

Always use Node **24.19.0**, including npm child runtime:

```powershell
$env:PATH = "$PWD\.local\node24-bin;C:\Users\aadk9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;" + $env:PATH
$env:DATABASE_URL = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:SPOH_SKIP_DOTENV = '1'
node -v
npm exec --no --call 'node -v'
```

Docker spoh2027-postgres listens on5435. **Only spoh2027_test is permitted**;
never migrate/reset/seed real spoh2027, create other test DBs or use shadow DBs.
Every Prisma command, even generate/diff, explicitly carries the test URL and
SPOH_SKIP_DOTENV. Current P14 migration is authored **but not applied**. Apply it
only after whole source readiness, directly via Prisma deploy against that DB.
Do not use `server/scripts/setup-test-db.mjs` until its legacy dotenv/broad-name
guard is repaired. Integration reset helper already permits only spoh2027_test.

Bare bash resolves broken WSL. Full local gate, no skip/resume arguments:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' .local/ci-local.sh
exit $LASTEXITCODE
```

Retain actual exit/completion evidence; no competing DB suites. gh is absent.
Ignored REST helper: `node .local/github-exact-ci-status.mjs <full-sha> --jobs`.
Keep credentials/private logs local; record sanitized status only.

## Foundation/P13 verified and closed

The inherited04:52 run had no retained final exit and was not acceptance. Grouped
repairs moved PrintableCard to a pure domain leaf, rejected impossible physical
print grids before font shaping, fixed source caller inventory conditional
method/object-spread handling and made incident list reads consistently no-store.

Corrected **20261011T061828Z** full Node24 gate retained actual **0** at06:48UTC.
Server239files:3,018passed/two existing skips; client98files:971; shared278;
policies85; CDK104. Lines/branches: server96.84/87.87%, client80.78/73.11%,
shared93.36/82.19%. Unchanged floors, dependency gate and both secret scans passed.
CDK bundled brace-expansion advisory exception remains until31October; no
zero-advisory claim.

All383 preserved staged files committed/pushed once in c00da9f. Exact-head
[CI38131824850](https://github.com/aadk979/SPOH_2027/actions/runs/38131824850)
finished all five jobs successfully, checked again before this continuation's
edits. Details: `BATCH-2026-10-11-FOUNDATION.md`, `P13/admin-build-2026-10-11.md`.

Tracker: P00–P11/P13 done; P12 **7/8** (P12.8 owner hold); P14 **0/10**, all
started; P15/P16 not started. Current P14/P14.10. Foundation closure docs are
dirty in this P14 batch. No P14 step marked done.

## P14 implementation saved — suites have not run

### Contracts, schema, current reads and composition

- Shared workspace17entity/16record kinds, bounded safe fields/facets/current
  actions/platform destinations, exact records/search/query contracts. Reject
  unknown/repeated query values, retain false and raw station-code case, pair
  assignment proof only for person/day/shift. Registrations.cardId supported.
  Ledger source-qualified row/cursor max160; entity IDs remain64.
- Shared retained redemption void/import undo/exact-original-UUID salvage,
  notice centre/preferences/delivery/source context, dashboard observation/
  private availability, and frozen export branding contracts.
- Prisma Notice/NoticePreference/NoticeDelivery with scoped ownership, enums,
  lease/version/retry/expiry; ImportBatch provenance/window/undo and exact capture
  FKs; GiftRedemption retained void reason/time. SQL CHECK retry/provenance bounds.
- Additive migration
  `server/prisma/migrations/20261011200000_p14_notices_import_ownership/migration.sql`
  created by explicit-test-URL read-only schema diff; reviewed creates/additions,
  **not applied**. Format/generate/eventOwned generator and shared emit passed0.
- `platform/access/currentRead.ts` binds active authenticated Person to exact
  scoped Membership; fresh EntityBuilder questions, archive standing, no read
  mutation-phase exceptions. Missing resources deny; evaluation/provider/DB errors503.
  `transactionRead.ts` holds Event→callerPerson→Membership→ownAssignments while
  reading. No cross-request policy cache.
- Source helper gates actual stations/private rows and actor/full-person/roster/
  incident/audit facets independently. `readableCollectionStations` fixed so a
  stored role grant answers only a genuinely station-empty event; actual Cedar
  denials cannot fall back to that rule. Unit source regression added.
- Search first proves Self, visits unique source readers, catches only clean403,
  propagates503, deduplicates/bounds. No hidden message/alert descriptor search.
  Workspace HTTP reads are private/no-store, named source-checked Entity.Read,
  Records.Read and Workspace.Search composite handlers executing real source
  policy inside read transaction; these are not invented Cedar actions.
- `app/workspaceSources.ts` wires all17/16 facades; source notice registry,
  bounded historical materialiser and scheduler delivery are composed via public
  module indexes in app files.

### Homes, collections and totals

- Station/person/day/shift/assignment/lost-found/audit source facades with minimal
  current references and related destinations. Limited person/day/shift requires
  the actual supplied assignment, not an unrelated allowed station. Station
  explicit APP contributions and Audit.Read history links; own swap actions.
- Registration/footfall/redemption exact collections independently gate station,
  recorder/card/gift/minimal retained import links; footfall sums quantity, not
  row count. Current Record.Void actions reach implemented correction screens.
- Cards: bounded minimal Self stations-left/redeemed state, replacement chain;
  richer stamps/registration/group/redemption facets gated. Issued/completed/
  redeemed distinct-card vs stamp-row units; explicit LOST behavior.
- Gifts: exact live/practice home/ledgers. Parameterized SQL UNION keyset pages
  adjustment/redemption rows, separate full-history balance. Namespaced cursor
  `adjustment:<id>`/`redemption:<id>` resolves equal physical-ID/time collision;
  original recordId retained for station-gated redemption destination. Void delta0.
- Fallback/import: proven associated windows, permitted inserted captures,
  importer/report caveat. Legacy/roster provenance unknown, no invented undo.
  Archive/cross-type metadata Audit.Read; bodies retain source proof.
- Incident status/follow-ups and safe reporter/station. Announcement current
  persisted recipient role/day/posting/expiry or live own-author body proof;
  recipient own ACK state, authorized-author observed aggregate; archive-only
  metadata triggers no ACK query. Lost-person resolved/practice-outside-rehearsal
  hides descriptors and controls immediately.
- Dashboard private roster/device queries permission-first; APP-only phone
  freshness/totals separate from overall imported totals/source breakdown. Exact
  materialized-shift IDs, one deterministic welfare warning/person with all
  assignment references. Safety/check-ins/cards/gifts share same now.
- Inclusive asOf, explicit to exclusive. Today-card/CardFunnel generated links
  no longer add to=asOf; future asOf rejected; exact timezone/day/midnight/pool/
  source/station predicates. Gift totals and summary bound future rows at asOf.

### Corrections, outbox and notices

- New capture imports stamp provenance1 exact inserted-row batch ownership in
  apply transaction; duplicates retain old ownership. Roster import version0
  metadata-only history, no invented undo/window.
- POST /fallback/imports/:id/undo: canonical Event/member/receipt/batch/row locks,
  current Fallback.Import and every actual Record.Void, exact row count/provenance,
  retain earlier manual-void reasons, row+batch audit/undoneAt/reason/UUID settle
  atomically. Legacy/roster refused.
- POST /gifts/redemptions/:id/void: current Record.Void, canonical event/member/
  receipt/gift/card/row locks, retained reason/time/audit, exact written-pool stock,
  one replay, no lost/voided-card rewrite; revoked/archive/pool guards.
- POST /fallback/salvage/confirm: exact person/event/current Self, original UUID
  +retained record ID for five capture kinds; wrong/mixed409, unsupported groups
  remain parked. Minimal audit/receipt atomic; client clears only owned FAILED
  entries after confirmed proof.
- Reviewed gift stock now optional expectedRehearsal (legacy compatibility).
  UI always pins displayed pool/retry input; server compares under Event lock
  before stock/audit/completed receipt. Mode-change regression authored.
- Atomic IndexedDB outbox claim/cancel/lease-fenced settle and owner/session
  generation check immediately before API transport; no duplicate sender race.
- Durable minimal notice/context/preference rows, separate read vs ACK, quiet
  default operational/urgent rules. Source transitions enqueue in their existing
  transactions. Bounded push claims/current preference/device ownership/retries;
  urgent announcements retain existing delivery owner, no duplicate push.
- History materialises only currently eligible announcements/active searches,
  at most100/source and25events, reports incomplete coverage; no invented old
  assignment/stock transitions or historical push/ACK. Personal export/erasure
  and event staff retention cover notice/context/delivery; preferences global.
  Detail report `P14/notification-source-build-2026-10-11.md`.

### Branding and client experience

- Content.Edit/Publish branding, bounded decoded PNG receipts/immutable approved
  asset-digest publication, ambiguous-slug refusal/neutral fallback. Narrow
  anonymous name/approved accent/assets/CSS/manifest exception documented ADR001/
  D23; drafts and operational/private data remain protected.
- Runtime identity shell/sign-in/TV/setup/CSS/manifest; safe static escaped
  metadata rewrite preserves inline script bytes, final-HTML SHA ETag GET/HEAD/
  304. SW event URL/query cache separation. Clone unpublished target-owned draft.
  Report/print approved frozen branding/context; absent legacy identity unknown.
  sharp0.35.5 pinned server/lockfile.
- Typed workspace pages/API/cache/path/navigation, permission-aware search/
  palette/quickactions/help, actual import undo/redemptionvoid client actions.
  Private reads keyed by event/person/current permission, no stale private data.
- Common error/loading/empty/denied/notfound/offline/confirmation/toast components
  replace feature variants. Latest grouped repair: truthful undo vs sending/
  expiry/failed cancellation, result toasts/count glossary surfaces/audited salvage
  copy/global offline message; visitor owner-scoped abort/no-store/gc0/shared
  error and save feedback; structure effect help; reviewed gift exactpool;
  unassign exacttarget confirmation/focus return; scoped assignment validation.
- Content publish shared safe feedback/confirmation and lifecycle readiness
  error distinguished from empty. Latest client repairs lack assembled green check.
- `P14/journey-matrix-2026-10-11.md`: source before/after for F02 sixjourney and
  all entity rows; **not** a new browser walk/axe result.

## Authored checks and actual results

**No P14 suite/coverage/full gate/migration apply/commit/push/browser run occurred.**
Earlier foundation CI does not accept P14 source. New server unit sources:
branding/Storage/Exports, staticBranding, currentRead, workspaceObservation/
Orchestration/Collections/Structure/History, dashboardPrivateFacets, noticeDelivery.
New integration: noticeCentre, assignmentNotices, safetyWorkspace,
workspaceStructure/Http/Captures/CardsGifts/Imports, retainedCaptureCorrections.
Existing changed: dashboard, thresholdConsumers, giftAdministration,
personDataRetention, isolation, routeRoleMatrix, authorizationCoverage, schemaScope,
shift. Matrices include workspace/branding/void/undo/salvage. Notice.sourceId is
documented discriminated opaque context key, not generic FK or authority.

Shared source asserts strict URLs/pools/stages/filters/destinations, namespaced
ledger keys vs entity-ID bounds, salvage/undo/branding. Client source includes
workspace/notice/branding/paths/outboxAtomic/assignment-groups/feedback/
routeManifest and latest p14-client-repairs.test.tsx; stock/staffing/dashboard/
navigation tests updated. Browser specs authored, not executed.

| Latest source-only check | Result and limitation |
| --- | --- |
| Prisma format/generate/eventOwned, shared build |0; explicit test env, no DB mutation |
| Root shared/gift/currentRead/collection focused lint |0 |
| Root server typecheck46907 |1: fixture missing getLiveDashboard export; structure subsequently fixed direct import |
| Notification final server typecheck36493 |Reported0 after OPEN→LIVE fixture fix; source/seed/tests. Subsequent edits are browser files |
| Earlier client typecheck/focused lint |0 before latest grouped UX/browser assembly |
| Whole lint36419 |1: useCapture line-limit; footfall/giftadmin/registration complexity11; VisitorFieldRow81lines. Client reported helper refactors later; final whole lint still needed |
| Root campaign runner/config focused lint |0; reducedMotion later corrected to contextOptions |
| Latest client typecheck |Failed during partial assembly: campaignCore ClientConfiguration type-only parse and missing campaignFixtures; root reducedMotion config error fixed |

Re-run assembled lint/typechecks after finishing below. Do not infer verification
from subsequent edits. Source assertions may expose real failures on first run.

## Immediate unfinished source: browser fixtures and acceptance authoring

Old visual routes.spec has29legacy paths, networkidle/main readiness, two light
projects. Independent new manifest has57pages/fourprojects, but is coverage
**intent**, not runnable proof. Workspace spec has140authored kind/state cases,
fourprojects; no current screenshots/axe acceptance.

Saved partial files in `client/tests/browser`:

- campaignTypes.ts: response path/query/body/status; no method field yet. Installer
  must exact GET vs explicit auth POST, not match every method.
- campaignCore.ts: current event/person/session/config/me/settings/grants.
  **Known error:** ClientConfiguration.parse uses a type; use runtime schema
  ClientConfigurationV1. Neutral branding404 also conflicts with root runner's
  no400+ assertion; use valid published fixture or explicit asserted expected404,
  never silently ignore failures. Review phase/role grants, no blanket action
  widening solely to expose screens.
- campaignStructureData.ts, campaignAdminData.ts, campaignContentData.ts: partial
  schema-validated response families, not imported/executed as a combined fixture.
  Complete normal identity/device/MFA/privacy/stock/schedule/catalogue/content.
  Old helpers often return {} on unknown request; copy safe data, not that behavior.
- campaignOperationalData.ts:
  campaignOperationalResponses(CampaignContext):CampaignResponse[] populated
  dashboard/counts/attendance/safety/frozenreport rows. Newly saved, **not finally
  lint/typecheck/runtime validated**.
- **Missing campaignSettingsData.ts**, root assignment stopped before writing:
  planned campaignSettingsResponses(CampaignContext), exact GET shift-templates,
  event-settings, attendance-settings, organisation-settings, catalogue?scope=event
  and applicable settings/capture schedule collections.
- **Missing campaignFixtures.ts**, planned
  installCampaignFixture(page,CampaignRoute):Promise<CampaignFixture> returning
  {url,expectedUrl,ready:()=>Promise<void>,unexpected:string[]}. IDs evt_mock/
  mock-event, person, station, day; fixed2027-01-08T02:00UTC. Route-specific query
  IDs/canonical root redirect, explicit populated domain-ready state. Strict
  method+event/path+unique allowed query; unknown/method/foreign/repeated fails.
  Pure handler contract tests for those rules are also **missing**.
- Root's new client/playwright.campaign.config.ts, tests/campaign/routes.spec.ts,
  test:campaign script and dispatch-only browser workflow campaign option are
  authored:57routes×fourprojects, URL/readiness/noerror/overflow/axe/screenshot.
  Runner imports missing installer; baselines not created.
- **Missing admin-keyboard.spec.ts and named icon/live-region matrix**; client
  assigned but files absent at checkpoint. Cover setup/structure; settings/
  schedule/content/people; staffing/swaps/briefings; audit/corrections/closeout:
  visible focus, associated validation, no trap, confirmation cancel/focus return.
  Named controls and changed live text: count/group/scanner/camera/upload,
  queued/synced/failed capture, stamp/redeem warning/result, alertACK/resolve,
  mutation validation/error/success/toast. Existing safe inline reviewed flows may
  remain; repair concrete review/cancel/focus gaps without gratuitous modal churn.

Finish partial source/latest regression cases; final lint/typechecks. Then apply
migration to sole testDB and execute affected server suites serially; shared/
client suites independently. Collect/fix concrete failures together; one full
local gate actual0; stage whole coherent P14/docs, cached stat, D11commit/push once,
exact-head all5green. Only then close P14 via progress.mjs and continue P15.

## P15 and ordered P16 next

P15 plans: `P15/build-plan-2026-10-11.md`, `P15/csp-build-plan-2026-10-11.md`.
**No P15 source started**. Main remaining work:

- PostgreSQL UNLOGGED shared quotas, hashed namespace/subject, atomic generation
  fenced increments/reset/decrement, failed-only sign-in request charge context,
  DBoutage503; denial claim+audit sameSQLtransaction.
- Legacy card generate/void/reissue current authority/UUID receipts/lock order;
  IDOR/regression, session dual signing-key rotation, policy alarms/nightly
  deployed matrix, sensitive OAuth/error/log redaction.
- Strict actual Next script-hash CSP, UTF8/browser normalization, wholeHTML
  sidecar/hostmapping failclosed/8KiB; Express/Firebase/Docker pairing, finite CSS
  replacements for inline styles.
- Default-dry-run resumable restored-identity journal/provider ownership marker/
  collision refusal; post-I/O operator/profile CAS, atomic rebind/audit/session/
  handoff revocation. Explicit D08 poolwideUTC50 default-sender invitation quota.
  Actual real-person recovery stays owner-gated.
- Remaining MIME/decode gap; append-only audit retention/dbroles; full privacy
  map including notices/context/delivery/preferences/branding/outboxsalvage and
  backup/erasure; recheck bundled advisory exception.
- Individual ASVS5L1/L2 controls (253 in plan), applicability/code/tests/provider
  proof, baseline security diff d2497b6332bd32758f24fd832a01a4d14524c4f0,
  findings/exception report; no blanket chapter ticks. ADR006/008 exceptions retained.

AWS still torn down; no deploy during builds. After all feature source/CI closes:
authorized staging bootstrap→GitHubrole→stacks, then **P16.10 granularAPI →
P16.1 fullbrowser/visual/regression → P16.8 deferredacceptance → P16.9 real24h
soak → P16.2 load → P16.3 drills → P16.4 restore → report/handover**.
Alias removal waits7days after closure. ap-southeast-1; GitBash AWSlogs uses
MSYS_NO_PATHCONV=1. Never claim soak time before environment runs.

Before browser execution repair oldports/17testDBreferences/setupguards to sole
spoh2027_test. Route-inventory tool hardcodes inventory_test/history overwrite;
repair guard/output/full composite chain first. Mocked fixtures prove UI only.
Remote API campaign requires HTTPS/stagebuildattestation/realCognito and granular
role/resource/phase/revocation/failure cases; no fakeJWT/devsignin/truncate staging.
Sanitize evidence IDs, record SHA/casehash/UTC/JUnit/JSON; private logs stay local.

D08 noSES; D10 approximately$100/month baseline excludesWAF; D11directmain.
Owner gates remain production/cutover/live-site rebuilding/unrecoverable real
data/actual restored-person recovery and28Octobergo. Ask only money/production/
unrecoverable data/open product rules, otherwise documented assumed choice and
short updates. Continue all authorized work, not just a partial milestone.

Owner duration question was answered **several days, not hours**, with P15 and
campaign remaining including real24hsoak. Rough estimate, not committed date;
refine after P14 affected tests establish repair size.
