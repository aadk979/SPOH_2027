#!/usr/bin/env node
/** Reconciles P05 assumptions without changing its signed-off prices or generated report. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  ASSUMPTIONS as A,
  MONTHS,
  TOPOLOGIES,
  unitPrice as p,
  fetchedAt,
} from '../../P05/pricing/cost-model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    prices: { type: 'string' },
    amendments: { type: 'string' },
    output: { type: 'string' },
  },
});
const fmt = (n) => n.toFixed(2);
const total = (lines) => Object.values(lines).reduce((sum, amount) => sum + amount, 0);

/** Jan's approximate $130 exception is D-10/Q-P9; $100 applies to other months. */
export const ceiling = (name) => (name.startsWith('Jan 2027') ? 130 : 100);

export function hostingLines(month) {
  const lines = TOPOLOGIES.lean.lines(month);
  delete lines['Route 53 zone'];
  delete lines['SES invites'];
  lines['prod: Fargate ARM API (Firebase serves client)'] =
    lines['prod: Fargate ARM API (serves the static client)'];
  delete lines['prod: Fargate ARM API (serves the static client)'];
  const prod = month.prodDays > 0;
  const active = month.stagingHours > 0;
  lines['prod: API Gateway HTTP API + Cloud Map'] = prod
    ? month.apiM * 1e6 * (p('apigw.httpRequest') + p('cloudmap.apiCall')) +
      p('cloudmap.resourceMonth')
    : 0;
  // DNS namespaces are already deployed by Cloud Map. D-08 removes public domain hosting.
  lines['prod: Cloud Map private DNS namespace (no public domain)'] = prod
    ? p('route53.hostedZoneMonth')
    : 0;
  lines['staging: Cloud Map private DNS namespace (retained)'] = p('route53.hostedZoneMonth');
  if (!active) lines['staging: ingress'] = p('cloudmap.resourceMonth');
  // Off-season deletion is conditional, and a full provisioned-volume allowance is safer than 2 GB.
  if (!active) {
    lines['staging: RDS t4g.micro (stopped when idle; storage always)'] =
      A.rdsGb * p('rds.backupGbMonth');
  }
  lines['prod: CloudWatch log storage (one month allowance)'] =
    month.prodLogsGb * p('cloudwatch.logStorageGbMonth');
  lines['staging: CloudWatch log storage (one month allowance)'] =
    month.stagingLogsGb * p('cloudwatch.logStorageGbMonth');
  return lines;
}

export function forecasts() {
  return Object.entries(MONTHS).map(([name, month]) => {
    const parked = hostingLines(month);
    const alwaysOn = hostingLines({ ...month, stagingHours: month.days * 24 });
    // Keep the historical log/request volumes in this sensitivity comparison.
    return { name, ceiling: ceiling(name), parked, alwaysOn };
  });
}

function renderUsage(usage) {
  const lines = [
    '## Observed billing and usage',
    '',
    `Observed ${usage.observedAt}; query is **${usage.scope}**. UTC dates, end exclusive 2026-10-03.`,
    '',
    '| Date | Estimated | Unblended USD | RDS micro hours | Fargate vCPU hours | HTTP requests | Cloud Map calls |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const day of usage.costExplorer.ResultsByTime) {
    const quantity = (type) =>
      day.Groups.find((group) => group.Keys[1] === type)?.Metrics.UsageQuantity.Amount ?? '0';
    const cost = day.Groups.reduce(
      (sum, group) => sum + Number(group.Metrics.UnblendedCost.Amount),
      0,
    );
    lines.push(
      `| ${day.TimePeriod.Start} | ${day.Estimated} | ${cost.toExponential(8)} | ${quantity('APS1-InstanceUsage:db.t4g.micro')} | ${quantity('APS1-Fargate-ARM-vCPU-Hours:perCPU')} | ${quantity('APS1-ApiGatewayHttpRequest')} | ${quantity('APS1-Cloud-Map-API-Calls')} |`,
    );
  }
  lines.push(
    '',
    'These quantities are not three complete isolated staging days: tags app/env/cost-centre are inactive, the region also contains the old Lightsail deployment and other services, and the October days are estimated/incomplete. Near-zero UnblendedCost is not evidence that running resources are free. No billing, tag activation/backfill or account controls were changed.',
    '',
    'Measured quantities remain in usage-2026-10-03.json with service, usage type and unit. Do not sum UsageQuantity across different units or substitute account-region totals for staging usage. Rerun the model with isolated, complete staging quantities when available; P08.10 remains open.',
  );
  return lines;
}

