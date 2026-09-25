#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Monthly AWS cost for the ADR-008 topologies, from prices.json (fetch-prices.mjs) and the
 * usage assumptions below. Writes cost.md.
 *
 *   node remediation/reports/P05/pricing/cost-model.mjs
 *
 * Every usage figure is an assumption, stated in ASSUMPTIONS and in cost.md, so the owner can
 * change one and rerun. P08.10 replaces them with Cost Explorer data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { prices, fetchedAt } = JSON.parse(readFileSync(join(HERE, 'prices.json'), 'utf8'));
const p = (key) => {
  if (!(key in prices)) throw new Error(`missing price ${key}`);
  return prices[key].usd;
};

const HOURS = 24;
const CEILING = 100;

/** Usage per month. Days are calendar days; requests in millions. */
export const MONTHS = {
  'Oct 2026 (build)': {
    days: 31,
    prodDays: 3,
    eventDays: 0,
    stagingHours: 264,
    lightsailDays: 31,
    apiM: 0,
    mau: 0,
    prodLogsGb: 0.1,
    stagingLogsGb: 1,
    invites: 0,
  },
  'Nov 2026 (training, Dry Run #1, cutover)': {
    days: 30,
    prodDays: 30,
    eventDays: 2,
    stagingHours: 264,
    lightsailDays: 17,
    apiM: 2,
    mau: 350,
    prodLogsGb: 1,
    stagingLogsGb: 1,
    invites: 500,
  },
  'Dec 2026 (fixes)': {
    days: 31,
    prodDays: 31,
    eventDays: 0,
    stagingHours: 200,
    lightsailDays: 0,
    apiM: 0.3,
    mau: 60,
    prodLogsGb: 0.5,
    stagingLogsGb: 1,
    invites: 50,
  },
  'Jan 2027 (Dry Run #2 + event)': {
    days: 31,
    prodDays: 31,
    eventDays: 7,
    stagingHours: 80,
    lightsailDays: 0,
    apiM: 8,
    mau: 350,
    prodLogsGb: 2,
    stagingLogsGb: 0.5,
    invites: 50,
  },
  'Off-season month (Feb–Sep)': {
    days: 30,
    prodDays: 30,
    eventDays: 0,
    stagingHours: 0,
    lightsailDays: 0,
    apiM: 0.3,
    mau: 30,
    prodLogsGb: 0.3,
    stagingLogsGb: 0,
    invites: 0,
  },
};

export const ASSUMPTIONS = {
  staticShare: 0.1, // static client requests as a share of API requests (the service worker caches the shell)
  stagingApiM: 0.3, // staging requests per active month, millions
  // Decision-cache hit rate (ADR-005 §6: 30 s TTL for writes, 60 s for reads). From P04.8's
  // mix: dashboards 10/s polled every 3 s (~95 %), alerts 30/s every 10 s (~83 %), captures 10/s
  // repeating principal × action × station (~90 %): about 0.86; 0.8 is used to stay on the safe side.
  avpCacheHit: 0.8,
  prodTask: { vcpu: 0.25, gb: 0.5 }, // one API task outside the event days
  eventTask: { vcpu: 1, gb: 2, count: 2 }, // on event and dry-run days, and the day before each
  stagingTask: { vcpu: 0.5, gb: 1 },
  rdsGb: 20,
  archiveSnapshotGb: 2,
  secretsPerEnv: 2, // the RDS-managed DB secret + one JSON secret for the app's keys
  alarms: 12,
  customMetrics: 5,
  s3Gb: 5,
  ecrGb: 3,
  lightsailBox: 'lightsail.bundle2gbHour', // today's single box (small_3_0), until it is decommissioned
};

const A = ASSUMPTIONS;
const taskHour = (t) =>
  t.vcpu * p('fargate.arm.vcpuHour') + t.gb * p('fargate.arm.gbHour') + p('vpc.publicIpv4Hour');

function shared(m) {
  return {
    'Route 53 zone': m.prodDays > 0 ? p('route53.hostedZoneMonth') : 0,
    'ECR images': A.ecrGb * p('ecr.storageGbMonth'),
    'SES invites': m.invites * p('ses.recipient'),
    'Lightsail box (until decommissioned)': m.lightsailDays * HOURS * p(A.lightsailBox),
  };
}

function prodCommon(m) {
  const share = m.prodDays / m.days;
  const baseHours = (m.prodDays - m.eventDays) * HOURS;
  const eventHours = m.eventDays * HOURS;
  return {
    'prod: RDS PostgreSQL (t4g.micro; t4g.small single-AZ in event window)':
      baseHours * p('rds.pg.t4gMicro.singleAzHour') +
      eventHours * p('rds.pg.t4gSmall.singleAzHour') +
      A.rdsGb * p('rds.gp3.singleAzGbMonth') * share,
    'prod: archive snapshot': m.prodDays > 0 ? A.archiveSnapshotGb * p('rds.backupGbMonth') : 0,
    'prod: Cognito Essentials (free under 10,000 MAU)':
      Math.max(0, m.mau - 10000) * p('cognito.essentialsMau'),
    'prod: Verified Permissions (IsAuthorized after cache)':
      m.apiM * 1e6 * (1 - A.avpCacheHit) * p('avp.singleRequest'),
    'prod: Secrets Manager': A.secretsPerEnv * p('secrets.secretMonth') * share,
    'prod: CloudWatch (logs, alarms, metrics)':
      m.prodLogsGb * p('cloudwatch.logIngestGb') +
      (A.alarms * p('cloudwatch.alarmMonth') + A.customMetrics * p('cloudwatch.metricMonth')) *
        share,
    'prod: S3 (media, content, exports)': m.prodDays > 0 ? A.s3Gb * p('s3.standardGbMonth') : 0,
  };
}

