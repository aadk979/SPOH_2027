# P07 visual safety net

## Current P16 boundary — 13 October 2026

The earlier fixture record below is history. Its other database names and ports
are obsolete and must not be used. Local regressions now use **only the existing
spoh2027_test database**, local5435/CI5432, and the real static client/API together
at **http://localhost:4012**. The guards require identical DATABASE_URL,
TEST_DATABASE_URL and E2E_DATABASE_URL, SPOH_SKIP_DOTENV=1, NODE_ENV=development,
DEPLOYMENT_ENV=development and AUTH_PROVIDER=local. E2E_BASE_URL/E2E_API_ORIGIN
and VISUAL_BASE_URL/VISUAL_API_URL must be explicitly set to that same origin.
No default database or dev server is silently selected. Do not reuse an unknown
listener on4012 or stop another checkout's process.

Work only from V1-main with Node24/npm and TEMP/TMP in V1-main/.local/tmp.
The current [dispatch-only local browser workflow](../../../.github/workflows/browser.yml)
is the reproducible setup: build shared packages, migrate the sole pre-existing
test DB with the guarded setup CLI, seed only that local fixture, build the server
and actual static export/manifest, then start an owned API with CLIENT_DIR set to
that export. Database suites and fixture servers run serially.

The frozen clock also checks the exact database and explicit local/development
mode. Higher visual fixture quotas require SPOH_ALLOW_LOCAL_VISUAL_LIMITS=1;
conversion of an unused rehearsal fixture separately requires
SPOH_ALLOW_LOCAL_VISUAL_REHEARSAL=1 and retains its existing refusal/cleanup
checks. Those local quotas and dates do not prove normal rate limits, real
provider authentication, staging or load behavior.

The journey/visual configurations contain SQL and local sign-in fixtures; the
campaign configuration contains network-mocked UI composition. Their guards
refuse staging and production. Real HTTPS/Cognito acceptance has separate
fixtures and evidence in P16.10/P16.1. A generated manifest or local screenshot
is not an executed provider journey. Keep existing baselines; establish new
ones only after populated states, functional, keyboard and axe checks pass and
the resulting image changes are reviewed. No browser run or baseline refresh
was performed by the guard repair.

## Historical P07–P10 fixture record (read-only)

`npm run test:visual --workspace client` compares all 29 current app routes at 390×844 and 1440×900, plus capture, category scheduling and operational catalogue panel states at both widths (100 checks). Panel snapshots retain the viewport width and extend the height when needed to include every control; CSS property assignments hide surrounding sticky navigation for that crop, with zero CSP violations asserted. Functional phone/laptop journeys retain the original viewport heights. Baselines use the installed Playwright Chromium on Windows. Use the same browser/platform to avoid font-rendering differences. Screenshots are assertions, not automatically updated during refactors.

The 6 October continuation preserves the existing frozen database, its nine
membership rows and eight person markers. Its owned same-origin static preview
uses API/client port 4013 with `VISUAL_BASE_URL` and `VISUAL_API_URL` both set to
`http://localhost:4013`. The E2E API on 4014 must finish its owned cleanup and close
first. Restart the frozen API between baseline iteration and full acceptance,
and compare markers with the retained snapshot before and after. Do not reseed
this retained fixture while reviewing changes; the preparation commands below
describe initial disposable-fixture creation.
The account primer verifies all seeded identities once per Playwright worker.
Repeated files reuse that completed verification so the frozen clock does not
exhaust the unchanged sensitive credential-minting limit. Each test still opens
its own normal application session and rejects 429/5xx responses.

The fixture stack uses a dedicated `spoh2027_visual_test` database, API port 4012 and client port 3001. The seed, API and browser dates are fixed at 2026-09-28T02:00:00Z; timers still run normally. `freeze-clock.mjs` refuses production and any database whose name does not end in `_test`. The API runs local auth, silent logging and REHEARSAL fixtures. Assigned stations remain available outside shift hours in that phase. No live credentials are needed.

From the repository root, with Node 24 on PATH, prepare the disposable fixture:

```powershell
$env:TEST_DATABASE_URL='postgresql://spoh:spoh@localhost:5435/spoh2027_visual_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:NODE_ENV='development'
node server/scripts/setup-test-db.mjs
node --import ./client/tests/visual/freeze-clock.mjs --import tsx server/prisma/seed.ts
node --import tsx server/scripts/prepare-visual-rate-limits.mjs
npm run build --workspace server
```

Start the API in one terminal with the same DATABASE_URL and NODE_ENV:

```powershell
$env:SPOH_SKIP_DOTENV='1'
$env:AUTH_PROVIDER='local'
$env:LOCAL_AUTH_SECRET='visual-fixture-only-secret-at-least-thirty-two-chars'
$env:PORT='4012'
$env:LOG_LEVEL='silent'
$env:CORS_ALLOWED_ORIGINS='http://localhost:3001'
node --import ./client/tests/visual/freeze-clock.mjs server/dist/index.js
```

Start the client in another terminal (stop any existing Next dev process for this checkout first):

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='http://localhost:4012'
node node_modules/next/dist/bin/next dev client --port 3001
```

Then run `npm run test:visual --workspace client`. Use `-- --update-snapshots` only to deliberately establish a reviewed new baseline, and inspect the diff. `VISUAL_BASE_URL` can override the client URL. Do not use the browser fixture database for load tests: accumulated captures change dashboards and reports.

Since P09.11 the seed generates its fixture relative to "today" (here the frozen date): event days are offsets from it, not the January 2027 dates of the earlier fixture. The committed baselines were captured on a database seeded before that change; rebuilding the visual database from the current seed changes day labels and dates on some screens, so establish and review a new baseline in the same change rather than chasing the differences.

P10.5 fixtures start in REHEARSAL with practice cards and stock. For the existing legacy visual
database, `node --import tsx server/scripts/prepare-visual-rehearsal.mjs` preserves its dates and
roster. It permits only the exact local visual test database, refuses any capture, issued card or
closed/archived event, and converts the unused fixtures in one transaction. Normal
seed reruns never reclassify existing events, cards or stock. Restart the visual API before every
full run; visual and E2E APIs share port 4012 and must run serially.

The screenshots cover seeded initial page states. Behavioural actions are covered separately by the e2e and component suites. Snapshot coverage does not imply every interactive state has a visual baseline.

The frozen API clock also freezes rate-window expiry. The guarded fixture script sets bounded, high platform limits in this disposable test database; rate-limit correctness remains covered by server tests under their normal configuration. Browser tests reject 429/5xx responses instead of capturing an error/loading state as a golden image. The shared primer verifies seeded local provider identities; it does not open application sessions or touch membership last-seen fields. Additional settings visual states use the existing chief account so they preserve the administrator's "never signed in" roster baseline.
