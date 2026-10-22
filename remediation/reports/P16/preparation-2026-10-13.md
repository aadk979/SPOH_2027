# P16 preparation — 13 October 2026

> **Current launch policy — 22 October 2026 (D-25/ADR-012):** [Event-focused release plan](../../../docs/EVENT_RELEASE_PLAN.md) supersedes conflicting exhaustive API, compliance/SLA/durability, load-cohort, drill/restore and local-before-CI prerequisites below. [Current handoff](../HANDOFF-2026-10-22-EVENT-FOCUSED-RELEASE.md) defines the next work. Preserve historical results; deferred/unrun work is not passed.


P15 build acceptance is recorded at `14baa68c2e947c4cdfee376f1e33aca6c1030b5e`,
all five CI38398631231 jobs green. Closure records were pushed as
`07ccad403c846f171d5b820a4c58a3f6b8c1398d`; CI38402415957 passed its two
documentation jobs and correctly skipped the three application jobs. That
documentation run is not application acceptance. P16.10 is in progress;
no P16 step is accepted.

## Guarded source preparation

- One import-safe test database boundary is shared by migration, inventory and
  browser fixtures. Explicit skip-dotenv and spoh2027_test on local5435/CI5432
  are required; different databases, URL overrides/fragments, remote hosts,
  production and mismatched URLs refuse before effects. It creates no database.
- Inventory requires a new explicit P16 JSON output, refuses existing files,
  P04/P06 output, traversal and symbolic links/junctions, and writes exclusively.
  The obsolete P04 parser and P02 journey renderer refuse regeneration while
  retaining their source and historical outputs. No historical JSON/Markdown or
  screenshot was overwritten.
- Mounted middleware retains every composite Cedar question, filters unrelated
  mount paths and includes earlier same-prefix router passthrough authentication.
  Actual mounted input schemas come from the existing validation WeakMap and
  Zod input JSON-schema conversion. Custom/refinement semantics still need
  authored cases; an unrepresentable schema node is explicitly `any`.
- All 29 browser database inputs use the common guard. Local client/API origins
  are explicit and same-origin4012; local SQL/sign-in and mocked UI configurations
  refuse staging/production. Frozen-clock/visual setup require the sole DB and
  explicit local mode; fixture quota/conversion changes require separate opt-ins.
- Legacy load harnesses no longer load server/.env and refuse remote/staging
  targets. Their local synthetic JWTs remain historical tooling, not real P16
  authentication or load proof. Real provider workload must replace that path
  in P16.2 after the soak.

Guarded source inventory executed successfully under Node24/npm, using only the
sole test URL: **423 served routes**, 194 event-scoped and194 legacy aliases,
with no dev sign-in in Cognito composition. The final schema checkpoint has
**343 routes with schemas /470 schema locations**. Both uniquely named
`routes-source-20261013-a.json` and `routes-source-20261013-b.json` are preserved;
the second includes mounted schemas and same-prefix passthrough metadata.
They are source intent, not actual HTTP/Cognito/staging execution.

Changed-file lint and client/server/seed/test types passed actual0 during
preparation. The new safety run passed **33 dependency-free tests**, including
real subprocess refusals, unchanged historical snapshot hashes, junction
boundaries and composite/same-prefix middleware behavior. CI's always-run
dependency-free checks now include them; the private complete local runner is
updated to match. The complete new-batch gate and exact pushed-SHA acceptance
remain required before delivery.

## P16-001 — Deployment-time audit acknowledgement

The first no-image CDK review passed. Full service synthesis then failed
AwsSolutions-IAM5 for the audit log-stream ARN. Its acknowledgement handled
concrete region/account but hardcoded an unresolved partition; the CLI enables
partition literals while plain App tests leave it unresolved.

A full deployment-mode nag regression was added first: actual1, two passes and
one failure. The fix uses the actual partition when resolved and retains the
token representation otherwise. IAM actions/resources and the evidence for the
existing narrow acknowledgement are unchanged. The affected regression then
passed all three tests, actual0. Full deployment CLI synthesis subsequently
passed actual0 at `2026-10-13T14:29:35.1713633Z`, with nag enabled.
The failed review is retained separately. The source fix still needs the whole
batch local gate and exact-SHA CI; no AWS resource was deployed.

