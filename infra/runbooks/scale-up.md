# Single box → two boxes

Moving from `small_3_0` ($12) to `2 × medium_3_0` ($48) without a rebuild and
with a few minutes of downtime rather than an outage. Do this before the event,
or before any load test above roughly 100 concurrent users.

The shape of it: **stand the new pair up alongside the running box, cut over,
keep the old one until you are sure.** Nothing is deleted until the end.

## 1. Provision the pair

```sh
./infra/lightsail/provision-two-box.sh
```

It creates `spoh-app` and `spoh-db`, restricts `5432` on the database box to
the app box's private address, and prints both private IPs. Use different
instance names from the live box so the two can coexist — the script defaults
to `spoh-app`, so rename the old one first or pass `APP_NAME=`.

## 2. Start Postgres on the database box

```sh
cd ~/db
POSTGRES_PASSWORD='<same password as the old box>' docker compose up -d
docker compose ps        # healthy before continuing
```

Reusing the password means `DATABASE_URL` changes only in its host portion,
which is one fewer thing to get wrong under time pressure.

## 3. Seed it from the live box

```sh
# On the OLD box
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo docker exec spoh-postgres pg_dump -U spoh_app -d spoh2027 --no-owner \
  | gzip > ~/cutover-$STAMP.sql.gz
gzip -t ~/cutover-$STAMP.sql.gz && echo ok

# To the NEW app box, then into the NEW database
scp ~/cutover-$STAMP.sql.gz ubuntu@<new-app-ip>:~/
ssh ubuntu@<new-app-ip> \
  "zcat ~/cutover-$STAMP.sql.gz | psql 'postgresql://spoh_app:<pw>@<db-private>:5432/spoh2027?sslmode=require' -v ON_ERROR_STOP=1"
```

This copy is already stale the moment it is taken — step 5 repeats it during
the quiet window. Doing it twice is what keeps that window short.

## 4. Build the app box, but do not cut over

Follow `deploy.md`, with `DATABASE_URL` pointing at the database box's private
address. Then verify without touching DNS, using the `Host` header to reach the
new box directly:

```sh
curl -sf --resolve spoh2027.duckdns.org:443:<new-app-ip> \
  https://spoh2027.duckdns.org/readyz
```

TLS will not validate yet — the certificate is still on the old box. Use `-k`
for this check only; the real certificate is issued in step 6.

## 5. The quiet window

```sh
# OLD box: stop writes
pm2 stop spoh-server spoh-client

# Re-dump and re-load, exactly as step 3. Now nothing is changing underneath.
```

Everything from here is the cutover. Keep it tight.

## 6. DNS and certificate

Point `spoh2027.duckdns.org` at the new app box's static IP and issue the
certificate — full procedure in `dns-and-tls.md`. Nothing in Cognito or the env
files changes, because the hostname has not.

## 7. Verify, then stop

```sh
curl -sf https://spoh2027.duckdns.org/healthz
curl -sf https://spoh2027.duckdns.org/readyz
pm2 list          # cluster mode, both online
```

Sign in and load `/admin/audit`. Then compare row counts against the old box
before you believe the restore:

```sh
psql "postgresql://spoh_app:<pw>@<db-private>:5432/spoh2027?sslmode=require" -c \
 'select (select count(*) from "Volunteer") as v,
         (select count(*) from "AuditLog")  as a,
         (select count(*) from "Registration") as r;'
```

## 8. Settings that should change with the topology

None of these need a deploy, and all three matter more than the instance size:

| Setting                | Was      | Should be   | Why                                                                                                     |
| ---------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_POOL_MAX`    | 10       | **25**      | Postgres no longer competes for the app box's RAM. Ceiling is workers × pool against `max_connections`. |
| `dashboardPollSeconds` | 3        | **10**      | Runtime setting, `/admin/settings`. At 500 users a 3s poll is ~167 req/s before anyone taps.            |
| PM2 mode               | check it | **cluster** | `pm2 list`. If it says `fork`, the API is one core and the whole upgrade was wasted.                    |

## 9. Only now, delete the old box

Leave it stopped for a day first. A stopped Lightsail instance still bills for
its disk, which is a few dollars — cheap for a rollback you can reach in sixty
seconds.

```sh
aws lightsail delete-instance --region ap-southeast-1 --instance-name <old-name>
```

**Do not delete** the Cognito pool or `spoh2027-backups-665146708212`. The pool
is a foreign key target for every volunteer row (`restore.md` explains what
breaks); the bucket is what you reach for when this runbook has failed you.

## Rolling back

Before step 9, rollback is: point DNS at the old box, `pm2 start` on it, done.
The old certificate is still valid and still installed. That is the entire
reason the old box stays up through the verification.
