#!/usr/bin/env bash
#
# Create the two-box (app + database) deployment described in
# topology/two-box.md. $48/month.
#
# NOT the current topology. Run this when the single box stops being enough —
# before the event, or before any load test above ~100 concurrent users.
# runbooks/scale-up.md is the migration from an existing, live single box.
#
set -euo pipefail

REGION="${REGION:-ap-southeast-1}"
AZ="${AZ:-ap-southeast-1a}"
BUNDLE="${BUNDLE:-medium_3_0}"
BLUEPRINT="${BLUEPRINT:-ubuntu_24_04}"
APP_NAME="${APP_NAME:-spoh-app}"
DB_NAME="${DB_NAME:-spoh-db}"
STATIC_IP_NAME="${STATIC_IP_NAME:-spoh-static-ip}"
HERE="$(cd "$(dirname "$0")" && pwd)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Bootstrap runs over SSH after creation, not as user-data: Lightsail prepends
# its own `#!/bin/sh`, so a bash script dies on the first bashism with the
# evidence buried in cloud-init-output.log. See provision-single.sh.
create() {
  local name=$1 role=$2 userdata=$3
  # shellcheck disable=SC2034  # kept for the caller's readability
  : "$userdata"
  if aws lightsail get-instance --region "$REGION" --instance-name "$name" >/dev/null 2>&1; then
    echo "     $name already exists, skipping"
    return
  fi
  aws lightsail create-instances --region "$REGION" \
    --instance-names "$name" --availability-zone "$AZ" \
    --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" \
\
    --tags key=project,value=spoh2027 key=role,value="$role" >/dev/null
  echo "     $name created"
}

wait_running() {
  until [ "$(aws lightsail get-instance-state --region "$REGION" --instance-name "$1" \
             --query 'state.name' --output text 2>/dev/null)" = "running" ]; do
    printf '.'; sleep 5
  done
  echo " $1 running"
}

say "1/6  instances ($BUNDLE each)"
create "$DB_NAME"  db
create "$APP_NAME" app

say "2/6  waiting"
wait_running "$DB_NAME"
wait_running "$APP_NAME"

say "3/6  private addresses"
DB_PRIVATE=$(aws lightsail get-instance --region "$REGION" --instance-name "$DB_NAME" \
             --query 'instance.privateIpAddress' --output text)
APP_PRIVATE=$(aws lightsail get-instance --region "$REGION" --instance-name "$APP_NAME" \
              --query 'instance.privateIpAddress' --output text)
echo "     db=$DB_PRIVATE  app=$APP_PRIVATE"

say "4/6  firewalls"
# App host: public web, SSH.
aws lightsail put-instance-public-ports --region "$REGION" --instance-name "$APP_NAME" \
  --port-infos \
    fromPort=22,toPort=22,protocol=TCP \
    fromPort=80,toPort=80,protocol=TCP \
    fromPort=443,toPort=443,protocol=TCP >/dev/null

# Database host: 5432 from the app host's private address ONLY, and no SSH
# from anywhere — administration hops through the app box. Lightsail instances
# in one region share a private network, so this needs no peering.
aws lightsail put-instance-public-ports --region "$REGION" --instance-name "$DB_NAME" \
  --port-infos \
    "fromPort=5432,toPort=5432,protocol=TCP,cidrs=$APP_PRIVATE/32" >/dev/null
echo "     db reachable from $APP_PRIVATE only"

say "5/6  static IP on the app host"
aws lightsail get-static-ip --region "$REGION" --static-ip-name "$STATIC_IP_NAME" >/dev/null 2>&1 \
  || aws lightsail allocate-static-ip --region "$REGION" --static-ip-name "$STATIC_IP_NAME" >/dev/null
aws lightsail attach-static-ip --region "$REGION" \
  --static-ip-name "$STATIC_IP_NAME" --instance-name "$APP_NAME" >/dev/null 2>&1 || true
IP=$(aws lightsail get-static-ip --region "$REGION" --static-ip-name "$STATIC_IP_NAME" \
     --query 'staticIp.ipAddress' --output text)

# Daily snapshots of the database box — the recovery path the single-box
# topology does not have. Roughly $0.05/GB-month.
aws lightsail enable-add-on --region "$REGION" --resource-name "$DB_NAME" \
  --add-on-request 'addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=18:00}' \
  >/dev/null 2>&1 || echo "     (auto-snapshot not enabled — set it in the console)"

say "6/6  bootstrap both hosts over SSH"
# The database box has no public SSH rule of its own, so it is bootstrapped
# through its public address before the firewall is narrowed, or by hand from
# the app host afterwards. Run this step before step 4 if you have already
# locked 22 down on the db box.
DB_PUBLIC=$(aws lightsail get-instance --region "$REGION" --instance-name "$DB_NAME"             --query 'instance.publicIpAddress' --output text)
echo "     db..."  && bootstrap "$DB_PUBLIC" "$HERE/bootstrap-db.sh"
echo "     app..." && bootstrap "$IP"        "$HERE/bootstrap.sh"

echo ""
echo "  App : $APP_NAME  public $IP  private $APP_PRIVATE"
echo "  DB  : $DB_NAME   private $DB_PRIVATE  (no public exposure)"
echo ""
echo "  On the app host, DATABASE_URL becomes:"
echo "    postgresql://spoh_app:<password>@$DB_PRIVATE:5432/spoh2027?sslmode=require&uselibpqcompat=true"
echo ""
echo "  Then: runbooks/dns-and-tls.md -> runbooks/restore.md -> runbooks/deploy.md"
echo "  Migrating from a live single box instead? runbooks/scale-up.md"
echo ""
