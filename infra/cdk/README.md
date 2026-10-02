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
- The production domain is a placeholder (`spoh.example.invalid`) until the owner names it (D-08).

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
P08.6 now defines 14 standard `String` parameters under `/spoh/<stage>/infra/<ENV_NAME>` and
injects them at task startup. The app execution role can read only its 14 parameters; the
migration execution role reads only `DB_HOST` and `DB_NAME`. Application task roles do not gain
SSM access. Credentials remain in Secrets Manager, and no environment file is included in an image.

The parameter values preserve the existing API Gateway origin, Cognito settings and one-proxy
configuration. P08.5 will change routing when its DuckDNS edge is verified. Infrastructure
values are code-owned and released through CDK/CI: ECS does not reload changed parameters into
running containers, so changing a parameter requires a new task deployment. Operational live
settings retain their database/cache-bus path. See the
[`P08.6 verification report`](../../remediation/reports/P08/infrastructure-configuration.md).
Secret completion, rotation and Access Analyzer verification remain open.

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

Do not introduce operational parameters or environment overrides for attendance root/networks,
rehearsal, upload lifetime/size, access-token lifetime or rate limits. They use the versioned
settings registry or event lifecycle, as listed in
[`env-migration.md`](../../remediation/reports/P10/env-migration.md). Container `DB_HOST`,
`DB_NAME` and credential inputs construct the server's `DATABASE_URL` at entrypoint; they do
not add operational configuration. Keep this boundary when adding SSM injection in P08.6.
