# P08.8 / P10.6 — Scheduler metric filters and alarms

P08.8 remains in progress. This slice defines the lag/dead-action gauges and alarms; it does
not claim SNS delivery, owner email verification, availability alarms or the broader twelve-alarm
catalogue. P10.6's engine metric-to-alarm criterion is verified below.

Each environment's existing `/spoh/<stage>/app` log group has two metric filters. They require
the `metric: scheduler` marker and a nonnegative numeric field. Values go to `SPOH/<stage>` as
`SchedulerLagSeconds` (Seconds) and `SchedulerDeadActions` (Count). There are no dimensions,
worker/event IDs, per-request metrics or default-zero observations. These fixed-cardinality
gauges require no new task IAM permissions or log groups.

Alarms use **Maximum** over one-minute periods, preserving the worst observation across
workers instead of adding repeated queue gauges. Lag over 60 seconds for two consecutive
minutes alarms; any dead action alarms after one minute. Missing data is ignored, preserving
the previous state rather than inventing a healthy zero. This is not a worker heartbeat:
availability/poll-failure monitoring still needs its P08.8 slice. SNS actions and subscription
delivery are also pending; these detection alarms alone do not page anyone.

Verification before deployment:

- **29 infrastructure tests**, including both real service templates, fixed namespaces/cardinality,
  gauge aggregation, cutoff/evaluation periods and absence of default-zero filling; CDK nag,
  infra typecheck, root lint/architecture, formatting and `git diff --check` passed.
- AWS `logs test-metric-filter` accepted positive/zero lag and dead counts, and rejected unrelated
  marker, missing field, negative and nonnumeric observations for both actual filter patterns.
- Read-only staging logs show the real worker emitting both numeric gauges at five-second
  intervals. Its current zero/zero observations are not represented as an alarm-trigger test.
- The read-only staging CDK diff, with both image contexts pinned to deployed `e9aaac8`, adds
  only two metric filters, two alarms and their two name outputs. It changes no task, origin,
  identity, network or database resource. Production is synthesised for review and not deployed.

The existing Singapore price snapshot prices each custom metric at US$0.30/month and each
standard alarm at US$0.10/month: two of each cost **up to US$0.80 per continuously active
environment-month**, before free tier, tax and credits. Production's twelve-alarm/five-metric
model already includes scheduler monitoring; staging adds these two gauges/alarms to its
previous log-only estimate. Actual billing and the amended overall edge budget remain P08.10;
this is a bounded model, not a measured bill. AWS documents hourly metric proration and
[current pricing](https://aws.amazon.com/cloudwatch/pricing/). Its
[metric-filter guidance](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html)
describes numeric extraction and dimension cardinality.

## Deployed metric/alarm verification (2026-10-02)

CI, infra checks and staging deployment succeeded for `1e702e7`:
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37026332526),
[infra](https://github.com/aadk979/SPOH_2027/actions/runs/37026332583),
[staging](https://github.com/aadk979/SPOH_2027/actions/runs/37026877789).
CloudFormation is UPDATE_COMPLETE and its service image output matches that commit.

The real worker's five-second observations arrive in both CloudWatch metrics with the correct
namespace, units and Maximum statistic. Both detection alarms initially were OK.
After checking both alarms had no ALARM/OK/insufficient-data actions, a labelled synthetic
log stream `remediation-scheduler-verification-20261002T153835Z` supplied lag 90 seconds and
dead count 1. The first two historical samples reached the metrics without triggering an
alarm; seven current-time observations at thirty-second intervals then verified evaluation.
No `SetAlarmState` call, queued action or database row was used or changed by the probe.

| Alarm                         | Entered ALARM (UTC) | Recovered to OK (UTC) |
| ----------------------------- | ------------------- | --------------------- |
| `spoh-staging-scheduler-dead` | 2026-10-02 15:42:35 | 2026-10-02 15:46:35   |
| `spoh-staging-scheduler-lag`  | 2026-10-02 15:43:31 | 2026-10-02 15:46:31   |

Normal worker zero gauges drove recovery after the finite probe stopped. The labelled probe
observations stay in the existing retained application log group as verification evidence;
they are not represented as real queue failures. Production and existing live Lightsail are
unchanged. No alarm test or notification has been sent to the owner. Read the owner email
only at notification deployment and never commit it. P08.8 still requires owner delivery and
the remaining observability criteria; P10.6's deployed metric/alarm criterion passes.