export function render(usage) {
  const months = forecasts();
  const lines = [
    '# Reconciled cost forecast — P08.10 (still open)',
    '',
    `AWS public offer snapshot fetched ${fetchedAt}. USD before tax/credits; planned usage, **not a measured bill**. Historical P05 prices/cost.md and the handoff draft cost.md remain intact.`,
    '',
    '## Current hosting assumptions and sensitivity',
    '',
    '| Month | D-10 ceiling | Conditional parking plan | Continuous staging compute |',
    '| --- | ---: | ---: | ---: |',
    ...months.map(
      (m) =>
        `| ${m.name} | ${m.ceiling} | ${fmt(total(m.parked))}${total(m.parked) > m.ceiling ? ' ⚠️' : ''} | ${fmt(total(m.alwaysOn))}${total(m.alwaysOn) > m.ceiling ? ' ⚠️' : ''} |`,
    ),
    '',
    'These are known-cost subtotals. Parking/deletion and approved scaling dates have not been implemented or approved merely by modelling them. Continuous staging matches its current running inventory. Requests, log volume, production dates, event-scale dates and the old Lightsail decommission date still inherit P05 assumptions. No production stack or scaling action was performed.',
    '',
    'Production static files move to Firebase, so their 10% AWS ingress allowance and SES invites are removed. The Cloud Map **private** DNS namespace costs $0.50 per retained environment; this is existing service-discovery infrastructure, not a new public Route 53 domain. Staging Cloud Map registry, alarms, secrets and the $7 edge stay charged while compute is parked. The off-season deleted-database scenario reserves 20 GB of snapshot storage instead of the old 2 GB. Log storage has a one-month ingestion allowance. All 13 planned staging alarm metric inputs and five custom metrics remain in the conservative forecast; currently deployed five alarms use six inputs and two custom metrics ($1.20/month versus planned $2.80).',
    '',
    'The $7 staging edge is assumed reusable for production after the go decision and routing review, as proposed in the approved edge pricing. A separate production edge would add another $7/month. [Cloud Map pricing](https://aws.amazon.com/cloud-map/pricing/) lists DNS namespace charges. [RDS stop rules](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html) retain storage charges and automatically restart after seven days; the parking forecast needs real controls and measured restart/stop overhead.',
    '',
    '## Conditional parking plan, itemised',
    '',
    `| Item | ${months.map((m) => m.name).join(' | ')} |`,
    `| --- | ${months.map(() => '---:').join(' | ')} |`,
  ];
  const keys = new Set(months.flatMap((m) => Object.keys(m.parked)));
  for (const key of keys) {
    lines.push(`| ${key} | ${months.map((m) => fmt(m.parked[key] ?? 0)).join(' | ')} |`);
  }
  lines.push(
    '',
    '## Unmeasured allowances and January protection',
    '',
    'Firebase is outside AWS and its project/plan/transfer usage is not available. Its [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing) provide 10 GB storage and 360 MB/day transfer at no cost; Spark can suspend serving when its transfer limit is exceeded. A zero-dollar Firebase assumption therefore does not prove event readiness or a complete combined hosting budget. Price overage against measured bytes before deployment.',
    '',
    'The subtotal excludes unmeasured incremental 35-day backup storage beyond the RDS allowance, S3 requests/versioned data, API/Secrets request overages, DNS queries, deployment overlap/migrate task hours, excess public data transfer, proxy excess beyond 2 TB, SMS, and any paid dashboard beyond free quotas. ECR 3 GB and RDS 20 GB are assumptions, not autoscaling caps (staging can grow to 100 GB). Retained off-season logs, audit logs and annual archive growth need separate measured allowances. It does not deduct AWS credits or free-tier benefits from forecast rates.',
    '',
    `D-10/Q-P9 allows about $130 for January only, including the accepted protection recommendation. The original three January option allowances total $29.47 ($7 Plus, $9.19 Multi-AZ and $13.28 WAF). The conditional January subtotal plus those historical allowances is $${fmt(total(months[3].parked) + 29.47)}, exceeding $130 before the unmeasured items. HTTP API itself does not support WAF, so the actual edge topology and cost need review. The draft warning at $106.89 against $100 was not the complete D-10 rule. No protection or budget policy was changed to force a fit.`,
    '',
    ...renderUsage(usage),
    '',
    '## Verification and next evidence',
    '',
    'Pricing CLI regression checks preserve historical totals 36.46 / 77.38 / 56.39 / 96.99 / 40.19 and the five handoff-draft totals 46.27 / 87.28 / 66.29 / 106.89 / 50.09. Strict amendments reject unknown/negative/fractional metric inputs before writing. Imports never write the signed-off report. P08.10 stays in progress until isolated measured cost, complete hosting/protection allowances, pipeline smoke and D-10 criteria pass.',
    '',
  );
  return lines.join('\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!values.prices || !values.amendments) {
    throw new Error('Reconciliation requires explicit --prices and --amendments snapshots.');
  }
  const usage = JSON.parse(readFileSync(join(HERE, 'usage-2026-10-03.json'), 'utf8'));
  const report = render(usage);
  writeFileSync(values.output ?? join(HERE, 'reconciled-cost.md'), report);
  process.stdout.write(`${monthsSummary()}\n`);
}

function monthsSummary() {
  return JSON.stringify(
    forecasts().map((m) => ({
      month: m.name,
      ceiling: m.ceiling,
      conditional: fmt(total(m.parked)),
      continuous: fmt(total(m.alwaysOn)),
    })),
  );
}
