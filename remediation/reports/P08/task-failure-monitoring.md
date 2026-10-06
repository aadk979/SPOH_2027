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

The core agent must retain full application CI, verify the exact deployed
rule/target/policy/filter/alarm and exercise legitimate bounded event delivery
without interrupting the accepted app. AWS event-pattern/filter probes should
prove both matching failures and rejection of foreign/intentional/one-off events.
The real EventBridge-to-log-to-metric path, ALARM transition and owner email
delivery remain unverified; no detector or notification claim follows from synth.

Scheduler-initiated unhealthy replacements, service placement/deployment failures,
and service running tasks below desired remain separate required detectors.
The two known failure codes are not represented as the entire restart scope.
Production creation/cutover, scaling dates and live Lightsail approvals remain
unchanged; production is still review-only pending the 28 October go decision.
