#!/usr/bin/env bash
#
# Database-only host for the two-box topology (topology/two-box.md).
#
# Postgres and nothing else. No Node, no nginx, no application code — the whole
# point of the split is that this box has one job and one reason to fail.
#
# Runs once as root via Lightsail user-data. Safe to re-run by hand. It does
# not start Postgres: that needs POSTGRES_PASSWORD, which never lives in a
# file that gets committed. See the tail of this script.
#
set -euo pipefail
exec > >(tee -a /var/log/spoh-bootstrap-db.log) 2>&1
echo "=== spoh db bootstrap $(date -u +%FT%TZ) ==="

export DEBIAN_FRONTEND=noninteractive
APP_USER=ubuntu

apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades postgresql-client-16

if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  usermod -aG docker "$APP_USER"
fi

# ── TLS material ────────────────────────────────────────────────────────────
# On this topology the connection crosses the private network rather than
# loopback, so the transport encryption stops being ceremony and starts being
# the thing protecting the hop.
PGSSL="/home/$APP_USER/pgssl"
if [ ! -f "$PGSSL/server.key" ]; then
  mkdir -p "$PGSSL"
  openssl req -new -x509 -days 3650 -nodes -text \
    -out "$PGSSL/server.crt" -keyout "$PGSSL/server.key" -subj "/CN=spoh-postgres"
  # Postgres refuses to start if the key is group- or world-readable, and
  # wants it owned by the container's postgres uid (70 on alpine).
  chmod 600 "$PGSSL/server.key"
  chown 70:70 "$PGSSL/server.key" "$PGSSL/server.crt"
fi

# ── Compose file ────────────────────────────────────────────────────────────
# A 4 GB box that owns the machine, unlike the single-box layout where Postgres
# shares with Node and Next.js. Roughly a quarter of RAM to shared_buffers and
# three quarters declared as effective_cache_size, which is a planner hint
# rather than an allocation.
mkdir -p "/home/$APP_USER/db"
cat > "/home/$APP_USER/db/docker-compose.yml" <<'COMPOSE'
services:
  postgres:
    image: postgres:17-alpine
    container_name: spoh-postgres
    restart: always
    environment:
      POSTGRES_USER: spoh_app
      POSTGRES_DB: spoh2027
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
    command:
      - -c
      - ssl=on
      - -c
      - ssl_cert_file=/var/lib/postgresql/server.crt
      - -c
      - ssl_key_file=/var/lib/postgresql/server.key
      - -c
      - shared_buffers=1GB
      - -c
      - effective_cache_size=3GB
      - -c
      - max_connections=100
    # Bound to all interfaces on purpose: the Lightsail firewall restricts
    # 5432 to the app host's private address, and this box has no public path
    # to it at all. Binding to loopback here would make it unreachable.
    ports:
      - '5432:5432'
    volumes:
      - spoh-pgdata:/var/lib/postgresql/data
      - /home/ubuntu/pgssl/server.crt:/var/lib/postgresql/server.crt:ro
      - /home/ubuntu/pgssl/server.key:/var/lib/postgresql/server.key:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U spoh_app -d spoh2027']
      interval: 10s
      timeout: 5s
      retries: 10

volumes:
  spoh-pgdata:
COMPOSE
chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/db"

# ── Firewall ────────────────────────────────────────────────────────────────
# No 22 rule: reach this box from the app host. No 80/443 either. Lightsail's
# private range for the region is the only source that can matter, and the
# Lightsail firewall narrows it further to one address.
ufw allow from 172.26.0.0/16 to any port 5432 proto tcp
ufw --force enable

dpkg-reconfigure -f noninteractive unattended-upgrades

echo "=== db bootstrap complete $(date -u +%FT%TZ) ==="
echo "Start Postgres with:"
echo "  cd ~/db && POSTGRES_PASSWORD='<password>' docker compose up -d"
echo "Then restore: infra/runbooks/restore.md"
