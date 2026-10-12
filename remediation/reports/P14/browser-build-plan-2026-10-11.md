# P14 browser build plan — 11 October 2026

Planning for P14.7/P14.9 only. The foundation/P13 batch is frozen for CI. No browser, database, visual or accessibility campaign was executed for this inventory. Author the suites in the P14 batch; execute them in P16 under ADR-011. Root owns suite authoring, router mounting and central inventories.

## Current evidence

- There are **52 composition pages: 48 event pages and four global pages** after restoring `/admin/audit`, `/admin/corrections`, `/safety/incidents` and `/admin/close-out`.
- `client/tests/visual/routes.spec.ts` still lists 29 routes. The five visual specs have 100 committed light-only snapshots: 29 pages plus 21 panel states, each at phone and laptop widths.
- `client/playwright.visual.config.ts` defines phone 390×844 and laptop 1440×900, light only. `client/playwright.config.ts` defaults to Pixel 7; individual specs sometimes override the viewport.
- Existing axe coverage reaches nine distinct pages. `navigation.spec.ts` checks four hubs at 320/390/1440px, with dark mode only at 320px. No existing `keyboard.press`/`toBeFocused` admin walkthrough was found.
- `client/tests/screens/navigation-registry.test.ts` already checks registry destinations against real composition files independently in both directions. Preserve this check and add the same completeness check for the authored browser manifest.

## Existing fixture inventory

Fixture IDs below name reusable source, not new database names:

| ID           | Existing source and useful data                                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEED         | `server/prisma/fixtures/devEvent.ts`, `server/prisma/seed.ts`: admin/lead/chief/dc/ic/booth/counter accounts; multi account on `spoh2027` and `dry-run`; eight stations/categories, seven relative days × two shifts; three rehearsal gift types; 50 reserved rehearsal cards; 21 briefing slots on future tour days. |
| AUTH         | `client/tests/e2e/mockEvent.ts`, `identityUiFixture.ts`: client-config bootstrap, scoped mock event, person/action grants, restricted MFA and domain route hook.                                                                                                                                                      |
| STRUCTURE    | `client/tests/helpers/structure.ts`, `client/tests/e2e/structure-journey.spec.ts`: structure, station, category, day/template/exception handlers.                                                                                                                                                                     |
| STAFFING     | `client/tests/helpers/staffing.ts`, `client/tests/e2e/staffing-journey.spec.ts`: assignment board, reviewed CSV import, swap request/review, scheduled/completed briefing.                                                                                                                                            |
| CORRECTION   | `client/tests/e2e/corrections-journey.spec.ts`: recent registrations/footfall, paper totals, record void, audit filters/pagination/before-after.                                                                                                                                                                      |
| CLOSEOUT     | `client/tests/e2e/closeout-journey.spec.ts`: LIVE/CLOSED/ARCHIVED readiness, custody settlement, archive pack and clone link.                                                                                                                                                                                         |
| CONTENT      | `client/tests/helpers/content.ts`, `client/tests/e2e/offline-content.spec.ts`: draft/publication, guide/journey/map content and synthetic floor-plan asset.                                                                                                                                                           |
| IDENTITY     | `client/tests/e2e/identity-provisioning.spec.ts`, `identity-devices-mfa.spec.ts`: invitation/import/resend, restricted MFA, current/other device revocation.                                                                                                                                                          |
| ANNOUNCEMENT | `client/tests/helpers/announcement.ts`, `client/tests/e2e/announcement-drafts.spec.ts`: private draft/schedule and acknowledgement scenarios.                                                                                                                                                                         |
| SCHEDULE     | `client/tests/helpers/captureSchedule.ts`; `client/tests/e2e/schedule-producers.spec.ts`, `schedule-timeline.spec.ts`, scheduled lifecycle/report/capture/category specs; existing visual capture/category schedule handlers.                                                                                         |
| SETTINGS     | `client/tests/visual/operational-catalogue.spec.ts`, `capture-controls.spec.ts`, `capture-schedules.spec.ts`, `category-schedules.spec.ts`; settings/history/control state handlers.                                                                                                                                  |
| COUNTS       | `client/tests/screens/counts.test.tsx`: typed footfall/live/card/gift/health/staffing responses. Move reusable data into the shared browser fixture without changing component assertions.                                                                                                                            |
| SAFETY       | `client/tests/screens/audit-incidents.test.tsx`, `client/tests/e2e/capture.spec.ts`, `media-upload-retry.spec.ts`: incident records/follow-ups, lost-person propagation, found-item upload retry. Complete browser read fixtures remain to be authored.                                                               |

