# SPOH platform infrastructure (CDK)

The AWS environments as code, per ADR-008: `staging` and `prod`, each one `PlatformStack` in
ap-southeast-1, configured in [`src/config.ts`](src/config.ts). Every resource is tagged `app`,
`env`, `owner` and `cost-centre`, and the AwsSolutions `cdk-nag` pack runs at synth: an
unsuppressed finding fails it, and a suppression must say why.

```bash
npm run infra:synth              # both stages, nag checks included
npm run infra:diff               # against the deployed stacks (needs credentials)
npm run test --workspace infra/cdk
```

`Spoh-staging-Platform` is deployed and released from CI; the production stack is created at the
go decision. Bootstrapping, the GitHub OIDC role and releases are described below.

- The production Cognito pool `ap-southeast-1_9bwl2nGF7` is referenced by id, never owned: every
  `Volunteer.cognitoSub` points into it.
- Production routing still has unused placeholders: D-08 now requires Firebase Hosting for
  the client and a DuckDNS HTTPS API. Its concrete identifiers and deployment remain subject
  to the owner boundaries; no Route 53 domain is required.

## Access from CI (P08.2)

The account is bootstrapped (`cdk bootstrap aws://665146708212/ap-southeast-1`, default qualifier,
tagged). The `Spoh-DeployAccess` stack holds GitHub's OIDC provider and the role
`spoh-github-deploy`, which a workflow may assume only from `aadk979/SPOH_2027` (matched by its
immutable owner and repository ids, `aadk979@138833125/SPOH_2027@1379786785`) on `main` or in the
`staging` or `prod` deployment environment. Its only permission is to assume the four CDK bootstrap
roles, so everything CI changes goes through CloudFormation. `.github/workflows/infra.yml` runs
`cdk diff` with it; no workflow holds static keys.

The bootstrap and this stack were deployed once from a workstation with the owner's approval
(2026-09-29, D-13). To change the role, edit `src/deployAccessStack.ts` and deploy
`Spoh-DeployAccess` the same way, or from CI once P08.9 adds deploys.

## Releases and one-off tasks (P08.4, P08.10)

`.github/workflows/deploy-staging.yml` runs after CI succeeds on `main`: it pushes the image, deploys
the stack with the new task definitions, runs the migrate task
([`infra/scripts/run-migrate-task.mjs`](../scripts/run-migrate-task.mjs)), moves the service to the
release and runs the smoke test.

The migrate task definition also runs the container entrypoint's one-off commands against the
stage's database, with the current release's image:

```bash
node infra/scripts/run-migrate-task.mjs - Spoh-staging-Platform seed    # idempotent seed (production shape)
node infra/scripts/run-migrate-task.mjs - Spoh-staging-Platform seed-fixture # two synthetic event fixtures, staging only
node infra/scripts/run-migrate-task.mjs - Spoh-staging-Platform totals  # P09 totals check, read-only
```

`-` reads the stack outputs from CloudFormation; the task's log is printed when it stops. All run
as the app role. `seed-fixture` overrides `NODE_ENV` for that one-off staging task only. The API
service stays in production mode, and a production stack name is refused before any AWS call.

## Configuration migration boundary (P10.4 / P08.6)

The P10.4 audit checkpoint found no application SSM parameters to remove in Singapore.
P08.6 defines standard `String` parameters under `/spoh/<stage>/infra/<ENV_NAME>` and
injects them at task startup: 16 for staging, 14 for the unchanged production definition.
The app execution role can read only its stage's exact injected parameters; the
migration execution role reads only `DB_HOST` and `DB_NAME`. Application task roles do not gain
SSM access. Credentials remain in Secrets Manager, and no environment file is included in an image.

Staging now selects the verified DuckDNS API/client origins together for callback,
browser redirects, logout and credentialed CORS, and injects `DEPLOYMENT_ENV=staging`.
Production retains the previous API Gateway origin and reference-only Cognito configuration.
The closest API Gateway hop remains the only trusted proxy hop. Infrastructure
values are code-owned and released through CDK/CI: ECS does not reload changed parameters into
running containers, so changing a parameter requires a new task deployment. Operational live
settings retain their database/cache-bus path. See the
[`P08.6 verification report`](../../remediation/reports/P08/infrastructure-configuration.md).
Secret completion, rotation and Access Analyzer verification remain open.

## Private storage foundation (partial P08.7)

`ObjectStorage` defines retained media, versioned content and 90-day exports,
with a separate 30-day access-log bucket. All four block public access, disable
ACLs, use S3-managed encryption and deny non-TLS access. Log delivery is scoped
to the exact source bucket, account and prefix. Media CORS permits only signed
POSTs from the configured exact HTTPS client origin; no production origin means
no production CORS rule.

