# P08.8 — Native HTTP API alarms

P08.8 remains in progress. This slice defines two detection alarms for each platform stage.
Notification delivery, service availability and the remaining alarm catalogue are still open.
Only staging is released; production deployment retains its owner/go decision boundary.

The native `AWS/ApiGateway` metrics use the actual HTTP API's `ApiId`, without route/stage
dimensions or paid detailed route metrics. The five-minute error expression is
`IF(requests > 0, 100 * errors / requests, 0)`, using Sum for both `5xx` and `Count`.
More than 1% errors in one five-minute period alarms. The latency alarm uses native `Latency`
p95 milliseconds: more than 300 ms in two of three one-minute periods. It evaluates low-sample
percentiles rather than retaining an old state. Missing data is non-breaching for both alarms.
These request-driven metrics do not prove that a silent/unreachable service is healthy.

No unit constraint is added to native metrics: the observed Count unit is `None`, so asking
CloudWatch for `Count` would select a different series. There are no metric filters, custom
metrics, task permissions or alarm actions in this slice. Names are exported from the stack.

Verification on 3 October 2026:

- **34 infrastructure tests in six files** pass, including real staging/prod synth with CDK nag,
  actual API dimensions, error expression/statistics, latency threshold/evaluation, output
  references and absence of detailed metrics or notification actions. Infra types, root lint,
  architecture, changed formatting and `git diff --check` pass. Two initial output assertions
  expected literal names; they were corrected to resolve the actual CloudFormation references.
- A read-only staging diff pinned to deployed image `53c67aa` adds only the two alarms and
  their two outputs. No API route, task, origin, identity, database or network resource changes.
- Native staging metric reads at 01:33 SGT observed Count Sum/SampleCount 6 and p95 latency
  46.823 ms. At 01:57 SGT, `GetMetricData` evaluated the exact error expression over six real
  request periods: each Count 6, errors 0 and rate 0, all Complete. These are healthy traffic
  observations, **not an ALARM transition test**. No synthetic native metric, forced failure
  or `SetAlarmState` was used. Deployed alarm verification follows CI release.
- The preceding daily snapshot checkpoint `94e6c5a` is actually deployed: CloudFormation
  UPDATE_COMPLETE and matching `ServiceImageTag`, successful
  [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37041644790) and
  [staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37042215820).

AWS documents the [HTTP API metrics and dimensions](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html).
Its [metric math rules](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/using-metric-math.html)
treat missing arithmetic operands as zero and drop division-by-zero points; the denominator
condition makes a no-request period zero when a point is present. No `FILL` manufactures healthy
worker observations. Availability monitoring remains separate pending work.

The Singapore P05 snapshot prices standard alarm metrics at US$0.10/month. AWS
[bills each input metric in a math alarm](https://aws.amazon.com/cloudwatch/pricing/): two inputs
for rate plus one latency metric are **US$0.30 per continuously active environment-month**,
before free tier, tax and credits. Native basic HTTP API metrics incur no new custom-metric
charge. Production's old twelve-alarm count needs one extra billable metric for this rate
expression (US$0.10/month); staging's old log-only model gains US$0.30/month. This is a bounded
estimate using the existing price snapshot, not a measured bill or a claim that the overall
US$100 budget fits after the approved US$7 staging edge and other monitoring additions.
P08.10 must reconcile actual costs and the amended model.

## Deployed definition verification (2026-10-03)

At 02:11 SGT, `f0f647f` is actually deployed: CloudFormation UPDATE_COMPLETE and matching
`ServiceImageTag`, with successful [CI](https://github.com/aadk979/SPOH_2027/actions/runs/37044009013),
[infra checks](https://github.com/aadk979/SPOH_2027/actions/runs/37044008982) and
[staging release](https://github.com/aadk979/SPOH_2027/actions/runs/37044593281).

Read-only `DescribeAlarms` verifies the deployed rate's exact math expression, both native
Sum inputs and five-minute period; latency's native p95, one-minute period and low-sample
evaluation; both alarms' actual `ApiId=wdgdtbz846`, thresholds, evaluation periods,
non-breaching missing-data policy and absence of all three action types. Stack outputs match
their alarm names. Both are OK after their initial evaluation **because request data was
missing and treated as non-breaching**. Healthy request observations above validate the
expression's query, not an ALARM trigger or an availability test. No failure/notification
probe was added. P08.8 remains open for owner delivery and the remaining catalogue.
