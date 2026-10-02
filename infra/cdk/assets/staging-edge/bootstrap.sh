#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl tar

# Official release, pinned and checked before executing any downloaded binary.
curl --fail --location --retry 5 --proto '=https' --tlsv1.2 \
  https://github.com/caddyserver/caddy/releases/download/v2.11.6/caddy_2.11.6_linux_amd64.tar.gz \
  -o /tmp/caddy.tar.gz
echo '422771007d505ea97efd1177a4905b2c1a471cd426668f2ace3bcda3d8e30b11f9b1610bfb02c6ad60f2a795f56124f2f5eec6409c17d5a0dd4c21a11375fb94  /tmp/caddy.tar.gz' | sha512sum --check -
tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin caddy
chmod 0755 /usr/local/bin/caddy
groupadd --system --force caddy
id -u caddy >/dev/null 2>&1 || useradd --system --gid caddy --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy
install -d -o caddy -g caddy -m 0700 /var/lib/caddy
install -d -o root -g caddy -m 0750 /etc/caddy
cat > /etc/caddy/Caddyfile <<'CADDYFILE_END'
@@CADDYFILE@@
CADDYFILE_END
chown root:caddy /etc/caddy/Caddyfile
chmod 0640 /etc/caddy/Caddyfile
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
cat > /etc/systemd/system/caddy.service <<'CADDY_SERVICE_END'
@@SERVICE@@
CADDY_SERVICE_END
chmod 0644 /etc/systemd/system/caddy.service
systemctl daemon-reload
systemctl enable --now caddy
