# Staging database backup metadata — independent P08 observation

At 17:15 Singapore on 5 October 2026, read-only AWS CLI queries verify the
CloudFormation-owned staging database and backup plan. Account/region, stack
ownership and exact database resource filters precede full pagination. The
stack is UPDATE_COMPLETE on image 00dbc2a; no database connection or secret
value read is used. [Sanitised evidence](staging-backup-inventory-evidence-2026-10-05.json)
omits identifiers, ARNs, endpoint names and credentials.

The available PostgreSQL 17.9 db.t4g.micro is single-AZ, encrypted, protected
against deletion and not publicly accessible. Its gp3 allocation is 20 GiB,
with a configured autoscaling maximum of 100 GiB. RDS reports seven-day backup
retention and one active automated-backup instance. The reported recovery window
starts on 29 September at 07:12:46.982 UTC and ends on 5 October at 09:07:55 UTC;
the latter is 482 seconds old at observation. Seven available encrypted automated
snapshots are listed. Metadata supports a recovery window, not a tested restore.

The single backup-plan selection explicitly includes exactly this database,
without exclusions or tag conditions. Its daily rule is cron(0 5 * * ? *) on
Etc/UTC, with 35-day retention. Six owned encrypted recovery points report
COMPLETED and 35-day retention. The resource-filtered last-seven-day job list
contains six COMPLETED jobs; the newest completion is 15:37:49.738 Singapore
on 5 October. These service outcomes are not application/data restore validation.

The attached parameter group reports rds.force_ssl=1, source system, apply method
pending-reboot; its attachment apply state is in-sync. The first query filtered
only user overrides and therefore omitted this parameter. The corrected query
reads all parameter sources and the automated-backup recovery window. No reboot
or parameter change is requested, and no live SQL/TLS assertion is claimed.

This observation creates no snapshot, restore, database, export or backup job and
changes no policy, data or configuration. Reads are non-atomic and time-dependent.
The original P08.3 network/database completion remains recorded; this refresh
does not reopen or newly close it. A functional restore rehearsal, backup-age
alarm/delivery, current network reachability and measured backup/storage costs
remain separate evidence. P08 and its broader gates remain open; no budget
compliance or production creation is claimed.
