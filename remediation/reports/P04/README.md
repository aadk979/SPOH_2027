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