Additional entry points: `client/tests/visual/primeAccounts.ts`, `client/tests/e2e/events.spec.ts`, `admin.spec.ts`, `attendance.spec.ts`, `role-permissions.spec.ts`, lifecycle control/preparation/close/reopen specs. The seed assigns booth to SIGNUP_BOOTH, counter to DCDF_STATION and IC to SIGNUP_BOOTH. It does **not** assign a redeemer to MISSION_COMPLETE.

## Exact composition inventory and fixture mapping

`<event>` below is the runtime event slug. Global source files are `client/src/app/page.tsx` or `client/src/app/<route>/page.tsx`. Every event source file is `client/src/app/e/[event]/<suffix>/page.tsx`. The table therefore identifies all 52 exact composition files as well as their canonical browser addresses. Use canonical event addresses for page coverage; test legacy redirects separately. “Add” identifies missing populated browser data, not a reason to exempt a page.

| Canonical route                         | Initial fixture / populated state source                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                     | SEED chief signed-in redirect; anonymous redirect to sign-in. Assert destination rather than treating a redirect as unique screen content. |
| `/sign-in`                              | Anonymous local auth; AUTH bootstrap.                                                                                                      |
| `/events`                               | SEED multi (`events.spec.ts`); SEED admin variant for event wizard controls.                                                               |
| `/mfa`                                  | AUTH restricted MFA + IDENTITY enrolment. A normal seeded session only shows Continue.                                                     |
| `/e/<event>/home`                       | SEED booth; chief variant to expose organiser navigation.                                                                                  |
| `/e/<event>/attendance`                 | SEED booth + `attendance.spec.ts`; add allowed/check-in/out/network-denied states.                                                         |
| `/e/<event>/brief`                      | SEED chief initial; CONTENT publication.                                                                                                   |
| `/e/<event>/briefings`                  | SEED chief with a future tour day selected; STAFFING mine/pending/completed slots.                                                         |
| `/e/<event>/capture/footfall`           | SEED counter posting; `capture.spec.ts`; count/undo/sync states.                                                                           |
| `/e/<event>/capture/redeem`             | **Add valid Mission Complete posting**; gift stock and redemption warning/success/hard-stop states.                                        |
| `/e/<event>/capture/registration`       | SEED booth; `capture.spec.ts`; add selected card/issue and validation/sync states.                                                         |
| `/e/<event>/capture/registration/group` | SEED booth; group quantity/category/undo states.                                                                                           |
| `/e/<event>/capture/stamp`              | SEED counter; reserved cards are available, but add issued/stamped lookup/result states.                                                   |
| `/e/<event>/chief`                      | SEED chief zero/rehearsal dashboard; add populated counts/staffing/attention.                                                              |
| `/e/<event>/chief/fallback`             | SEED chief; `rehearsal-import.spec.ts`; add open/closed window/history.                                                                    |
| `/e/<event>/chief/imports`              | SEED chief; `rehearsal-import.spec.ts`; add reviewed/imported/error history.                                                               |
| `/e/<event>/counts`                     | SEED IC counts and chief health; COUNTS populated responses.                                                                               |
| `/e/<event>/devices`                    | SEED current session; IDENTITY multiple/current/revoked sessions.                                                                          |
| `/e/<event>/guide`                      | SEED chief initial; CONTENT publication.                                                                                                   |
| `/e/<event>/ic`                         | SEED IC posting; add populated station/device/roster/flagged-gift detail.                                                                  |
| `/e/<event>/inbox`                      | SEED chief empty; ANNOUNCEMENT received/ack/draft/scheduled/expired states.                                                                |
| `/e/<event>/journey`                    | SEED chief initial; CONTENT publication.                                                                                                   |
| `/e/<event>/map`                        | SEED chief initial; CONTENT map asset/alt text/offline state.                                                                              |
| `/e/<event>/operations`                 | SEED chief; explicit action-filtered registry tiles.                                                                                       |
| `/e/<event>/overview`                   | SEED chief readiness; lifecycle specs; add full passed/blocked transition responses.                                                       |
| `/e/<event>/reports`                    | SEED chief; scheduled/rehearsal report specs; add populated snapshot/archive/download state.                                               |
| `/e/<event>/safety`                     | SEED booth hub; authorised management variant.                                                                                             |
| `/e/<event>/safety/incident/new`        | SEED booth; incident report validation/pending/success.                                                                                    |
| `/e/<event>/safety/incidents`           | SEED IC empty; SAFETY populated incident/status/follow-up browser handler to add.                                                          |
| `/e/<event>/safety/lost-found`          | SEED chief empty; add available/claimed/handover/private-photo read states.                                                                |
| `/e/<event>/safety/lost-found/new`      | SEED booth; SAFETY upload/retry/camera/form states.                                                                                        |
| `/e/<event>/safety/lost-person/new`     | SEED booth; SAFETY raise/active/ack/resolve states.                                                                                        |
| `/e/<event>/setup`                      | SEED chief; setup checklist and lifecycle readiness responses.                                                                             |
| `/e/<event>/shift`                      | SEED booth posting; `events.spec.ts`; STAFFING escalation/shift references.                                                                |
| `/e/<event>/swaps`                      | AUTH + STAFFING own/requested/approved/rejected/withdrawn/review states.                                                                   |
| `/e/<event>/tv`                         | SEED chief zero/rehearsal; populated dashboard. Keep display content plain.                                                                |
| `/e/<event>/admin/audit`                | SEED chief; CORRECTION audit filters, before-after and older page.                                                                         |
| `/e/<event>/admin/cards`                | SEED chief/reserved cards; add issued/void/reissue and print-job/PDF/ZIP browser responses.                                                |
| `/e/<event>/admin/categories`           | SEED chief; STRUCTURE category edit/disable/form errors.                                                                                   |
| `/e/<event>/admin/close-out`            | CLOSEOUT live/closed/archive states. SEED REHEARSAL is not an after-event fixture.                                                         |
| `/e/<event>/admin/content`              | AUTH with Content.Edit/Content.Publish + CONTENT. Add complete edit/review/publish browser handlers.                                       |
| `/e/<event>/admin/corrections`          | CORRECTION selected registration/footfall, reason/confirm and audit link.                                                                  |
| `/e/<event>/admin/days`                 | SEED chief; STRUCTURE templates/days/exception grid.                                                                                       |
| `/e/<event>/admin/gifts`                | SEED chief catalogue; add low/zero stock, adjustments/history and flagged redemption.                                                      |
| `/e/<event>/admin/permissions`          | SEED admin; `role-permissions.spec.ts`; read-only and policy-result variants.                                                              |
| `/e/<event>/admin/schedule`             | SEED chief; SCHEDULE lifecycle/report producers and pending/cancelled/history rows.                                                        |
| `/e/<event>/admin/settings`             | SEED chief initial; admin security-edit variant; SETTINGS controls/history.                                                                |
| `/e/<event>/admin/staffing`             | SEED chief board; AUTH + STAFFING assigned/gaps/import/swap/escalation.                                                                    |
| `/e/<event>/admin/stations`             | SEED chief; STRUCTURE station/types/tags/capabilities.                                                                                     |
| `/e/<event>/admin/users`                | SEED chief + `admin.spec.ts`; IDENTITY lifecycle/device/invite states.                                                                     |
| `/e/<event>/admin/users/invite`         | AUTH + IDENTITY invitation/CSV preview/apply/errors.                                                                                       |
| `/e/<event>/admin/users/person`         | SEED admin PLATFORM_ADMIN, query `?id=<actual scoped person id>` resolved from roster. Add person/membership/privacy browser responses.    |

