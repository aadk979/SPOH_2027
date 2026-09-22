#!/bin/sh
# shellcheck shell=bash
#
# Re-exec under bash.
#
# Lightsail PREPENDS its own `#!/bin/sh` to whatever you pass as user-data, so
# this file's shebang is discarded and the whole thing runs under dash — where
# `set -o pipefail` is an "Illegal option" and process substitution does not
# parse. cloud-init then reports `scripts_user` failed and nothing else in here
# runs, silently, with the only trace in /var/log/cloud-init-output.log.
#
# provision-single.sh runs this over SSH instead, for exactly that reason. The
# guard stays so the script is still correct if it is ever used as user-data.
if [ -z "${BASH_VERSION:-}" ]; then
  exec /bin/bash "$0" "$@"
fi
#
# Turn a bare Ubuntu 24.04 Lightsail instance into the SPOH app host.
#
# Run as root over SSH by provision-single.sh. Safe to re-run by hand.
# Deliberately does NOT deploy the application or write secrets — see
# runbooks/deploy.md. This script only produces a host that is ready for one.
#
set -euo pipefail
exec > >(tee -a /var/log/spoh-bootstrap.log) 2>&1
echo "=== spoh bootstrap $(date -u +%FT%TZ) ==="

export DEBIAN_FRONTEND=noninteractive
APP_USER=ubuntu
APP_DIR=/home/$APP_USER/app

# ── Swap ────────────────────────────────────────────────────────────────────
# 2 GB box running Postgres, Node, Next.js and Docker. A build will touch the
# ceiling. Without swap the OOM killer picks a victim, and on this layout that
# is usually Postgres — which takes the data path down with it.
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Prefer reclaiming cache over swapping a live process.
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-spoh.conf
fi

# ── Packages ────────────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y ca-certificates curl gnupg git nginx ufw unattended-upgrades

# Node 22, matching the .nvmrc the repo builds against. NodeSource rather than
# the Ubuntu archive, which ships a version too old for the toolchain.
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Docker, for Postgres only.
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  usermod -aG docker $APP_USER
fi

npm install -g pm2@latest
snap install --classic certbot || apt-get install -y certbot python3-certbot-nginx
ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true

# ── Postgres TLS material ───────────────────────────────────────────────────
# config/env.ts refuses to start in production without sslmode=require. A
# self-signed cert is correct here: the connection is loopback today and
# private-network tomorrow, and this is about satisfying the transport
# requirement, not about proving identity to a third party.
PGSSL=/home/$APP_USER/pgssl
if [ ! -f "$PGSSL/server.key" ]; then
  mkdir -p "$PGSSL"
  openssl req -new -x509 -days 3650 -nodes -text \
    -out "$PGSSL/server.crt" -keyout "$PGSSL/server.key" \
    -subj "/CN=spoh-postgres"
  # Postgres refuses to start if the key is group- or world-readable, and
  # wants it owned by the container's postgres uid (70 on alpine).
  chmod 600 "$PGSSL/server.key"
  chown 70:70 "$PGSSL/server.key" "$PGSSL/server.crt"
fi

# ── Firewall ────────────────────────────────────────────────────────────────
# Lightsail's own firewall is the outer layer; ufw is the one that survives a
# console misclick. 5432 appears in neither — Postgres binds to loopback.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── Unattended security updates ─────────────────────────────────────────────
dpkg-reconfigure -f noninteractive unattended-upgrades

mkdir -p "$APP_DIR" /home/$APP_USER/predeploy-backups
chown -R $APP_USER:$APP_USER /home/$APP_USER

# After the recursive chown, not before: the sweep above would otherwise hand
# the Postgres key back to ubuntu, and the container refuses to start with a
# key it does not own. uid 70 is postgres inside postgres:17-alpine.
chown 70:70 "$PGSSL/server.key" "$PGSSL/server.crt"
chmod 600 "$PGSSL/server.key"

# PM2 resurrects its process list on boot. Without this a reboot leaves nginx
# serving 502 until somebody notices.
env PATH="$PATH:/usr/bin" pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

echo "=== bootstrap complete $(date -u +%FT%TZ) ==="
echo "Host is ready. Deploy with runbooks/deploy.md."
