#!/usr/bin/env bash
#
# Create the single-box Lightsail deployment.
#
# Idempotent enough to re-run: it skips anything that already exists. It does
# NOT touch Cognito or the S3 backup bucket — those outlive any server.
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

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/4  instance $NAME ($BUNDLE, $BLUEPRINT) in $AZ"
if aws lightsail get-instance --region "$REGION" --instance-name "$NAME" >/dev/null 2>&1; then
  echo "     already exists, skipping"
else
  aws lightsail create-instances \
    --region "$REGION" \
    --instance-names "$NAME" \
    --availability-zone "$AZ" \
    --blueprint-id "$BLUEPRINT" \
    --bundle-id "$BUNDLE" \
    --user-data file://"$(dirname "$0")/bootstrap.sh" \
    --tags key=project,value=spoh2027 key=role,value=app >/dev/null
  echo "     created"
fi

say "2/4  waiting for it to run"
until [ "$(aws lightsail get-instance-state --region "$REGION" --instance-name "$NAME" \
           --query 'state.name' --output text 2>/dev/null)" = "running" ]; do
  printf '.'; sleep 5
done
echo " running"

say "3/4  static IP $STATIC_IP_NAME"
# Free while attached, billed while not. Allocating one and forgetting to
# attach it is the classic Lightsail surprise.
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

say "4/4  firewall"
# 22 stays open to the world here only because Lightsail has no equivalent of
# EC2 Instance Connect to fall back on; narrow it to your own address once the
# box is built. 5432 is deliberately absent — Postgres binds to loopback.
aws lightsail put-instance-public-ports --region "$REGION" --instance-name "$NAME" \
  --port-infos \
    fromPort=22,toPort=22,protocol=TCP \
    fromPort=80,toPort=80,protocol=TCP \
    fromPort=443,toPort=443,protocol=TCP >/dev/null
echo "     22, 80, 443 open"

cat <<DONE

  Instance : $NAME ($BUNDLE)
  Address  : $IP
  SSH      : aws lightsail get-instance-access-details --region $REGION --instance-name $NAME

  Next:
    1. Point secure-channel.duckdns.org at $IP   (manual — see runbooks/dns-and-tls.md)
    2. Wait for DNS, then issue the certificate  (runbooks/dns-and-tls.md)
    3. Restore the database                      (runbooks/restore.md)
    4. Deploy                                    (runbooks/deploy.md)

DONE
