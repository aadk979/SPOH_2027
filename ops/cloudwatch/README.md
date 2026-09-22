# Shipping the audit trail off the box

The server writes every audit row to Postgres and, when a log group is
configured, to CloudWatch Logs as well. Both live on the same instance today,
so the second copy is the only one that survives losing it.

## One-time setup

The instance has no IAM role at all right now, which is the blocker — attach a
profile carrying `iam-policy.json` before setting the environment variables, or
the server will start, log one delivery failure per batch, and keep every row in
Postgres only.

```sh
REGION=ap-southeast-1
ACCOUNT=665146708212
INSTANCE=i-0bb1cda065e637f0a

aws iam create-role --role-name spoh2027-app \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam put-role-policy --role-name spoh2027-app \
  --policy-name cloudwatch-logs \
  --policy-document file://ops/cloudwatch/iam-policy.json

aws iam create-instance-profile --instance-profile-name spoh2027-app
aws iam add-role-to-instance-profile \
  --instance-profile-name spoh2027-app --role-name spoh2027-app

# Takes a few seconds to propagate before the association will succeed.
aws ec2 associate-iam-instance-profile --region "$REGION" \
  --instance-id "$INSTANCE" \
  --iam-instance-profile Name=spoh2027-app
```

Then in the deployed `server/.env`:

```
CLOUDWATCH_AUDIT_LOG_GROUP=/spoh2027/audit
CLOUDWATCH_RETENTION_DAYS=365
```

and restart. The server creates the group and the retention policy itself on
the first delivery; there is nothing to provision by hand.

`/admin/audit` shows the delivery state in a banner — group, region, events
delivered, and the last error if one is outstanding. That is the check that it
worked, and it is also how somebody notices weeks later that it stopped.

## What gets shipped

Audit rows only, unless `CLOUDWATCH_SHIP_APP_LOGS=true` also sends the pino
request log. The default is off on purpose: at peak the capture endpoints
produce more request lines in an hour than the audit trail does rows in a day,
and ingestion is billed by the byte. Turn it on for a debugging window, not for
the event.

Delivery is buffered, batched every two seconds, bounded to 10,000 queued
events, and backs off to a minute on repeated failure. It never throws into a
request path, so a CloudWatch outage degrades the trail to database-only rather
than failing captures.

## Alarms worth having

The log group is only half of it — nothing reads it yet. A metric filter on
`{ $.severity = "CRITICAL" }` with an SNS topic is the cheapest useful alarm,
and `auth.untrustedOrigin` and `session.reuseDetected` are the two actions that
should wake somebody up.
