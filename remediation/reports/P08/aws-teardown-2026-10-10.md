# AWS torn down — 10 October 2026

At the owner's instruction ("tear down all infra in all regions, everything … anything that costs
money"), every billable AWS resource was deleted so that the remaining features are written first
([ADR-011](../../../docs/adr/ADR-011-build-first-verify-after.md)). Nothing runs in AWS now.

## What was deleted

| Resource                                                                 | How                                           |
| ------------------------------------------------------------------------ | --------------------------------------------- |
| `Spoh-staging-Platform` (ECS, API Gateway, VPC, RDS, Cognito, alarms)    | stack delete                                  |
| `Spoh-staging-Edge` (Lightsail `spoh-staging-edge` DuckDNS proxy)        | stack delete                                  |
| `Spoh-DeployAccess` (GitHub OIDC provider, `spoh-github-deploy` role)    | stack delete (finished with a temporary role) |
| `CDKToolkit` (bootstrap roles, assets bucket and repository)             | stack delete                                  |
| Retained staging buckets (media, content, exports, access logs)          | emptied and deleted                           |
| `spoh2027-backups-665146708212` (the live site's dump bucket)            | copied locally, then emptied and deleted      |
| AWS Backup vault and its 10 recovery points                              | deleted                                       |
| ECR `spoh-app`, log groups (including `/spoh2027/audit`), the RDS secret | deleted                                       |
| Lightsail `spoh-app` (**the live site**) and its static IP               | deleted                                       |
| Cognito pool `ap-southeast-1_9bwl2nGF7` (**real identities**) and domain | deleted                                       |

A sweep of every enabled region found nothing else billable before the teardown, and nothing
billable after it (below).

## What was kept

- **RDS snapshot `spoh-staging-final-20261010`** of the staging database, at the owner's choice
  (a few cents a month). CloudFormation's automatic snapshot was deleted so there is one.
- **IAM users and the account budget**, which cost nothing. The IAM user `spoh2027-app` held the
  live site's credentials; its keys now reach nothing.

## Local copies (git-ignored, in `V1-main/.local/`)

| File                                                         | What                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `live-spoh-app-pg_dumpall-20261010.sql.gz`                   | the live site's PostgreSQL (`spoh2027`)                         |
| `live-spoh-app-config-20261010.tgz`                          | its server/client env, nginx, TLS key, compose, pre-deploy dump |
| `s3-spoh2027-backups/`                                       | the dump bucket (1 September dump, manifest)                    |
| `cognito-users-…`, `cognito-groups-…`, `cognito-pool-…` JSON | both pools' users, groups and settings                          |

These hold secrets and personal data: never commit them or copy them off this machine casually.
Cognito passwords cannot be exported; a recreated pool needs every user to reset theirs.

## Consequences

- **The January no-go line has no host.** ADR-009 §3 runs training and January on
  `release/january` on Lightsail, which no longer exists. Before 28 October, either a new
  Lightsail instance is created from the local copies and the deploy runbook
  (`git show 319d06d:infra/runbooks/deploy.md`), or the owner decides otherwise.
- `deploy-staging.yml` and `infra.yml` run only when dispatched (`6ff14f0`); CI still runs on
  every push.
- To bring staging back for P16: `cdk bootstrap`, deploy `Spoh-DeployAccess` (the GitHub role),
  then dispatch the deploy workflow. Cognito, DuckDNS and the edge proxy are recreated by the
  stacks; staging's sign-in and DNS names change.
