# Local Docker recovery — 3 October 2026

The owner authorized resetting Docker and deleting all containers, then required
CLI/terminal actions only. Docker recovery is complete: the Linux engine answers
requests and the recreated `spoh2027-postgres` is healthy on `127.0.0.1:5435`.

This was a socket/process repair and container cleanup, **not a factory reset**.
Automatic approval review rejected the attempted manual WSL/data/settings reset
before execution, returning only `blocked by policy`. No data deletion occurred
from that command. The earlier startup log's factory-reset action was not issued
by this agent and did not remove the existing containers or databases.

## Recovery performed

- Used `docker desktop stop --force` and terminated remaining Docker processes by
  their verified executable paths. The final cleanup covered
  `C:\Program Files\Docker\`, including an orphaned `cli-plugins/docker-desktop.exe`
  process missed by the narrower initial process filter.
- Terminated only the `docker-desktop` WSL distribution. No WSL distribution was
  unregistered and no virtual disk was removed.
- Used native PowerShell `Move-Item -LiteralPath` to quarantine locked runtime
  directories, after checking their absolute source/destination paths and parents.
  The last pair is `%LOCALAPPDATA%\Docker\run.recovery-20261003-1600` and
  `%LOCALAPPDATA%\docker-secrets-engine.recovery-20261003-1600`. Earlier retries
  left additional `*.recovery-20261003-*` directories. Keep those quarantines for
  now; no credentials or socket payloads are included in this report.
- Verified both original runtime directories were absent and no Docker process
  remained, then used `docker desktop start --detach`. The engine started and
  returned all **21** existing containers.
- Removed those **21 containers** through `docker rm --force`, as explicitly
  requested. Verified the inventory was empty before recreating SPOH Postgres.
  Images and volumes were retained.
- Recreated `spoh2027-postgres` using its original `postgres:17-alpine` image and
  **existing** named volume `v1_spoh-pgdata`. Published only localhost:5435 and
  retained `unless-stopped`. No sibling checkout file was edited.

The inference error cleared after the first directory quarantine; a second stale
`docker-secrets-engine/engine.sock` then blocked startup. Docker's issue tracker
describes the same socket/process failure pattern and a process cleanup/runtime
directory recovery. This is supporting context, not proof of the exact Windows
kernel cause on this machine. [Docker issue 448](https://github.com/docker/desktop-feedback/issues/448),
[Docker issue 460](https://github.com/docker/desktop-feedback/issues/460).

## Verification and database boundary

- Engine reports **29.5.3**, Linux/overlayfs, and accepts container requests.
- The recreated Postgres container reports **healthy**, with `pg_isready` accepting
  connections. The previous real `spoh2027` and all dedicated test databases remain
  present in a read-only `pg_database` inventory.
- The integration setup targets only `spoh2027_test`: **26 migrations**, none
  pending. No reset, seed or migration was directed at real `spoh2027`.
- Remediation source remains confined to `V1-main`. This local Docker repair made
  no AWS, production, staging-origin or Cognito change.

The container deletion affects other local projects too, as the owner requested.
Their volumes remain available, but their containers were not recreated.
