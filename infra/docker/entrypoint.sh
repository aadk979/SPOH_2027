#!/bin/sh
# Container entrypoint (P08.4). ECS injects the database host and passwords
# from Secrets Manager as separate values; the server reads one DATABASE_URL.
# Generated passwords exclude punctuation, so they need no URL-encoding.
set -eu

url() { # user password
  printf 'postgresql://%s:%s@%s:%s/%s?sslmode=%s' "$1" "$2" "$DB_HOST" "${DB_PORT:-5432}" "${DB_NAME:-spoh}" "${DB_SSLMODE:-require}"
}

cd /app/server
export SPOH_SKIP_DOTENV=1
case "${1:-serve}" in
  serve)
    DATABASE_URL="$(url spoh_app "$DB_APP_PASSWORD")"
    export DATABASE_URL
    exec node dist/index.js
    ;;
  migrate)
    # Roles as the admin, migrations and grants as the migrator (F04-015).
    ADMIN_DATABASE_URL="$(url "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD")" \
      MIGRATOR_PASSWORD="$DB_MIGRATOR_PASSWORD" APP_PASSWORD="$DB_APP_PASSWORD" \
      node scripts/db-roles.mjs roles
    DATABASE_URL="$(url spoh_migrator "$DB_MIGRATOR_PASSWORD")"
    export DATABASE_URL
    node ../node_modules/prisma/build/index.js migrate deploy --config prisma.config.ts
    node scripts/db-roles.mjs grants
    ;;
  seed)
    # Production requires explicit owner-reviewed initial-admin/provider inputs.
    # Run with the app task's own-pool GetUser permission; migration tasks do not have it.
    DATABASE_URL="$(url spoh_app "$DB_APP_PASSWORD")"
    export DATABASE_URL
    exec node dist/seed/prisma/seed.js
    ;;
  totals)
    # One-off, read-only (P09.4, P09.10): old and new columns agree.
    DATABASE_URL="$(url spoh_app "$DB_APP_PASSWORD")"
    export DATABASE_URL
    exec node scripts/event-one-totals.mjs
    ;;
  seed-restored-operator)
    # Separate owner-approved offline restore operation; never chosen by ordinary seed.
    DATABASE_URL="$(url spoh_app "$DB_APP_PASSWORD")"
    export DATABASE_URL
    exec node dist/seed/prisma/seed.js restored-operator
    ;;
  *)
    exec "$@"
    ;;
esac
