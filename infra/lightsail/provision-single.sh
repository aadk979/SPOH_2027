#!/usr/bin/env bash
#
# Create the single-box Lightsail deployment (topology/single-box.md).
#
# Idempotent: it skips anything that already exists, and bootstrap.sh is safe
# to re-run. It does NOT touch Cognito or the S3 backup bucket — those outlive
# any server.
#
#   ./infra/lightsail/provision-single.sh
#
set -euo pipefail

REGION="${REGION:-ap-southeast-1}"
AZ="${AZ:-ap-southeast-1a}"
NAME="${NAME:-spoh-app}"
BUNDLE="${BUNDLE:-small_3_0}"
# Ubuntu 24.04 LTS, matching what the previous box ran.
BLUEPRINT="${BLUEPRINT:-ubuntu_24_04}"
STATIC_IP_NAME="${STATIC_IP_NAME:-spoh-static-ip}"

# A key pair we hold the private half of.
#
# Without this, Lightsail assigns LightsailDefaultKeyPair, whose private key is
# downloadable exactly once and only through the console:
# `get-instance-access-details` returns just the public half. An instance
# created that way is unreachable from a script and the only fix is to delete
# and recreate it.
KEY_NAME="${KEY_NAME:-spoh-deploy-key}"
KEY_FILE="${KEY_FILE:-$HOME/.ssh/spoh-deploy-key}"

HERE="$(cd "$(dirname "$0")" && pwd)"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/6  key pair $KEY_NAME"
if aws lightsail get-key-pair --region "$REGION" --key-pair-name "$KEY_NAME" >/dev/null 2>&1; then
  echo "     already imported"
  if [ ! -f "$KEY_FILE" ]; then
    echo "     ERROR: $KEY_FILE is missing and an imported key cannot be re-downloaded." >&2
    echo "            aws lightsail delete-key-pair --key-pair-name $KEY_NAME, then re-run." >&2
    exit 1
  fi
else
  mkdir -p "$(dirname "$KEY_FILE")"
  ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "spoh2027-deploy" -q
  aws lightsail import-key-pair --region "$REGION" \
    --key-pair-name "$KEY_NAME" \
    --public-key-base64 "$(cat "$KEY_FILE.pub")" >/dev/null
  echo "     created and imported -> $KEY_FILE"
  echo "     KEEP THIS FILE. It is the only copy."
fi

say "2/6  instance $NAME ($BUNDLE, $BLUEPRINT) in $AZ"
if aws lightsail get-instance --region "$REGION" --instance-name "$NAME" >/dev/null 2>&1; then
  echo "     already exists, skipping"
else
  aws lightsail create-instances \
    --region "$REGION" \
    --instance-names "$NAME" \
    --availability-zone "$AZ" \
    --blueprint-id "$BLUEPRINT" \
    --bundle-id "$BUNDLE" \
    --key-pair-name "$KEY_NAME" \
    --tags key=project,value=spoh2027 key=role,value=app >/dev/null
  echo "     created"
fi

say "3/6  waiting for it to run"
until [ "$(aws lightsail get-instance-state --region "$REGION" --instance-name "$NAME" \
           --query 'state.name' --output text 2>/dev/null)" = "running" ]; do
  printf '.'; sleep 5
done
echo " running"

say "4/6  static IP $STATIC_IP_NAME"
# Free while attached to a running instance, billed while not. Allocating one
# and forgetting to attach it is the classic Lightsail surprise.
if aws lightsail get-static-ip --region "$REGION" --static-ip-name "$STATIC_IP_NAME" >/dev/null 2>&1; then
  echo "     already allocated"
else
  aws lightsail allocate-static-ip --region "$REGION" --static-ip-name "$STATIC_IP_NAME" >/dev/null
fi
aws lightsail attach-static-ip --region "$REGION" \
  --static-ip-name "$STATIC_IP_NAME" --instance-name "$NAME" >/dev/null 2>&1 || true

IP=$(aws lightsail get-static-ip --region "$REGION" --static-ip-name "$STATIC_IP_NAME" \
     --query 'staticIp.ipAddress' --output text)
echo "     $IP"

say "5/6  firewall"
# 22 is open to the world because Lightsail has no equivalent of EC2 Instance
# Connect to fall back on when you lock yourself out. Narrow it to your own
# address once the box is built, by appending ,cidrs=<your.ip>/32 to the rule.
# 5432 is deliberately absent — Postgres binds to loopback.
aws lightsail put-instance-public-ports --region "$REGION" --instance-name "$NAME" \
  --port-infos \
    fromPort=22,toPort=22,protocol=TCP \
    fromPort=80,toPort=80,protocol=TCP \
    fromPort=443,toPort=443,protocol=TCP >/dev/null
echo "     22, 80, 443 open"

say "6/6  bootstrap over SSH"
# Deliberately NOT --user-data.
#
# Lightsail PREPENDS its own `#!/bin/sh` to user-data, so the shebang on
# bootstrap.sh is discarded and the whole script runs under dash — where
# `set -o pipefail` is an "Illegal option" and process substitution will not
# parse. cloud-init then reports scripts_user failed, nothing in the script
# runs, and the only evidence is in /var/log/cloud-init-output.log.
#
# Over SSH the output lands here where it can be read, and a failure can be
# re-run rather than needing the instance rebuilt.
SSH_OPTS=(-i "$KEY_FILE" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

# A recreated instance reuses the address with a new host key, which trips the
# known_hosts check on every later connection.
ssh-keygen -R "$IP" >/dev/null 2>&1 || true

until ssh "${SSH_OPTS[@]}" -o ConnectTimeout=8 "ubuntu@$IP" true 2>/dev/null; do
  printf '.'; sleep 8
done
echo " ssh up"

scp "${SSH_OPTS[@]}" -q "$HERE/bootstrap.sh" "ubuntu@$IP:/tmp/bootstrap.sh"
ssh "${SSH_OPTS[@]}" "ubuntu@$IP" 'sudo bash /tmp/bootstrap.sh' 2>&1 | tail -15

echo ""
echo "  Instance : $NAME ($BUNDLE)"
echo "  Address  : $IP"
echo "  SSH      : ssh -i $KEY_FILE ubuntu@$IP"
echo "  Log      : /var/log/spoh-bootstrap.log on the box"
echo ""
echo "  Next:"
echo "    1. Point secure-channel.duckdns.org at $IP   (manual - runbooks/dns-and-tls.md)"
echo "    2. Issue the certificate                      (runbooks/dns-and-tls.md)"
echo "    3. Restore the database                       (runbooks/restore.md)"
echo "    4. Deploy                                     (runbooks/deploy.md)"
echo ""
