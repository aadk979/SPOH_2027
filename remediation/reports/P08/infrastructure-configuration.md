# P08.6 infrastructure configuration injection

The CDK app now creates 14 standard non-secret `String` parameters per stage under
`/spoh/<stage>/infra/<ENV_NAME>`: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `DB_HOST`, `DB_NAME`,
`AUTH_PROVIDER`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
`COGNITO_DOMAIN`, `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `AWS_REGION`.
These are the existing container values, with no removed operational tunables reintroduced.
The server schema remains the audited 24 infrastructure/secret keys.

ECS injects parameters through task-definition `Secrets` references. Despite that ECS property
name, the new parameters contain only non-secret infrastructure; DB and session credentials
continue to reference Secrets Manager. No plaintext credentials or environment files are added.
The app execution role reads exactly its 14 parameter ARNs; migration reads exactly the two DB
configuration ARNs. App/migration task roles acquire no SSM read/write permissions. Standard
tier is explicit; production parameters are retained, and disposable staging configuration is
deleted with its stack. No production stack is created by the existing staging workflow.

ECS resolves the injected values at task startup; existing tasks do not reload changed parameters.
Keep values code-owned and deploy a new task through the release workflow after a configuration
change. This infrastructure path is separate from operational settings, which already update
through their audited database and cache bus. The existing API origin, CORS origin, Cognito
references and proxy count are preserved; the approved DuckDNS edge remains P08.5 work.

The [AWS ECS injection documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html)
describes startup resolution and execution-role access. AWS's
[parameter tier documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html)
lists standard storage without an additional charge. This slice adds no paid compute or network
resource and does not enable advanced tier or increased parameter throughput.

The former `AwsSolutions-ECS2` acknowledgement is removed because both task definitions now have
no inline environment entries. The existing ECR token wildcard acknowledgement remains; SSM
reads are scoped to named parameter ARNs. Tests synthesize real app/migration definitions for both
stages, including nag checks, rather than only testing the no-release foundation stack.

P08.6 remains open for the remaining attendance/push secrets, rotation and Access Analyzer checks.
Production creation, existing live Lightsail changes and later deployment approvals retain their
owner boundaries. Deployment verification will be recorded after the authorised staging release.

Local verification on 2026-10-02: infrastructure **19 tests** and configuration example/schema
**6 tests** passed, as did infra typecheck, root lint, architecture and hardcoding checks.
Release-context synthesis includes both actual task definitions and passes the nag pack without
the removed ECS2 acknowledgement. The initial assertions were corrected to inspect CloudFormation
resource references rather than assume they had already resolved into literal endpoint/secret ARNs.

The read-only staging `cdk diff --no-change-set` was inspected: 14 added SSM parameters,
two new task-definition versions and their scoped execution-role read policies. No database,
Cognito, network, production or existing Lightsail resource changes are present. Image-tag
differences reflect the release context while the authorised staging pipeline advances. A
read-only SSM inventory before this slice found only the CDK bootstrap version parameter.

Staging release verification on 2026-10-02: [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37004867493)
and [Deploy staging](https://github.com/aadk979/SPOH_2027/actions/runs/37005407334) both passed
for `56146bd`. Read-only AWS inventory confirms all 14 named parameters are Standard/String.
The subsequent running task revision 60 uses the same 14 SSM ARN references plus the existing
two Secrets Manager references, with **zero inline environment entries**. ECS reports one
desired/running task and zero pending tasks while the next authorised release rolls out.
No parameter values or secret contents were read or exported for this verification.

The subsequent [staging task policy review](staging-task-policy-review.md) on
5 October verifies current injected-reference counts and zero inline entries,
validates the three current role identity policies with no returned findings,
and records unreported rotation metadata. The regional analyzer inventory is
empty, so external-access verification and the broader P08.6 criteria remain open.
