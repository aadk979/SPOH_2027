# Production activation — owner approved 23 October 2026

The owner approved activation now, reusing `https://secure-channel.duckdns.org` and `https://api.secure-channel.duckdns.org`, with a separate production database and retained Cognito pool. The production ceiling is **USD125 per month**. The previously protected USD75.26332 reserve is available for production; park staging only after successful cutover. This supersedes the older 28 October wait for this operation. The event-focused E1–E5 checks, data integrity and authentication/MFA safeguards remain.

The initial Root is **aadk979@gmail.com**, as organisation `PLATFORM_ADMIN`, joined to each event as `ADMIN`. Cognito sends the requested temporary account invitation; the owner sets their permanent password and enrolls their own authenticator through normal hosted sign-in. Do not print passwords, reset an existing identity blindly, enroll MFA for the owner, or send unrelated messages.

| Event               | Dates in Asia/Singapore     | Initial lifecycle |
| ------------------- | --------------------------- | ----------------- |
| SPOH 2027 DRY RUN 1 | 18 November 2026            | DRAFT             |
| SPOH 2027 DRY RUN 2 | 18 December 2026            | DRAFT             |
| SPOH 2027 D DAY 1-7 | 1–7 January 2027, one event | DRAFT             |

Create only these three events through the ordinary event factory/API, with stable slugs and idempotency keys. Leave venue blank until supplied. Do not copy synthetic staging fixtures into production. DRAFT lets the owner configure the event and crew; it does not enable unrestricted capture or bypass readiness/lifecycle checks.

## Release and cutover

Require full successful CI for the exact production candidate, including isolated PostgreSQL tests and unchanged quality/security guards. Review the complete production CDK template before creation. Bootstrap the production resources and migration task without serving traffic; run migrations only against its new empty database. Obtain the new session-signing secret's explicit VersionId before enabling the app service. Production retains its pool, uses database deletion protection and seven-day automated backups, and grants media/content uploads only from the exact approved HTTPS client origin.

The current edge remains on staging until production's native health, runtime identity and public configuration are verified. Preserve the actual Caddy configuration, upstream and resource metadata. Validate the replacement Caddy configuration before reloading it; switch both public hosts together, then verify HTTPS/public configuration, static client, normal sign-in and any already-created event details. Keep the previous Caddy configuration for rollback. Do not roll back production by restoring the staging database or deleting real production captures.

Bootstrap only the exact verified owner Cognito subject using the audited first-administrator path. The owner must complete normal password change and MFA before an authenticated Root session is used for event creation. Preserve actual failures/partials and reconcile uncertain provider/mail results before retrying.

After successful cutover, use the existing staging park procedure: drain its app service to zero, then stop its database and verify the stopped state. Preserve staging data and all test evidence. RDS automatically restarts a stopped instance after seven days; this is parking, not permanent retirement or a hard spending cap. Review its state when testing resumes; no recurring automation is created by this activation.

## Current execution status

Production origins and regressions are being prepared. No production runtime/account/event/mail success is claimed by this document. Actual source, CI, cloud, invitation, cutover and park receipts live under `.local/p16-production-*`; record their real outcomes before reporting completion. Background push remains optional and unconfigured unless separately enabled and its receipt is checked; the existing in-app channel and operator fallback note remain applicable.
