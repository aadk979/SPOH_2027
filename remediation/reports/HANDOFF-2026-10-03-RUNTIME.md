# Runtime and staging continuation — 3 October 2026

Read `HANDOFF-2026-09-29.md` first, including the owner answers, then the takeover
and authoritative `HANDOFF-2026-10-03.md`. This continuation updates the runtime,
Docker, pricing, cloud verification and private announcement draft checkpoints. Their scope, production
approvals, transaction/retention cautions and remaining P10 catalogue still apply.

## Scope and Git

All repository work stayed in `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`.
Sibling `V1` files were not edited. No subagents were used. The owner required
CLI/terminal actions only; all subsequent work, including headless Playwright,
used that constraint. D-11 source/tracker commits were pushed directly to main
and verified against `origin/main` and `ls-remote`.

| Source / tracker      | Verified slice                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| `d6fe080` / `8892864` | Preserved pricing draft completed and reconciled; P08.10 stays open.            |
| `33f8d68` / `24eb43d` | Strict public runtime-configuration server foundation; P08.5 stays open.        |
| `a07e5e5` / `91c202f` | Runtime client startup gate, deferred auth/API origins and retry/refusal.       |
| `a46e297` / `7d0dbd9` | Combined staging API/client origins, CORS, callback/logout and label.           |
| `ce0a83a` / `b70817c` | Owner Chrome amendment and actual installed Chrome session evidence.            |
| `3f4f6a1` / `3a3d197` | Production Firebase static preparation and local emulator verification.         |
| `b13f48a` / `e878481` | Private, versioned announcement draft storage and APIs.                         |
| `0df8c82` / `4844360` | Synthetic UUID fixture correction and exact historical scan exceptions.         |
| `2231d54` / `caf309a` | Durable announcement delivery storage; green CI/deploy and exact staging image. |

Before the private draft slice, main/origin/main/ls-remote matched full hash
`3a3d19779f79040242ad7db7bd08fd30c0dbd84f`. Subsequent draft source/tracker and
staging evidence commits are expected; verify Git again before editing. The inherited
pricing work is committed, with its three inherited artifacts preserved byte-for-byte.

## Verification and what is deployed

- [Pricing](P08/pricing/README.md): six regressions and static checks passed.
  The three inherited P08 draft artifacts remain byte-identical to their handoff
  fingerprints, and historical P05 prices/report are unchanged. The conditional
  January subtotal is $105.66; accepted protection allowances raise it to $135.13
  before unmeasured costs. The approximate January ceiling is $130; continuous
  staging is more expensive. Billing attribution/complete measured usage and
  budget fit remain unverified. No cost-allocation tags or billing controls changed.
- [Server foundation](P08/client-runtime-configuration.md): 36 shared checks,
  five new database route checks and full integration **1,074 passed / four
  existing skips, 84 files**. All 26 existing migrations were applied on the test
  database; no migration was added.
- [Client startup](P08/client-runtime-startup.md): **291 client units**, **547
  server units**, all **58 distinct E2E cases** across serial fresh-API runs and
  **58 full visual assertions** against unchanged baselines. Failed broad mocks
  were corrected; saved traces confirmed subsequent HTTP 429 pressure before
  affected suites passed with a fresh API. Limits were not relaxed. Types, lint,
  architecture (902 modules / 3,884 dependencies), hardcoding, settings, format,
  static export/server/Docker builds passed. One local image and identical HTML
  selected local/Cognito metadata correctly and refused unavailable config.
- [Staging origins](P08/staging-origins.md): **38 infra tests**, actual staging/prod
  nag synth, infra types, lint, architecture and deployed-image read-only diff
  passed. Only staging gains two Standard/String parameters, to 16 total;
  production keeps its original 14 and reference-only pool. Exact grants remain
  on execution roles; migration reads only the two DB parameters.
