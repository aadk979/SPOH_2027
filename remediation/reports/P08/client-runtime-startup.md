# Runtime client startup — P08.5, 3 October 2026

The static client now reads the server's public configuration at startup instead
of choosing its API origin and authentication provider during the build. One
same-origin, credential-free request to `/api/v1/client-config` accepts only the
versioned public contract. Concurrent consumers share that request; accepted
metadata is immutable for the page session. Failed or malformed responses and a
ten-second timeout show an explicit retry screen. They never select local auth,
mount operational screens or send session, capture, settings or push requests.

Session/API/export requests await the accepted configuration, and the hosted
sign-in URL is calculated afterward. Configuration failures remain distinct from
offline API failures. The client uses a small strict validator to keep Zod off
every route, with invalid cases checked against the shared server contract.

Local Next development proxies only the bootstrap endpoint to the server-only
`SPOH_DEV_API_ORIGIN`; operational requests still go directly to the API. The
Docker build no longer supplies an environment-specific browser API origin.
Static-client CSP admits only self and the validated runtime API origin. Ignored
`.local` files, including ephemeral SSH material, are excluded from the Docker
build context.

## Verified evidence

- Client units: **291 passed, 46 files**; server units: **547 passed, 49 files**.
  These include startup ordering, refusal/retry, immutable configuration,
  deduplicated requests, timeout, deferred hosted URLs and runtime CSP cases.
- All workspace types, root lint, architecture (**902 modules / 3,884
  dependencies**), hardcoding and generated-settings checks passed. Client types
  and lint were repeated after the two broad browser mocks were updated to
  explicitly supply the bootstrap contract.
- Production server build and static client export (**32 pages**) passed. An
  export built with deliberately invalid legacy public origin/label/pool markers
  contained none of those markers or obsolete configuration variable names in
  its JavaScript. Docker built the complete image successfully.
- **All 58 distinct E2E cases passed across serial runs** against
  `spoh2027_rehearsal_shift_e2e_test`. The initial full run had six bootstrap-mock
  failures, corrected in attendance/navigation fixtures, and two lifecycle
  failures with HTTP 429. The focused eight-case rerun passed. Final coverage
  comprised 33 passes in the first fresh-API group, 22 passes in the second group
  and four fresh-API import/report passes. Three second-group failures were
  confirmed HTTP 429 in their saved network traces. API restarts isolated the
  in-memory rate buckets; no application limits were changed. This is serial
  coverage of the full corpus, not a claim of one uninterrupted green full run.
- Full visual assertion: **58 passed**, with no baseline updates. The visual API
  was restarted with its dedicated `spoh2027_visual_test` database and existing
  frozen-clock fixture. Its pre-existing fixture limits were retained unchanged.

The preceding [server foundation](client-runtime-configuration.md) has the full
real-database route evidence: **1,074 passes / four existing skips**, with all 26
existing migrations. This client slice adds no migration. The real local
`spoh2027` database was not reset, seeded or migrated.

## One image, two configurations

The [machine-readable local proof](runtime-image-evidence-2026-10-03.json) records
the same image id and identical sign-in HTML hash for two disposable containers.
One rendered local roster auth; the other rendered the hosted Cognito link using
dummy public metadata. Both had zero browser page errors. A simulated bootstrap
503 blocked auth and operational requests; retry accepted Cognito metadata
without exposing local auth. Only the dedicated `spoh2027_container_test`
database received its missing test migrations. The two proof containers and
their temporary network were removed afterward; the Postgres volume was retained.

This is local headless Chromium evidence. It does not establish Cognito login,
cloud session recovery or iOS Safari behaviour.

## Remaining exit criteria

P08.5 stays in progress. The next separate slice must switch the staging API
origin, browser redirect origin, credentialed CORS and Cognito callback/logout
URLs together, while preserving production's reference-only pool. A legitimate
staging account with membership linkage and iOS Safari session evidence are still
required. Production Firebase configuration and its cross-site session design
remain distinct work before the owner-approved production deployment.