function prodFargate(m) {
  const base = (m.prodDays - m.eventDays) * HOURS * taskHour(A.prodTask);
  const event = m.eventDays * HOURS * A.eventTask.count * taskHour(A.eventTask);
  return base + event;
}

function staging(m, { ingress }) {
  const active = m.stagingHours;
  const exists = active > 0;
  return {
    'staging: Fargate API (only while in use)': active * taskHour(A.stagingTask),
    'staging: RDS t4g.micro (stopped when idle; storage always)':
      active * p('rds.pg.t4gMicro.singleAzHour') +
      (exists
        ? A.rdsGb * p('rds.gp3.singleAzGbMonth')
        : A.archiveSnapshotGb * p('rds.backupGbMonth')),
    'staging: Secrets Manager': A.secretsPerEnv * p('secrets.secretMonth'),
    'staging: CloudWatch logs': m.stagingLogsGb * p('cloudwatch.logIngestGb'),
    'staging: ingress': exists ? ingress(A.stagingApiM) : 0,
  };
}

const httpApi = (millions) =>
  millions * 1e6 * (1 + A.staticShare) * (p('apigw.httpRequest') + p('cloudmap.apiCall')) +
  p('cloudmap.resourceMonth');
const albMonth = (days, lcu = 1) =>
  days * HOURS * (p('elb.albHour') + lcu * p('elb.albLcuHour') + 2 * p('vpc.publicIpv4Hour'));

const TOPOLOGIES = {
  /** ADR-008's choice. */
  lean: {
    title: 'Recommended: HTTP API + Fargate (one service) + RDS, no NAT, staging parked when idle',
    lines: (m) => ({
      ...shared(m),
      'prod: API Gateway HTTP API + Cloud Map': m.prodDays > 0 ? httpApi(m.apiM) : 0,
      'prod: Fargate ARM API (serves the static client)': prodFargate(m),
      ...prodCommon(m),
      ...staging(m, { ingress: httpApi }),
    }),
  },
  leanAlb: {
    title: 'Same, with one ALB shared by staging and production instead of the HTTP API',
    lines: (m) => ({
      ...shared(m),
      'shared ALB (2 public IPv4)': albMonth(Math.max(m.prodDays, m.stagingHours > 0 ? m.days : 0)),
      'prod: Fargate ARM API (serves the static client)': prodFargate(m),
      ...prodCommon(m),
      ...staging(m, { ingress: () => 0 }),
    }),
  },
  plan: {
    title:
      'As first drafted (D-07 A): per environment ALB + WAF + Fargate api and web + 6 interface endpoints × 2 AZ, always on',
    lines: (m) => {
      const envs = [
        ['prod', m.prodDays],
        ['staging', m.days],
      ];
      const out = { ...shared(m) };
      for (const [env, days] of envs) {
        if (days === 0) continue;
        const h = days * HOURS;
        out[`${env}: ALB`] = albMonth(days);
        out[`${env}: WAF (ACL + 4 rules)`] =
          (p('waf.webAclMonth') + 4 * p('waf.ruleMonth')) * (days / m.days);
        out[`${env}: Fargate api + web`] =
          h * (taskHour(A.prodTask) + taskHour({ vcpu: 0.25, gb: 0.5 }));
        out[`${env}: 6 interface endpoints × 2 AZ`] = h * 12 * p('vpc.interfaceEndpointHour');
        out[`${env}: RDS t4g.micro`] =
          h * p('rds.pg.t4gMicro.singleAzHour') +
          A.rdsGb * p('rds.gp3.singleAzGbMonth') * (days / m.days);
      }
      Object.assign(out, prodCommon(m));
      delete out['prod: RDS PostgreSQL (t4g.micro; t4g.small single-AZ in event window)'];
      return out;
    },
  },
  lightsail: {
    title:
      'D-07 C: Lightsail (4 GB instance, managed DB, load balancer) for prod; 2 GB instance + DB for staging',
    lines: (m) => ({
      ...shared(m),
      'prod: Lightsail 4 GB instance': m.prodDays * HOURS * p('lightsail.bundle4gbHour'),
      'prod: Lightsail DB 1 GB (HA in event window)':
        (m.prodDays - m.eventDays) * HOURS * p('lightsail.db1gbHour') +
        m.eventDays * HOURS * p('lightsail.db1gbHaHour'),
      'prod: Lightsail load balancer': m.prodDays * HOURS * p('lightsail.lbHour'),
      'prod: Cognito Essentials': Math.max(0, m.mau - 10000) * p('cognito.essentialsMau'),
      'prod: Verified Permissions': m.apiM * 1e6 * (1 - A.avpCacheHit) * p('avp.singleRequest'),
      'staging: Lightsail 2 GB instance + DB 1 GB':
        m.days * HOURS * (p('lightsail.bundle2gbHour') + p('lightsail.db1gbHour')),
    }),
  },
};

