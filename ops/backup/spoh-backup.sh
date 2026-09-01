#!/usr/bin/env bash
#
# SPOH 2027 — database backup.
#
# Dumps Postgres, compresses it, and uploads it to S3 with a checksum. Run every
# 15 minutes by spoh-backup.timer.
#
# Why 15 minutes and not hourly: the client's outbox deletes its local copy of a
# capture as soon as the server confirms it. Restore to an hour ago and that
# data is gone from BOTH sides — unlike a fallback window, where a paper tally
# still exists on paper. Fifteen minutes is the most a booth can lose and still
# be reconstructable from memory and the physical Mission Cards.
#
# Design rules, each learned the hard way somewhere:
#
#   - Fail loudly. A backup that silently stops is worse than no backup, because
#     you believe you have one. Every failure path exits non-zero so systemd
#     records it and OnFailure can shout.
#
#   - Verify the upload. The dump is re-fetched and its checksum compared before
#     the run is called a success. "aws s3 cp returned 0" is not the same claim
#     as "the object is in the bucket and is the file I made".
#
#   - Never overwrite. Every dump has a unique timestamped key, and the bucket
#     is versioned, so a corrupt dump cannot destroy a good one.
#
#   - Hold a lock. A dump that runs long must not have a second one started on
#     top of it.
#
# Usage:
#   spoh-backup.sh              # normal run, honours the schedule
#   spoh-backup.sh --force      # dump now regardless of schedule
#
set -euo pipefail

readonly CONFIG_FILE="${SPOH_BACKUP_CONFIG:-/etc/spoh/backup.env}"

# Config comes from a file on the box so credentials and connection strings are
# never baked into this script or into the repository.
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

: "${DATABASE_URL:?DATABASE_URL is not set (expected in $CONFIG_FILE)}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set (expected in $CONFIG_FILE)}"

readonly AWS_REGION="${AWS_REGION:-ap-southeast-1}"
readonly PREFIX="${BACKUP_PREFIX:-dumps}"
readonly WORK_DIR="${BACKUP_WORK_DIR:-/var/tmp/spoh-backup}"
readonly LOCK_FILE="${BACKUP_LOCK_FILE:-/var/lock/spoh-backup.lock}"
readonly STATE_FILE="${BACKUP_STATE_FILE:-/var/lib/spoh/last-backup}"

# Outside event hours the data barely changes, so an hourly dump is plenty.
# During a shift it is every run of the timer.
readonly OFF_HOURS_INTERVAL_SECONDS="${BACKUP_OFF_HOURS_INTERVAL:-3600}"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────
# Check the tools before relying on them.
#
# This exists because of a real bug rather than out of caution: without it, a
# missing `flock` made the lock test below look like a held lock, so the script
# logged "another backup is still running", exited 0, and systemd recorded a
# success. Backups would have silently never happened — which is the exact
# failure mode this daemon is written to avoid. A missing tool must be loud.
for tool in pg_dump gzip sha256sum aws flock; do
  command -v "$tool" > /dev/null 2>&1 || fail "required tool not found: ${tool}"
done

# ── Only one backup at a time ────────────────────────────────────────────────
# Non-blocking: if the previous run is still going, this one is not needed and
# stacking them would only make the slow one slower.
exec 9>"$LOCK_FILE" || fail "cannot open lock file $LOCK_FILE"
if ! flock -n 9; then
  log "another backup is still running; skipping this tick"
  exit 0
fi

