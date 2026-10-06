# P08.8 — App task startup and essential-container failure detection

This bounded prerequisite adds an app-service failure signal to the existing
six-alarm foundation. P08.8 remains in progress. It does not establish running-task
availability or complete the task-restart catalogue.

## Definition

Each actual Fargate service has one default-bus EventBridge rule. It accepts only
`aws.ecs` / `ECS Task State Change` events from its stage's account and region,
with the actual cluster ARN, exact `service:<service name>` group, `STOPPED`
status and `EssentialContainerExited` or `TaskFailedToStart` stop code. These
fields follow the documented [ECS task-event format](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_task_events.html)
and [essential-container failure selector](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_cwet2.html).
One-off migration/seed tasks, another service/cluster and intentional deployment,
parking or operator stops do not match that rule.

The native log target uses the documented [timestamp/message input envelope](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutTargets.html).
Its message is JSON containing only a fixed metric marker, `taskFailure: 1`,
the task ARN and the bounded stop code. Container overrides/environment, IPs,
network details, image metadata and free-text failure reasons are omitted.
The `/spoh/<stage>/task-failures` log group retains events for 30 days and is
retained on stack deletion or replacement.

A native CloudFormation log resource policy grants only `CreateLogStream` and
`PutLogEvents` to the documented [EventBridge/log-delivery service principals](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html),
on that exact log group's streams. Conditions restrict the source rule ARN and
source account, using the documented [CloudWatch Logs context keys](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutResourcePolicy.html)
and [EventBridge rule context](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-conditions.html).
The rule depends on its log policy, metric filter and alarm. No Lambda/custom
resource, task-role grant, container change or Container Insights is introduced.

The filter creates the fixed-cardinality `SPOH/<stage>/TaskFailureEvents` Count
metric, without task-id dimensions or a default zero. One-minute Sum above zero
alarms after one observation. Duplicate terminal events or delivery retries can
produce multiple counts; the metric measures failure observations rather than
an exact number of task restarts. Missing data is non-breaching for this sparse
event signal and provides no service-availability evidence. No notification
actions/subscriptions are added.

## Local verification — 6 October 2026

Eight focused infrastructure checks pass, including actual staging/production
CDK nag synth, exact rule ownership/status/stop-code selection, bounded JSON
transformation, exact log policy conditions, retained log lifecycle, resource
dependencies, fixed-cardinality alarm and migration-only release exclusion.
The latest focused run passes **8 checks** in 7.76 seconds using explicit
Node 24, after replacing the deprecated `CfnResource.addDependency` call with
`addResourceDependency`. The installed CDK 2.271.0 declaration accepts the same
resource target; its deprecated implementation directly delegates to the new
method. The passing dependency assertions preserve rule-to-policy ordering,
and no dependency API warning appears in the latest focused run.
Infrastructure types, focused lint and formatting pass.

The earlier full infrastructure run passes **69 checks across 11 files** in
41.35 seconds, including all eight focused checks, the independent target ARN
assertion and both actual stage nag synths. That explicit Node 24 measurement
predates the dependency method replacement. The full suite is not repeated
locally for this equivalent call; the core agent retains the final full CI gate.

These are definition checks, not a cloud-delivery rehearsal.
No application build, shared database, browser suite, Git operation or cloud
mutation is performed by this worker. The core agent owns release/diff evidence.

The independent review added an exact staging/production target ARN assertion:
the EventBridge target names its log group without the stream wildcard `:*`,
while the existing resource-policy assertion requires that wildcard for log
stream writes. The target assertion requires the exact account/region prefix
and a reference to the stage's named failure log group. Its initial expectation
inlined the log-group name; that assertion was corrected to CDK's actual
CloudFormation reference before the final passing measurements above.

## Cost and acceptance boundaries

The preserved Singapore offer snapshot prices one standard alarm metric at
US$0.10/month and one custom metric at US$0.30/month: **US$0.40 per deployed
environment-month**, before free-tier credits/tax, plus log ingestion/storage
at the existing US$0.70/GB and US$0.03/GB-month rates. AWS documents no ingestion
charge for [AWS management events on the default bus](https://aws.amazon.com/eventbridge/pricing/).
No new custom bus, cross-account delivery, archive or paid event evaluation is
configured. The conservative P08 staging forecast already reserves 13 alarm
metric inputs and five custom metrics; this definition consumes one of each.
It does not demonstrate overall D-10 compliance or reconcile missing measured
usage, the January protection allowance, dashboard, notifications or backup costs.

On 6 October, the core agent completed the read-only staging diff pinned to the
running image. It showed exactly five added monitoring resources and one output,
with no existing task, service, network or IAM resource replacement. Its
`ap-southeast-1` CloudWatch Logs inventory found **zero existing account-scope
resource policies**. These observations are preflight evidence, not deployment
or delivery acceptance.

This native policy omits `resourceArn`
and consumes one of the [ten account-policy slots](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutResourcePolicy.html).
Before an actual deployment, policy preflight must still account for planned
creation/replacement and any intervening account-policy changes. No available
slot means deployment stays pending until an owner approves an appropriate
resolution. Do not remove or widen unrelated policies to make room.

## Exact staging acceptance — 6 October 2026

Source `1063eeca4465eeb34fea02ad989efc9a0b5b5b5d` passed
[full CI](https://github.com/aadk979/SPOH_2027/actions/runs/37405030559)
and [staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37405740146).
All 69 infrastructure checks passed in CI. Read-only preflight verified the
healthy application on task revision 135, its exact ARM64 image digest and the
deployed rule, target, bounded log policy, metric filter and sparse alarm.
Seven AWS event-pattern probes and four metric-filter probes passed, including
foreign, intentional-stop and one-off-task exclusions.

A unique, standalone fixture used the accepted image with a Node entrypoint
that exited 42. It had no task role, secrets, environment, ports, health check,
application entrypoint or database access. A temporary rule selector admitted
only that owned probe group alongside the existing exact service group. The
application service was neither stopped nor updated. An ignored durable attempt
ledger recorded mutation intent, exact ownership and the original rule/targets
before effects. EventBridge has no atomic compare-and-swap API: each bounded
change used serial read/compare/write/verify and refused unexpected state.

The actual `EssentialContainerExited` task event produced exactly one bounded
log message and one failure Count datapoint. The alarm changed from OK to ALARM
at **16:51:50 Singapore**, then recovered to OK at **16:57:50**. A final window
recheck excluded a coincident foreign application failure before acceptance.
Cleanup restored the exact original rule and targets, deregistered the owned
fixture definition, and verified the original application task, image and
desired/running count were unchanged. Original/final rule hashes match.
The [sanitized evidence](staging-task-failure-monitoring-evidence-2026-10-06.json)
records the source, digest, observations and cleanup checks.

This verifies the actual failure delivery path and alarm recovery. No notification
actions exist; owner email delivery remains unverified. P08.8 remains open.

Scheduler-initiated unhealthy replacements, service placement/deployment failures,
and service running tasks below desired remain separate required detectors.
The two known failure codes are not represented as the entire restart scope.
Production creation/cutover, scaling dates and live Lightsail approvals remain
unchanged; production is still review-only pending the 28 October go decision.
