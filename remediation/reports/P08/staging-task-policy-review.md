# Staging task policy and secret metadata review — partial P08.6

A read-only inventory on 5 October 2026 binds the two current staging task
definitions to four exact CloudFormation-owned IAM roles. Application revision
120 and migration revision 118 have zero inline environment entries. They use
19 and six injected references respectively. Parameter and secret values are
not retrieved. The service image at this observation is the previously verified
28ec1577fe01c3562b9fb00bc8d742426dcc2da5; the subsequent history API pipeline is
still separate verification.

All four role trust documents allow the ECS task service only. Three identity
policy documents across the application task/execution and migration execution
roles are submitted to IAM Access Analyzer policy validation. All return zero
findings. The migration task role has no inline or attached identity policy to
validate. Policy enumeration and validation pagination are checked completely.

The regional analyzer inventory is empty. Policy validation establishes syntax
and the service's returned best-practice findings; it does not establish absence
of unintended external or resource access. No analyzer, policy, archive rule or
resource is created or changed by this review.

Four distinct Secrets Manager references are inspected through metadata only.
None reports rotationEnabled, owningService or rotationRules. The sanitised
evidence records those fields as null, preserving the distinction between
unreported metadata and a verified rotation configuration. No GetSecretValue,
parameter value retrieval or credential test is performed. Secret names, ARNs,
contents and full policy documents are omitted from the published evidence.

The [sanitised inventory](staging-task-policy-review-evidence-2026-10-05.json)
records the bounded task/reference counts, role policy findings, trust checks,
rotation metadata and explicit limitations. This is observational evidence,
not a deployment or a new infrastructure change. Remaining attendance/push
secret wiring, database credential rotation and external-access verification
keep P08.6 open. Production and existing live Lightsail approvals retain their
owner boundaries; no budget-compliance claim is made.
