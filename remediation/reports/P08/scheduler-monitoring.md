# P08.8 / P10.6 — Scheduler metric filters and alarms

P08.8 remains in progress. This slice defines the lag/dead-action gauges and alarms; it does
not claim SNS delivery, owner email verification, availability alarms or the broader twelve-alarm
catalogue. P10.6 remains open until deployed metric/alarm verification is recorded.

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

No alarm test or notification has been sent to the owner in this slice. Read the owner email
only at notification deployment and never commit it. Verify real metric arrival, alarm state
changes and owner delivery before closing P08.8/P10.6 as applicable.
