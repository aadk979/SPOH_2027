# P16 permission replays and platform appointments — 15 October 2026

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P16.10 remains in progress. The preceding 24-file event-day, settings and visitor-field
batch was delivered as `3d996c6eb9ffb15d719f35e7b813ce71b474f11c` after a fresh complete
29-step Node 24/npm gate: 8,547 passing tests and the same two historical server skips.
Server coverage was 96.73% lines / 88.34% branches, above the unchanged floors.
[All five exact-SHA CI jobs](https://github.com/aadk979/SPOH_2027/actions/runs/38707672935),
including the actual deployment image build and verification, passed. Its one direct-main
push did not redeploy unchanged application code. The earlier failed runs and coverage
evidence remain preserved.

The next cases exposed three application defects. This report describes their source
repairs and local verification. The repaired application needs its own complete gate,
exact-SHA CI, staging release and real-provider acceptance; the preceding batch's success
does not establish those results.

## Replayed permission data omitted no-store

Four positive permission-review cases failed because the initial handler set
`Cache-Control: no-store` but the idempotency middleware answered an alias replay before
that handler ran. The permissions router now applies the header before authentication,
validation, receipts and handlers. This also protects grant responses, errors and
simulation results through both URL forms.

All 55 semantic cases subsequently passed against only `spoh2027_test`. The published
cases additionally assert no-store on grant changes, exact replays, changed-intent
conflicts, fixed/minimum-role refusals, stale reviews and missing simulation resources.
They retain normalization, exact business-audit effects, original grant restoration,
field retirement and protected-data checks. The 20 create cases deliberately pair a
normalized scoped creation with an alias duplicate-code conflict; update cases exercise
both forms and restore their original metadata. Corpus preparation annotations are
historical classification, not staging acceptance.

## Platform appointment did not reach its approved person policy

[ADR-005 §3 and approved C5](../../../docs/adr/ADR-005-authorization-avp.md) permit an
organisation's platform administrator to appoint an event Admin. The two initial
positive provisioning cases instead returned 403: the enforcement point, transaction
recheck and older service rank checks used committee-member authority throughout.
Ordinary event-admin and self-mutation refusals already passed.

Principal selection now reads the active person's current platform standing in the
event's organisation. Invites and role assignments use the existing Person policies
for that standing; other callers retain the existing committee rank rules. Mutation
rechecks still require an active event membership, hold current organisation standing
and ask Cedar inside the transaction. A person question with no named resource fails
closed. The self-mutation refusal always remains in force. Profile changes retain their
separate membership permission, and Cognito groups grant no application authority.

The same distinction applies to roster preview and commit. Twelve tests passed across
provisioning and import, scoped and alias forms: platform appointment succeeds, ordinary
event admins and the caller's own account remain refused, and an existing bound account
with an accepted invitation is reused without another provider account or invitation.
The original person's profile content is preserved.

Ten further authority cases passed. They cover another organisation, a missing event,
deactivated or erased people, inactive event membership, empty person questions,
independent platform versus committee standing, and platform authority withdrawn after
the provider stage. Withdrawal prevents binding and invitation while preserving the
unbound provider-operation journal. These are disposable-database tests with a local
test provider; they are not real-person recovery acceptance.

## Provisioning retained a warm revoked-session cache entry

After appointment began succeeding, the target's old access token still returned 200.
The regression was repeated through the provider-token exchange with an explicitly
verified thin-session ID, retaining its immediate 401 assertion. The database session
was revoked, but targeted volunteer-cache invalidation did not evict the local session
liveness entry before the asynchronous notification arrived.

Provisioning now clears that liveness cache after the SQL transaction commits. Existing
transactional revocation, rollback, notification and separately journalled invitation
delivery remain. All six thin-session provisioning cases then passed, followed by all
twelve provisioning/import cases. No test advances time to hide the revocation failure.
The failed native results, original fixtures and stronger replacement fixture remain
preserved privately.

## Verification and delivery

The matched private previews passed all 77 cases: 55 semantic, 12 appointment/import and
10 authority cases. Publication copies their assertions and shared corpus bindings.
The sole local database is `spoh2027_test`; source inventory sends no provider or HTTP
request. Staging has not executed these new semantic cases on the repaired image yet.

The fresh combined 29-step Node 24/npm gate exited zero at 2026-10-15T11:23:34.9648643Z, with all
15 frozen source files unchanged and no inherited steps. It passed 8,624 tests:
server 6,719, client 1,220, shared 348, policies 158 and infrastructure 179.
The two historical server skips remain. Server coverage was 96.72% lines /
88.36% branches; client 80.23% / 71.80%; shared
94.38% / 87.40%. All unchanged floors passed, including the 96.67%
server line floor. Build/image/CSP, types/lint, architecture/hardcoding, dependency audit
and both secret scans passed. Complete coverage and hashes were archived privately.
The retained bundled-CDK advisory exception expires on 31 October.
This establishes local acceptance only; the repaired staging image and real-provider
cases still require their own evidence. Exact-SHA CI and release results are separate.

Delivery retains a fresh complete Node 24/npm gate with no resumed steps, unchanged
coverage and lint floors, archived coverage, final whole-batch staged secret/whitespace
and stat review, one direct-main commit and one push. This application change requires
all five exact-SHA CI jobs including image verification, followed by a successful staging
release and native current-image checks. Exact CI and release evidence are recorded
separately from local acceptance.

## Remaining campaign

Run the prepared real-provider semantic and ordinary-admin cases on the accepted repaired
image using the existing seven synthetic identities, normal authentication and existing
MFA. Preserve original fixtures, restore grant values through valid writes, retain
advanced versions and review/audit history, and retire only newly created empty QA fields.
No additional invite, account, MFA enrollment, staging host SQL or raw secret read is
authorised by these tests.

Finish the remaining granular API obligations before full/browser regression, deferred
acceptance, load, drills, restore and handover. The owner waived the continuous 24-hour
soak; P16.9 is skipped without a successful-soak claim. Other owner gates, actual alarm
receipt, independent assurance, real-person recovery and production/go approval remain.
No whole-API or P16 completion, zero operating High, ASVS Level 2 or production
acceptance is claimed.
