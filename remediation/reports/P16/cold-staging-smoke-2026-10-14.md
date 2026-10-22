# P16-004–007 — Cold staging and hosted MFA bootstrap

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


The preceding SNS correction was delivered as
`7f326075046187dc23fd5b82f2182c4d4769215d`.
[Exact-SHA CI 38442015130](https://github.com/aadk979/SPOH_2027/actions/runs/38442015130)
finished with all five jobs green at `2026-10-13T18:15:13Z`.
The recreated staging platform completed at `18:26:41.339Z`; the edge subsequently
completed with static public IP `13.214.63.245`. AWS accepted the corrected SNS
policy. This does not prove owner alarm receipt.

[Staging release 38447314214](https://github.com/aadk979/SPOH_2027/actions/runs/38447314214)
built and pushed the accepted ARM64 image, applied all 51 migrations and database
roles/grants, and updated the service. Its final smoke step failed: five checks
passed, but anonymous `/api/v1/me` returned 503 instead of 401. Preserve that
failed run; the deployment workflow is not accepted as green.

## Cause and correction

Legacy event aliases select an event before entering their route authentication
middleware. On this deliberately fresh installation, no event exists; the alias
selector refuses with “No event is set up yet.” `/api/v1/me` therefore cannot
prove anonymous authentication refusal before the first event. The person-level
`/api/v1/events` route already exists and actually returns 401 in this state.

The smoke probe now uses `/api/v1/events` and still requires exactly 401. The
other five checks are unchanged. Ten dependency-free tests execute the real
smoke process against loopback HTTP fixtures: an event-free installation,
incorrect anonymous statuses 200/403/429/503, and failure of each original
health/page/private-readiness check. CI runs these tests on every delivery.

The before-fix run exited 1 at `2026-10-13T19:00:59.5861788Z`; the corrected run
passed all ten tests with exit 0 at `19:03:04.3221210Z`. The corrected working
script also passed all six checks against the live native staging HTTPS address.
That is working-source runtime evidence, not acceptance of a corrected pipeline.
Complete before/after logs and actual exit records remain private.

## Staging bootstrap and retained gates

One controlled synthetic initial Cognito operator was created with message
delivery suppressed and independently verified against this staging pool.
The accepted application task, using its application database role and own-pool
provider permission, completed the explicit initial administrator seed with
actual exit 0. Its log confirms organisation/person bootstrap only; events
remain absent and must be created through the application. This is neither
restored-operator recovery nor an authenticated browser/MFA result.

The owner updated DuckDNS on 14 October Singapore time. Both application and
API names resolve to the new static IP. The first HTTPS check still encountered
a TLS alert while edge certificate provisioning was pending; successful TLS and
authenticated journeys remain to be demonstrated.

The complete Node24/npm local gate, final staged secret scan, coherent direct-main
delivery, exact-SHA CI and corrected staging pipeline are still required.
P16.10 remains in progress with zero accepted granular cases. Subsequent P16
steps retain their documented order. Production, real-person recovery/reinvite,
new-cost decisions, independent assurance, owner reviews and go/no-go gates
remain open. Local database work uses only `spoh2027_test`.

## HTTPS and hosted first-login findings

At `2026-10-13T19:09:49.960Z` and `19:09:50.137Z`, both DuckDNS HTTPS liveness
checks returned 200 with normal certificate validation. Before the owner DNS
update, Caddy's certificate challenges had been attempting the previous IP.
One restart of the existing staging Caddy service reset that retry backoff after
public DNS was verified. No TLS validation was bypassed or edge configuration
changed. The initial synthetic operator completed the temporary-password
challenge through managed login in a fresh browser; an independent provider
read confirmed `CONFIRMED`, enabled and no enrolled MFA. An earlier stale
challenge transition and private observer failure remain recorded privately.

**P16-005 — restricted hosted-session bootstrap:** the controlled real browser
then demonstrated a successful callback redirect, followed by ordinary refresh
401 and a return to sign-in. The callback had opened a restricted MFA session;
ordinary refresh correctly refuses that session. The client selected its
implemented first-party recovery only for production cross-origin hosting.
It now selects that existing PKCE-bound, one-use handoff for Cognito sign-in,
including staging and same-origin hosting. Local fixtures retain cookie recovery.
The server's restricted-session and refresh guards remain unchanged.

**P16-006 — user-managed MFA scope:** the actual authorization redirect requested
only `openid email`, although the app client already permits the additional
`aws.cognito.signin.user.admin` scope. The application's provider-token
`AssociateSoftwareToken` call requires that scope under the
[AWS API contract](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AssociateSoftwareToken.html).
The redirect now requests exactly these three scopes. This is a source/protocol
finding; actual MFA enrollment was not reached on the previous deployed image.

Before correction, the affected client suite had two failures/ten passes and
the hosted-login suite one failure/fourteen passes, with both actual exits 1 at
`2026-10-13T19:22:52.8321278Z`. After correction, the client suite passed all 12
and the two hosted-login suites passed all 16 at `19:24:53.9646190Z`. The new integration journey
starts with no events, opens a hosted restricted session, proves refresh and
ordinary protected reads refuse it, redeems a correctly bound handoff exactly
once, rejects a wrong verifier/replay, and completes mocked-provider MFA with a
new SID while the original SID remains refused. This is local integration
evidence, not actual Cognito enrollment or granular staging acceptance.

The first complete-gate attempt was stopped during server tests because this
confirmed runtime defect enlarged the coherent batch. Its actual termination
was -1; its completed checks and unfinished log are preserved. A new complete
29-step run from the beginning is required after the combined corrections.

## Native smoke shutdown correction

**P16-007:** the next complete-gate attempt (`ci-local-20261014T0343Z`) had
70/71 tracker/delivery/safety/smoke passes. The cold-staging smoke child printed
all six successful probes, then terminated with native Windows assertion
`UV_HANDLE_CLOSING` and exit `3221226505`. Its test correctly refused that
abnormal exit. The CLI had forced `process.exit` while fetch responses could
still own HTTP handles. It now cancels unread response bodies and sets
`process.exitCode`, allowing natural shutdown; every probe and strict failure
status is preserved. After this correction all 71 checks passed with actual
exit 0. The failed and interrupted gate records remain private; the interrupted
whole attempt returned -1 at `2026-10-14T03:47:18.5592565Z`.

A test-fixture typecheck also caught an undeclared email claim passed to the
local token issuer. Removing that claim passed the affected runtime integration
test at `2026-10-13T19:28:52.8234309Z`, but the next complete gate correctly
refused its missing required `groups` field with actual exit 1 at
`2026-10-14T03:53:49.8870100Z` (`ci-local-20261014T0349Z`). The final fixture
supplies the subject and an empty groups array; groups grant no authority.
The complete gate must recheck this typed fixture. No staging token is locally
minted, and no native crash or test failure is accepted as a pass.

## Complete corrective gate

The corrected complete **29-step** Node24/npm gate ran from the beginning
without resume and returned actual 0 at `2026-10-14T04:37:50.7565611Z`
(`ci-local-20261014T0357Z`). Server3803/two existing skips, client1216,
shared348, policies158 and infrastructure133 give **5658 passed**, with
71 separate tracker/delivery/safety/smoke passes. Both full image build and
network-disabled runtime checks passed, including all59 static HTML/CSP pairs.
Coverage floors, assertions, architecture/hardcoding guards and nag checks are
unchanged. Complete logs, actual exit, coverage summaries and LCOV are retained
privately. This accepts the local corrective gate; direct-main delivery,
exact-SHA CI, corrected staging pipeline and real provider MFA remain required.

All nine existing controlled inboxes were reverified on14October; no new
account or message was created by that check. The current `spoh-staging-alerts`
subscription matches the approved owner destination and is pending confirmation;
actual alarm receipt remains P16.8 work. The owner confirmation request is open.
The latest lagged account billing read shows14.9188062412USD gross through
13October, estimated. The existing stronger50USD alert,100USD ceiling and
seven-active-day campaign bound are unchanged. Interruption hours are not an
accepted soak. Prepared44 invalid-field bindings and guarded MFA/first-event
scripts remain unexecuted; P16.10 and the later owner gates remain open.
