# P08.5 separate sign-in origins

`APP_BASE_URL` remains the API's public origin. Both the Hosted UI authorization request
and the server-side code exchange use its `/api/v1/auth/callback`, so the callback receives
the API host's state and PKCE cookies. A separate optional `CLIENT_BASE_URL` selects the
browser destination after success and every handled sign-in failure. Leaving it unset
preserves the existing shared-origin deployment.

The new key is infrastructure routing, not an operational setting. It accepts a canonical
HTTP(S) origin with an optional trailing slash, and refuses credentials, paths, queries,
fragments, whitespace and non-HTTP schemes. Redirects remove the optional trailing slash.
Callback query parameters cannot choose either the callback or the browser destination.
The refresh cookie remains host-only, HttpOnly and scoped to the API auth path; same-site
staging retains SameSite=Lax. This slice does not claim that a third-party refresh cookie
works between production Firebase and DuckDNS; that session requirement remains in P12.

The schema now has **25 infrastructure/secret keys**, documented exactly in `.env.example`.
The P10.4 audit of 24 keys is a historical checkpoint. The new optional key is not injected
into the existing stage yet: routing/Cognito/CORS activation waits for verified DuckDNS HTTPS,
and both published stage origins must be configured together. Client API routing must also
be supplied by runtime configuration per ADR-003; an environment-specific browser build
would defeat the tested-image promotion requirement.

The five additional database route cases verify separate-host callback/cookies, successful
session creation, the exchange's unchanged API redirect URI, rejected input-selected
redirects, callback failures and rejected code exchange. Existing same-origin cases remain.
Schema tests cover accepted origins and rejected unsafe/non-origin destinations. Public
Cognito and iOS Safari sign-in, HTTPS and renewal remain unverified exit criteria for P08.5.

Verification on 2026-10-02: focused hosted sign-in integration **14**; full integration
**743 passed / 4 existing skips** on `spoh2027_test`; server unit **505** passed. All
workspace typechecks, root lint, architecture, hardcoding, generated settings, changed-file
formatting and server production build passed by exit code. No client layout, browser
baseline, migration, public routing or production resource changed in this slice.
