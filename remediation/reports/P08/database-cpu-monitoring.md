# P08.8 — Native RDS CPU detection

Each platform stack defines an `AWS/RDS` CPU alarm scoped to its actual database instance
identifier. Average CPU over 90% in five consecutive one-minute periods alarms. This follows
AWS's [RDS CPU recommendation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html).
Missing observations produce insufficient data rather than establishing healthy CPU on a
parked database. There are no alarm actions, new custom metrics, task permissions or database
parameter changes. Owner delivery and the rest of P08.8 remain open.

Verification on 3 October 2026:

- **37 infrastructure tests in seven files** pass, including actual staging/prod synth with
  CDK nag, exact database dimensions/statistic/period/threshold, missing-data behavior, output
  references and absence of notification actions. Infra types, root lint/architecture,
  changed formatting and diff checks pass. An initial test-only possibly-undefined dictionary
  lookup was corrected before the passing typecheck; runtime assertions already passed.
- A read-only staging diff pinned to actual deployed `6877a0e` adds only one alarm and one
  output. No database, network, task, identity or API route change is present. The database
  is available, `db.t4g.micro`, 20 GiB with autoscaling maximum 100 GiB.
- Read-only native CPU queries observed 24 one-minute Percent observations between 02:55
  and 03:18 SGT, with averages from 3.57% to 6.70%. This verifies the native series; it is
  not a forced ALARM trigger, notification test or proof of deployment of this new definition.

The P05 Singapore snapshot prices one standard alarm metric at **US$0.10 per environment-month**,
before free tier, credits and tax. Production's original twelve-alarm model already included RDS
CPU; staging's old log-only model did not. No overall budget-fit claim is made: P08.10 still
needs actual-cost and amended-model reconciliation, including the separately approved US$7 edge.

Free storage and connections are later slices. AWS's cited guidance cautions against a fixed
free-space percentage alarm when storage autoscaling is enabled, as it is here. A suitable
ceiling/headroom signal and verified connection limit are required before those definitions.
Production creation/deployment and live Lightsail approvals remain unchanged.

## Deployed verification at the owner-requested handoff

At 03:46–03:48 SGT on 3 October, the staging stack is UPDATE_COMPLETE with actual image
`02bff990adf854908dbf980b8113b04dab9b1fee`; exact-hash
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37053731304),
[Infra](https://github.com/aadk979/SPOH_2027/actions/runs/37053730974) and
[deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37054265503) succeeded.
Read-only resource/CloudWatch checks confirm `spoh-staging-rds-cpu` is CREATE_COMPLETE/OK
and targets the actual RDS instance, with Average, 60-second periods, 5/5 evaluation,
GreaterThanThreshold 90, missing-data treatment `missing` and no alarm actions.
This supersedes the earlier definition-only deployment limitation; no trigger or delivery
test is claimed. See the [current handoff](../HANDOFF-2026-10-03.md).
