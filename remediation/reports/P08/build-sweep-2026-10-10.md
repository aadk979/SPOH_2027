# P08 code completion sweep — 10 October 2026

This is source evidence under ADR-011. AWS remains deleted; no resource was created or deployed.
The parent batch's full local CI and GitHub CI are the completion gate.

| Step   | Code evidence                                                                                                                                                                                                                                                                                                                                     | Remaining feature work                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P08.5  | Existing Caddy edge, exact origins, Chrome acceptance report and Firebase release tests. Production uses the explicit browser refresh flow rather than a third-party refresh cookie.                                                                                                                                                              | Concrete production identifiers and creation stay behind P12.8 approval.                                                                                                  |
| P08.6  | Stage SSM injection and scoped task execution roles; independent 64-character attendance secret; optional encrypted VAPID JSON secret, with tested P-256 provisioning helper. Images contain no env file.                                                                                                                                         | Operator rotation is the documented assumed recommendation under the no-NAT/no-interface-endpoint topology; automatic database rotation is not claimed.                   |
| P08.7  | Retained private buckets; signed exact-type/size image POSTs; versioned, reviewed content publication with frozen floor-plan copies, authenticated immutable assets and ETags; private final XLSX export packs and scoped task access. Event-close media retention deletes owned receipt objects, while exports expire at 90 days.                | Staging privacy, upload, publication, offline floor-plan delivery, scheduled event-close deletion and final workbook checks remain P16.8. No cloud deployment is claimed. |
| P08.8  | The twelve ADR-008 signals are defined, with the AVP detail/failure signals retained. Added free-storage and connection alarms, a read-only ECS/AWS Backup observer, SNS actions, conditional private email/event-week SMS subscription parameters, a dashboard and optional single account budget. The audit log group is retained for 400 days. | Audit shipping is not implemented by this sweep; the retained group does not prove delivery. Complete that build work with P15.7's audit protection.                      |
| P08.9  | Existing OIDC release/migrate/smoke and coverage ratchet; new manual staging park/unpark workflows and npm/Actions/Docker Dependabot.                                                                                                                                                                                                             | Keep open: the seeded browser CI workflow definition is absent. Build it before closure; browser execution is P16.1 under ADR-011. Production delivery is P15/P12.8.                                                                                       |
| P08.10 | Existing smoke runner, fixture command and cost-model reconciliation scripts.                                                                                                                                                                                                                                                                     | Staging smoke and measured three-day cost are P16.8.                                                                                                                      |
| P08.11 | Updated deployment/rotation/monitoring instructions and source architecture diagram in infra/cdk/README.md; this sweep records source evidence, verification and explicit cloud acceptance deferrals.                                                                                                                                             | Batch full local CI and GitHub CI are still required before the parent closes the phase.                                                                                  |

The observer publishes only two bounded gauges per stage. It samples actual desired/running ECS
counts, so a deliberately parked service is not reported as a task deficit, and follows every
AWS Backup result page to find the newest completed recovery point. Missing backups produce a
breaching 27-hour observation; missing telemetry and observer errors also alarm. It has no
application-data access or mutation permissions. Backup metadata listing requires IAM `*`;
metric publication requires `*` constrained to the stage namespace. SDK v3 comes from the
[Lambda Node 24 runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html).

The owner budget survived teardown. Default synth leaves it untouched. `manageAccountBudget=true`
defines a single US$100 monthly budget with actual-cost alerts at 80% and 100%, with its email
supplied as a NoEcho parameter. Reconcile/import the existing budget before enabling that context;
do not create a second account budget casually. The default event-week phone is empty: paid SMS
needs the owner's cost approval before deployment.

Deferred P16.8 acceptance: recreate staging; configure/confirm SNS email and any approved event
phone; prove test alarm delivery and recovery, every detector, dashboard and backup metadata;
run IAM Access Analyzer; provision VAPID and prove push delivery; perform and prove operator
rotation; run park/unpark and smoke; validate renewal/host routing and storage privacy; reconcile
three days of costs against D-10; prove exact-origin signed uploads, private content/export access,
frozen floor-plan history and event-relative photo deletion. Dashboards, extra alarm/custom-metric counts and observer
invocations must be included in the refreshed cost model before AWS is recreated. No load number,
notification delivery, key rotation or cost compliance is claimed by synthesis.

Verification in this sweep: Node 24 typecheck/lint passed. The affected infrastructure suite had
93/95 tests green; the two failures were old assertions that alarms had no SNS actions. Corrected
those assertions; the remaining affected file passed 8/8. The new observer/provisioning/power and
catalogue cases passed 14/14. The complete batch CI will run the suite together.

Content/close-out source evidence added in this batch: `ContentDocument` is an optimistic draft,
and each edit invalidates its review. Publication requires the current reviewed version and current
Cedar authority under the event lock. S3 image copies pin the source version and ETag; only the
committed publication is reachable through authenticated routes. The combined JSON/images budget
is 2 MB. Cloning copies only published source content into an unreviewed target-owned draft and
remaps selected station/tag references. Final exports contain the frozen report workbook and its
counting notes; visitor-value sheets and transient lost-person descriptions are excluded. Archive
requires the completed current export, closed found-item/fallback work, expired capture grace and
purge/report evidence, ends memberships and schedules staff retention in the same transaction.
Archive read-only Cedar and media/staff retention handlers are supplied by the identity/security
worker; their integration suites belong to the same parent batch gate.

The content/domain/storage and lifecycle affected unit suites passed 29/29. The configuration
suite then passed 25/25 after pinning the added storage/audit environment keys. The scoped
content/export/media/injection CDK files passed 17/17. Three existing storage assertions still
assumed no content CORS or export injection; they were corrected and the affected storage file
passed 15/15 on rerun. DB content/archive and isolation tests are written and are run serially by the
parent against `spoh2027_test`; no production or real local database was touched.