- Exact **`7d0dbd975dc5a993dae2d97e0be66411a4c0a4af`** has successful
  [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37110928650),
  [Infra](https://github.com/aadk979/SPOH_2027/actions/runs/37110928681) and
  [staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37111159938).
  `Spoh-staging-Platform` is `UPDATE_COMPLETE` with that image tag.
- **Actual cloud wiring and session are verified** at 17:10–17:15 SGT:
  trusted DuckDNS HTTPS, runtime staging metadata, credentialed CORS, CSP, real
  Cognito credential form, normal code/PKCE authentication, active membership,
  hard-reload refresh, sign-out/cookie clearing and refusal after signed-out
  reload. Evidence is sanitized JSON linked from the report. This is headless
  Chromium with a phone viewport, **not actual iOS Safari**.
- **Owner amendment, 3 October:** Chrome is sufficient for staging verification;
  actual iOS Safari evidence is waived. Installed Google Chrome **154.0.8037.97**
  passed the same normal sign-in, membership, hard-reload refresh, sign-out and
  signed-out reload flow at 17:20 SGT, with zero app page errors. See
  [Chrome evidence](P08/staging-chrome-session-evidence-2026-10-03.json).
- Exact **`3a3d19779f79040242ad7db7bd08fd30c0dbd84f`** subsequently passed
  [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37114213639),
  [Infra](https://github.com/aadk979/SPOH_2027/actions/runs/37114213661) and
  [staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37114513664).
  The stack was `UPDATE_COMPLETE` with that exact image at approximately 18:10 SGT.
- [Private draft foundation](P10/announcement-drafts.md): **47 shared checks**, **548
  server units**, **1,098 full database passes / four existing skips in 85 files**,
  all workspace types and static/build checks pass. The additive 27th migration was
  applied only to guarded `spoh2027_test` locally. Draft attribution, content/version,
  metadata audit and id-only replay settle atomically. No inbox/publication/push effect.
  Exact **`4844360fa0f49adcfe10bcdc623aa1e9609c1c23`** passed
  [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37116845053) and
  [staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37117164613),
  with matching `UPDATE_COMPLETE` stack. At 18:49 SGT, installed Chrome plus normal
  Cognito/PKCE verified create/read/edit/replay/private listing, stale-version refusal,
  unchanged inbox and refused acknowledgement, followed by successful sign-out.
  [Public evidence](P10/staging-draft-evidence-2026-10-03.json) contains no credentials.
  The synthetic private draft/audit receipts remain; no publication or delivery occurred.

The synthetic Cognito identity was seeded under the owner's 30 September test-data
authorization. Invitation delivery was suppressed; no email was sent. Its actual
subject was supplied to the existing staging bootstrap seed rather than replacing
another identity or bypassing auth. Credentials are in restricted, Git-ignored
`.local/staging-smoke-identity.json` and excluded from Docker context. Never print
or commit them. The current session was signed out; the first probe's leftover
session was revoked through the normal API. Staging retains synthetic fixtures
and immutable audit/session receipts.

## Remaining work

[Durable announcement delivery storage](P10/announcement-delivery-storage.md) advances
P10.7 with a frozen audience/device plan and per-device state, without registering a
producer or network worker. **67 focused checks**, **555 server units**, **47 shared
checks**, **1,120 full database passes / four existing skips in 86 files**, workspace
types/static/build and secret scans pass. The additive 28th migration was applied only
to guarded `spoh2027_test` locally. Source/plan/intent/audit rollback, concurrent and
zero-device deduplication, current recipient/day scope and database immutability are
covered. Exact `caf309a5d088c2850ad895349b4b7dbc88d63ca6` has green
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37119410440) and
[deploy](https://github.com/aadk979/SPOH_2027/actions/runs/37119621113), a matching
`UPDATE_COMPLETE` stack and application task definition revision 93. Actual external
delivery remains unverified and inactive.

[Timed publication](P10/scheduled-announcement-publication.md) is the next verified local
slice: strict saved-version payload, current author/IC/day authority, immutable publication
provenance, atomic message/plan/intents/audit/completion and actual worker registration.
Its **105 focused database checks**, **59 shared checks**, **556 server units**, all workspace
types/static/build/format/secret checks and **1,158 full DB passes / four existing skips in
87 files** pass. D-11 source/tracker and exact pipeline verification are the next checkpoint.

P08.5 must stay open, but **the staging browser blocker is cleared** by the owner's
Chrome amendment and the installed Chrome result. Do not ask for actual iOS Safari
evidence again. No renewal-cycle test is claimed. Production Firebase configuration
and its session design remain distinct and must not depend on third-party cookies.

[Firebase static preparation](P08/firebase-static-configuration.md) now makes the
production hosting configuration reviewable without owner identifiers or a deploy.
Nine preparation regressions and Linux Firebase demo emulator/installed Chrome
routing/startup checks pass, preserving all 216 export files. Production-shaped
synthetic metadata and mocked APIs were used; no production session result is
claimed. Production deployment identity/site mapping and P12 session changes remain.

P08.6/.8/.10 and other P08 criteria remain open. P10.5/.7 and P10.8/.9, then later
phases, retain their original dependencies. The private draft foundation advances
P10.7 without repeating close-out or scheduler execution. The timed publication handler
still needs after-commit delivery and legitimate schedule producer/CRUD integration;
schedule UI, retention and other catalogue consumers/authority remain pending. Continue
independent authorized work on resume; there is no remaining iOS owner gate.

No production stack/cutover or existing live Lightsail change was made. Production
still waits for the 28 October go decision; scaling dates, deployment-time email
and Firebase identifiers retain their documented owner boundaries. No Route 53,
ACM or SES was introduced. Production sessions must not depend on third-party
refresh cookies.

## Local recovery and database constraints

[Docker recovery](P08/docker-recovery-2026-10-03.md) repaired stale runtime sockets
and processes. The owner authorized deleting all containers: 21 were removed,
then only `spoh2027-postgres` was recreated with the existing `v1_spoh-pgdata`
volume. Images/volumes and the real database were retained. This was **not a
factory reset**: automatic review rejected the manual reset before execution
with only `blocked by policy`. Runtime directory quarantines remain recoverable.
A hidden launcher command was also rejected; tool-managed terminal processes
were used instead.

- Node 24 must be prepended from the existing Codex runtime directory.
- Docker Postgres is healthy at `127.0.0.1:5435`; never reset, seed or migrate real
  local `spoh2027`. Integration remains on `spoh2027_test`.
- E2E remains on `spoh2027_rehearsal_shift_e2e_test`; visual remains on frozen
  `spoh2027_visual_test`. The one-image proof used `spoh2027_container_test` only.
  Run browser suites serially and restart the visual API before each full run.
  Retain existing visual fixtures/limits; inspect baseline changes.
- Local preview was restored to E2E mode with a normal clock: API 4012, client
  3001, healthy runtime metadata with explicit local auth. Tool-managed sessions
  at checkpoint are API **36918** and Next client **26444**; confirm listeners
  and exact executable/command before stopping anything. Services can stop when
  the computer sleeps.
- Long DB verification used a temporary wake hold restored in `finally`; no
  persistent power settings changed. Cloud/browser probes never enable local
  auth in the running staging API.
