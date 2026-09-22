# Deploying

From a laptop with the repo, to a host that `bootstrap.sh` has already prepared.

## The order that matters

**Migration before build.** Every audited mutation writes `severity`, `outcome`,
`method`, `path` and `statusCode`. Deploy the new build against an unmigrated
database and every void, every capture, every roster edit fails at the audit
write — which, because the audit write shares the mutation's transaction, takes
the mutation with it. Migrate first, always.

Prisma migrations in this repo are additive with defaults, so the _old_ build
runs happily against the _new_ schema. That is what makes this order safe.

## Steps

```sh
ssh ubuntu@<host>
cd ~/app

# 1. Code
git fetch --all
git checkout <branch>
git pull

# 2. Dependencies. `ci` not `install` — a deploy should never resolve a
#    version the lockfile did not pin.
npm ci

# 3. Shared types first; server and client both compile against them.
npm run build:shared

# 4. Migrate. Never `migrate dev` on a deployed box: it can reset.
npm run db:deploy --workspace server

# 5. Build
npm run build --workspace server
npm run build --workspace client

# 6. Restart. Cluster mode reloads workers one at a time, so this does not
#    drop connections; `restart` would.
pm2 reload spoh-server
pm2 restart spoh-client
pm2 save
```

## Verify, in this order

```sh
curl -sf https://secure-channel.duckdns.org/healthz    # process is up
curl -sf https://secure-channel.duckdns.org/readyz     # database reachable
pm2 list                                               # both online, cluster mode
pm2 logs spoh-server --lines 40 --nostream             # no boot errors
```

`/readyz` is the one that matters. `/healthz` answers from the process alone
and will happily say `ok` while the database is unreachable.

Then sign in and load `/admin/audit`. It exercises auth, the database, the
capability matrix and the new schema in one page, and its banner reports
whether CloudWatch delivery is working.

## First deploy to a fresh host

Three things exist only on the box and are not in git, because they are
secrets or host-specific:

**`server/.env`** — copy from the old host or rebuild from
`server/.env.example`. The values that must be right:

```
NODE_ENV=production
AUTH_PROVIDER=cognito
DATABASE_URL=postgresql://spoh_app:<pw>@127.0.0.1:5432/spoh2027?sslmode=require&uselibpqcompat=true
CORS_ALLOWED_ORIGINS=https://secure-channel.duckdns.org
APP_BASE_URL=https://secure-channel.duckdns.org
COGNITO_DOMAIN=https://spoh2027-livetest.auth.ap-southeast-1.amazoncognito.com
COGNITO_USER_POOL_ID=ap-southeast-1_9bwl2nGF7
COGNITO_CLIENT_ID=23uft7mvtnrno1uunsc5lp0h2v
SESSION_SIGNING_SECRET=<32+ chars, NEW per host>
TRUST_PROXY_HOPS=1
DATABASE_POOL_MAX=25
```

`config/env.ts` validates all of it at boot and refuses to start on anything
missing or malformed, so a typo is a failed start with a named field rather
than a subtle runtime bug. `TRUST_PROXY_HOPS=1` is the one it cannot catch:
wrong, it collapses per-IP rate limiting into one bucket for the whole event.

**`client/.env.production.local`** — inlined into the browser bundle at build
time, so it must exist _before_ `npm run build --workspace client`:

```
NEXT_PUBLIC_API_BASE_URL=https://secure-channel.duckdns.org
NEXT_PUBLIC_ENV_LABEL=live-test
NEXT_PUBLIC_COGNITO_REGION=ap-southeast-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-1_9bwl2nGF7
NEXT_PUBLIC_COGNITO_CLIENT_ID=23uft7mvtnrno1uunsc5lp0h2v
```

**PM2's process list** — `pm2 start infra/config/ecosystem.config.cjs` once,
then `pm2 save`. Check `pm2 list` says **cluster** for `spoh-server`. If it
says `fork`, the API is one process on one core and the instance size is
irrelevant.

## Rolling back

```sh
git checkout <previous-sha>
npm ci && npm run build:shared
npm run build --workspace server && npm run build --workspace client
pm2 reload spoh-server && pm2 restart spoh-client
```

The schema is not rolled back, and should not be. Migrations here are additive,
so the previous build ignores the new columns. Reversing a migration to undo a
deploy is how you lose the rows written since it ran.

## If the Cognito callback breaks

The app client's callback URL is pinned to the hostname:
`https://secure-channel.duckdns.org/api/v1/auth/callback`. It is a Cognito
setting, not an application one, so a hostname change means:

```sh
aws cognito-idp update-user-pool-client --region ap-southeast-1 \
  --user-pool-id ap-southeast-1_9bwl2nGF7 \
  --client-id 23uft7mvtnrno1uunsc5lp0h2v \
  --callback-urls https://<new-host>/api/v1/auth/callback \
  --logout-urls https://<new-host>/sign-in \
  --allowed-o-auth-flows code --allowed-o-auth-scopes openid email \
  --allowed-o-auth-flows-user-pool-client \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH
```

`update-user-pool-client` replaces the whole configuration rather than
patching it, so every flag has to be repeated or it is silently dropped.
