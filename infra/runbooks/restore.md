# Backup and restore

## Taking a dump

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p ~/predeploy-backups
sudo docker exec spoh-postgres pg_dump -U spoh_app -d spoh2027 --no-owner \
  | gzip > ~/predeploy-backups/spoh2027-$STAMP.sql.gz
```

`--no-owner` because the restore target may not have the same role names, and
a dump that only restores onto an identically-provisioned box is not a backup.

**Verify it before you trust it.** An unverified dump is a comforting file, not
a backup:

```sh
gzip -t ~/predeploy-backups/spoh2027-$STAMP.sql.gz && echo "gzip ok"
zcat ~/predeploy-backups/spoh2027-$STAMP.sql.gz | grep -c "CREATE TABLE"
```

The table count should be **32**. A dump with a plausible file size and three
tables in it is what a half-finished `pg_dump` looks like.

**Get it off the box.** A backup on the machine it is protecting is not a
backup. At minimum pull a copy down:

```sh
scp ubuntu@<host>:'~/predeploy-backups/*.sql.gz' .
```

The S3 bucket `spoh2027-backups-665146708212` exists for this and has
versioning, a Glacier IR transition at 30 days and expiry at 400. Writing to it
needs an IAM instance profile the box does not have by default — see
`ops/cloudwatch/README.md`, which sets up the same mechanism for logs.

## Restoring

Onto an **empty** database. Restoring over a populated one produces duplicate
key errors interleaved with successful inserts, which leaves a database that is
neither the old state nor the new one.

```sh
# 1. Stop the app so nothing writes mid-restore.
pm2 stop spoh-server spoh-client

# 2. Recreate the database.
sudo docker exec spoh-postgres psql -U spoh_app -d postgres \
  -c 'DROP DATABASE IF EXISTS spoh2027;' -c 'CREATE DATABASE spoh2027;'

# 3. Restore.
zcat ~/predeploy-backups/<file>.sql.gz \
  | sudo docker exec -i spoh-postgres psql -U spoh_app -d spoh2027 -v ON_ERROR_STOP=1

# 4. Bring migrations up to date. The dump carries the schema as it was;
#    anything merged since still has to be applied.
cd ~/app && npm run db:deploy --workspace server

# 5. Start.
pm2 start spoh-server spoh-client
curl -sf https://spoh2027.duckdns.org/readyz
```

`ON_ERROR_STOP=1` matters. Without it psql prints errors and carries on, and
you discover the half-restored table three days later.

## Check it actually worked

```sh
sudo docker exec spoh-postgres psql -U spoh_app -d spoh2027 -c \
 'select (select count(*) from "Volunteer")   as volunteers,
         (select count(*) from "AuditLog")    as audit_rows,
         (select count(*) from "Registration") as registrations;'
```

Compare against what the source had. Then sign in — the real test is that a
Cognito identity still maps to a roster row.

## The Cognito coupling

`Volunteer.cognitoSub` is a foreign key into user pool
`ap-southeast-1_9bwl2nGF7`. **Restoring a database against a different pool
orphans every volunteer**: the rows exist, nobody can sign in to them, and the
only repair is re-provisioning every account with fresh invites.

This is why the pool is never torn down with a server, and why
`server/scripts/sync-cognito-subs.mjs` exists. If you ever do have to move
pools, that script is the path — not a restore.

## Restoring onto the two-box topology

Identical, except the `docker exec` runs on the database host. From the app
host, with `postgresql-client` installed:

```sh
zcat backup.sql.gz | psql "postgresql://spoh_app:<pw>@<db-private-ip>:5432/spoh2027?sslmode=require" \
  -v ON_ERROR_STOP=1
```

Migrations still run from the app host, because that is where the repo lives.
