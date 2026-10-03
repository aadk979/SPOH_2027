# Reconciled cost forecast — P08.10 (still open)

AWS public offer snapshot fetched 2026-10-02T19:26:52.987Z. USD before tax/credits; planned usage, **not a measured bill**. Historical P05 prices/cost.md and the handoff draft cost.md remain intact.

## Current hosting assumptions and sensitivity

| Month                                    | D-10 ceiling | Conditional parking plan | Continuous staging compute |
| ---------------------------------------- | -----------: | -----------------------: | -------------------------: |
| Oct 2026 (build)                         |          100 |                    46.80 |                      73.03 |
| Nov 2026 (training, Dry Run #1, cutover) |          100 |                    87.34 |                  112.26 ⚠️ |
| Dec 2026 (fixes)                         |          100 |                    66.76 |                      96.49 |
| Jan 2027 (Dry Run #2 + event)            |          130 |                   105.66 |                  141.95 ⚠️ |
| Off-season month (Feb–Sep)               |          100 |                    52.34 |                      93.29 |

These are known-cost subtotals. Parking/deletion and approved scaling dates have not been implemented or approved merely by modelling them. Continuous staging matches its current running inventory. Requests, log volume, production dates, event-scale dates and the old Lightsail decommission date still inherit P05 assumptions. No production stack or scaling action was performed.

Production static files move to Firebase, so their 10% AWS ingress allowance and SES invites are removed. The Cloud Map **private** DNS namespace costs $0.50 per retained environment; this is existing service-discovery infrastructure, not a new public Route 53 domain. Staging Cloud Map registry, alarms, secrets and the $7 edge stay charged while compute is parked. The off-season deleted-database scenario reserves 20 GB of snapshot storage instead of the old 2 GB. Log storage has a one-month ingestion allowance. All 13 planned staging alarm metric inputs and five custom metrics remain in the conservative forecast; currently deployed five alarms use six inputs and two custom metrics ($1.20/month versus planned $2.80).

The $7 staging edge is assumed reusable for production after the go decision and routing review, as proposed in the approved edge pricing. A separate production edge would add another $7/month. [Cloud Map pricing](https://aws.amazon.com/cloud-map/pricing/) lists DNS namespace charges. [RDS stop rules](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html) retain storage charges and automatically restart after seven days; the parking forecast needs real controls and measured restart/stop overhead.

## Conditional parking plan, itemised

| Item                                                                         | Oct 2026 (build) | Nov 2026 (training, Dry Run #1, cutover) | Dec 2026 (fixes) | Jan 2027 (Dry Run #2 + event) | Off-season month (Feb–Sep) |
| ---------------------------------------------------------------------------- | ---------------: | ---------------------------------------: | ---------------: | ----------------------------: | -------------------------: |
| ECR images                                                                   |             0.30 |                                     0.30 |             0.30 |                          0.30 |                       0.30 |
| Lightsail box (until decommissioned)                                         |            11.99 |                                     6.58 |             0.00 |                          0.00 |                       0.00 |
| prod: API Gateway HTTP API + Cloud Map                                       |             0.10 |                                     4.60 |             0.78 |                         18.10 |                       0.78 |
| prod: RDS PostgreSQL (t4g.micro; t4g.small single-AZ in event window)        |             2.07 |                                    22.01 |            21.36 |                         25.73 |                      20.76 |
| prod: archive snapshot                                                       |             0.19 |                                     0.19 |             0.19 |                          0.19 |                       0.19 |
| prod: Cognito Essentials (free under 10,000 MAU)                             |             0.00 |                                     0.00 |             0.00 |                          0.00 |                       0.00 |
| prod: Verified Permissions (IsAuthorized after cache)                        |             0.00 |                                     2.00 |             0.30 |                          8.00 |                       0.30 |
| prod: Secrets Manager                                                        |             0.08 |                                     0.80 |             0.80 |                          0.80 |                       0.80 |
| prod: CloudWatch (logs, alarms, metrics)                                     |             0.34 |                                     3.50 |             3.15 |                          4.20 |                       3.01 |
| prod: S3 (media, content, exports)                                           |             0.13 |                                     0.13 |             0.13 |                          0.13 |                       0.13 |
| staging: Fargate API (only while in use)                                     |             7.83 |                                     7.83 |             5.93 |                          2.37 |                       0.00 |
| staging: RDS t4g.micro (stopped when idle; storage always)                   |             9.36 |                                     9.36 |             7.76 |                          4.76 |                       1.90 |
| staging: Secrets Manager                                                     |             0.80 |                                     0.80 |             0.80 |                          0.80 |                       0.80 |
| staging: CloudWatch logs                                                     |             0.70 |                                     0.70 |             0.70 |                          0.35 |                       0.00 |
| staging: CloudWatch alarm metrics and custom metrics (retained while parked) |             2.80 |                                     2.80 |             2.80 |                          2.80 |                       2.80 |
| staging: ingress                                                             |             0.84 |                                     0.84 |             0.84 |                          0.84 |                       0.10 |
| staging: approved HTTPS proxy (retained while parked)                        |             7.00 |                                     7.00 |             7.00 |                          7.00 |                       7.00 |
| prod: Fargate ARM API (Firebase serves client)                               |             1.25 |                                    16.85 |            12.89 |                         28.22 |                      12.47 |
| prod: Cloud Map private DNS namespace (no public domain)                     |             0.50 |                                     0.50 |             0.50 |                          0.50 |                       0.50 |
| staging: Cloud Map private DNS namespace (retained)                          |             0.50 |                                     0.50 |             0.50 |                          0.50 |                       0.50 |
| prod: CloudWatch log storage (one month allowance)                           |             0.00 |                                     0.03 |             0.01 |                          0.06 |                       0.01 |
| staging: CloudWatch log storage (one month allowance)                        |             0.03 |                                     0.03 |             0.03 |                          0.01 |                       0.00 |

## Unmeasured allowances and January protection

Firebase is outside AWS and its project/plan/transfer usage is not available. Its [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing) provide 10 GB storage and 360 MB/day transfer at no cost; Spark can suspend serving when its transfer limit is exceeded. A zero-dollar Firebase assumption therefore does not prove event readiness or a complete combined hosting budget. Price overage against measured bytes before deployment.

The subtotal excludes unmeasured incremental 35-day backup storage beyond the RDS allowance, S3 requests/versioned data, API/Secrets request overages, DNS queries, deployment overlap/migrate task hours, excess public data transfer, proxy excess beyond 2 TB, SMS, and any paid dashboard beyond free quotas. ECR 3 GB and RDS 20 GB are assumptions, not autoscaling caps (staging can grow to 100 GB). Retained off-season logs, audit logs and annual archive growth need separate measured allowances. It does not deduct AWS credits or free-tier benefits from forecast rates.

D-10/Q-P9 allows about $130 for January only, including the accepted protection recommendation. The original three January option allowances total $29.47 ($7 Plus, $9.19 Multi-AZ and $13.28 WAF). The conditional January subtotal plus those historical allowances is $135.13, exceeding $130 before the unmeasured items. HTTP API itself does not support WAF, so the actual edge topology and cost need review. The draft warning at $106.89 against $100 was not the complete D-10 rule. No protection or budget policy was changed to force a fit.

## Observed billing and usage

Observed 2026-10-03T06:56:16.669Z; query is **Entire AWS account in ap-southeast-1; untagged and NOT isolated staging billing**. UTC dates, end exclusive 2026-10-03.

| Date       | Estimated |  Unblended USD | RDS micro hours | Fargate vCPU hours | HTTP requests | Cloud Map calls |
| ---------- | --------- | -------------: | --------------: | -----------------: | ------------: | --------------: |
| 2026-09-29 | false     | -2.41000000e-8 |       16.841111 |        7.957828195 |            57 |              52 |
| 2026-09-30 | false     | -3.51000000e-8 |              24 |      12.0850147225 |            57 |              52 |
| 2026-10-01 | true      |  4.68000000e-8 |              24 |      12.3165951401 |           198 |             177 |
| 2026-10-02 | true      |  3.12000000e-8 |              15 |       8.2054370841 |           144 |             126 |

These quantities are not three complete isolated staging days: tags app/env/cost-centre are inactive, the region also contains the old Lightsail deployment and other services, and the October days are estimated/incomplete. Near-zero UnblendedCost is not evidence that running resources are free. No billing, tag activation/backfill or account controls were changed.

Measured quantities remain in usage-2026-10-03.json with service, usage type and unit. Do not sum UsageQuantity across different units or substitute account-region totals for staging usage. Rerun the model with isolated, complete staging quantities when available; P08.10 remains open.

## Verification and next evidence

Pricing CLI regression checks preserve historical totals 36.46 / 77.38 / 56.39 / 96.99 / 40.19 and the five handoff-draft totals 46.27 / 87.28 / 66.29 / 106.89 / 50.09. Strict amendments reject unknown/negative/fractional metric inputs before writing. Imports never write the signed-off report. P08.10 stays in progress until isolated measured cost, complete hosting/protection allowances, pipeline smoke and D-10 criteria pass.