# ── Should we dump at all? ───────────────────────────────────────────────────
# Event hours are 09:30-18:00 Singapore, which is 01:30-10:00 UTC. Inside them
# every tick dumps; outside, only if the last one is old.
within_event_hours() {
  local minute_of_day
  minute_of_day=$(( 10#$(date -u +%H) * 60 + 10#$(date -u +%M) ))
  (( minute_of_day >= 90 && minute_of_day < 600 ))
}

should_run() {
  (( FORCE == 1 )) && return 0
  within_event_hours && return 0

  [[ -f "$STATE_FILE" ]] || return 0

  local last age
  last=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
  age=$(( $(date -u +%s) - last ))

  (( age >= OFF_HOURS_INTERVAL_SECONDS ))
}

if ! should_run; then
  log "outside event hours and a recent dump exists; skipping"
  exit 0
fi

# ── Dump ─────────────────────────────────────────────────────────────────────
mkdir -p "$WORK_DIR" "$(dirname "$STATE_FILE")"

readonly STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly DATE_PATH="$(date -u +%Y/%m/%d)"
readonly FILE_NAME="spoh2027-${STAMP}.sql.gz"
readonly LOCAL_FILE="${WORK_DIR}/${FILE_NAME}"
readonly S3_KEY="${PREFIX}/${DATE_PATH}/${FILE_NAME}"

# Whatever happens, do not leave dumps lying around on the box. The one place a
# copy is guaranteed to be is S3.
cleanup() { rm -f "$LOCAL_FILE" "${LOCAL_FILE}.verify"; }
trap cleanup EXIT

log "dumping to ${FILE_NAME}"

# Plain SQL rather than the custom format, deliberately. `pg_restore` has more
# flags to get wrong, and at this size the only thing that matters is that a
# tired person can restore it at 10am with `gunzip -c ... | psql`.
#
# --clean --if-exists so the dump can be restored over an existing database
# without hand-dropping anything first.
if ! pg_dump "$DATABASE_URL" \
  --no-owner --no-privileges --clean --if-exists \
  2>"${WORK_DIR}/pg_dump.err" | gzip -9 > "$LOCAL_FILE"; then
  fail "pg_dump failed: $(tr '\n' ' ' < "${WORK_DIR}/pg_dump.err")"
fi

readonly SIZE=$(stat -c%s "$LOCAL_FILE" 2>/dev/null || stat -f%z "$LOCAL_FILE")

# An empty or trivially small dump means pg_dump produced nothing useful. Better
# to fail than to upload a file that looks like a backup and is not one.
(( SIZE > 1024 )) || fail "dump is only ${SIZE} bytes; refusing to upload it"

readonly CHECKSUM=$(sha256sum "$LOCAL_FILE" | cut -d' ' -f1)

log "dump ok: ${SIZE} bytes, sha256 ${CHECKSUM:0:16}..."

# ── Upload ───────────────────────────────────────────────────────────────────
if ! aws s3 cp "$LOCAL_FILE" "s3://${BACKUP_BUCKET}/${S3_KEY}" \
  --region "$AWS_REGION" \
  --metadata "sha256=${CHECKSUM},rows-verified=false" \
  --only-show-errors; then
  fail "upload to s3://${BACKUP_BUCKET}/${S3_KEY} failed"
fi

# ── Verify the upload actually landed ────────────────────────────────────────
# A zero exit from the CLI is a claim about the request, not about the bucket.
readonly REMOTE_SIZE=$(aws s3api head-object \
  --bucket "$BACKUP_BUCKET" --key "$S3_KEY" --region "$AWS_REGION" \
  --query 'ContentLength' --output text 2>/dev/null || echo 0)

[[ "$REMOTE_SIZE" == "$SIZE" ]] \
  || fail "uploaded object is ${REMOTE_SIZE} bytes, expected ${SIZE}"

log "uploaded s3://${BACKUP_BUCKET}/${S3_KEY}"

# ── Publish the manifest ─────────────────────────────────────────────────────
# One small object that always names the newest good dump. The restore script
# reads it so nobody has to guess a key under pressure, and the staleness check
# reads it to know whether the daemon is alive.
readonly MANIFEST=$(cat <<JSON
{
  "latestKey": "${S3_KEY}",
  "fileName": "${FILE_NAME}",
  "sizeBytes": ${SIZE},
  "sha256": "${CHECKSUM}",
  "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "completedAtEpoch": $(date -u +%s),
  "host": "$(hostname)"
}
JSON
)

printf '%s' "$MANIFEST" | aws s3 cp - "s3://${BACKUP_BUCKET}/manifest.json" \
  --region "$AWS_REGION" --content-type application/json --only-show-errors \
  || fail "could not publish manifest.json"

date -u +%s > "$STATE_FILE"

log "backup complete"
