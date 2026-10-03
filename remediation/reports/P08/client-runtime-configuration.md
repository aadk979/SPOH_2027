# Public runtime client configuration foundation — P08.5

The API now serves `GET /api/v1/client-config` without a session or event context.
It publishes only a versioned allowlist of non-secret infrastructure metadata:
API origin, deployment label, explicit auth provider and the public Cognito
region/pool/client/domain identifiers when Cognito is selected. It uses the
existing default rate limiter and the configured CORS policy.

The strict shared contract requires all Cognito fields for cloud authentication.
Missing or invalid values refuse the response instead of selecting development
authentication. Local mode emits `cognito: null` even if stale Cognito environment
values exist. API/Cognito destinations must be canonical HTTP(S) origins, with no
credentials, path, query, fragment, whitespace or backslash. Request Host/query
values cannot choose the provider or destinations. The allowlist never spreads
the environment into the public payload.

Successful responses use `Cache-Control: public, max-age=300` and do not create a
session cookie. Validation failures receive the normal API error response without
the successful configuration cache policy.

`DEPLOYMENT_ENV` is an optional infrastructure key, independent of `NODE_ENV`, so
the same production-mode image can identify itself as staging or production.
It accepts `development`, `test`, `staging` or `production`, and defaults to
`NODE_ENV` when omitted. There are now **26** server infrastructure/secret keys,
all documented in `.env.example`; the earlier 25-key origin report remains a
historical checkpoint.

## Verification

The initial database attempt could not run while Docker was unavailable; it is
not passing evidence. Docker recovered through the CLI-only repair described in
[the recovery report](docker-recovery-2026-10-03.md).
The first connected focused run exposed an assertion that did not accept an
absent cache header; that assertion was corrected before rerunning.

Verified on 3 October 2026:

- Shared contract suite: **36 passed**, including provider/version/secret-field
  rejection and unsafe/noncanonical origin cases.
- Focused real-database route cases: **5 passed**. They cover anonymous access,
  the public allowlist, explicit cloud metadata, request-input refusal, stale
  metadata exclusion, failed validation without the success cache header and CORS.
- Full database suite: **1,074 passed / 4 existing skips, 84 files**, using only
  `spoh2027_test`. All **26** existing migrations were already applied; no migration
  was added. A temporary system wake hold was restored in `finally` on completion.
- Server units: **543 passed**. Workspace types, root lint, architecture
  (**899 modules / 3,874 dependencies**), hardcoding, generated settings,
  changed-file formatting and diff checks passed. Shared and server production
  builds passed.

No client layout or visual baseline changed in this foundation. No fresh
browser, visual, cloud sign-in or staging-origin verification is claimed.

## Remaining exit criteria

P08.5 stays open. The browser still reads environment-specific build-time values
and has not consumed this endpoint. The next slice must validate configuration
before mounting auth/session-dependent consumers, block development-auth fallback
on startup failure, provide an explicit retry state and calculate hosted sign-in
URLs only after runtime configuration is available. Local development must also
serve the bootstrap endpoint consistently without environment-specific browser
builds.

Only after that client slice passes may staging API/client origins, credentialed
CORS and Cognito callback/logout URLs switch together. A real authorized staging
session and the iOS Safari criteria remain required. Production Firebase session
design, resource creation and live cutover remain subject to their existing
constraints and approvals. This server foundation claims none of those results.
