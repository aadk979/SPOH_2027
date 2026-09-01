#!/usr/bin/env bash
#
# SPOH 2027 — is the backup daemon actually alive?
#
# Reads manifest.json and fails if the newest dump is older than it should be.
#
# The failure this catches is the one that matters: the timer stopped, or the
# dump has been failing for six hours, and nobody noticed because nothing was
# on fire. You find out during a restore, which is the worst possible moment.
#
# Run it from the pre-event checklist, and from CloudWatch or a cron on another
# box so that a dead instance is noticed by something that is not on that
# instance.
#
#   spoh-backup-check.sh            # 30 min during event hours, 90 otherwise
#   spoh-backup-check.sh --max-age-minutes 20
#
set -euo pipefail

readonly CONFIG_FILE="${SPOH_BACKUP_CONFIG:-/etc/spoh/backup.env}"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set (expected in $CONFIG_FILE)}"

readonly AWS_REGION="${AWS_REGION:-ap-southeast-1}"

MAX_AGE_MINUTES=""
[[ "${1:-}" == "--max-age-minutes" ]] && MAX_AGE_MINUTES="$2"

# Event hours are 09:30-18:00 Singapore = 01:30-10:00 UTC. Inside them a dump is
# expected every 15 minutes, so 30 is already two missed ticks. Outside, hourly
# dumps mean 90 minutes is the first genuinely late one.
if [[ -z "$MAX_AGE_MINUTES" ]]; then
  minute_of_day=$(( 10#$(date -u +%H) * 60 + 10#$(date -u +%M) ))
  if (( minute_of_day >= 90 && minute_of_day < 600 )); then
    MAX_AGE_MINUTES=30
  else
    MAX_AGE_MINUTES=90
  fi
fi

MANIFEST=$(aws s3 cp "s3://${BACKUP_BUCKET}/manifest.json" - --region "$AWS_REGION" 2>/dev/null) || {
  echo "CRITICAL: no manifest.json in s3://${BACKUP_BUCKET} — the daemon has never completed a run"
  exit 2
}

COMPLETED_EPOCH=$(printf '%s' "$MANIFEST" | grep -o '"completedAtEpoch"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
COMPLETED_AT=$(printf '%s' "$MANIFEST" | grep -o '"completedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
SIZE=$(printf '%s' "$MANIFEST" | grep -o '"sizeBytes"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')

[[ -n "$COMPLETED_EPOCH" ]] || { echo "CRITICAL: manifest.json is unreadable"; exit 2; }

AGE_MINUTES=$(( ( $(date -u +%s) - COMPLETED_EPOCH ) / 60 ))

printf 'last backup: %s (%d minutes ago, %s KB)\n' "$COMPLETED_AT" "$AGE_MINUTES" "$(( SIZE / 1024 ))"

if (( AGE_MINUTES > MAX_AGE_MINUTES )); then
  cat <<MSG
CRITICAL: the newest backup is ${AGE_MINUTES} minutes old (limit ${MAX_AGE_MINUTES}).

The database is running unprotected. On the app instance:
  systemctl status spoh-backup.timer
  journalctl -u spoh-backup -n 50
  sudo -u spoh /opt/spoh/ops/backup/spoh-backup.sh --force
MSG
  exit 2
fi

echo "OK: within the ${MAX_AGE_MINUTES} minute limit"