## Read-only account and cost preflight

The current operator can access the expected account665146708212. Singapore
has no active CloudFormation stack or RDS instance. The retained account budget
is a **US$50 alert**, actual spendUS$14.704/forecastUS$23.226, unchanged. D-10
remains the owner-approved **US$100 programme ceiling**; no duplicate budget
or relaxed alert was created.

Cost Explorer through end-exclusive13October records **US$14.703644 gross
positive charges**, estimated/incomplete month data. Net unblended cost is near
zero because of credits; no free-resource conclusion is drawn. Public AWS offer
files were fetched13October without credentials or the prohibited Pricing API;
the 51-price private snapshot and original P05/P08 price/history files are kept.
The approved Micro IPv4 Lightsail bundle is available atUS$7/month.

The [bounded cost estimate](staging-cost-preflight-20261013.json) uses the full
reviewed service definition: 20 alarms/22 billable inputs, 14 custom metrics,
one dashboard andfive defined secrets plus a VAPID allowance. The S3 **gateway**
endpoint is retained; no paid interface endpoint, NAT, WAF or paid detector is
included. [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) and
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) explain the
metering; the JSON records exact fetched offer URLs/versions for each rate.

An initial **seven active days**, including48 extra task-hours for bounded
cross-instance/production-like tests, plus conservative RDS automatic-restart,
full-month storage/monitoring, 2million uncached decisions/requests, 20GB logs
and contingency estimates **US$89.97 October gross including observed charges**,
with US$10.03 headroom before unmodelled charges. This is a bounded estimate,
not measured staging cost or approval to exceed D-10. Review actual cost before
extension or volume growth; park after the campaign/while waiting, never during
the actual soak. RDS automatically restarts after seven stopped days; the
estimate reserves that exposure. Real three-day isolated cost is still P16.8.

## Next, in order

Deliver the coherent preparation/fix batch with full unchanged-floor acceptance,
then recreate only the approved lean staging baseline: bootstrap, deploy access,
fresh staging stacks and accepted image. No production or retained real snapshot
restore. Generate/bind/run all granular API cases with real HTTPS/Cognito and
source/build/policy/case attestations before full browser/visual regression.
Generated route/schema intent is not a green API suite.

