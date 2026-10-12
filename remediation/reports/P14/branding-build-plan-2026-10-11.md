# P14.6 branding build plan — 11 October 2026

Planning only while the foundation/P13 batch completes CI. No P14 application
source, dependency, database, infrastructure or verification change is claimed.
Implement this lane only after the coordinator authorizes BUILD. ADR-011 applies:
source and lint/typecheck first, touched suites afterward, then the shared batch's
single full local CI and application push. Browser execution belongs to P16.

## Existing implementation and gaps

| Surface        | Current implementation                                                                                                                                                                                                               | Required change                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence    | `Organisation.branding` and `Event.branding` are nullable JSON. `createClonedEvent` copies the source JSON verbatim.                                                                                                                 | A strict versioned shape, explicit approved publication, scoped immutable asset references and clone remapping. Arbitrary legacy JSON does not establish approval.                                                     |
| Content assets | `ContentUploadReceipt` records event, issuer, generated key, MIME and declared bytes. `contentStorage` signs exact uploads, pins uploaded S3 versions/ETags before copying, and serves only committed publication members.           | Reuse these boundaries for branding upload receipts; add decoded, normalized logo/icon variants and a branding-specific publication registry. The present content system has no generic approved-brand-asset registry. |
| Authority      | Existing `Content.Edit` and `Content.Publish` apply to Event, with Chief/Admin minimum role. `prepareContentMutation` locks the event and checks current membership/Cedar again inside the write transaction; ARCHIVED is read-only. | Reuse those existing actions for upload/draft and explicit publication. Record routes and audit actions centrally; do not create a new role comparison or new permission solely for branding.                          |
| Shell          | `GlobalNav` already shows `event.name`; the shell has no event logo or theme loader. `MyEvent` and `EventSummary` omit branding.                                                                                                     | A public, bounded branding read and one shared identity/theme component, without enlarging the public DTO into an operational event summary.                                                                           |
| Sign-in        | The page is generic, with a `returnTo` query; its development placeholder contains an event-specific test domain.                                                                                                                    | Resolve an exact safe event slug from a same-origin event return path, display its published identity and use neutral fallback. Replace the placeholder with a generic example.                                        |
| TV             | `TvScreen` displays the event name and pins dark mode, with no logo or event accent.                                                                                                                                                 | Reuse the identity component while preserving the large type, dark mode, alerts and non-interactive count display.                                                                                                     |
| PWA/head       | `layout.tsx` has neutral static title and fixed accent; `public/manifest.json` still names the old event and dates. Next exports only `/e/_` and cannot use incoming-request Route Handlers or dynamic metadata.                     | Neutral static defaults, runtime event head/manifest selection, and escaped head replacement in the existing Express static-file adapter. No Next request server is needed.                                            |
| Reports/cards  | Reports freeze event name/slug/status; CSV/XLSX already title themselves with that name. Print exports freeze event/station/batch labels, but neither system freezes logo or accent.                                                 | Extend frozen documents with optional approved branding metadata and render logo/accent from that historical snapshot. Never consult today's branding when reopening an old report/export.                             |

Reviewed local entry points include `content/application/storage.ts`,
`content/application/createImageUpload.ts`, `content/application/prepare.ts`,
`content/application/publishContent.ts`, `content/application/cloneContent.ts`,
`content/data/repo.ts`, `event/application/applyClone.ts`,
`platform/http/staticClient.ts`, `report/application/generateReport.ts`,
`report/application/export/{toCsv,toXlsx}.ts`,
`missionCard/domain/printContext.ts`, `missionCard/application/cardPrintLayout.ts`,
`GlobalNav.tsx`, `EventProvider.tsx`, `SignInScreen.tsx`, `TvScreen.tsx`,
`layout.tsx`, `sw.js` and the Firebase hosting generator.

The installed Next documentation was read at
`node_modules/next/dist/docs/01-app/02-guides/static-exports.md` and
`01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`.
The existing static export remains the delivery architecture.

## Recommended contract and publication boundary

