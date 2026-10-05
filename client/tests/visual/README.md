# P07 visual safety net

`npm run test:visual --workspace client` compares all 29 current app routes at 390×844 and 1440×900, plus two capture-panel states at both widths (62 checks). Panel snapshots retain the viewport width and extend its height when needed to include every control; CSS property assignments hide surrounding sticky navigation for that crop, with zero CSP violations asserted. The functional phone/laptop journeys retain the original viewport heights. Baselines were generated with the installed Playwright Chromium on Windows. Use the same browser/platform to avoid font-rendering differences. Screenshots are assertions, not automatically updated during refactors.

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
