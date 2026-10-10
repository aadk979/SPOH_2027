# Identity, guides and close-out build batch — 10 October 2026

**Local CI passed under Node 24.19.0; GitHub CI is pending at this commit.** The complete
local pipeline ran, its failed/affected checks were repaired and rerun, and the final pipeline
exit code was zero. Unchanged successful checks were reused under ADR-010/ADR-011. Coverage
floors were not changed. Tracker steps await the main push's exact-commit GitHub result.

## Built

- Event- and organisation-scoped creation/cloning; identity reuse, provisioning, invite/resend
  quota, membership lifecycle, devices, administrative sign-out, MFA and dual-key verification.
- Optimistic, reviewed guide publication; immutable authenticated floor plans; published-only
  cloning and offline guide/map reads after access-token expiry.
- Frozen final workbook export receipts, guarded archive, membership ending and scheduled
  media/staff/session/identity/audit retention. Audit pruning enforces its 400-day floor in SQL.
- Infrastructure definitions for private storage, secrets, monitoring, notifications, budgets,
  backup observations and manual staging power controls. No AWS resources were created.

The implementation details and acceptance boundaries remain in the P08/P10/P12 build reports
and [remaining-build inventory](BUILD-REMAINING-2026-10-10.md). Whole P08, P12, P13, P14 and P15
phases are not declared complete by this batch.

## Verification

| Suite | Result | Lines | Branches |
| --- | --- | --- | --- |
| Server | 218 files; 2,833 passed, 2 skipped | 96.51% | 87.31% |
| Client | 84 files; 762 passed | 77.21% | 70.26% |
| Shared contracts | 21 files; 267 passed | 92.38% | 81.92% |
| Cedar policies/catalogue | 85 passed | — | — |
| CDK definitions | 19 files; 99 passed | — | — |

The two existing skipped regressions cover shared multi-instance sign-in limiting and a local-day
registration count. Review/reactivate them in P15; a green run does not count them as passed.

Every CI step passed: dependency installation, shared builds, generated catalogues, pricing and
Firebase guards, Prisma generation/test migration, lint, typecheck, static client build,
architecture/hardcoding checks, suites, raw-counter coverage ratchet, dependency audit and secret
scans. Database work used only `spoh2027_test`, with dotenv loading disabled.

Meaningful repair regressions include real actor/publication/session foreign keys; recovery-code
issuance against pruning and revocation; current authority after lock waits; expired-access logout;
and delayed JSON/blob/401 responses across sign-out, account changes and credential rotation.
Same-person renewal preserves pending actions. A previous person's refresh cannot replace the
current person; a credential-free person-ID pin preserves that check across reload. Explicit
sign-in can change the account. The actual group-cleanup script's ten unit cases cover pagination,
dry-run planning, explicit confirmation, serial deletion and errors; it was not run against AWS.

Browser specifications now cover fifty-person import with three corrections and resend, device
revocation/admin sign-out, the event wizard and offline published guides/maps. Browser/visual
execution and external provider/staging observations remain P16; these definitions are not
claims that those campaigns ran.

## Lessons for the next batch

- Prepending Node alone is insufficient when a global npm/npx wrapper selects another runtime.
  Check the npm child runtime too; the corrected local gate used Node 24 for both.
- Unit tests need the explicit local-auth/signing environment as well as the integration project.
- Run the classification guard after adding text/JSON Prisma fields, and use real foreign keys
  for actor and immutable-publication ownership. Keep test cleanup ordered around those keys.
- Session intent and credential rotation are different: normal renewal must preserve in-flight
  work, while explicit sign-in/out invalidates it. The browser can apply a late Set-Cookie even
  when application code discards its old JSON response.

## Next build

Finish P12.1 managed login and protected production configuration, P10 reminder/scheduling gaps,
P08.9's missing browser workflow definition, then P13 setup/staffing/print/correction surfaces,
P14 navigation/search/inbox/branding/common states and P15 security implementation. Build in
large batches with lint/typecheck during writing; add the tests before the next full CI gate.

AWS stays torn down. Production creation/cutover/live-site rebuild and P12.8 approvals retain
the owner's 28 October gate. Missing code stays in its feature step; staging, soak, load, drills,
restore and sign-off observations remain in P16's documented campaign order.