Documentation check: P14.6 and F01-001/003/004/005 require the event name and
organisation identity at sign-in and in PWA/head/export surfaces. ADR-001 §§1/5
defines the existing Organisation/Event JSON and slug-based client workspace;
ADR-003 §7 provides the versioned guide-publication pattern; ADR-005 maps
`Content.*` to the old `config.manage` capability. These documents do **not**
explicitly prescribe a branding publication action or an unauthenticated slug API.
Using `Content.Edit`/`Content.Publish` for this narrow identity publication is an
**assumed implementation recommendation under D-23**, supported by the approved
sign-in/manifest requirement. Root will add the exact public projection exception
to ADR-001 §4. Its ordinary operational event API retains the outsider-404 rule.

D-18 explicitly makes `Event.name` the only editable event name, with the existing
Chief/Admin rename action. Do not duplicate it in a branding draft or silently
replace `Structure.Edit` with `Content.Publish` on that existing route. Before the
first branding publication the public route reveals no event identity. After an
explicit publication, a later authorized rename changes the public display name
and its ETag immediately, consistent with D-18's all-surfaces name rule; publishing
a new logo/accent still requires current `Content.Publish`. Frozen exports retain
their generation-time name. The branding panel must explain that rename behavior.

ADR-001 defines slug uniqueness **within an organisation**; the Prisma schema does
the same. D-02 currently deploys one organisation, but tests and future deployments
can contain another. A public lookup must fetch at most two exact slug candidates
and refuse an ambiguous slug with the same not-found envelope, without counts or
organisation identity. Never `findFirst` an event across organisations or choose a
candidate because one is published. Authenticated branding APIs use the stable
path event ID and current EventScope, so they are never ambiguous.

Keep the existing Event JSON rather than introduce another persistence model.
Use a strict `schemaVersion: 1` envelope with a monotonic draft/publication version,
an optional pending receipt, the current published identity and a bounded registry
of immutable approved asset sets. Persist server-only object keys/version IDs in
that registry; return only the selected public projection and server-generated API
asset paths. Separate draft state from published state. Retain asset entries used
by frozen reports/cards; never evict them merely to make room for another publish.
Enforce a documented registry/JSON budget and report an actionable limit before
writing, rather than growing the Event row without a bound.

An identity contains the event name, one validated `#rrggbb` accent, optional logo
alt text, immutable logo/icon variant IDs and a publication version/ETag. The event
name remains the existing Event field, edited through the current rename flow;
branding draft controls do not introduce a competing name. A name change invalidates
the public identity/head/manifest ETag, while frozen exports retain their old name.
Organisation JSON may supply a validated default accent and approved identity;
unknown or malformed legacy organisation/event JSON falls back to neutral defaults,
never to arbitrary URLs, CSS, HTML or storage keys.

Assume the documented event identity becomes public only through explicit branding
publication. The pre-sign-in route may reveal that published name, app label, logo,
colour and icons for the exact requested slug. It reveals no IDs needed by private
APIs, status, venue, dates, memberships, roster, counts, draft body, upload receipt,
storage key, signed credentials or arbitrary list of events. Unknown/unpublished
slugs return the same not-found result; the sign-in page falls back to neutral copy.
Authenticated event pages can still show their already-authorized event name before
a branding publication exists. Record these assumptions with the P14 batch.

Every mutation takes an expected version and durable UUID intent. Lock Event,
recheck current permission and archive state, then lock/settle the reserved receipt
using the established order. Publishing makes the normalized assets reachable only
when the approved registry entry, publication pointer, audit and success receipt
commit together. A successful object write followed by DB rollback remains private
and inaccessible through the public proxy. Never adopt an existing object after a
conditional-write conflict or expose a pending object through a guessed path.

## Asset processing and storage

Issue server-generated `drafts/<eventId>/branding/<receiptId>` upload keys in the
existing private content bucket. Accept only existing raster MIME types, at most
the current content-image 1 MB limit. Match declared size/type to the upload receipt,
then decode the pinned S3 version with explicit input-pixel and output-byte bounds.
Reject incorrect type, malformed images, multiple frames/pages, unsupported content
and decompression-limit failures. Do not accept SVG, remote URLs, user-selected
object keys or a found-item/floor-plan receipt as a public branding image.

Normalize the decoded image to metadata-free PNG. Generate a compact logo plus
192×192 and 512×512 icons and a separate maskable 512 variant with a deliberate
safe margin. Preserve aspect ratio and make transparent logos legible on both
surfaces; show the administrator the actual variants before publication. The
already-installed dependency tree contains `sharp` 0.35.5 through Next; root should
pin that exact version as a direct server production dependency when BUILD starts
and verify the native ARM64 runtime packaging. Do not depend on Next's transitive
installation in the production server layer.

