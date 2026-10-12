# P14 implementation plan — 11 October 2026

Planning only, while the foundation/P13 batch is frozen for CI. No P14 build or
verification is claimed. ADR-011 applies; browser execution remains in P16.

## Ownership

- Root: entity homes, filtered records, global search/command palette, complete
  browser route/viewport/theme inventory, accessibility and visual suite authoring.
- Client lane: dashboard destinations, shared query/mutation feedback, confirmations,
  undo/toasts, glossary and help on administrative controls.
- Notification lane: private persistent centre/read state, per-person push preferences,
  transactional producers, current audience checks, retention and export/erasure.
- Branding lane: existing branding JSON, approved assets, manifests/metadata,
  shell/sign-in/TV and frozen exports. Coordinate central files and dependencies.

Root owns schema/migrations, shared exports, app router mounting, action/audit
catalogues, navigation central entries, route inventories/matrices and package files.
Agents must coordinate their patches to these rather than overwrite one another.

## Entity and record contract

Use static `/entity?kind=...&id=...`, `/records?kind=...` and `/search` client pages;
runtime `[id]` pages do not fit the existing Next static export. Links use the
current event through `appPath`; never accept a server-returned arbitrary href.

An explicitly reviewed `Entity.Read` composite enforcement point may select existing
Cedar actions/resources by kind. It is a middleware name, **not a new Cedar action**.
Record it as decided per request in the route matrix and independently test the
kind/action/resource table. Related data, counts and links need their own existing
read permission before querying; hiding only the link after exposing the count is
insufficient. Search enters through Self.Read and filters each kind by its authority.
Policy failure must produce 503 rather than an apparently empty successful search.

Cover the eleven P14.1 homes plus the matrix's gift stock history, audit entity
links, capture-row details and assignment/shift links. Resolve card IDs to scoped
codes for audit/reissue links; never put QR payloads in URL history.

Important existing permissions:

- Station reference Self.Read; counts Dashboard.ReadStation; roster Roster.ReadStation.
  IC foreign-station counts are allowed; foreign-station roster is restricted.
- Full person detail People.Read. Own/allowed roster references use deliberately
  limited projections; never expose the full person DTO through Self.Read.
- Full day/config Structure.Read; own shift/day references derive from the caller's
  existing membership/assignment. Shift has no independent Cedar resource type.
- Incident detail/follow-ups Incident.Read on the scoped Incident.
- Active alerts intentionally include reporter phone. Resolved history omits age,
  description and clothing immediately, including when the purge worker is late.
- Found items retain current photo authority and no claimant identity fields.
- Announcement bodies require current role/today station/day/expiry eligibility or
  the existing sender-history authority. Ack is a write, not a read gate.
- Capture import metadata Fallback.Import; roster imports Roster.Edit; cross-type
  history Audit.Read. Gift ledger uses existing dashboard reads; adjustment is a write.

Every source, related query and cursor anchor names the event and the same filters.
Validate the cursor within that dataset before `pageArgs`; its bare id cursor does
not by itself prove scope. Bound pages, preserve deterministic sort/id ordering.

Records preserve event date, rehearsal inclusion, station/person/category/status,
stage, gift type and severity. Match existing aggregate semantics: server recordedAt
for registration/footfall, issuedAt for cards, quantity sums for footfall, distinct
cards for redeemed/station stamps, and the existing LOST/VOIDED rules. Preserve raw
station CODE funnel stages without lowercasing them into reserved stage names.

## Exact import provenance and undo

ImportBatch currently lacks capture-row associations and a window FK. New capture
imports need nullable composite event/batch links on Registration/FootfallTick and
an optional scoped batch/window FK. Create the batch before insertion inside the
same transaction; only newly inserted rows acquire it, and duplicates keep the
original batch. Existing `import.run` audit metadata can explain historical window
links through a narrow safe facade, but cannot prove historical row association.

Reasoned undo voids retained rows in one event/batch/row-lock transaction, rechecks
CURRENT Fallback.Import and each Record.Void permission, writes audit, and uses a
durable receipt. Cover concurrent/ambiguous retries, prior manual voids, rollback,
duplicates, foreign IDs and legacy unlinked batches. Do not nest existing per-row
use cases, and never infer ownership from filenames or timestamps. Roster identity
provisioning is outside capture undo.

## Browser campaign preparation

Current visual inventory covers 29 of 48 existing pages, with 100 light-only stored
snapshots. Restore the four P13 compositions, then include every new P14 route.
Share one route/fixture inventory; phone 390×844 and laptop 1440×900, light and dark.
Add all-route axe, keyboard admin navigation and icon/live-region checks. Current
axe covers only nine distinct pages; no keyboard-only admin walkthrough exists.
Windows baselines and Ubuntu workflow, ports and disposable database fixtures need
reconciliation in P16.1. Never run or claim those browser campaigns during build.

P14.5 defaults to urgent push only; operational opt-in must not suppress the durable
in-app notice. Notice reads do not acknowledge source alerts/announcements. Source
details recheck current audience/permission. Partition caches by person and event.
Branding should use escaped tags, linked assets and bundled runtime code; avoid a
new inline script because P15 will hash the actual static-export bootstraps for CSP.