The existing `spoh2027-backups-665146708212` bucket is referenced by name only.
CDK takes no ownership of it and changes none of its policies, lifecycle or
permissions. Stack outputs expose the three data bucket names and the existing
backup name. Application access and SSM injection remain separate: this
foundation grants no task S3 permissions and does not enable media uploads.

Media expiry must follow the event's CLOSED instant (ADR-003 §8); there is no
upload-age deletion rule. Content versions are retained. Deleting or replacing a
stack retains all owned buckets and their objects; any later removal is a
separate, explicit data-disposal operation. See the
[verification, retention and cost boundary](../../remediation/reports/P08/private-storage-foundation.md).

For a review that preserves the actual running app, supply its verified image
tag in both contexts:

```bash
npx cdk diff Spoh-staging-Platform Spoh-DeployAccess --no-change-set \
  -c imageTag=<verified-current-image> -c serviceImageTag=<verified-current-image>
```

An image-less platform diff omits the existing app construct and therefore also
shows proposed app removals; review with both image contexts before a release.
Production remains review-only until the owner go decision.

## Scheduler monitoring (P08.8 / P10.6)

The app log group supplies two fixed-cardinality scheduler gauges in `SPOH/<stage>`;
one-minute alarms use Maximum across worker observations. The lag alarm requires two minutes
over 60 seconds; any dead action alarms after one minute. Missing observations preserve the
previous state. Alarm names are stack outputs. SNS actions/subscriptions, worker availability
and the remaining alarm catalogue are pending; these detection alarms alone do not notify the
owner. See the [verification and cost boundary](../../remediation/reports/P08/scheduler-monitoring.md).

The native HTTP API alarms detect a five-minute 5xx rate over 1% and p95 latency over 300 ms
in two of three minutes. They use only the actual API id and existing basic metrics, with no
paid route dimensions. Missing request data is non-breaching; availability and owner SNS
delivery remain pending. See the [HTTP alarm evidence and cost](../../remediation/reports/P08/http-monitoring.md).

The native RDS CPU alarm uses the actual database identifier, Average over 90% in five
consecutive minutes, with missing observations left insufficient. It changes no database
parameters and has no notification actions. Free storage/connection limits and owner delivery
remain pending. See the [database CPU evidence and cost](../../remediation/reports/P08/database-cpu-monitoring.md).

The cache-bus heartbeat reports connection bypass as a bounded 0/1 gauge before each
worker claim. Maximum across reporting instances alarms for two of three minutes of
degradation; missing observations remain insufficient. It uses the existing app log
group without per-instance metric dimensions or extra permissions. Owner delivery and
worker availability remain pending. See the
[cache-bus evidence and cost](../../remediation/reports/P08/cache-bus-monitoring.md).

## Staging HTTPS proxy (P08.5)

`-c stagingEdge=true` adds the separate `Spoh-staging-Edge` stack. Provision only that stack,
with its `ApiOrigin` parameter set to staging's `AppUrl` and `OperatorSshCidr` to the current
operator IPv4 /32. It creates the approved new US$7/month Micro and attached static IP;
the automatic platform release does not deploy this stack. The owner points the client/API
DuckDNS names at the `PublicIp` output. Caddy's HTTP/TLS-ALPN validation then obtains and
renews certificates without a DuckDNS token. See the
[`staging proxy report`](../../remediation/reports/P08/staging-edge.md) for verification and limits.
Updating instance user data is not a live Caddy configuration reload; deploy/reload verified
configuration on the named new proxy explicitly. Preserve the existing live Lightsail site.

For separate client/API origins, `APP_BASE_URL` keeps the API callback and optional
`CLIENT_BASE_URL` selects the post-sign-in browser destination. See the
[`sign-in origin report`](../../remediation/reports/P08/sign-in-origins.md). This optional
key is injected for staging with the combined routing, Cognito and CORS change after
HTTPS and the [runtime client startup](../../remediation/reports/P08/client-runtime-startup.md)
were verified. Client API routing uses ADR-003 runtime config. See the
[combined staging wiring report](../../remediation/reports/P08/staging-origins.md) for the
deployment checkpoint and remaining real-account/iOS verification.

Do not introduce operational parameters or environment overrides for attendance root/networks,
rehearsal, upload lifetime/size, access-token lifetime or rate limits. They use the versioned
settings registry or event lifecycle, as listed in
[`env-migration.md`](../../remediation/reports/P10/env-migration.md). Container `DB_HOST`,
`DB_NAME` and credential inputs construct the server's `DATABASE_URL` at entrypoint; they do
not add operational configuration. Keep this boundary when adding SSM injection in P08.6.