Use `content/<eventId>/branding/<publicationId>/<fixed-variant-name>.png` for approved
objects. Current `infra/cdk/src/contentAccess.ts` already permits GetObject,
GetObjectVersion and PutObject under `drafts/*` and `content/*`; this namespace fits
without bucket listing, public ACLs, delete rights, new buckets or broader IAM.
Only the committed event-scoped registry authorizes reads. Public asset routes take
the slug/publication/allowlisted variant, resolve the exact approved row, then read
the server-owned key. Return fixed `image/png`, `nosniff`, a digest ETag and immutable
caching. Missing/corrupt objects fail closed; never proxy an arbitrary S3 key.

Do not reuse `content/assets/:versionId/map-N` as an unauthenticated logo route.
That existing route deliberately checks a committed content document and Self.Read.
Private guide, found-item and branding approval boundaries remain distinct.

## Public identity, CSS, manifest and metadata

Recommend a new `branding` module facade with authenticated draft/read/upload/publish
routes and a separate credential-free exact-slug public router. Root mounts it and
records its authorization classification. Example public resource family:
`/api/v1/public/events/:slug/branding`, `/theme.css`, `/manifest.webmanifest` and
`/assets/:publicationId/:variant`. Final names should be agreed with the central
route owner before contracts are written. Public latest identity/manifest reads
revalidate or use no-store; versioned CSS and image assets are immutable.

Use one linked stylesheet that emits only fixed custom-property names and validated
colour values. Derive light/dark link, focus and button variants with contrast
checks against the actual surfaces and on-primary text. Preserve alert/warn/ok
colours and bright-hall capture overrides; branding must not recolour safety states
or weaken target size/contrast. An invalid accent is refused with a specific error.
No unrestricted selector, event name, URL or input text enters CSS. No inline style
element, `style` prop, DOM style assignment or inline bootstrap script is required.

As agreed in the P15 CSP plan, links use `crossOrigin="anonymous"`; the exact API
origin belongs in style/manifest/image policy directives as needed. Existing API
CORP is same-site and production Firebase is a separate origin, so the anonymous
CORS request and exact client allowlist must be preserved. Logo elements also use
anonymous CORS mode when crossing origins. No cookie/token is needed for these
explicitly public resources.

Manifest `id`, `start_url` and `scope` must identify the client event workspace,
not the API host that serves the manifest. Build absolute URLs from validated
`CLIENT_BASE_URL`, falling back to `APP_BASE_URL` only for the existing shared-origin
deployment. Never derive them from an unchecked Host/Origin header. The scope is
the event's `/e/<slug>/` path and the start URL its `/home`; icons refer to approved
API asset variants. A missing valid production client origin is a configuration
error, not an invitation to publish a manifest with the wrong origin. Keep a neutral
static root manifest for platform pages and before the event identity resolves.

Keep `layout.tsx` defaults generic and add one bundled runtime head controller:
title, description, theme colour, manifest, favicon/apple icon and stylesheet are
updated together for the current slug, with no unsafe HTML. Remove prior event
links immediately on a slug change or failure; ignore stale responses and cleanup
on unmount. Runtime metadata is needed on both Express and Firebase. In Express,
the existing static adapter can additionally replace escaped head tags for exact
HTML event/sign-in requests before sending the file. Preserve all inline Next
script bytes, exported-path resolution, RSC/text assets, status codes, unknown-route
404s, and neutral fallback during an unavailable branding read. No runtime template
injection into inline script is acceptable because P15 will hash those exact bytes.

Firebase serves static destinations and cannot vary initial HTML per event. It
will use neutral prerendered head tags followed by the same bundled runtime event
controller; record this delivery limitation accurately. Do not invent Next SSR,
build one export per event or claim pre-hydration dynamic Firebase metadata.

## Shell, sign-in, TV and offline switching

