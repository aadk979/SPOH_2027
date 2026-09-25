# P04 artefacts

Everything P04 ran, so a later session can repeat it. No command here calls AWS or the staging
site (D-13).

## Route inventory (P04.3)

```bash
node remediation/reports/P04/routes.mjs   # writes routes.json and routes.md, prints the counts
```

Needs `npm run build:shared` first (it imports the capability matrix from `packages/shared/dist`).

## Security repros (P04.2–P04.6)

```bash
cd server && npx vitest run --project integration tests/integration/repro/security.test.ts
cd client && npx vitest run tests/repro/outbox.test.ts
```

The skipped tests fail today when un-skipped; the active ones guard ownership checks that hold.
Un-skip each in the commit that fixes it.

## Secret scan (P04.5)

gitleaks is not a dependency; it was downloaded into a scratch directory.

```bash
gitleaks git --log-opts="--all" --redact -f json -r gitleaks.json -v .
# and the targeted greps over every commit:
git log --all --name-only --format= | sort -u \
  | grep -iE '(^|/)\.env($|\.)|\.pem$|\.key$|id_rsa|id_ed25519|credentials|\.p12$|\.pfx$'
git grep -E -I '(AKIA|ASIA)[A-Z0-9]{16}' $(git rev-list --all)
git grep -I -l 'BEGIN [A-Z ]*PRIVATE KEY' $(git rev-list --all)
git grep -I -h -E '(SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY)[A-Z_]*\s*[=:]\s*[^ <$`{]{12,}' $(git rev-list --all) | sort -u
```

Result on 2026-09-25: 116 commits, no findings; the greps return only `.env.example` files and
dev/test placeholders.

## Load test and poll probe (P04.8)

Against a scratch database, never the dev one:

```bash
docker exec spoh2027-postgres psql -U spoh -d postgres -c "CREATE DATABASE spoh2027_p04"
cd server
export DATABASE_URL=postgresql://spoh:spoh@localhost:5435/spoh2027_p04
npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run build
SPOH_SKIP_DOTENV=1 NODE_ENV=development LOG_LEVEL=warn PORT=4011 AUTH_PROVIDER=local \
  LOCAL_AUTH_SECRET=dev-only-secret-change-me-at-least-32-chars SHIFT_HOURS_ALWAYS_OPEN=true \
  node dist/index.js &
LOAD_TEST_API=http://localhost:4011 LOCAL_AUTH_SECRET=dev-only-secret-change-me-at-least-32-chars \
  node scripts/load-test.mjs --clients 100 --taps 20 --duration 60     # then --clients 300
cp ../remediation/reports/P04/poll-probe.mjs ./p04-poll-probe.tmp.mjs && node ./p04-poll-probe.tmp.mjs
```

`poll-probe.mjs` has to run from `server/` (it imports `jose` from there); it times
`/dashboard/live` and `/lost-person/active` alone and in bursts. Results: F04 § P04.8.

## PF-14: baseline `migrate deploy` on an audit-migrated database (P04.8)

```bash
mkdir -p /tmp/pf14 && git archive 319d06d server/prisma | tar -x -C /tmp/pf14
# a prisma.config.ts in /tmp/pf14/server pointing at spoh2027_pf14_test, then:
npx prisma migrate deploy --config /tmp/pf14/server/prisma.config.ts      # audit branch's 5 migrations
DATABASE_URL=…/spoh2027_pf14_test npx prisma migrate deploy               # main: "No pending migrations", exit 0
TEST_DATABASE_URL=…/spoh2027_pf14_test npx vitest run --project integration   # 292 passed, 49 skipped
```

The database name must end in `_test` for the integration suite's truncation guard.
