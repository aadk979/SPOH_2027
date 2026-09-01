#!/usr/bin/env bash
#
# SPOH 2027 — database restore.
#
# The other half of the backup. An untested restore is not a backup, it is a
# hope, so this is written to be run under pressure by somebody who did not
# write it — and it is rehearsed at Dry Run #1, exactly like the fallback pack.
#
# Usage:
#   spoh-restore.sh --list                        # what is available
#   spoh-restore.sh --latest --into spoh2027_restore_check   # rehearsal
#   spoh-restore.sh --latest --into spoh2027 --i-am-sure     # the real thing
#   spoh-restore.sh --key dumps/2027/01/07/spoh2027-... --into spoh2027_scratch
#
# The safety rule: restoring over a database whose name does not end in
# _restore_check or _scratch requires --i-am-sure. On 7 January somebody will
# run this from the wrong terminal, and the cheapest place to catch that is here.
#
set -euo pipefail

readonly CONFIG_FILE="${SPOH_BACKUP_CONFIG:-/etc/spoh/backup.env}"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set (expected in $CONFIG_FILE)}"

readonly AWS_REGION="${AWS_REGION:-ap-southeast-1}"
readonly WORK_DIR="${BACKUP_WORK_DIR:-/var/tmp/spoh-backup}"

MODE=""
KEY=""
TARGET_DB=""
CONFIRMED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) MODE=list; shift ;;
    --latest) MODE=latest; shift ;;
    --key) MODE=key; KEY="$2"; shift 2 ;;
    --into) TARGET_DB="$2"; shift 2 ;;
    --i-am-sure) CONFIRMED=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# ── What is available ────────────────────────────────────────────────────────
if [[ "$MODE" == "list" ]]; then
  echo "most recent dumps in s3://${BACKUP_BUCKET}/dumps/"
  echo ""
  aws s3 ls "s3://${BACKUP_BUCKET}/dumps/" --recursive --region "$AWS_REGION" \
    | sort -r | head -30 | awk '{ printf "  %s %s  %8.1f KB  %s\n", $1, $2, $3/1024, $4 }'

  echo ""
  echo "manifest (the newest verified dump):"
  aws s3 cp "s3://${BACKUP_BUCKET}/manifest.json" - --region "$AWS_REGION" 2>/dev/null \
    | sed 's/^/  /' || echo "  no manifest — the daemon may never have run"
  exit 0
fi

[[ -n "$MODE" ]] || fail "specify --list, --latest, or --key <s3-key>"
[[ -n "$TARGET_DB" ]] || fail "specify --into <database-name>"

# ── The guard ────────────────────────────────────────────────────────────────
# A name ending in _restore_check or _scratch is obviously a rehearsal. Anything
# else might be the live event database, so say its name out loud.
if [[ ! "$TARGET_DB" =~ (_restore_check|_scratch)$ ]] && (( CONFIRMED == 0 )); then
  cat >&2 <<MSG
REFUSING: "${TARGET_DB}" is not obviously a scratch database.

This will DROP AND REPLACE every table in it.

  - To rehearse, restore into a name ending in _restore_check or _scratch.
  - If you really mean to overwrite "${TARGET_DB}", add --i-am-sure.
MSG
  exit 1
fi