Expose `features/branding` public hooks/components so the shell, event provider,
sign-in and dashboard import through a feature boundary. A small `EventIdentity`
component owns logo dimensions, alt text and graceful missing-logo fallback.
Global navigation retains event name and gains the compact logo without hiding
the environment badge or safety banners. TV uses the same identity with its dark
contrast variant and remains readable at a distance. Sign-in uses only a safe
same-origin return path parsed into an EventSlug; an external/malformed returnTo
must not select a public branding request or alter an authentication redirect.

Use public query keys containing the exact slug and publication version. Cancel or
ignore prior requests on event switches, and clear the old theme before resolving
the next identity. An authorization/session failure must not resurrect a prior
person's event from an unpartitioned cache. Public approved images/CSS may be reused
by their immutable URL; private operational requests keep their current cache rules.

The current service worker rewrites every `/e/<slug>` HTML cache key to `/e/_`.
Event-specific head injection would therefore cache event A's title/links under
the placeholder and serve them to B offline. Fix that specific collision: cache
event HTML by its real event path; retain neutral `/e/_` precache as generic fallback
and continue normalizing shared RSC/build assets where appropriate. Do not expand
the generic API cache exception to branding drafts/latest identity or operational
responses. Any optional immutable public CSS/image cache rule must use the exact
public route, slug and publication, with no credential-bearing Request retained.

## Clone and historical export behavior

Replace the raw branding JSON copy in `createClonedEvent` with the branding facade's
transactional clone helper. Copy only approved source identity/assets into fresh
target event-scoped immutable objects and target registry entries; never copy a
pending receipt or preserve the source event's API/object references. The target
uses the clone request's new name. Editing and publishing the clone's colour/logo
must not modify the source or old files. A clone without branding uses normal
neutral/organisation fallback. Recommend mapping branding to the existing
`copy.settings` flag: false means neutral/organisation fallback; otherwise copy the
approved source appearance into the target draft and require a fresh target
publication, as guide content already does. `copy.content` continues to control
the guide, not branding. The clone review should state this behavior; root records
the assumption before BUILD.

Add optional frozen branding metadata to `FullReport.event` and `CardPrintContext`:
version, resolved accent and an immutable approved logo reference. Root owns these
shared contract changes. Resolve the effective brand in the report-generation or
print transaction, alongside the frozen name, and persist it in the existing JSON
document. Missing metadata on old snapshots/prints remains explicitly unknown; do
not retrofit today's logo/colour onto a historical document.

Keep renderers supplied with validated immutable image bytes instead of allowing
them to fetch arbitrary URLs or read live event branding. A narrow branding facade
can resolve a frozen approved reference for normal report downloads and archive
packs. XLSX embeds the normalized PNG and uses the frozen accent in title/header
formatting; CSV carries the name and explicit frozen branding metadata in escaped
text since CSV cannot embed an image. The card PDF/ZIP renderer includes a compact
logo/accent outside the QR quiet zone and stamping areas, updates header wrapping
and card height, and retains the existing station-label space and Unicode fonts.
QRs remain black on white. ZIP metadata records the same frozen brand used by its
PDF. A later rename, republish, clone or lifecycle transition cannot rewrite stored
historical membership, labels or branding.

## Proposed narrow lane ownership

Branding lane may own new `server/src/modules/branding/{domain,application,data,http}`
files plus its `index.ts` public facade, new shared branding contract leaf/tests,
new `client/src/features/branding` leaf files and focused branding tests. It may
own export-rendering leaf changes after reporting their interface to root. Avoid
parallel patches to the same renderer or shell file.

Root retains Prisma/schema/migrations, shared barrel exports and existing report/
printing contracts, app/API mounting, central action/audit catalogues, route matrix/
inventory, navigation, package files/lock, EventProvider/app layout, service-worker
integration, staticClient/Firebase changes and `applyClone` wiring. Branding supplies
narrow functions/components and proposed patches for these files. Coordinate small
insertion points in GlobalNav, SignInScreen, TvScreen, AdminSettingsScreen and export
response/archive composition with their current owners before applying them.

The recommended UI is a `BrandingPanel` in the existing event settings composition,
with controlled accent/alt inputs, logo upload, rendered variant preview, version
conflict feedback and an explicit publish confirmation explaining public identity.
Use the P14 shared loading/error/denied/confirmation components when available and
existing `useAllows` action checks; do not derive editing authority from a role name.

## Tests to write after source exists

