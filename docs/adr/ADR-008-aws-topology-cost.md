# ADR-008 — AWS topology, environments and cost

| Field     | Value                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Accepted (G1, 2026-09-26; written in P05.9)                                                                                                                                                                                                                                                                                        |
| Decisions | D-10 = US$100/month (owner). Environments = staging + production, and the ceiling covers both (**assumed**). D-07 = Fargate + RDS, reshaped to fit D-10 (**assumed**: the owner set the ceiling, not the shape). D-08 = a domain in Route 53 (**assumed**). Items marked **assumed** were accepted by the owner's delegation at G1 |
| Resolves  | F04-019, F04-018 (infrastructure half), F04-017 (alerting), F04-010 and PF-12 (task roles), F04-011 (store), F04-015 (database roles and log groups), F04-020, F04-012 (DuckDNS retired), F04-008 (health routes), PF-13, F01-028, F01-030, F01-031                                                                                |
| Evidence  | [`remediation/reports/P05/pricing/`](../../remediation/reports/P05/pricing/): `fetch-prices.mjs` (51 prices from the public AWS Price List offer files, no credentials, D-13), `prices.json` (each price's offer file, version and publication date, fetched 2026-09-25/26), `cost-model.mjs` → `cost.md`                          |
| Builds in | P08.1–P08.11, P15.6, P15.8, P16.3, P16.4                                                                                                                                                                                                                                                                                           |

## Context

Today everything runs on one Lightsail 2 GB box: API, client, Postgres, backups, deploys built on
the box. Its own documentation says it cannot serve the event (F04-019). Nothing pages a human
(F04-017). Off-site backups are unproven (F04-018). The app uses a long-lived IAM key (F04-010).
Secrets are a plaintext file (F04-011).

The draft target (target-architecture §9, D-07 option A) put CloudFront, WAF and an ALB in front of
two Fargate services, with RDS and VPC interface endpoints, in each environment. **Priced from the
AWS Price List, it costs US$400–450 a month** (`cost.md`, row "plan"). Six interface endpoints in two
AZs are about US$114 per environment on their own. The owner's ceiling is **US$100 a month**
(D-10), for staging and production together (assumed). The design has to start from that number.

Prices used below (ap-southeast-1, USD; the source file for each is in `prices.json`):

| Item                                                         | Price                                                                                              | Offer file (version)                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Fargate ARM vCPU / GB                                        | $0.04045 per vCPU-h / $0.00442 per GB-h                                                            | AmazonECS (20260911124425)                 |
| Public IPv4 address                                          | $0.005 per hour                                                                                    | AmazonVPC (20260917190528)                 |
| Interface VPC endpoint                                       | $0.013 per hour per AZ                                                                             | AmazonVPC (20260917190528)                 |
| NAT gateway                                                  | $0.059 per hour + $0.059 per GB                                                                    | AmazonEC2 (20260924165117)                 |
| Application Load Balancer                                    | $0.0252 per hour + $0.008 per LCU-h                                                                | AWSELB (20260911124544)                    |
| API Gateway HTTP API                                         | $1.25 per million requests                                                                         | AmazonApiGateway (20260921231404)          |
| Cloud Map                                                    | $0.10 per resource-month, $1.00 per million discovery calls                                        | AWSCloudMap (20260911124531)               |
| RDS PostgreSQL db.t4g.micro / small, single-AZ               | $0.025 / $0.051 per hour                                                                           | AmazonRDS (20260924211011)                 |
| RDS db.t4g.small Multi-AZ                                    | $0.102 per hour                                                                                    | AmazonRDS (20260924211011)                 |
| RDS gp3 storage                                              | $0.138 per GB-month (Multi-AZ $0.276)                                                              | AmazonRDS (20260924211011)                 |
| Cognito Essentials / Plus                                    | $0.015 / $0.02 per MAU; 10,000 MAU free tier (Lite and Essentials)                                 | AmazonCognito (20260911124417)             |
| Verified Permissions                                         | $5 per million single; $150 per million batch                                                      | AmazonVerifiedPermissions (20260911124513) |
| WAF                                                          | $5 per web ACL, $1 per rule per month, $0.60 per million requests                                  | awswaf (20260914163921)                    |
| CloudFront flat-rate                                         | Free (1 M requests), Pro $15 (10 M), Business $200; throttled beyond, no overage                   | CloudFrontPlans (20260911124622)           |
| Secrets Manager                                              | $0.40 per secret per month                                                                         | AWSSecretsManager (20260911124610)         |
| CloudWatch                                                   | $0.70 per GB of logs ingested, $0.03 per GB-month stored, $0.10 per alarm, $0.30 per custom metric | AmazonCloudWatch (20260922021715)          |
| Lightsail 2 GB / 4 GB instance; 1 GB database; load balancer | $0.01612 / $0.03225 per hour; $0.02016 per hour; $0.0242 per hour                                  | AmazonLightsail (20260915151951)           |

## Decision

### 1. Topology (per environment)

```
Route 53 (zone for <domain>)  ─ ACM certificate
        │
API Gateway HTTP API  (custom domain; stage throttling; access logs)
        │  VPC link
Cloud Map service  ─▶  ECS Fargate (ARM64) service "app":
                         one image = the API + the client as a static export (same origin)
                         public subnets, public IPv4 for egress only; inbound only from the VPC link SG
                         task role: AVP IsAuthorized, Cognito admin calls, SES send, S3 media/content, logs
        │  5432 (TLS), from the app SG only
RDS PostgreSQL 17 (db.t4g.micro, gp3 20 GB, autoscaling to 100 GB), isolated subnets
        · PITR 7 days · AWS Backup daily, 35 days · archive snapshot per event (ADR-003 §8)
        · deletion protection · rds.force_ssl=1 · AWS-managed KMS key
S3 (gateway endpoint, free): media · content · exports; the existing backups bucket imported
Secrets Manager (2 secrets) · SSM Parameter Store (standard, free) · CloudWatch Logs (app 30 d, audit 400 d)
Cognito: production = the existing pool, imported (ADR-006); staging = its own pool
Verified Permissions: one policy store per environment (ADR-005)
SES: domain identity with DKIM (ADR-006)
CloudWatch alarms ─▶ SNS ─▶ email (and SMS to the on-call phone during event weeks)
GitHub Actions ─ OIDC ─▶ ECR ─▶ migrate task ─▶ ECS deploy (staging on push to main; production after approval)
```

The choices that make it fit, each with what it costs to reverse:

| Choice                                                                                                | Instead of                                                           | Saves (per month)                                                                                                                                                                                            | Accepted trade-off                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Gateway HTTP API + Cloud Map** as the ingress                                                   | an ALB                                                               | about $28 a month fixed per ALB (with its two public IPv4s). The HTTP API costs about $1 off-season and $20 in January, including a Cloud Map discovery call per request, which is a conservative assumption | 30 s integration timeout (long exports run as scheduled jobs, ADR-004); 10 MB payload (uploads go to S3 presigned); no WAF on HTTP APIs (§4)                                    |
| **One service**: the API serves the client as a Next.js static export                                 | a second Fargate service running `next start`                        | about $13 a month                                                                                                                                                                                            | needs a spike (§2): the `/e/[event]` segment under static export                                                                                                                |
| **Public subnets with task public IPs; no NAT; no interface endpoints**                               | private subnets + NAT ($44/month) or 6 endpoints × 2 AZ ($114/month) | $44–114                                                                                                                                                                                                      | tasks have public IPs; security groups allow **no** inbound except from the VPC link, and egress only 443 and 5432 to RDS                                                       |
| **RDS single-AZ db.t4g.micro**, resized to db.t4g.small single-AZ for event and dry-run days          | Multi-AZ                                                             | $9 for the event month, $18–37 for a month kept Multi-AZ                                                                                                                                                     | an instance failure means minutes to an hour of downtime (RTO in §5). The client outbox queues captures meanwhile (ADR-007 §5). Multi-AZ for event week is a priced option (§6) |
| **Staging parked when idle** (ECS count 0, RDS stopped; off-season RDS deleted with a final snapshot) | staging always on                                                    | $15–20                                                                                                                                                                                                       | staging takes about 10 minutes to unpark (`park`/`unpark` workflows, P08.9)                                                                                                     |
| **Cognito Essentials**                                                                                | Plus (threat protection)                                             | $7 in event months                                                                                                                                                                                           | no compromised-credential or adaptive checks; admins still need MFA (ADR-006 §3). Plus is a priced option (§6)                                                                  |

### 2. The client as a static export (a spike first)

Every client page is a client component, and there is no middleware or route handler (checked in
P05). So `output: 'export'` produces static files that the API container serves from
`/` with long-lived caching for hashed assets. The dynamic `/e/[event]/…` segment is exported once,
with a placeholder param, and the server maps every `/e/<slug>/…` to it. Client code reads the slug
through one helper that parses the pathname, never `useParams()`. **P08.4 spikes this first.**
If it fails, the fallback is a second Fargate service running Next standalone (PF-13). That adds
about $13 a month and **breaks the January budget**, so the owner is told at once. Serving static
files from the same server also lets it set a hash-based CSP without `'unsafe-inline'` (F04-007,
P15.3).

### 3. Environments

|              | staging                                                                                         | production                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | every merge to `main` deploys here; e2e, load tests (sized like production for the test), demos | the event                                                                                                                                                        |
| Data         | synthetic fixture events; **never** real people (own Cognito pool)                              | real (Event #1 migrated, D-12)                                                                                                                                   |
| Size         | 1 task 0.5 vCPU/1 GB; RDS micro                                                                 | 1 task 0.25 vCPU/0.5 GB; **event and dry-run days (and the day before): 2 tasks of 1 vCPU/2 GB and RDS small**, set by scheduled scaling that the owner approves |
| Availability | parked when idle; off-season deleted to a snapshot                                              | always on                                                                                                                                                        |
| Deploy       | automatic on push to `main`                                                                     | after manual approval (GitHub environment)                                                                                                                       |

There is no ephemeral dev stack (D-10, **assumed**). Development runs locally as today.

The production stack is created **at the 28 Oct go decision**, not in P15 (ADR-009). Training on
4 Nov then runs on production in `REHEARSAL` (ADR-004 §2), with the real pool, and staging never
holds real people.

### 4. Edge protection without WAF

HTTP APIs do not support WAF, so the design protects itself in three other places:

- **API Gateway stage throttling:** a default rate and burst per stage, with tighter route-level
  limits on `/api/v1/auth/*`. Throttled requests never reach the app. A flood mostly costs 429s
  and a bounded number of requests, not compute.
- **The app's limiter** (ADR-003 §4): keyed per person, and per IP on sign-in failures.
- **An AWS Budget** with alerts at 80 % and 100 % of US$100 to the owner, so a cost spike is seen
  in hours, not at the end of the month.

WAF (or CloudFront Pro, whose plan documentation includes WAF) is a priced option for production
(§6). The threat model's top risks are availability and operability (F04 § P04.1), which the items
above address. No finding requires WAF.

### 5. Reliability targets (for P16.3 and P16.4)

| Measure                                    | Target                            | How                                                                                     |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------- |
| RPO                                        | ≤ 5 minutes                       | RDS point-in-time recovery                                                              |
| RTO, database instance failure (single-AZ) | ≤ 60 minutes                      | RDS replaces the instance; or restore to a new instance and repoint. Rehearsed in P16.4 |
| RTO, task failure                          | ≤ 2 minutes                       | ECS replaces the task; during event days two tasks run                                  |
| RTO, bad deploy                            | ≤ 10 minutes                      | redeploy the previous image tag (P08.9)                                                 |
| Captures during an outage                  | none lost                         | the outbox queues captures; the late-sync window covers the close (ADR-004, ADR-007)    |
| Alerting                                   | a human is paged within 5 minutes | alarms (below) → SNS email, and SMS to the on-call phone during event weeks             |

**Alarms (12):**

- HTTP API 5xx rate;
- HTTP API p95 latency;
- running tasks below desired;
- task restarts;
- RDS CPU, free storage and connections;
- backup age over 26 h;
- scheduler lag and dead actions (ADR-004);
- authorization degraded (ADR-005);
- cache bus degraded (ADR-003).

The last four are custom metrics.

### 6. Cost

From `cost.md` (US$ per month, generated by `cost-model.mjs`; every usage figure is an assumption
stated there):

| Topology                                              | Oct 2026 (build) | Nov 2026 (training, Dry Run #1, cutover) |  Dec 2026 | **Jan 2027 (event)** | Off-season |
| ----------------------------------------------------- | ---------------: | ---------------------------------------: | --------: | -------------------: | ---------: |
| **Recommended** (this ADR)                            |            36.46 |                                    77.38 |     56.39 |            **96.99** |      40.19 |
| Same, with one shared ALB instead of the HTTP API     |            67.66 |                                102.59 ⚠️ |     86.85 |            108.39 ⚠️ |      70.45 |
| Lightsail (D-07 C)                                    |            45.30 |                                    91.67 |     85.09 |                96.18 |      82.38 |
| As first drafted (D-07 A, always-on, per environment) |        237.63 ⚠️ |                                410.20 ⚠️ | 413.95 ⚠️ |            422.70 ⚠️ |  401.38 ⚠️ |

The recommended topology fits every month. **January has only about US$3 of headroom.** Its
largest items are compute on the event days ($28), RDS ($26), the HTTP API with Cloud Map ($20,
counted conservatively), staging ($9) and AVP ($8). October and November include today's
Lightsail box until it is decommissioned.

**Options the owner can buy.** None fits inside the January ceiling:

| Option                                    | Jan 2027 |
| ----------------------------------------- | -------: |
| Cognito Plus (threat protection, ADR-006) |    +7.00 |
| RDS Multi-AZ during the event window      |    +9.19 |
| WAF on the edge                           |   +13.28 |
| CloudFront Pro flat-rate plan             |   +15.00 |
| D-06 B (no AVP calls at run time)         |    −8.00 |

**Q-P9 for the owner:** keep January at US$100 and accept single-AZ, no WAF and no threat
protection? Or allow about US$130 for January only, to add Plus, Multi-AZ and WAF for event week?
**Recommendation:** allow it for January only. Those three protect exactly the week that matters,
and each is switched off afterwards.

Not priced: the domain registration (Route 53 Domains has its own price list), data transfer out
(under the 100 GB/month global free tier at this scale), and tax.

### 7. Delivery

- **CDK** (TypeScript) in `infra/cdk`, with one stage per environment and typed config.
  `cdk-nag` runs at synth. Resources that hold data use `RemovalPolicy.RETAIN`. The Cognito pool
  and the backups bucket are imported, never recreated.
- **GitHub Actions with OIDC** (no static keys). It builds one ARM64 image (API plus static client)
  and pushes it to ECR with scan on push. It runs migrations as a one-off ECS task, then updates
  the service: minimum healthy 100 %, maximum 200 %, circuit-breaker rollback. Staging deploys on
  push to `main`; production deploys after approval. **Rollback** redeploys the previous tag.
- **Park and unpark** workflows for staging. **Scale-up and scale-down** workflows for event days
  (scheduled, approved by the owner).
- **Database roles:** a migration role owns the schema, and the app role can only insert and read
  `AuditLog` (F04-015). The audit log group's retention is set by CDK, and the app role cannot
  change it.

## Options considered

| Topic        | Chosen                                           | Rejected, and why                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute      | ECS Fargate ARM, one service                     | App Runner: needs a VPC connector for RDS, and then a NAT ($44) to reach AWS APIs. EC2 with Docker Compose: cheapest, but hand-operated, which is what F04-019/F04-020 are about. Lightsail (D-07 C): about $40 more off-season, and no task roles |
| Ingress      | HTTP API + Cloud Map                             | ALB: $28 fixed per month even when idle. CloudFront Free: 1 M requests, throttled beyond (the event month needs about 9 M). CloudFront Pro: $15, with 10 M requests throttled beyond, too close to the estimate for event day                      |
| Egress       | public task IPs                                  | NAT gateway: $44/month. Interface endpoints: $114/month for six in two AZs                                                                                                                                                                         |
| Database     | RDS PostgreSQL single-AZ, resized for event days | Aurora Serverless v2: $0.20 per ACU-h, more than a micro instance at any steady load. Multi-AZ all year: $18–37/month more                                                                                                                         |
| Environments | staging + production, staging parked             | three environments: no budget                                                                                                                                                                                                                      |

## Consequences

- Every month fits US$100 on the stated assumptions, with no margin in January. P08.10 replaces
  the assumptions with Cost Explorer data after three days of staging, and the Budget alarms watch
  it.
- A single-AZ database is the event's main infrastructure risk. The outbox, PITR and a rehearsed
  restore reduce it. Multi-AZ for event week is Q-P9.
- The static export is load-bearing for the budget, so the spike comes first in P08.4.
- Operating burden is low: no servers, no NAT, no patching of hosts. Two scheduled operations
  (park and unpark; scale for event days) replace always-on capacity.

## How it is tested

- `cdk synth` with `cdk-nag`. Every suppression carries a written reason (for example, "public
  subnet by design, inbound only from the VPC link").
- Staging smoke in the pipeline (P08.10), including a presigned upload and a refused direct
  public read.
- A test alarm reaches the owner (P08.8).
- Park, then unpark, and the smoke test passes.
- A load test at event size (P16.2): p95 under 300 ms at twice the peak.
- Resilience drills (P16.3), and a timed restore (P16.4) against §5's targets.
- Cost: Cost Explorer after three days (P08.10), and monthly against `cost.md`.

## Migration

1. **P08:** build staging from CDK (spike the static export first), then the pipeline, alarms and
   budget. Lightsail keeps serving.
2. **28 Oct go decision (ADR-009):** create production from the same code, import the existing
   pool and add a new app client, restore Lightsail data into RDS, and run the P09 migrations with
   the totals check.
3. **Training (4 Nov), Dry Run #1 (18 Nov):** on production in `REHEARSAL`, then `LIVE`. Cutover
   of the domain happens before Dry Run #1.
4. **Lightsail:** read-only after cutover, then decommissioned with a final snapshot when the owner
   approves. The model assumes 17 November.
