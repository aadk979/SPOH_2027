#!/usr/bin/env bash
#
# SPOH 2027 — install the backup daemon on the app instance.
#
# Run once, as root, on the EC2 box. Idempotent: safe to re-run after a change.
#
#   sudo BACKUP_BUCKET=spoh2027-backups-665146708212 \
#        DATABASE_URL='postgresql://spoh_app:...@localhost:5432/spoh2027' \
#        ./install.sh
#
# The instance needs an IAM role with the policy in iam-policy.json. Do NOT put
# access keys in the config file — a role means there is no key on the box to
# leak, and nothing to rotate on handover.
#
set -euo pipefail

readonly INSTALL_DIR=/opt/spoh/ops/backup
readonly CONFIG_DIR=/etc/spoh
readonly CONFIG_FILE="${CONFIG_DIR}/backup.env"
readonly SERVICE_USER=spoh

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }

: "${BACKUP_BUCKET:?BACKUP_BUCKET must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

readonly AWS_REGION="${AWS_REGION:-ap-southeast-1}"
readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> checking prerequisites"
for tool in pg_dump psql aws gzip sha256sum flock; do
  command -v "$tool" > /dev/null || {
    echo "missing: $tool" >&2
    echo "  on Amazon Linux 2023: dnf install -y postgresql16 awscli-2 util-linux" >&2
    exit 1
  }
done
echo "    all present"

echo "==> service user"
id -u "$SERVICE_USER" &>/dev/null || useradd --system --shell /usr/sbin/nologin "$SERVICE_USER"
echo "    ${SERVICE_USER}"

echo "==> directories"
install -d -m 0755 "$INSTALL_DIR"
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" /var/tmp/spoh-backup /var/lib/spoh
install -d -m 0700 "$CONFIG_DIR"

echo "==> scripts"
for script in spoh-backup.sh spoh-restore.sh spoh-backup-check.sh; do
  install -m 0755 "${SOURCE_DIR}/${script}" "${INSTALL_DIR}/${script}"
  echo "    ${INSTALL_DIR}/${script}"
done

echo "==> config"
# 0600 root-only: this file holds the database URL.
if [[ -f "$CONFIG_FILE" ]]; then
  echo "    ${CONFIG_FILE} already exists, leaving it alone"
else
  cat > "$CONFIG_FILE" <<CONF
# SPOH 2027 backup configuration. Root-readable only.
#
# No AWS credentials here on purpose — the instance role supplies them, so
# there is no key on this box to leak or to rotate at handover.

DATABASE_URL='${DATABASE_URL}'
BACKUP_BUCKET='${BACKUP_BUCKET}'
AWS_REGION='${AWS_REGION}'

# Every tick during event hours; this often otherwise.
BACKUP_OFF_HOURS_INTERVAL=3600
CONF
  chmod 0600 "$CONFIG_FILE"
  chown root:"$SERVICE_USER" "$CONFIG_FILE"
  chmod 0640 "$CONFIG_FILE"
  echo "    wrote ${CONFIG_FILE}"
fi

echo "==> systemd units"
for unit in spoh-backup.service spoh-backup.timer spoh-backup-failed.service; do
  install -m 0644 "${SOURCE_DIR}/${unit}" "/etc/systemd/system/${unit}"
  echo "    /etc/systemd/system/${unit}"
done

systemctl daemon-reload
systemctl enable --now spoh-backup.timer

echo "==> proving it works before walking away"
# An installer that reports success without having taken a backup has told you
# nothing. Take one now, and fail the install if it does not work.
if sudo -u "$SERVICE_USER" "${INSTALL_DIR}/spoh-backup.sh" --force; then
  echo "    first backup succeeded"
else
  echo "    FIRST BACKUP FAILED — the daemon is installed but not working" >&2
  echo "    journalctl -u spoh-backup -n 50" >&2
  exit 1
fi

echo ""
echo "installed."
systemctl list-timers spoh-backup.timer --no-pager | head -3
echo ""
echo "next:"
echo "  systemctl status spoh-backup.timer"
echo "  ${INSTALL_DIR}/spoh-backup-check.sh"
echo "  ${INSTALL_DIR}/spoh-restore.sh --list"
echo ""
echo "Rehearse a restore before you need one:"
echo "  ${INSTALL_DIR}/spoh-restore.sh --latest --into spoh2027_restore_check"
