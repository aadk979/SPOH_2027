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