Missing from current visual route list (23): audit, cards, categories, close-out, content, corrections, days, gifts, permissions, schedule, staffing, stations, invite, person, briefings, counts, devices, events, mfa, overview, setup, swaps and safety/incidents. Existing source helpers use different TEST_EVENT/IDENTITY_EVENT IDs; remap `eventId`, response paths and object keys consistently.

## Shared fixture and matrix to author

Proposed new files: `client/tests/browser/routeFixtures.ts`, `apiFixture.ts`, `assertions.ts`. Reuse them in `client/tests/visual/routes.spec.ts`, `client/tests/e2e/a11y.spec.ts` and a new `client/tests/e2e/admin-keyboard.spec.ts`.

```ts
type BrowserRouteFixture = {
  id: string;
  compositionFile: string;
  path: (eventSlug: string) => string;
  auth: AnonymousAuth | SeededAuth | SyntheticAuth;
  data: SeedReferences | ContractHandlers;
  ready: (page: Page) => Promise<void>;
  expectedRedirect?: string;
  variants: RouteStateCase[];
  iconNames: AccessibleControlCase[];
  liveCases: LiveRegionCase[];
  keyboardCase?: KeyboardCase;
  snapshotMask?: MaskCase[];
};
```

- Authored route entries remain independent of implementation/registry. Assert file and registry coverage in both directions; extend for every new P14 route and its query-kind/tab/filter variants.
- Four projects: phone-light/phone-dark (390×844), laptop-light/laptop-dark (1440×900). Preserve locale en-SG, Asia/Singapore, reduced motion and fixed fixture clock. Snapshot paths include project name. Keep the separate 320px navigation overflow smoke.
- Each normal route checks the resolved canonical URL, an explicit domain-ready locator, horizontal overflow, screenshot, axe and named icon controls. Waiting only for `networkidle` or a visible `main` can bless an error/loading/denied page accidentally.
- 52 base routes × four projects gives 208 route cases. Existing 21 panel states × four adds 84; new states/P14 pages add more. Redirects assert their destination and may share a destination snapshot.
- Relevant variants: loading, empty, API error+retry+request ID, offline, forbidden+policy reason, not found; retain applicable populated states. Explicitly document non-applicable variants rather than add meaningless generic placeholders.
- Visual/axe runs block service workers; retain the dedicated CONTENT offline journey with its actual worker and cache assertions. Browser/platform reconciliation (Windows baselines versus Ubuntu workflow), ports and runtime preparation belongs to P16.1.