The user delegated the controlled synthetic inbox choice. A private authenticated
test mailbox can use [Mail.tm's account API](https://docs.mail.tm/api/accounts),
whose access is tied to that account's bearer token; its
[documented free API/terms](https://docs.mail.tm/) require attribution and forbid
reselling/proxying. This is only a proposed synthetic-testing transport at this
checkpoint: no mailbox, provider identity or invitation was created. Keep all
credentials/messages private, and never send to real people as fixture setup.

Then P16.1 →P16.8 →actual24-hour P16.9 →P16.2 →P16.3 →P16.4 →documentation
and owner readiness. P12.8,28October go/no-go, production/cutover, irreversible
real data, real-person recovery/reinvite/retirement and new paid-service choices
retain owner gates. IA/copy/assurance reviews and immutable DB report retention,
provider/backup and S3-header residuals remain open. No soak, load, restore,
receipt, production readiness or new independent assurance is claimed here.

## Complete preparation gate and subsequent evidence

The whole Node24.19.0/npm 27-step gate `ci-local-20261013T1444Z` ran from the
beginning without resume and finished **actual0** at
`2026-10-13T15:21:49.4945681Z`. Server302files/3801 passes/two retained skips,
client112/1214, shared28/348, policies158 andinfrastructure24/129 give
**5650 passed** across those five suites. The always-run tracker/delivery/safety
group separately passed61 tests. Whole install/generators/lint/types, actual
59-document static export, architecture/hardcoding, sole-DB migration, raw
unchanged floors, dependency and history secrets checks passed. Complete
coverage summaries/LCOV and actual exit/log are preserved privately. The empty
staged scan is rerun over the actual coherent batch before D-11 commit.

During the gate, the controlled synthetic Mail.tm operator inbox was created and its
account identity verified through authenticated `/me`; credentials stay private
in `.local/`. The API's JSON domain response is an array, unlike its JSON-LD
example; the first no-domain refusal created no account, and the corrected
private client created exactlyone. No real-person message, invitation or
Cognito identity was created. This does not establish actual invite receipt.

GitHub's current2026 OIDC metadata confirms immutable subjects and the exact
`repo:aadk979@138833125/SPOH_2027@1379786785` prefix used by deploy trust.
The [official OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)
documents that format. No provider/trust setting was changed. Cognito pools
and IAM OIDC providers remain absent; the retained final RDS snapshot is
available and was not restored, copied or deleted.

Private case planning reconciles423 unique served/229 canonical routes,
1524 input-field entries and194 inherited event parameters with the committed
matrix. It records **zero executed cases** and requires concrete fixtures and
expected outcomes, including custom semantic checks. It is not the passing
granular suite required by P16.10. Exact-SHA CI for this coherent preparation
batch is the remaining delivery prerequisite; P16.10 stays in progress.

## Preparation delivery and image packaging correction

The whole63-file preparation batch was delivered directly to main as
`2be731d2c799f905a90a80149cc04006048bdb84`. Its exact-SHA
[CI38421756985](https://github.com/aadk979/SPOH_2027/actions/runs/38421756985)
completed with allfive jobs green at `2026-10-13T15:41:48Z`.

A subsequent actual container build exposed missing inputs that the host build
could not detect: the client campaign config imports its independently authored
route manifest, excluded by `.dockerignore`, and all browser configs import root
verification guards absent from the build image. Runtime server verification
scripts also require those root guards. The pre-fix build failed TypeScript at
`2026-10-13T15:43:58.6907150Z`; no database connection was attempted.
The correction includes only the manifest from client tests and the two guards
in build/runtime stages. Generator-only Docker/CI configuration uses the sole
permitted `spoh2027_test` name; no other database is created or accessed.

The blocking quality job now builds the complete image and executes a runtime
check with networking disabled, no mounts and no credentials. It imports the
packaged verification scripts, checks non-root Node24 and compiled entrypoints,
exercises local/production refusal guards, and compares the complete actual HTML
bytes and parsed executable-script hashes with the packaged CSP manifest.
This is package verification, not provider, deployed ARM64 or staging API proof.
The corrected source still requires its whole local gate and exact-SHA delivery.

The corrected complete linux/amd64 image build and network-disabled runtime
check both finished **actual0** at `2026-10-13T15:54:14.1488957Z`.
All59 packaged HTML documents matched their CSP bytes/script hashes, packaged
imports and refusal guards passed, and no database connection was attempted.
The earlier failing build and corrected logs/exit records remain private.

The owner will update DuckDNS after receiving the recreated staging edge's public
IP (reconfirmed13October; consistent with D-08's2October DNS operation). Agent
DuckDNS login/token access is unnecessary. No domain was changed. The temporary
login panel was closed, and no production/live-site change is authorised.

The whole corrected Node24/npm **29-step** local gate ran from the beginning
without resume and finished **actual0** at `2026-10-13T16:32:53.8054192Z`
(`ci-local-20261013T1555Z`). The five suites again passed5650 tests with the
two existing server skips retained; the separate tracker/delivery/safety group
passed61. Coverage floors and assertions are unchanged. The additional image
build and network-disabled runtime check passed with59 verified documents;
complete coverage/LCOV, logs and actual exit are retained privately.

Read-only baseline synthesis/review also passed: seven deploy-access resources,
147 fresh staging-platform resources and three staging-edge resources, with no
app image/service requested yet. No paid interface endpoint/NAT, duplicate
budget, production stack or snapshot restore is included. AWS confirms the
configured PostgreSQL17.9/t4g.micro/gp3 and Ubuntu24.04 blueprint are available.
The sole retained budget email recipient was recovered privately for the
already-approved owner alarm destination; neither budget nor subscription was
changed. Actual creation still waits for corrected exact-SHA CI.

The operator and six role inboxes now have authenticated control proof. One
[Mail.tm rate refusal](https://docs.mail.tm/getting-started/error-handling)
was reconciled after waiting, using the exact same address/credentials.
A further foreign-event inbox intent was rate-refused and remains journalled;
no alternate identity/IP or duplicate account was used. All credentials remain
private. No Cognito account/invitation or real-person message was created.
Private planning now contains5246 concrete schema mutation intents and31
partial platform fixture/expectation bindings, with514 authored semantic
residuals and **zero executed cases**. These are not a passing granular suite.