- Strict shape, valid colours and contrast derivation; unsafe CSS/URLs, malformed
  legacy JSON, metadata escaping, MIME validation, pixel and frame bounds, size limits and normalized icon
  dimensions. Exercise genuine decoding faults and complete variant output.
- Current Chief/Admin action authority, deactivated/changed role, foreign event/
  receipt/publication/variant, ARCHIVED writes, stale version and exact replay intent.
  Verify no public/private DTO leaks and no arbitrary object proxy.
- Upload/publication failure and upload-success/DB-rollback, races between publishing,
  renaming and archiving; no approved registry/audit/success receipt after rollback.
- Exact public slug identity, unavailable or unpublished fallback, deterministic
  versions/ETags, cache headers, escaped event names and fixed MIME/nosniff.
- Manifest client origin, id/start/scope and approved icon variants in both shared-
  and split-origin deployments. Verify CORS/CORP behavior in authored browser cases.
- Two differently branded cloned events, fresh target asset references, unchanged
  source and no pending/source-private object inheritance.
- Shell/sign-in/TV identity, safe return path, neutral fallback, event switching,
  failed/stale branding response and removal of the old stylesheet/head links.
- Frozen report/card brand after rename/republish and legacy metadata handling;
  actual XLSX embedded bytes, CSV escaping and PDF QR/stamp/layout preservation.
- Static adapter keeps Next inline scripts unchanged and correct route/404 behavior;
  worker cannot serve A's branded HTML as B's shell. Existing content/offline tests
  and P15 hash-generation tests remain authoritative at their shared integration.

Author browser assertions and route fixtures during P14, then execute them in the
P16.1 campaign. AWS publication/CORS/native ARM64 runtime, installed-PWA behavior
and staging clone acceptance belong in P16.8 after authorized recreation. No live
site rebuild, production creation or cutover occurs in this lane.

## Exact root integration patch list

The following are the current source insertion points, not changes already made.
The branding lane should supply its new public facade/contract/component signatures
first; root can then apply these shared edits as one P14 source batch.

