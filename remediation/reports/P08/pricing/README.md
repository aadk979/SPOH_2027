# Pricing reconciliation — 3 October 2026

P08.10 remains in progress. [reconciled-cost.md](reconciled-cost.md) is the current
reviewable forecast, with conditional parking and continuous-staging sensitivity,
the January exception and limits of the observed billing data. It is not a final bill
or a verified budget fit. The January conditional subtotal is $105.66; adding the
historical approved protection allowances gives $135.13 before unmeasured costs.
Continuous staging raises the November/January known subtotals above their ceilings.
Production deployment and scaling-date approvals remain intact.

The inherited [cost.md](cost.md) is the **preserved draft**, including its superseded
$100 January warning and old Route 53/SES/static-client assumptions. Its bytes and the
fresh prices/amendments are unchanged from the handoff. The two P05 CLI extensions
were completed with an import guard and stricter own-key validation. The original
P05 price snapshot and signed-off report are unchanged.

## Reproduce

Run from the repository root with Node 24:

```powershell
node remediation/reports/P08/pricing/reconcile-cost.mjs --prices remediation/reports/P08/pricing/prices.json --amendments remediation/reports/P08/pricing/amendments.json
node --test remediation/reports/P08/pricing/cost-model.test.mjs
```

The reconciler requires explicit snapshots. The historical CLI retains its original
defaults; use `--output` for comparisons to preserve P05 evidence. The public
fetcher supports `--output` without AWS credentials or the Pricing API. The fresh
51-price snapshot already fetched on 2 October is reused; no second fetch is claimed.

## Read-only observation

[usage-2026-10-03.json](usage-2026-10-03.json) records the 14:56 SGT read-only
observation, exact query/filter/units and limited deployed staging inventory.
`Spoh-staging-Platform` was UPDATE_COMPLETE with image `d9faf61`; one ARM64 task
(0.5 vCPU/1 GB) was running, and single-AZ RDS micro was available with 20 GB gp3 and
100 GB autoscaling cap. The five alarms reference six metric inputs and have no
notification actions. The app log group has 30-day retention; this is not a complete
account log/storage inventory.

The Cost Explorer query is account-wide in Singapore, not isolated SPOH staging.
It groups DAILY UnblendedCost and UsageQuantity by SERVICE/USAGE_TYPE over UTC
2026-09-29 through 2026-10-03 exclusive. The `app`, `env` and `cost-centre` cost
allocation tags remain Inactive. October results are estimated/incomplete. No tag,
backfill, billing control, email subscription, production or live Lightsail resource
was changed. Usage quantities are saved instead of being discarded when rounded
costs are near zero. Cost Explorer resource attribution/complete days and measured
Firebase, backup and retained-storage allowances remain required for final evidence.

AWS CLI reproduction (structured JSON filter; do not total unlike usage units):

```powershell
aws ce get-cost-and-usage --time-period Start=2026-09-29,End=2026-10-03 --granularity DAILY --metrics UnblendedCost UsageQuantity --filter '{"Dimensions":{"Key":"REGION","Values":["ap-southeast-1"]}}' --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE --output json
aws ce list-cost-allocation-tags --tag-keys app env cost-centre --output json
```

## Preserved handoff fingerprints

These identify the incoming draft before CLI completion, not the amended CLI source:

```text
cost-model.mjs 16CDDFE62606C8C53E2C73BC8EEA272A1AE250BAA05910D60BEABDF27DED03E5
fetch-prices.mjs 9123ADD8D06F9B6165F99BB626C09DC74F79E2BEB5826531BEDB4C032B501B45
P08/pricing/prices.json 2C5A34B6D1004A48D523425017CDE2EC1624107BD1F377C7E77E50A135013EF7
P08/pricing/amendments.json 6257AD02CA54004E894522D0C18D07FF9FD2DD530D1F3782D0BA5DC6F9E44405
P08/pricing/cost.md 21F25F50C478FE979A48F9A056CEBDC8C8B131E66587185E7206638847C179C3
```

Verification: six pricing regressions pass, including historical/default and draft
totals, safe imports, malformed/inherited amendment rejection before writes,
retained-cost/January sensitivity and explicit input requirements. Root lint,
architecture, changed-source/report formatting and Git diff checks are recorded
with the slice's tracker update. No application/schema change or browser test is
claimed for this pricing slice.
