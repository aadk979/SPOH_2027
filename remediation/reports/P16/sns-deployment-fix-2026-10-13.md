# P16 staging deployment: SNS policy correction

## Accepted source and actual deployment failure

The image-packaging correction was delivered as
`469f9385a4128ddbd03d2aebb3a7bc4b37d621a5` after the complete29-step
Node24/npm local gate returned0. Exact
[CI38431577333](https://github.com/aadk979/SPOH_2027/actions/runs/38431577333)
finished with allfive jobs green at `2026-10-13T16:50:38Z`, including the
complete image build and network-disabled runtime/CSP check. Accepted run/job
evidence, complete coverage/LCOV and all previous evidence are kept privately.

Under D-13, ADR-011§7, D-08 and the bounded D-10 preflight, staging recreation
began. An initial bootstrap CLI tag-argument refusal created no resources;
its failed record was preserved and repeated `--tags` options corrected it.
`CDKToolkit` completed at `16:56:28.696Z`, and `Spoh-DeployAccess` completed
at `16:57:52.489Z`, on13OctoberUTC. The existing stronger owner budget was
preserved. No production or retained snapshot restoration was requested.

At `16:59:08.511Z`, creation of `Spoh-staging-Platform` failed because SNS
rejected the topic policy with **Policy statement action out of service scope**.
Its insecure-transport denial used `sns:*`, which is an IAM action wildcard
outside SNS's accepted topic-policy action list. The stack rolled back.
Bootstrap/deploy access remain provisioned; no edge/public IP, application
service, migration, Cognito fixture or granular API result exists at this
checkpoint. RDS instance enumeration is empty. The failed stack retained a
backup vault, audit log group and access-log bucket; their state must be
reconciled before retry. The separately retained final RDS snapshot is untouched.

## Defects and correction

**P16-002 — SNS action admission:** replace the rejected wildcard with every
action in AWS's
[supported SNS topic-policy action list](https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-language-api-permissions-reference.html).
The denial keeps `aws:SecureTransport=false`, the same topic and all principals.
It adds no grant or security waiver.

**P16-003 — alarm publisher namespace:** inspection also found the CloudWatch
publisher condition used `alarm/spoh-…`, while
[CloudWatch alarm ARNs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html)
use `alarm:spoh-…`. Explicit CDK `COLON_RESOURCE_NAME` formatting corrects the
namespace. The grant keeps CloudWatch as its sole principal, Publish as its
sole action, the same topic, exact account and stage alarm-name prefix.

Four new tests cover both stages, supported insecure-transport actions,
the exact topic and the actual restricted publisher ARN. With the real CLI
partition-literal flag, they produced **four failures/four retained passes**
before the fix at `17:08:17.5199098Z`. After the correction, all eight affected
tests passed at `17:08:42.2420813Z`. Initial token-form test output is also
retained; no assertion, coverage floor or nag check was lowered.
The whole corrected local gate, direct-main delivery, exact-SHA CI and actual
AWS policy acceptance remain required before retrying deployment.

## Controlled fixture preparation and retained gates

The nine Mail.tm operator/role/foreign-scope inboxes now have exact authenticated
control proof. Rate-refused intents were preserved and reconciled after waiting
using the same address and credentials. No alternate identity/IP was used;
all credentials remain private. No Cognito account or invitation was created.
No real-person message or recovered identity was involved.

Node24/npm and sole local `spoh2027_test` use continue. P16.10 remains in
progress with zero executed granular cases. Owner DNS operation, production,
real-data/recovery/reinvite, new-cost choices, independent assurance, IA/copy
review, readiness and28October go/no-go gates remain open.

## Complete correction gate and failed-resource reconciliation

The complete Node24/npm **29-step** local gate ran from the beginning without
resume and finished **actual0** at `2026-10-13T17:49:08.4973976Z`
(`ci-local-20261013T1712Z`). Server3801/two existing skips, client1214,
shared348, policies158 and infrastructure133 give **5654 passed**, with61
separate tracker/delivery/safety passes. Assertions, raw coverage floors and
nag checks are unchanged. The full image/runtime/CSP checks again passed.
Complete logs, actual exit and coverage/LCOV are preserved privately.

Corrected baseline CLI synthesis passed at `17:42:11.7911830Z`; no image or
service was requested by it. Read-only reconciliation verified zero versions,
delete markers, multipart uploads, audit streams and recovery points in the
three fresh failed-stack retained resources. Live resource app/env/owner/cost
tags and exact CloudFormation ownership were checked; CDK's explicit-stack-tag
mode leaves the stack tag list empty while correctly tagging its resources.
Failure events/resource metadata were archived privately before cleanup.
Only the failed stack and these verified-empty owned resources were cleared.
At `17:45:24.398Z`, their absence and stack DELETE_COMPLETE were verified;
the separately retained final snapshot's availability/creation time were
unchanged. No real data was deleted. Bootstrap and deploy access remain intact.
Corrected exact-SHA CI and actual AWS policy acceptance are still prerequisites
for the recreated platform/edge and the granular suite.
