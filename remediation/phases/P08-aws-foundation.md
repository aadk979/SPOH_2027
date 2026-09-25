# P08 — AWS foundation and delivery pipeline

| Field             | Value                  |
| ----------------- | ---------------------- |
| Gate              | G3                     |
| Depends on        | P05                    |
| Decisions         | D-07, D-08, D-10, D-11 |
| Changes behaviour | Infra only             |
| Size              | L                      |

## Purpose

Define the AWS environments as code, and have every merge deploy to a real staging stack. From P09
onward, each phase is proven on staging, not just locally. Production is created from the same
code in P15.

## Context for a fresh session

- Design: ADR-008 (topology, cost) and `standards/target-architecture.md` §9.
- Existing resources that **must survive**: Cognito pool `ap-southeast-1_9bwl2nGF7` (every
  `Volunteer.cognitoSub` points into it) and the backups bucket. Reference or import them; never
  let CDK own their deletion. `RemovalPolicy.RETAIN` everywhere data lives.
- Deploys run from GitHub Actions via OIDC. The container's static keys are used only for the
  one-time bootstrap, with the owner's approval.
- The existing `infra/` (Lightsail scripts, runbooks) stays until the cutover in P15.8.

## Steps

### P08.1 — CDK app skeleton

- **Do:**
  1. Create `infra/cdk/` (TypeScript, pinned `aws-cdk-lib`), with stages `staging` and `prod`
     driven by one typed config file.
  2. Apply tags: `app`, `env`, `owner`, `cost-centre`.
  3. Add `cdk-nag` (AwsSolutions pack) to synth.
  4. Add npm scripts `infra:synth` and `infra:diff`.
- **Done when:** `cdk synth` passes locally with no unexplained nag suppressions.

### P08.2 — Bootstrap and OIDC

- **Do:**
  1. `cdk bootstrap` for the account and region.
  2. A GitHub OIDC provider plus a deploy role scoped to this repo and its branches/environments.
  3. Document it in `infra/cdk/README.md`.
- **Done when:** a GitHub Actions job can run `cdk diff` using the role, with no static keys.

### P08.3 — Network and database

- **Do:**
  1. A VPC with 2 AZs. Public subnets for the ALB, private-isolated subnets for RDS.
  2. The NAT decision per ADR-008 (VPC endpoints for ECR, Secrets Manager, SSM, Logs, S3 and AVP).
  3. RDS Postgres 17: staging `db.t4g.micro`, single-AZ. A parameter group with `rds.force_ssl=1`,
     PITR 7 days, an AWS Backup plan, KMS, and a deletion-protected, retained snapshot on delete.
  4. Database roles: a migration role that owns the schema, and an app role that can insert and
     read `AuditLog` but not update or delete it, and cannot change its retention (F04-015).
- **Done when:** staging RDS is reachable only from app tasks.

### P08.4 — Containers and compute

- **Do:**
  1. Multi-stage Dockerfiles for the API and web (Next `output: 'standalone'`, verifying PF-13),
     non-root, with health checks.
  2. ECR repos with scan on push.
  3. ECS Fargate services behind an ALB (`/api/*` → api, `/` → web): health checks on
     `/healthz`/`/readyz`, autoscaling on CPU and request count, circuit-breaker rollback.
  4. Migrations run as a one-off ECS task before each service update.
- **Done when:** staging serves the app over HTTPS.

### P08.5 — DNS, TLS and edge (needs D-08)

- **Do:**
  1. A Route 53 hosted zone (or delegated subdomain) and an ACM certificate.
  2. CloudFront in front of the ALB with WAF (AWS managed rule groups and rate-based rules).
  3. Security headers on responses.
  4. Update the Cognito app client callback/logout URLs for staging.
- **Done when:** `https://staging.<domain>` works end to end, including Cognito sign-in.

### P08.6 — Secrets and configuration

- **Do:**
  1. Secrets Manager: DB credentials (rotation on), session and attendance signing secrets, VAPID keys.
  2. SSM Parameter Store for non-secret infra config.
  3. Task roles grant exactly the access each service needs. **No IAM user keys** (fixes PF-12 for
     the new stack).
  4. The server loads config from injected secrets and env. There are no `.env` files in images.
- **Done when:** a task definition has no plaintext secrets, and IAM Access Analyzer shows no
  unintended access.

### P08.7 — Storage

- **Do:**
  1. S3 buckets `media`, `content` and `exports`: Block Public Access, SSE-KMS, versioning on
     content, lifecycle rules, CORS limited to the app origin for presigned uploads, TLS-only
     bucket policy.
  2. Import (reference) the backups bucket.
- **Done when:** a presigned upload from staging works, and direct public access fails.

### P08.8 — Observability

- **Do:**
  1. CloudWatch log groups `app` and `audit`, with retention set.
  2. Structured JSON logs with request ids.
  3. Alarms: ALB 5xx, target p95 latency, ECS task restarts, RDS CPU/connections/storage, backup
     age, scheduler lag (placeholder until P10), AVP errors (placeholder until P11).
  4. An SNS topic with email subscriptions from config.
  5. A CloudWatch dashboard.
- **Done when:** a test alarm reaches the owner's email.

### P08.9 — CI/CD

- **Do:** GitHub Actions:
  1. The existing checks.
  2. Build images, push to ECR, run migrations, and deploy **staging** on merge to `main`.
  3. **prod** only by manual approval (GitHub environment protection).
  4. Rollback = redeploy the previous image tag. Documented and rehearsed once (F04-020).
  5. e2e runs in CI against a seeded database (PF-17), and the coverage gate from ADR-007 is
     enforced (PF-18).
  6. Dependabot for npm, GitHub Actions and Docker base images, with the upgrade pins documented
     (F04-022).
- **Done when:** a merge to `main` reaches staging without manual steps.

### P08.10 — Staging live and smoke

- **Do:**
  1. Adapt `infra/scripts/smoke-test.sh` to take a base URL and run it in the pipeline after
     deploy.
  2. Seed staging with a dev fixture event.
  3. Produce a cost report: Cost Explorer after 3 days, against the ADR-008 forecast, which is
     priced from the public Price List offer files.
- **Done when:** smoke is green in the pipeline, and cost is within D-10.

### P08.11 — Report

- **Do:** Write the phase report, `infra/cdk/README.md` (how to deploy, roll back and add a
  resource), and an architecture diagram.
- **Done when:** the exit criteria hold.

## Exit criteria

- Staging is fully defined in CDK, deployed by CI through OIDC, and fronted by WAF.
- Secrets are in Secrets Manager, alarms are wired, the smoke test is green, and cost is within budget.

## Risks

- **Touching the Cognito pool through CDK could replace it.** Mitigation: reference by id only
  (`UserPool.fromUserPoolId`) until P12 decides whether to import it properly, and run
  `cdk diff` review on every change to identity.
- **NAT gateway cost.** Mitigation: VPC endpoints (ADR-008).

## Phase report

_Fill in on completion._
