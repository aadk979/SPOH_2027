# Data protection and retention map

Source inventory, 12 October 2026. Scheduler/source tests are verification work;
this document is not a claim that retention ran on restored real data or AWS.

| Data | Access, location and retention boundary |
| --- | --- |
| Person profile and membership contact/notes | PostgreSQL, current organisation/event authority. Private subject export is no-store and excludes peer contacts/free text. Explicit erasure requires suspension in all events and another authorized administrator. Profile is anonymized; operational IDs and subject attribution remain. |
| Attendance, assignments, swaps, briefing slots | Subject export projects owned scalar IDs/state/times. Assigned briefier slots exist; individual briefing audience attendance is not invented. Archived membership notes/lastSeen and mutable incident/follow-up/holder/swap text expire at the event's staff-retention deadline. Active other-event participation protects the shared global profile. |
| Refresh sessions/provider envelopes/handoffs | PostgreSQL; no credential values in export/logs. Person-first issuance/current standing. Families have fixed bounded absolute expiry, at most 30 days and stricter administrator limits. Terminal history is retained 30 days after expiry/revocation. Invalidation clears every envelope/handoff, including terminal history, while preserving original revocation metadata. |
| Account/invitation journals | PostgreSQL; minimal state/time IDs enter export. Provider subjects/profile/email digests remain private. Explicit erasure removes target-owned bound and unbound plannedPersonId journals, invitation rows before account rows. Actor-only attribution for other people's operations remains. Ambiguous delivery is not auto-refunded or resent. |
| Notices, delivery rows, push subscriptions | Current recipient/source/standing checks. Private export omits device endpoint/keys and source body/context. Erasure clears target notices/preferences/deliveries/subscriptions; foreign recipient rows remain. |
| Lost-person/visitor descriptions | Event privacy settings and exact scheduler deadlines. Lost-person description retention may be shortened within the approved 1–24-hour limit. Visitor personal fields use explicit event allowlists/read roles/retention; aggregate counts remain independent. |
| Original media and normalized derivatives | Private S3 keys, successful event issuance/rehearsal proof, bounded ETag/version-pinned bytes and full still-raster decode. Immutable validated receipt serves normalized bytes. Event-relative media deadline clears references and original/derivative keys; deterministic derivative keys cover SQL-rollback orphans. S3 failure retains retryable SQL state. |
| Published guide images/content | Versioned S3 and immutable PostgreSQL publication/manifest. Current approved content access, hash/version-pinned images and linked branding CSS. Durable storage intent precedes external writes. Hourly cleanup handles at most six unreferenced exact keys, protects publication/body/manifest/upload references and deletes exact S3 versions. It needs no ListBucket. |
| Frozen reports and printable/archive exports | Private exports expire in S3 after 90 days. Immutable ReportSnapshot JSON can retain incident free text containing staff PII; it has **no implemented database purge deadline** and is not rewritten by person erasure. S3 expiry does not erase the database report. No owner approval for indefinite snapshot retention is asserted. |
| Audit and scheduled artifacts | PostgreSQL audit is append-only for the app; restricted SECURITY DEFINER cleanup enforces at least 400-day row age and event archive age. Null-event global rows are excluded from event feeds. Historical audit/schedule/publication payloads are not blindly rewritten by profile erasure. CloudWatch audit retention is 400 days; effective shipping/privileges are separate P16 evidence. |
| Quota state and retry receipts | UNLOGGED PostgreSQL counters use hashed scope/subject and bounded expiry cleanup; no credentials or raw subjects. Idempotency request digests bind intent; private endpoints keep minimal receipts. Retention follows registered settings. |
| Cognito identities | Separate retained/deletion-protected production pool at approved creation. Local anonymization does not delete provider records. Default sender, no SES; recovery/reinvite needs the owner's real-person approval. The old pool was deleted and passwords cannot be restored. |
| Backups and private teardown copies | RDS/AWS Backup/logical dump retention is distinct from live-row erasure. The owner-retained staging snapshot and `.local` teardown copies may contain credentials/PII. They are never published; no immediate backup erasure or restored-data approval follows from application source. |

The immutable-artifact/provider/backup retention cases remain explicit owner and
P16 operating-policy work. No universal-erasure or blanket ASVS L2 conformance
claim is made. Deployed privilege, HTTPS, synthetic delivery, purge/storage,
restore and owner walkthrough evidence must be recorded in P16 in its approved
order before any production readiness decision.
