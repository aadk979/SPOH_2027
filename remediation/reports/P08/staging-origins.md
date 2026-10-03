# Combined staging origin wiring — P08.5, 3 October 2026

Staging's typed infrastructure configuration now selects the two verified HTTPS
origins together. `APP_BASE_URL` and the Cognito callback use
`https://api.secure-channel.duckdns.org`; `CLIENT_BASE_URL`, credentialed CORS and
the Cognito logout destination use `https://secure-channel.duckdns.org`.
`DEPLOYMENT_ENV=staging` identifies the production-mode container correctly in
the runtime client metadata. The browser consumes this metadata through the
verified [startup gate](client-runtime-startup.md).

Two additional Standard/String SSM parameters bring staging to 16; production
retains its existing 14. ECS reads them at task startup through the execution
role's exact parameter grants. The migration task still reads only `DB_HOST`
and `DB_NAME`, and application task roles gain no SSM access. The two existing
Secrets Manager inputs remain unchanged. No secret is added to the image or
public configuration. These Standard parameters add no new priced resource tier.

The staging pool/client identities remain the existing resources. Production
continues to reference `ap-southeast-1_9bwl2nGF7` and defines no owned Cognito pool
or client. No production routing or resources are deployed by this slice. The
approved edge configuration, instance and trusted certificates need no change.
Only the closest API Gateway hop remains trusted; the native API endpoint is
still directly reachable.

## Verification before release

- **38 infrastructure tests in seven files** passed, including actual staging
  and production synth with nag checks, exact stage-specific SSM grants, API
  callback/client logout destinations, preserved identity logical ids and
  unchanged production routing/reference-only ownership.
- Infra types, root lint, architecture (**902 modules / 3,884 dependencies**),
  changed-file formatting and diff checks passed.
- Read-only `cdk diff --no-change-set`, pinned to the actual deployed
  `24eb43d0c304d2489e150b2860bbd95dd4b6bf1d` image, showed only the two new parameters,
  API/CORS parameter values, callback/logout URL updates, an app task-definition
  revision and its exact additional parameter grants. There was no pool, RDS,
  edge, migration-task, production or other resource replacement.

## Deployed checkpoint

The normal pipeline completed for exact image tag
`7d0dbd975dc5a993dae2d97e0be66411a4c0a4af`:
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37110928650),
[Infra](https://github.com/aadk979/SPOH_2027/actions/runs/37110928681) and
[Deploy staging](https://github.com/aadk979/SPOH_2027/actions/runs/37111159938) all
succeeded. Read-only CloudFormation verification found `UPDATE_COMPLETE` with
that exact `ServiceImageTag`. Actual Cognito callback/logout URLs match the two
configured origins; its pool/client ids are unchanged.

The [17:10 SGT origin evidence](staging-origin-evidence-2026-10-03.json) verifies
trusted HTTPS, identical public metadata through both hosts, client shell/API
host routing, private-readiness refusal, runtime CSP and credentialed CORS for
the exact client origin with an unrelated origin refused. Headless Chromium
reached Cognito's real credential form, with no local roster auth or app page
errors. OAuth uses code/S256, API-host Secure/HttpOnly/Lax state and PKCE cookies,
and client-host failure redirects. The first cookie probe incorrectly filtered
at the API root; correcting it to the cookies' auth path made the check pass.

The [17:15 SGT session evidence](staging-session-evidence-2026-10-03.json) verifies
normal Cognito Authorization Code + PKCE with a real subject and active staging
event membership. Callback and initial refresh succeeded, authenticated event
reads returned one membership, hard reload renewed the session, and sign-out
cleared the API-host Secure/HttpOnly/Lax refresh cookie. Reload after sign-out
received 401 and displayed hosted sign-in, with zero app page errors.

The first session probe expected `/home`, while the correctly scoped client went
to `/e/spoh2027/home`. Its timeout is not passing evidence. The corrected probe
completed the full flow and revoked the earlier probe's leftover session through
the normal self-session API before signing out.

## Remaining exit criteria

Initial read-only inventory found zero users. The owner's 30 September
authorization to seed test data covered a synthetic staging identity for this
check. Cognito created it with `MessageAction=SUPPRESS`, without an invitation or
email. The existing fixture seed ran only in the guarded staging cluster/task,
using `SEED_ADMIN_SUB` from Cognito to create a new bootstrap administrator and
its membership; no existing person's identity was overwritten. Only this seed
task used development mode. The running API retained Cognito/production mode
throughout; no authentication bypass or local provider was enabled.

The test credential is stored only in restricted, Git-ignored
`.local/staging-smoke-identity.json`, excluded from Docker context. It remains
available for the owner's device verification; no credential, OAuth state/code,
token or cookie value is in the committed evidence. Synthetic seed/audit/session
records are retained in staging.

**Actual iOS Safari verification is owner-controlled and still required.** The
owner was asked to check sign-in, hard reload, background/resume and sign-out
followed by reload, recording iOS version and results. P08.5 remains open for that
evidence, production Firebase/session configuration and the other full exit
criteria. No renewal-cycle test is claimed. Production deployment still waits
for the owner's go decision.