## Strict fixture and policy limitations

- Replace AUTH's permissive `{}` fallback with strict **method + scoped path + relevant query** matching. Unexpected API calls fail the fixture. Validate mock DTOs with shared Zod contracts and capture any unexpected 4xx/5xx/network error. Deliberate error-state cases identify the exact expected failure.
- Fixture grants represent the documented current policy; do not grant every action merely to expose a screen. Exercise authorised and denied controls independently. A synthetic role/action combination proves UI behavior only; real API/policy/receipt/isolation guarantees remain the integration and P16 campaigns.
- Denied panels must not request or render cached private data. Include permission revocation and person/event switch cases where reads/cache are involved. Do not reuse full person/incident/photo/announcement data in an unrestricted reference fixture.
- Reuse stable synthetic data, coherent event/person/station IDs and event-local clock. Preserve actual rehearsal and category/stage/filter semantics. Snapshot masks cannot hide policy, error, count or status content.
- SEED has no captures, redemptions, safety cases, audit before-after history, published content, pending swaps, print jobs, user schedules or archive exports. Add typed state handlers or explicit test-only seed extensions; never claim empty initial pages cover those capabilities.
- Briefings default to the first sandbox day, which has no seeded waves; choose a future tour day or supply typed slots. The old redemption visual uses booth at SIGNUP_BOOTH; supply a valid redeemer at MISSION_COMPLETE.
- **Owner database rule supersedes old scripts and README: tests use `spoh2027_test` only on localhost:5435.** P16.1 must correct `spoh2027_visual_test` and `spoh2027_rehearsal_shift_e2e_test` guards/workflow/docs before running them. Never migrate, reset or seed real `spoh2027`. Every Prisma command has explicit `DATABASE_URL=.../spoh2027_test` and `SPOH_SKIP_DOTENV=1`. Do not create extra test databases to preserve obsolete fixture instructions.
- No AWS/provider proof, staging acceptance or browser campaign is claimed by authored mocked specs. Existing owner approvals remain in P16.8. Keep `.local/` out of commits and shared evidence.

## Keyboard, icon and live-region cases

Laptop keyboard flows share the same fixtures, run in light/dark, assert visible focus, sensible order, field-error association, no focus trap and confirmation cancellation returning focus to its origin:

| Admin path                      | Keyboard sequence/state                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users / invite / person         | Search → Manage → withdraw confirmation/cancel; invalid CSV → associated errors → corrected preview/apply; person membership/privacy controls and denial. |
| stations / categories / days    | Native details Enter → edit fields → Save; day/type/category removal confirmation; exception grid reachable without pointer.                              |
| gifts / cards                   | Stock adjustment confirmation; card lookup → issue/void/reissue confirmation → cancel/focus return; print/download controls.                              |
| settings / permissions          | Tabs/role selector → editable field → validation → save/retry; read-only controls and denied policy reason.                                               |
| content / schedule              | Draft edit → review → publish confirmation; producer choice → time/reason → create → cancel pending.                                                      |
| staffing / swaps / briefings    | Assignment/unassign; CSV review; swap decision; escalation editor; briefing day/briefer/time and completion notes.                                        |
| audit / corrections / close-out | Filters → before-after details → older page; select record → reason → confirm; blocked/allowed close/archive checklist and confirmation.                  |

Every icon-containing button/link needs an accessible name; decorative SVGs are hidden. Explicitly assert count/group steppers, scanner/QR/camera/upload and tab controls. Live cases cover capture queued/synced/failed, count/group increment+undo, stamp/redeem pending/warning/result, lost-person active/ack/clear, and mutation validation/error/success/toast. Assert the intended `status`/`alert` semantics and changed text after a controlled action, not merely existence of an empty live region.
