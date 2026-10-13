# P15 security source review and evidence boundary

13 October 2026. Sole workspace V1-main; baseline
`d2497b6332bd32758f24fd832a01a4d14524c4f0`. This review includes the preserved
untracked P15 files, rather than only HEAD. The captured review inventory covers
2,002 changed tracked paths in application, packages, infrastructure, scripts and
workflows and 111 untracked paths at that checkpoint. These are inventory
counts, not an assertion that every line received a separate human audit.

The preserved independent authority and privacy/logging/upload reviews compared
current split implementations with deleted baseline implementations. Their
source findings are reconciled below. Current implementing-agent review also
walked credential/authority/transaction fences, provider and bootstrap proof,
media/storage/privacy SQL invariants, global/event isolation, deployed template
definitions and diagnostic sinks. A 76-entry source sink inventory checked raw
SQL, process execution, dynamic code/markup and logging; additional CLI/alias
sinks were inspected separately. Review artifacts and credentials stay private
in .local. `/security-review` is unavailable and was not run. This continuation
is not a new independent external security audit or a formal assurance report.

| Finding                      | Current source repair and relevant regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 capture authority         | Exact current capture action, global Person/member/assignment standing and Event admission fence; capture/card authority races and six-role per-ID isolation. Preserves historical shift/late-sync and completed replay semantics.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| H2 global audit exposure     | Legacy event feed selects exact event rows. Cross-organisation null-event person-operation sentinels cannot enter an event feed, filters or cursors; platformIsolation exercises this. History is not backfilled or rewritten.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| H3 diagnostic secrets        | Real Pino sink omits URL/query/private path values, Location/cookies, arbitrary errors/provider bodies and Prisma diagnostics. Notification text/tag was another discovered sink and is removed. Seven final sink cases pass locally.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| H4 credential elevation      | Person-first issuance/current standing, atomic promotion/revocation/envelope/handoff cleanup, new full MFA SID, fixed family deadline and retained original auth_time. Fresh verified authentication/current standing gates MFA setup/verify, remote revoke and recovery; credentialBoundary covers effects and rollback.                                                                                                                                                                                                                                                                                                                                            |
| H5 role import               | Existing-role changes require current People.AssignRole with target rank; unchanged Deputy imports retain Roster.Edit. Current targets are held and audited; rosterIdentityBoundary tests the distinction. Commit proves writable standing before interpreting a stale preview.                                                                                                                                                                                                                                                                                                                                                                                      |
| H6 foreign identity adoption | Reuse proves same-organisation standing and preserves the shared profile unless current People.Update permits a local edit. Foreign-only email reuse refuses without returning/modifying contacts or creating standing.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| H7 provider adoption         | Durable suppressed creation and immutable random operation marker, exact enabled provider email/name/verification/status/subject proof. Unknown manual collisions refuse; provider-ready progress survives bind failure. New recovery and bootstrap regressions cover collisions, current authority, attribution and audit rollback.                                                                                                                                                                                                                                                                                                                                 |
| Delivery rollback            | STARTED and pool-wide reservation commit before external send; ambiguous outcomes persist without refund/automatic resend. SQL cannot undo provider creation or delivery. Recovery, quota and invitation regressions cover the durable boundary.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Media/content                | Bounded pinned streaming, magic/full still-raster decode, metadata stripping, immutable derivative proof and publication manifests. Cleanup intent commits before external storage; exact-key/version deletion protects referenced artifacts. The real media advisory lock now returns an ORM-supported scalar.                                                                                                                                                                                                                                                                                                                                                      |
| Graph/group boundaries       | Reporting links serialize under Event and recheck the current chain/active manager; group card issue independently checks each captured station's permission. A Lead remains restricted to their station.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| SQL and local operations     | Additive proof/state/deadline/immutable constraints; effective app audit privilege tests. Test setup requires explicit skip-dotenv and the sole spoh2027_test URL and never creates a database. Bootstrap locking permits FK key-share admission behind a held Person.                                                                                                                                                                                                                                                                                                                                                                                               |
| Initial platform-only login  | Review found and fixed sign-in's implicit event-membership prerequisite. Organisation-only session settings, global attributed audit, fresh MFA/new SID and renewal now work before any event, without a placeholder membership. platformFirstLogin tests create/join the first real event through the accepted API and refuse withdrawn standing. All 66 affected identity tests pass locally; real provider/browser proof remains P16.                                                                                                                                                                                                                             |
| Restored operator trust root | Further review found that a wholly restored deleted-pool administrator cohort cannot obtain the SID required by recovery. Separate explicit offline bootstrap requires exact current existing PLATFORM_ADMIN/Person/profile/old-subject and bounded provider proof, refuses foreign standing, promotion and a second operator for the same organisation/new pool. Subject binding, all-credential invalidation and attributed digest-only audit are atomic; exact committed replay preserves fresh sessions. Source regressions cover current-standing withdrawal, collision, intent/concurrency and audit rollback. Real execution retains explicit owner approval. |

