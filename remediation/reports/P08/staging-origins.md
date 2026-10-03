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

Release verification is pending the normal CI/staging pipeline. A separate dated
checkpoint will record the exact deployed hash and public metadata/CORS/OAuth
observations; local synth is not deployment evidence.

## Remaining exit criteria

Read-only Cognito inventory found **zero users** in staging's pool
`ap-southeast-1_SWU8lHDQe`. No account, invitation, email or authentication bypass
was created. A legitimate owner-approved test identity with event membership is
needed for real login, session recovery and sign-out evidence. Actual iOS Safari
verification remains required; headless Chromium cannot satisfy it. P08.5 remains
in progress. Production Firebase/session work remains distinct and its deployment
still waits for the owner's go decision.
