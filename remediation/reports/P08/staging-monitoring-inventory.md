# Staging monitoring inventory — partial P08.8

Read-only inventory on 5 October 2026 selects only resources owned by
Spoh-staging-Platform. All six deployed alarms report OK at observation time.
Each has actions enabled but zero alarm, OK or insufficient-data actions.
No test metric, alarm transition or notification is requested, and no
notification endpoint or log contents are retrieved.

| Deployed alarm         | Observation                           |
| ---------------------- | ------------------------------------- |
| HTTP API 5xx rate      | OK; three-query metric expression     |
| HTTP API p95 latency   | OK; AWS/ApiGateway Latency            |
| Database CPU           | OK; AWS/RDS CPUUtilization            |
| Scheduler lag          | OK; SPOH/staging SchedulerLagSeconds  |
| Scheduler dead actions | OK; SPOH/staging SchedulerDeadActions |
| Cache bus degradation  | OK; SPOH/staging CacheBusDegraded     |

Running tasks below desired, task restarts, database free storage/connections,
backup age and authorization degradation are not represented by these six
stack-owned alarms. Authorization degradation retains its P11 dependency. The
complete twelve-alarm catalogue, notification wiring and owner email delivery
test remain open. No stack-owned CloudWatch dashboard is present.

The three exact stack-owned log groups are API access, application and VPC
flow logs. Each reports STANDARD class and 30-day retention. Their observed
storedBytes metadata is 326,173, 6,104,639 and 20,126,755 bytes respectively.
This is neither ingestion volume nor monthly usage or billed cost. A separate
audit group is not present in this stack-owned inventory; no audit shipping
verification is claimed.

The [sanitised evidence](staging-monitoring-inventory-evidence-2026-10-05.json)
records thresholds, missing-data treatment, evaluation periods and state
timestamps without physical resource names, dimensions, log bodies or
notification endpoints. OK can reflect the configured missing-data treatment
and is not proof that a detector or notification path has been exercised.
The inventory excludes unrelated account resources and does not establish
budget compliance. No alarm, metric, action, subscription, dashboard, log group
or infrastructure resource is changed. P08.8 remains open.
