# P08.8 — Cache-bus degradation detection

The normal scheduler heartbeat now records a bounded `CacheBusDegraded` gauge before
its database claim work. A fully connected bus reports zero; connecting, disconnected
or unstarted buses report one. Recovery reports zero only after the existing subscriber
refreshes finish. The reporter remains at INFO when ordinary application logging is
raised and is silent under the test environment. It does not record identities,
notification payloads, credentials, database errors or per-instance metric dimensions.
There is no new interval, database query, AWS permission or transport.

Each environment's existing app log group supplies one fixed-cardinality metric in
`SPOH/<stage>`. Maximum over each minute prevents a healthy reporting peer from masking
a degraded one. The alarm requires degradation in two of three minutes, allowing
brief reconnects without hiding persistent bypass mode. Missing observations remain
insufficient data; silent/parked workers are not reported as a healthy zero. Worker
availability and owner SNS delivery remain separate P08.8 criteria.

## Verification on 4 October 2026

- All 41 infrastructure tests in eight files pass, including actual staging/prod
  CDK nag synth, environment/log binding, strict 0/1 filter, Maximum/60-second
  evaluation, missing-data treatment, output and no notification actions.
- The real two-instance Postgres suite passes six checks with one existing skip.
  Its disconnection/recovery check now also verifies healthy → degraded → healthy
  reporting against terminated/reconnected test-only listener connections. Unstarted
  connections report degraded. Existing cross-instance authority/cache refresh
  assertions still pass. The four scheduler loop checks also pass.
- The server build and server/infra types, root lint, architecture and hardcoding
  checks pass. Source secret scans find no leaks.
- AWS's read-only `test-metric-filter` accepts exactly the healthy/degraded examples
  and rejects another metric, an out-of-bound value and a missing value.
- A read-only staging diff pinned to the deployed image adds only one metric filter,
  one alarm and one output. No database, network, task, identity or API route changes
  are present. Normal local worker logs confirm healthy gauge emission.

Definition/filter checks are not a forced alarm or email delivery result; exact
deployment and healthy CloudWatch observations are recorded below.

## Deployed observation

At 01:13 SGT on 4 October, exact `458903e32cd1c3de9ad74cde922515a075dd852c` has green
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37138788666),
[Infra](https://github.com/aadk979/SPOH_2027/actions/runs/37138788629) and
[deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37139142979).
The stack is UPDATE_COMPLETE and task definition revision 102 runs that image with
one desired/running task, completed rollout and zero failed tasks. CloudWatch confirms
the exact `spoh-staging-cache-bus-degraded` alarm definition, no actions and state OK.
Four one-minute Count samples at 01:09–01:12 SGT have Maximum zero. This proves actual
log-to-metric healthy observations; it is not a forced degradation/ALARM or email test.

## Cost and remaining scope

The preserved Singapore price snapshot charges US$0.30 per custom metric-month and
US$0.10 per standard alarm metric-month: US$0.40 per continuously running environment
before free tier, credits, tax and added log bytes. The original production alarm
catalogue already includes cache-bus degradation; staging's former log-only forecast
does not. The current P08 reconciliation already reserves all 13 staging alarm metric
inputs and five custom metrics, including this one, so its published forecast totals
are not increased again for this definition. The existing five-second worker heartbeat adds a small structured log
record per poll. No verified overall budget-fit claim follows from these unit prices;
P08.10 retains its attribution and amended-model reconciliation requirements.

Free-storage/connection, compute, backup and authorization detection, notification
subscriptions, budget alerts and a dashboard remain open. A fixed free-storage
percentage was deliberately not added for the autoscaling database: the
[AWS recommendation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html)
cautions against that alarm when storage autoscaling is enabled. No production stack
or existing live Lightsail resource is changed. The inherited P08 price/amendment/draft
artifacts and historical P05 pricing remain unchanged.