/** Options the owner can add to the recommended topology, priced for the event month. */
function options(m) {
  return {
    'WAF on the edge (ACL + 3 rules + requests)':
      p('waf.webAclMonth') +
      3 * p('waf.ruleMonth') +
      m.apiM * 1e6 * (1 + A.staticShare) * p('waf.request'),
    'RDS Multi-AZ during the event window':
      m.eventDays * HOURS * (p('rds.pg.t4gSmall.multiAzHour') - p('rds.pg.t4gSmall.singleAzHour')) +
      A.rdsGb *
        (p('rds.gp3.multiAzGbMonth') - p('rds.gp3.singleAzGbMonth')) *
        (m.eventDays / m.days),
    'A NAT gateway (1 AZ) instead of public task IPs': m.days * HOURS * p('ec2.natGatewayHour'),
    'CloudFront Pro flat-rate plan (10 M requests, throttled beyond)': p('cloudfront.plan.Pro'),
    'Cognito Plus instead of Essentials (threat protection, ADR-006)': m.mau * p('cognito.plusMau'),
    'D-06 B: local evaluation only, no AVP calls (saving)': -(
      m.apiM *
      1e6 *
      (1 - A.avpCacheHit) *
      p('avp.singleRequest')
    ),
  };
}

const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

function render() {
  const out = [];
  out.push('# Cost model (P05.9, ADR-008)');
  out.push('');
  out.push(
    `Generated by \`cost-model.mjs\` from \`prices.json\` (AWS Price List offer files fetched ${fetchedAt}, region ap-southeast-1). Every price's offer file, version and publication date is in \`prices.json\`. USD per month, before tax and before AWS credits. D-10 ceiling: **US$${CEILING}**.`,
  );
  out.push('');
  out.push('## Totals');
  out.push('');
  const names = Object.keys(MONTHS);
  out.push(`| Topology | ${names.join(' | ')} |`);
  out.push(`| --- | ${names.map(() => '---:').join(' | ')} |`);
  for (const [id, t] of Object.entries(TOPOLOGIES)) {
    const cells = names.map((name) => {
      const total = Object.values(t.lines(MONTHS[name])).reduce((a, b) => a + b, 0);
      const flag = total > CEILING ? ' ⚠️' : '';
      return `${fmt(total)}${flag}`;
    });
    out.push(`| **${id}**: ${t.title} | ${cells.join(' | ')} |`);
  }
  out.push('');
  out.push('⚠️ = over the D-10 ceiling.');
  out.push('');
  out.push('## Recommended topology, itemised');
  out.push('');
  const lean = TOPOLOGIES.lean;
  const rows = Object.keys(lean.lines(MONTHS[names[3]]));
  out.push(`| Item | ${names.join(' | ')} |`);
  out.push(`| --- | ${names.map(() => '---:').join(' | ')} |`);
  for (const row of rows) {
    out.push(`| ${row} | ${names.map((n) => fmt(lean.lines(MONTHS[n])[row] ?? 0)).join(' | ')} |`);
  }
  out.push(
    `| **Total** | ${names.map((n) => `**${fmt(Object.values(lean.lines(MONTHS[n])).reduce((a, b) => a + b, 0))}**`).join(' | ')} |`,
  );
  out.push('');
  out.push('## Options, priced for the event month (Jan 2027)');
  out.push('');
  out.push('| Option | Change to the month |');
  out.push('| --- | ---: |');
  for (const [name, delta] of Object.entries(options(MONTHS[names[3]]))) {
    out.push(`| ${name} | ${delta >= 0 ? '+' : ''}${fmt(delta)} |`);
  }
  out.push('');
  out.push('## Assumptions');
  out.push('');
  out.push(
    '| Month | Prod days | Event-scale days | Staging hours | Lightsail days | API requests (M) | Prod MAU | Invites |',
  );
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [name, m] of Object.entries(MONTHS)) {
    out.push(
      `| ${name} | ${m.prodDays} | ${m.eventDays} | ${m.stagingHours} | ${m.lightsailDays} | ${m.apiM} | ${m.mau} | ${m.invites} |`,
    );
  }
  out.push('');
  out.push('```json');
  out.push(JSON.stringify(ASSUMPTIONS, null, 2));
  out.push('```');
  out.push('');
  out.push(
    'Not priced here: the domain registration (Route 53 Domains has its own price list), data transfer out (under the 100 GB/month global free tier at this scale, then $0.12/GB), and tax.',
  );
  out.push('');
  return out.join('\n');
}

const text = render();
writeFileSync(join(HERE, 'cost.md'), text);
console.log(text);