# ── Resolve which dump ───────────────────────────────────────────────────────
if [[ "$MODE" == "latest" ]]; then
  MANIFEST=$(aws s3 cp "s3://${BACKUP_BUCKET}/manifest.json" - --region "$AWS_REGION" 2>/dev/null) \
    || fail "no manifest.json in the bucket; pass --key explicitly"

  KEY=$(printf '%s' "$MANIFEST" | grep -o '"latestKey"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  EXPECTED_SHA=$(printf '%s' "$MANIFEST" | grep -o '"sha256"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  COMPLETED=$(printf '%s' "$MANIFEST" | grep -o '"completedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

  [[ -n "$KEY" ]] || fail "manifest.json has no latestKey"
  log "latest dump: ${KEY} (taken ${COMPLETED})"
else
  EXPECTED_SHA=$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "$KEY" \
    --region "$AWS_REGION" --query 'Metadata.sha256' --output text 2>/dev/null || echo "")
fi

mkdir -p "$WORK_DIR"
readonly LOCAL_FILE="${WORK_DIR}/restore-$(basename "$KEY")"

cleanup() { rm -f "$LOCAL_FILE"; }
trap cleanup EXIT

log "downloading ${KEY}"
aws s3 cp "s3://${BACKUP_BUCKET}/${KEY}" "$LOCAL_FILE" --region "$AWS_REGION" --only-show-errors \
  || fail "could not download ${KEY}"

# ── Verify before touching anything ──────────────────────────────────────────
# Restoring a corrupt dump over a working database would turn a recoverable
# situation into an unrecoverable one.
if [[ -n "$EXPECTED_SHA" && "$EXPECTED_SHA" != "None" ]]; then
  ACTUAL_SHA=$(sha256sum "$LOCAL_FILE" | cut -d' ' -f1)
  [[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] \
    || fail "checksum mismatch — the dump is corrupt. expected ${EXPECTED_SHA}, got ${ACTUAL_SHA}"
  log "checksum verified"
else
  log "WARNING: no checksum recorded for this object; proceeding unverified"
fi

gzip -t "$LOCAL_FILE" || fail "the archive is not valid gzip"

# ── Restore ──────────────────────────────────────────────────────────────────
# Build the target URL from the configured one, swapping only the database name,
# so credentials and host never have to be retyped.
readonly BASE_URL="${DATABASE_URL%/*}"
readonly TARGET_URL="${BASE_URL}/${TARGET_DB}"

# Create the target if it is not there. Deliberately NOT wrapped in `|| true`:
# an earlier version swallowed the failure here and the restore then died three
# lines later with "database does not exist", which is a confusing way to be
# told that creating the database did not work.
if psql "${BASE_URL}/postgres" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'" 2>/dev/null | grep -q '^1$'; then
  log "${TARGET_DB} already exists"
else
  log "creating ${TARGET_DB}"
  psql "${BASE_URL}/postgres" -v ON_ERROR_STOP=1 -q \
    -c "CREATE DATABASE \"${TARGET_DB}\"" \
    || fail "could not create ${TARGET_DB}"
fi

log "restoring into ${TARGET_DB}"

# The dump carries --clean --if-exists, so it drops and recreates as it goes.
# ON_ERROR_STOP means a half-applied restore fails loudly rather than leaving a
# database that looks fine and is missing three tables.
if ! gunzip -c "$LOCAL_FILE" | psql "$TARGET_URL" -v ON_ERROR_STOP=1 --quiet > "${WORK_DIR}/restore.log" 2>&1; then
  fail "restore failed: $(tail -5 "${WORK_DIR}/restore.log" | tr '\n' ' ')"
fi

# ── Prove it worked ──────────────────────────────────────────────────────────
# "psql exited 0" is not the same claim as "the data is there".
log "verifying"

readonly COUNTS=$(psql "$TARGET_URL" -tAF' ' -c "
  SELECT
    (SELECT COUNT(*) FROM \"Volunteer\"),
    (SELECT COUNT(*) FROM \"Registration\"),
    (SELECT COUNT(*) FROM \"FootfallTick\"),
    (SELECT COUNT(*) FROM \"MissionCard\"),
    (SELECT COUNT(*) FROM \"Station\")
" 2>/dev/null) || fail "restored database is not queryable"

read -r VOLUNTEERS REGISTRATIONS FOOTFALL CARDS STATIONS <<< "$COUNTS"

log "restored into ${TARGET_DB}:"
log "  volunteers    ${VOLUNTEERS}"
log "  registrations ${REGISTRATIONS}"
log "  room entries  ${FOOTFALL}"
log "  cards         ${CARDS}"
log "  stations      ${STATIONS}"

(( STATIONS > 0 )) || fail "no stations in the restored database; this dump is not usable"

log "restore complete"