| Root-owned file or group                                                                                                                             | Exact integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/index.ts`                                                                                                                       | Export the new branding contract leaf. Keep it Zod/pure helpers only, with no server/client/native dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/shared/src/contracts/report/index.ts`                                                                                                      | Add optional nullable `FrozenBranding` to `FullReport.event`. Missing historical metadata stays unknown; parsing old reports must remain valid.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/shared/src/contracts/missionCard/printing.ts`                                                                                              | Add the identical optional nullable frozen brand to `CardPrintContextRecord`; the strict print-detail parser must accept new exports and old contexts. Do not add object keys or image bytes to the wire DTO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `server/src/modules/branding/index.ts` (lane supplies)                                                                                               | Export the authenticated/public routers and narrow use cases: `publicBrandingForSlug`, `freezeBranding(scope, tx)`, `readFrozenBrandingLogo(scope, frozen)` and `cloneBrandingInto(tx, input)`. Cross-module callers use this facade only. Final argument/return names must be shared before root patches.                                                                                                                                                                                                                                                                                                                                                                            |
| `server/src/app/routes.ts`                                                                                                                           | Add `/public/events/:slug/branding` to `PLATFORM_ROUTES` and `/branding` to `EVENT_ROUTES`. The public router validates its complete slug/variant/query and applies the anonymous default limit; it does not run `eventFromAlias` or `requireAuth`. The authenticated router still owns `requireAuth` and existing Cedar enforcement. Correct the stale comment that health checks are the only unauthenticated routes. Keeping both in these arrays makes the existing source-derived inventory see them.                                                                                                                                                                            |
| `server/src/platform/audit/index.ts`                                                                                                                 | Add the agreed `branding.image.issue`, `branding.draft`, `branding.publish` audit action literals. Do not invent a new Cedar action or edit generated action files; the permission mapping uses current `Content.Edit` and `Content.Publish`. Root updates audit-link handling for Event/branding publication references as part of the workspace integration.                                                                                                                                                                                                                                                                                                                        |
| `server/tests/integration/route-role-matrix.json`, `routeRoleMatrix.test.ts`, `isolation.test.ts`                                                    | Record each exact new route, read/write role/action and public classification. Add operational outsider isolation plus public published/unpublished/ambiguous-slug and foreign receipt/publication/variant cases. Public exceptions are narrow paths, not a general event-read exemption.                                                                                                                                                                                                                                                                                                                                                                                             |
| `server/tests/helpers/clientCallInventory.ts`, `server/tests/integration/clientRouteCoverage.test.ts`                                                | Keep source-derived callers for the authenticated/public identity mutations and reads. CSS/manifest/icon routes are real `<link>`/image/runtime resource callers; add only exact anchored runtime-caller evidence if the scanner cannot parse those, rather than a branding-prefix wildcard.                                                                                                                                                                                                                                                                                                                                                                                          |
| `client/src/app/providers.tsx`                                                                                                                       | Inside the existing `QueryClientProvider`, after `ClientStartup` has accepted configuration and within the `RuntimeEffects` subtree, mount exactly one bundled `BrandingRoot`/head controller. Do not make the entire application wait for public branding. Give it Suspense around any `useSearchParams` consumer, with a null fallback, to preserve static export.                                                                                                                                                                                                                                                                                                                  |
| `client/src/features/events/EventProvider.tsx`, `EventLayout.tsx`                                                                                    | Preserve member-based slug resolution, `useEventPhase`, remembered event and runtime settings effects, offline category warmup and outbox upgrade. Supply the already-authorized event name to the identity view after EventContext mounts; public branding success must not grant EventContext or render protected children. No change to `/e/[event]/layout.tsx`'s single `_` static parameter is needed. Avoid mounting another competing global head controller here.                                                                                                                                                                                                             |
| `client/src/app/layout.tsx`, `client/public/manifest.json`                                                                                           | Retain neutral static defaults and replace the old event/date/short-name literals in the root manifest. Runtime selection supplies the published exact event manifest, title, description, accent and icon links. The initial static document remains usable without a branding response.                                                                                                                                                                                                                                                                                                                                                                                             |
| `client/src/shared/shell/GlobalNav.tsx`, `features/session/screens/SignInScreen.tsx`, `features/dashboard/screens/TvScreen.tsx`                      | Import `EventIdentity` through `features/branding/index.ts` and use its fixed dimensions/alt/fallback. GlobalNav keeps `event?.name` and environment/session controls; SignIn uses the safe return-path slug and keeps hosted/local authentication flow; TV keeps `data-theme="dark"`, wake lock and safety/count components. None of these leaves fetches directly or compares role names.                                                                                                                                                                                                                                                                                           |
| `client/src/features/settings/screens/AdminSettingsScreen.tsx`                                                                                       | Insert `BrandingPanel` through the feature facade. Its read/edit/publish controls ask current existing actions independently, rather than inherit `canEdit` derived from operational settings. Coordinate P14 shared state/confirmation replacements with the client lane.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `client/src/styles/globals.css`                                                                                                                      | Keep semantic/safety/capture tokens and prepare only fixed custom-property hooks needed by the linked stylesheet. No arbitrary inline style or imported remote stylesheet. Apply dark variants to both root dark mode and the TV subtree's explicit dark attribute.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `server/src/app/createApp.ts`, `platform/http/staticClient.ts`                                                                                       | Composition root imports `publicBrandingForSlug` and injects a read-only function port into the static adapter; keep module-specific persistence out of platform HTTP. Capture the original requested event/sign-in path before `req.url = exportedPath(...)`. Transform only resolved existing HTML for GET/HEAD, with escaped fixed head tags and the unchanged inline-script bytes. Keep RSC `.txt`/hashed assets unmodified, directory containment, missing-route 404s and generic fallback on unavailable/unpublished/ambiguous branding. Compute transformed HTML ETag/content length from its actual output instead of retaining the static file's conditional/range metadata. |
| `infra/firebase/hostingConfig.mjs`, `prepareRelease.mjs`                                                                                             | Preserve the static destinations and client-config local rewrite. Permit only the reviewed exact API origin for anonymous CSS/manifest/image resources where required, coordinating P15's per-document CSP hashes. Firebase does not gain a server rewrite or per-event initial HTML. Do not deploy or rebuild the live site during this build lane.                                                                                                                                                                                                                                                                                                                                  |
| `client/public/sw.js`                                                                                                                                | Change HTML navigation cache keys to the real event path so server-injected head for A cannot populate B's placeholder. Keep neutral `/e/_` precache fallback and current published-guide/offline proof behavior. Shared immutable build/RSC resources may stay normalized. Remove the old event-specific root-manifest literal; retain stable cache/database names that F01-035 expressly classifies as legitimate constants.                                                                                                                                                                                                                                                        |
| `server/src/modules/report/application/generateReport.ts`, `data/readScope.ts`                                                                       | In the existing repeatable-read/close-out transaction, call the branding facade with the current EventScope/tx and include only the resolved frozen projection in `report.event`. Keep event name/slug/status from the scoped summary and preserve every counting rule. This single producer covers current reports, `freezeFinalReport` and `createDailySnapshot` without changing their stored-document read logic.                                                                                                                                                                                                                                                                 |
| `server/src/modules/report/http/{handlers,snapshotHandlers,exportResponse}.ts`, `application/archiveExport.ts`                                       | Supply `scopeOf(req)`/`actor.scope` to frozen logo resolution; `sendReportExport` currently has no scope parameter and needs one. Load only the exact immutable approved reference saved in the report, then pass validated bytes to `toXlsx`. Archive exports use the existing frozen final report, never current branding. CSV requires no image fetch. Existing stored archive downloads remain byte-for-byte unchanged.                                                                                                                                                                                                                                                           |
| `server/src/modules/report/application/export/{toXlsx,toCsv}.ts`, `export/sheets/readMe.ts`, `export/format.ts`                                      | Branding lane can patch these leaf renderers after agreeing an optional typed image input with root. XLSX embeds normalized PNG and frozen accent; CSV adds escaped frozen identity metadata. Keep pure rendering without remote URLs/live DB reads and preserve historical unknown behavior and visitor-sheet authorization.                                                                                                                                                                                                                                                                                                                                                         |
| `server/src/modules/missionCard/domain/printContext.ts`, `application/printBatch.ts`, `application/renderCards.ts`, `application/cardPrintLayout.ts` | Extend the domain context compatibly; `frozenPrintContext(tx, scope, cards)` freezes branding once while the existing Event/card locks are held. Resolve the logo only from this frozen projection, feed bytes into the renderers, recalculate header geometry and leave QR quiet zone/stamp cells intact. Persist the same context in CardPrintExport and ZIP metadata; do not rewrite historical exports or print success receipts. The existing strict detail mapper then accepts it through the shared context schema.                                                                                                                                                            |
| `server/src/modules/event/application/applyClone.ts`, `client/src/features/events/components/{CloneEventFields,CloneEventWizard}.tsx`                | Remove the verbatim `source.branding` insertion from `createClonedEvent`; after target creation call the branding facade in the same existing clone transaction. `copy.settings !== false` copies approved source appearance into target-owned draft assets/registry and `false` yields neutral fallback; pending receipts and source paths never copy. Change the existing settings checkbox/review copy to explain branding is a fresh target draft needing publication. Keep target `plan.request.name`, one audited clone, durable receipt, optional admin joining and operational-record exclusion.                                                                              |
| `server/package.json`, root `package-lock.json`, `Dockerfile`                                                                                        | Root pins server `sharp` 0.35.5 directly when source BUILD is authorized. The existing production-dependencies stage should then carry the platform-native package; assert ARM64 deployment packaging in later acceptance. No new bucket, broad IAM grant or branding-only database migration is proposed.                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/adr/ADR-001-tenancy-event-model.md`, `remediation/DECISIONS.md`, P14/P16 reports                                                               | Record D-23 assumptions for existing content actions, opt-in public identity, post-publication D-18 rename visibility, ambiguous slug refusal and clone settings behavior. Add only the narrow public projection exception to ADR-001 §4. Carry browser/PWA/CORS/native runtime acceptance into P16.8; retain P12.8 and the production go decision.                                                                                                                                                                                                                                                                                                                                   |

Keep `MyEvent` and `EventSummary` at their existing shapes unless another reviewed
P14 requirement needs a field: the existing name plus a separate published branding
projection is sufficient for these composition points. Likewise, do not add a
branding cache-bus channel solely for this feature. Latest public reads can read
the committed row and derive an ETag from name/publication/organisation versions;
versioned public CSS/images remain immutable. Client mutation invalidation must
target the exact slug query, and route/focus polling must not let the previous
event's theme persist.
