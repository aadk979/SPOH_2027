# P16.10 — Capture, lifecycle and invitation regressions

The accepted application `628fba94fae82103223092747df758b6bacb65bc` passed all five
jobs in exact-SHA CI 38727031044, including the actual image check. Staging release
38731108427 passed all three jobs and Smoke. Its ARM64 image and 73 deployed policies
were checked against the accepted source before the following HTTP batches.

The earlier repaired permission campaign also completed on this image: 55 semantic
cases across 110 primary requests, 80 read/access cases with 24 matched denial audits,
and 17 platform appointment/refusal/revocation cases. The two observed unexpired-token
revocations took 37 ms and 45 ms. Original event standing and global profiles were
preserved; the additional Chief membership in the second event was retained deactivated.
A private expectation initially required generic `FORBIDDEN` instead of the specified
`ROLE_ESCALATION_DENIED`. Its failure remains recorded. Read-only reconciliation
preceded execution of only the nine outstanding cases; successful writes were not repeated.

## Separate capture event

One additional synthetic event was configured through normal APIs: actual current-day
shift/station assignment, category, separate live/practice card batches, synthetic gift
stock, reviewed published content, attendance using the observed caller network, and
reviewed role grants. Original events were preserved. No real visitor values, provider
accounts, invitations, MFA enrollments, staging host SQL, clock changes or readiness
overrides were introduced. The seven existing provider identities remain the cohort.

| Batch                         | Accepted primary cases | Evidence checked                                                                                                                                                    |
| ----------------------------- | ---------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRAFT, READY and REHEARSAL    |                     29 | Field validation, actual expired/missing auth, illegal edges, exact replay and stale versions                                                                       |
| Rehearsal captures            |                     44 | Registrations/group size, paper entries, card issue/stamp, synthetic gift/stock corrections, retries, 12 exact business audits                                      |
| Rehearsal exit and first LIVE |                     26 | Nine earlier successful cases reconciled, 17 remaining cases; real readiness, versioned transitions, practice isolation, four transition audits                     |
| LIVE captures                 |                     44 | Same capture/retry/correction corpus, independent stock and counts, 12 exact business audits                                                                        |
| Invalid capture fields        |                    190 | 185 malformed requests across seven routes plus five state/count controls; no business writes                                                                       |
| CLOSED, real queue and reopen |                     33 | Fresh capture refusals, six genuinely created pre-close queue records, exact retries, premature archive refusal, required reopen reason and report/reminder effects |

These are 366 additional primary cases, not completion of the 423-route matrix. Audit
pagination and setup requests are separate. The final synthetic event remains LIVE for
remaining role coverage. It has nine registrations and nine room entries including
practice, four issued cards including practice, three completed journeys including
practice, and restored live gift stock of 100. The three counts retain their separate units.

The first attempt to leave rehearsal stopped in READY when fresh server evidence showed
an alarm and a backup horizon beyond five minutes. Its native failure and successful
READY/DRAFT/READY transitions were preserved. After the actual alarm recovered and RDS
advanced its restorable horizon, a read-only reconciliation preceded the outstanding
steps. All eleven checks passed immediately before first go-live and in its committed
transition audit. No successful transition was repeated or readiness failure overridden.
The five-minute RPO in ADR-008 remains unchanged; a passing observation is not a restore
rehearsal or evidence of continuous compliance.

Close-out used real time. Six synthetic outbox bodies were created while LIVE, then sent
unchanged after the server committed CLOSED. Each wrote once. Newly recorded captures
were refused. Archive retained its real grace-period and final-export blockers. Normal
platform reopening superseded the frozen final report and cancelled its archive reminder.

## Defects and fixes

Malformed lifecycle targets correctly returned 400 but were counted as authorization
evaluation failures. Three such requests triggered `spoh-staging-authorization-failed`.
Six regression cases reproduced the false metric; four genuine outage controls passed.
Preparation that returns an existing client-safe application refusal now counts as
unaskable. Its HTTP answer remains unchanged. Unexpected/provider failures still count
as failed and return 503. The alarm definition and its threshold are unchanged.

A preflight for adding the original five role actors to the capture event stopped before
any membership write when the volunteer's retained invitation history contained both an
old `DELIVERY_UNKNOWN` and a later accepted resend. Local HTTP tests reproduced the
consequence: provisioning/importing another membership for that normally authenticated,
bound person returned 503 by revisiting the old invitation operation.

Membership-only work now skips invitation delivery for the exact already-bound account
when the person has an active membership in the same organisation with a recorded
successful sign-in. The subject and active person standing must match. A fresh account,
an account without that sign-in evidence, or inactive history retains the existing
delivery path and ambiguous-delivery refusal. No journal is rewritten and no new invite
is sent. Four positive regressions failed before the change; four negative controls
passed. The repaired cases preserve original profiles, memberships and identity journals.

The identical 185-request field-validation corpus is now a maintained CI integration
test. Its generated bodies are compared offline with the preserved staging bodies,
allowing only fresh receipt UUIDs and the actual current paper-block timestamp.

## Verification and delivery

The first complete local gate stopped with one existing 30-second structure-body test
timeout; 6,737 server tests passed and the two historical skips remained. Windows power
events show a lid-triggered Modern Standby interval from 23:03 to 23:25 Singapore time,
matching that test's 22-minute wall time. The native failure and complete available
coverage were archived; no commit or push followed. The test, timeout, retry policy and
coverage floors remain unchanged. Acceptance requires a new complete gate.

The next attempt was interrupted at about 00:54 Singapore time on 16 October: Docker
and all six owned verification workers disappeared without native terminal records.
Coverage observations contained 326 of 327 test modules, with the product-settings
module still outstanding. No sleep/wake event was recorded during that attempt. Its
available coverage, logs, source freeze and controller journals were archived with
`actualExitCode: null`; this is incomplete evidence, not a passing or failed test result.
Restarting Docker reproduced the retained stale runtime-socket error. Only the verified
socket directories were preserved and replaced; images, volumes and settings were kept.
No commit, push or staging deployment followed the interruption. Its root cause remains
unestablished, and acceptance still requires a fresh complete gate.

The fresh 29-step Node 24/npm gate exited zero at 2026-10-15T18:01:51.6010398Z, with all nine frozen
source files unchanged and no inherited steps. It passed 8,643 tests: server 6,738,
client 1,220, shared 348, policies 158 and infrastructure 179, plus the two retained
historical server skips. Server coverage was 96.73% lines / 88.40% branches;
client 80.23% / 71.80%; shared 94.38% / 87.40%. All unchanged floors passed,
including the 96.67% server line floor. Types, lint, image/build/CSP, architecture,
hardcoding, dependency audit and both secret scans passed. Complete coverage was
archived privately. The bundled-CDK advisory exception still expires on 31 October.
This establishes local acceptance only; exact CI, staging and provider rechecks are separate.

The batch retains a fresh complete 29-step Node 24/npm gate, unchanged coverage/lint
floors, complete archived coverage, final whole-stage redacted secret/whitespace/stat
review, one direct-main commit and one push. The application fixes still require their
own exact-SHA CI image result, staging deployment and matched real-provider recheck.

P16.10 remains in progress. Full/browser regression, deferred acceptance, load, drills,
restore and handover remain in their documented order. Only P16.9's continuous 24-hour
soak is waived. Owner reviews, budget, production creation/cutover and go/no-go gates
remain. No production-readiness or ASVS acceptance is claimed.