Authored/affected tests are recorded with actual results in the
[continuation report](build-2026-10-12.md). Complete no-resume local gate and exact
pushed-SHA CI remain delivery prerequisites; local file names and mocked AWS
adapters do not establish provider behavior. The broad integration run had 2,491
passes, 27 failures and two historical skips; grouped repairs are being checked.
No complete-gate, staging, cutover or production-readiness acceptance is claimed
from that run.

The first completed no-resume gate ended actual 1 at 17:32:29 UTC on 12 October:
299 server files with 3,762 passes, two stale assertion failures and two historical
skips; all 1,214 client tests passed. Retained floors correctly rejected server
lines and shared lines/branches. Repairs add direct CSP AST traversal cases and
family/person revocation isolation/rollback proof; floors are not lowered.
Restored-operator source and its regressions were added after this diagnostic run,
so it cannot establish their acceptance. A fresh full gate remains required.

After that source repair, whole lint and server/seed/test types pass, and all 167
affected server tests pass. Shared CSP boundary coverage passes all 348 tests with
94.38% lines/87.40% branches. The complete current-source gate is the next required
acceptance; the previous failed gate is not resumed or inherited.

The fresh complete current-source 27-step local gate subsequently passed actual
0 at 11:18:14 UTC on 13 October. It includes 5,649 passing tests and the two
historical skips, full builds/guards and unchanged-or-raised coverage floors.
See the continuation report for raw counts. Exact pushed-SHA CI and actual staged
secret review remain delivery prerequisites; external assurance remains P16.

## Residuals and follow-through

The corrective fresh 27-step gate completed actual 0 at 12:36:11 UTC on
13 October with the same 5,649 passes and two historical skips. The complete
staged batch was reviewed and pushed directly to main; all five required
CI38398631231 jobs passed at 13:02:37 UTC on
`14baa68c2e947c4cdfee376f1e33aca6c1030b5e`. The
[delivery report](delivery-2026-10-13.md) records ADR-011 build closure and
preserves the residuals below. Later documentation CI is not application proof.

The [253-control ASVS register](asvs-review-2026-10-13.md) records individual
applicability, source evidence, provider/P16 evidence and assurance residuals.
It explicitly retains cookie-path versus __Host-, GET recovery navigation,
password-list/scanner assurance, optional MFA/strength, public-client token
assertion architecture, ordinary idle/concurrent-device policy, provider-reset
coordination and internal HTTP exceptions. ADR decisions are not automatically
ASVS waivers. Owner review remains required; no blanket L2 certificate or
zero-High operational claim is made.

Normalized photo reads still use private, short-lived S3 URLs. The application
cannot add arbitrary CSP/nosniff headers through S3 query overrides; byte decode
and trusted stored raster MIME mitigate content interpretation, but do not prove
every ASVS header requirement on the S3 response. Actual headers must be assessed
in P16 and the remaining assurance disposition recorded explicitly.

The [data map](data-map.md) preserves immutable report/audit/publication,
provider and backup exceptions. Frozen DB report JSON has no implemented purge
deadline and indefinite retention has not been approved. The
[operations runbook](security-operations-runbook.md) records key/DB rotation,
log/crypto/dependency inventories and owner-gated production/decommissioning.
Account root/access questions, IAM-user retirement, paid detection, actual
rotation/receipt/restore, real-person recovery and 28 October go/no-go stay held.
P16 tool preparation must repair its recorded legacy database/history behaviors
before any campaign execution; those tools have not been run here.
