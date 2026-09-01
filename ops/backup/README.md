# Database backup daemon

`pg_dump` to S3 every 15 minutes during event hours, hourly otherwise.

## Why 15 minutes

The client's outbox deletes its local copy of a capture the moment the server
confirms it. Restore to an hour ago and that data is gone from **both** sides —
unlike a fallback window, where a paper tally still exists on paper.

Fifteen minutes is roughly the most a booth can lose and still reconstruct from
memory and the physical Mission Cards.

## Files

|                               |                                                      |
| ----------------------------- | ---------------------------------------------------- |
| `spoh-backup.sh`              | dump, compress, upload, verify, publish the manifest |
| `spoh-restore.sh`             | download, verify checksum, restore, count rows       |
| `spoh-backup-check.sh`        | fail if the newest dump is stale                     |
| `spoh-backup.{service,timer}` | systemd                                              |
| `spoh-backup-failed.service`  | `OnFailure` hook — wire it to a real alert           |
| `install.sh`                  | installs all of the above and takes a first backup   |
| `iam-policy.json`             | the only S3 permissions the instance needs           |

## Install

```bash
sudo BACKUP_BUCKET=spoh2027-backups-665146708212 \
     DATABASE_URL='postgresql://spoh_app:...@localhost:5432/spoh2027' \
     ./install.sh
```

The installer takes a backup before it reports success. An installer that says
"done" without having proved the thing works has told you nothing.

## Operating

```bash
systemctl status spoh-backup.timer      # is it scheduled
journalctl -u spoh-backup -n 50         # what happened
./spoh-backup-check.sh                  # is the newest dump recent enough
./spoh-restore.sh --list                # what is available
./spoh-backup.sh --force                # take one now
```

## Restoring

Rehearse into a scratch database — the script refuses anything else without
`--i-am-sure`:

```bash
./spoh-restore.sh --latest --into spoh2027_restore_check
```

The real thing, when you mean it:

```bash
systemctl stop spoh-server
./spoh-restore.sh --latest --into spoh2027 --i-am-sure
systemctl start spoh-server
```

**Rehearse this at Dry Run #1 and time it.** An untested restore is not a
backup, it is a hope — the same discipline the fallback pack gets in §11.5.

## What is in the bucket

```
manifest.json                                   the newest verified dump
dumps/2027/01/07/spoh2027-20270107T033000Z.sql.gz
```

Versioning is on, so a corrupt dump cannot overwrite a good one. Objects cool to
Glacier IR at 30 days and expire at 400.

## Design notes

- **Fail loudly.** Every failure path exits non-zero. A backup that stops
  quietly is worse than none, because you believe you have one.
- **Verify the upload.** The object is re-read and its size checked. A zero exit
  from `aws s3 cp` is a claim about the request, not about the bucket.
- **Never overwrite.** Unique timestamped keys plus bucket versioning.
- **Hold a lock.** `flock`, non-blocking — a slow dump is never stacked on.
- **Plain SQL, not custom format.** `pg_restore` has more flags to get wrong,
  and at this size the only thing that matters is that a tired person can run
  `gunzip -c … | psql` at 10am.
- **No credentials on the box.** An instance role, so there is no key to leak
  and nothing to rotate at handover.
