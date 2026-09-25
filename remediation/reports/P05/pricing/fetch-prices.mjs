#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Fetches the AWS prices ADR-008 uses from the public AWS Price List offer files and writes
 * prices.json. No AWS credentials and no Pricing API (D-13): only the public files under
 * https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/.
 *
 *   node remediation/reports/P05/pricing/fetch-prices.mjs
 *
 * Every price records the offer file it came from (URL, version, publication date) and when it
 * was fetched, so ADR-008 can cite each one. The EC2 regional file is ~350 MB, so it is streamed
 * as CSV and filtered line by line instead of parsed as JSON.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

const HOST = 'https://pricing.us-east-1.amazonaws.com';
const REGION = 'ap-southeast-1';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'prices.json');

async function getJson(path) {
  const res = await fetch(HOST + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function offerUrl(offer, region = REGION) {
  const index = await getJson(`/offers/v1.0/aws/${offer}/current/region_index.json`);
  const entry = index.regions[region];
  if (!entry) throw new Error(`${offer}: no ${region} in region_index`);
  return entry.currentVersionUrl;
}

/** OnDemand price dimensions matching `match(product attributes, dimension)`. */
function* dimensions(offer) {
  for (const [sku, product] of Object.entries(offer.products)) {
    for (const term of Object.values(offer.terms?.OnDemand?.[sku] ?? {})) {
      for (const d of Object.values(term.priceDimensions)) yield { a: product.attributes, d };
    }
  }
}

// key → [offer, region, predicate(attributes, dimension)]
const JSON_SPECS = {
  'fargate.arm.vcpuHour': [
    'AmazonECS',
    REGION,
    (a) => a.usagetype === 'APS1-Fargate-ARM-vCPU-Hours:perCPU',
  ],
  'fargate.arm.gbHour': ['AmazonECS', REGION, (a) => a.usagetype === 'APS1-Fargate-ARM-GB-Hours'],
  'vpc.publicIpv4Hour': [
    'AmazonVPC',
    REGION,
    (a) => a.usagetype === 'APS1-PublicIPv4:InUseAddress',
  ],
  'vpc.interfaceEndpointHour': [
    'AmazonVPC',
    REGION,
    (a) => a.usagetype === 'APS1-VpcEndpoint-Hours',
  ],
  'elb.albHour': [
    'AWSELB',
    REGION,
    (a) => a.usagetype === 'APS1-LoadBalancerUsage' && a.operation === 'LoadBalancing:Application',
  ],
  'elb.albLcuHour': [
    'AWSELB',
    REGION,
    (a) => a.usagetype === 'APS1-LCUUsage' && a.operation === 'LoadBalancing:Application',
  ],
  'apigw.httpRequest': [
    'AmazonApiGateway',
    REGION,
    (a, d) => a.usagetype === 'APS1-ApiGatewayHttpRequest' && d.beginRange === '0',
  ],
  'cloudmap.resourceMonth': [
    'AWSCloudMap',
    REGION,
    (a) => a.usagetype === 'APS1-Cloud-Map-Resources',
  ],
  'cloudmap.apiCall': [
    'AWSCloudMap',
    REGION,
    (a) => a.usagetype === 'APS1-Cloud-Map-DIR-API-Calls',
  ],
  'rds.pg.t4gMicro.singleAzHour': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-InstanceUsage:db.t4g.micro' && a.databaseEngine === 'PostgreSQL',
  ],
  'rds.pg.t4gSmall.singleAzHour': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-InstanceUsage:db.t4g.small' && a.databaseEngine === 'PostgreSQL',
  ],
  'rds.pg.t4gSmall.multiAzHour': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-Multi-AZUsage:db.t4g.small' && a.databaseEngine === 'PostgreSQL',
  ],
  'rds.pg.t4gMedium.singleAzHour': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-InstanceUsage:db.t4g.medium' && a.databaseEngine === 'PostgreSQL',
  ],
  'rds.gp3.singleAzGbMonth': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-RDS:GP3-Storage' && a.databaseEngine === 'PostgreSQL',
  ],
  'rds.gp3.multiAzGbMonth': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-RDS:Multi-AZ-GP3-Storage' && a.databaseEngine === 'Any',
  ],
  'rds.backupGbMonth': [
    'AmazonRDS',
    REGION,
    (a) => a.usagetype === 'APS1-RDS:ChargedBackupUsage' && a.databaseEngine === 'PostgreSQL',
  ],
  'cognito.plusMau': ['AmazonCognito', REGION, (a) => a.usagetype === 'APS1-CognitoPlusMAU'],
  'cognito.essentialsMau': [
    'AmazonCognito',
    REGION,
    (a) => a.usagetype === 'APS1-CognitoEssentialsMAU',
  ],
  'cognito.freeTierMau': [
    'AmazonCognito',
    REGION,
    (a) => a.usagetype === 'Global-CognitoFreeTierMAU',
  ],
  'avp.singleRequest': [
    'AmazonVerifiedPermissions',
    REGION,
    (a) => a.usagetype === 'APS1-SingleAuthorizationRequest-API-Requests',
  ],
  'avp.batchRequest': [
    'AmazonVerifiedPermissions',
    REGION,
    (a, d) => a.usagetype === 'APS1-AuthorizationRequest-API-Requests' && d.beginRange === '0',
  ],
  'waf.webAclMonth': ['awswaf', REGION, (a) => a.usagetype === 'APS1-WebACLV2'],
  'waf.ruleMonth': ['awswaf', REGION, (a) => a.usagetype === 'APS1-RuleV2'],
  'waf.request': ['awswaf', REGION, (a) => a.usagetype === 'APS1-RequestV2-48KB'],
  'route53.hostedZoneMonth': [
    'AmazonRoute53',
    'aws-other',
    (a, d) => a.usagetype === 'HostedZone' && d.beginRange === '0',
  ],
  'route53.query': [
    'AmazonRoute53',
    'aws-other',
    (a, d) => a.usagetype === 'DNS-Queries' && d.beginRange === '0',
  ],
  'secrets.secretMonth': [
    'AWSSecretsManager',
    REGION,
    (a) => a.usagetype === 'APS1-AWSSecretsManager-Secret',
  ],
  'cloudwatch.logIngestGb': [
    'AmazonCloudWatch',
    REGION,
    (a) => a.usagetype === 'APS1-DataProcessing-Bytes' && a.operation === 'PutLogEvents',
  ],
  'cloudwatch.logStorageGbMonth': [
    'AmazonCloudWatch',
    REGION,
    (a) => a.usagetype === 'APS1-TimedStorage-ByteHrs',
  ],
  'cloudwatch.alarmMonth': [
    'AmazonCloudWatch',
    REGION,
    (a) => a.usagetype === 'APS1-CW:AlarmMonitorUsage',
  ],
  'cloudwatch.metricMonth': [
    'AmazonCloudWatch',
    REGION,
    (a, d) => a.usagetype === 'APS1-CW:MetricMonitorUsage' && d.beginRange === '0',
  ],
  's3.standardGbMonth': [
    'AmazonS3',
    REGION,
    (a, d) => a.usagetype === 'APS1-TimedStorage-ByteHrs' && d.beginRange === '0',
  ],
  'ecr.storageGbMonth': ['AmazonECR', REGION, (a) => a.usagetype === 'APS1-TimedStorage-ByteHrs'],
  'kms.keyMonth': ['awskms', REGION, (a) => a.usagetype === 'ap-southeast-1-KMS-Keys'],
  'ses.recipient': ['AmazonSES', REGION, (a) => a.usagetype === 'APS1-Recipients'],
  'dataTransfer.outGb': [
    'AWSDataTransfer',
    REGION,
    (a, d) => a.usagetype === 'APS1-DataTransfer-Out-Bytes' && d.beginRange === '0',
  ],
  'lightsail.bundle2gbHour': [
    'AmazonLightsail',
    REGION,
    (a) => a.usagetype === 'APS1-BundleUsage:2GB',
  ],
  'lightsail.bundle4gbHour': [
    'AmazonLightsail',
    REGION,
    (a) => a.usagetype === 'APS1-BundleUsage:4GB',
  ],
  'lightsail.db1gbHour': [
    'AmazonLightsail',
    REGION,
    (a) => a.usagetype === 'APS1-DatabaseUsage:1GB',
  ],
  'lightsail.db1gbHaHour': [
    'AmazonLightsail',
    REGION,
    (a) => a.usagetype === 'APS1-DatabaseUsage:1GB_ha',
  ],
  'lightsail.lbHour': ['AmazonLightsail', REGION, (a) => a.usagetype === 'APS1-LoadBalancerUsage'],
  'apprunner.vcpuHour': [
    'AWSAppRunner',
    REGION,
    (a) => a.usagetype === 'APS1-AppRunner-vCPU-hours',
  ],
  'apprunner.gbHour': ['AWSAppRunner', REGION, (a) => a.usagetype === 'APS1-AppRunner-GB-hours'],
};

// Streamed from the EC2 CSV: key → PriceDescription pattern.
const EC2_CSV_PATTERNS = {
  'ec2.natGatewayHour': /per NAT Gateway Hour$/,
  'ec2.natGatewayGb': /per GB Data Processed by NAT Gateways$/,
  'ec2.t4gSmallLinuxHour': /per On Demand Linux t4g\.small Instance Hour$/,
  'ec2.t4gMediumLinuxHour': /per On Demand Linux t4g\.medium Instance Hour$/,
  'ebs.gp3GbMonth': /General Purpose \(gp3\) provisioned storage - Asia Pacific \(Singapore\)$/,
};

/** One CSV line into cells: quoted or bare fields, `""` escapes a quote. */
function csvCells(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function source(url, offer) {
  return { url: HOST + url, version: url.split('/')[5], publicationDate: offer.publicationDate };
}

async function jsonPrices() {
  const byOffer = new Map();
  const prices = {};
  for (const [key, [offerCode, region, match]] of Object.entries(JSON_SPECS)) {
    const id = `${offerCode}@${region}`;
    if (!byOffer.has(id)) {
      const url = await offerUrl(offerCode, region);
      byOffer.set(id, { url, offer: await getJson(url) });
    }
    const { url, offer } = byOffer.get(id);
    const hits = [...dimensions(offer)].filter(({ a, d }) => match(a, d));
    if (hits.length === 0) throw new Error(`${key}: no price matched in ${offerCode}`);
    const { a, d } = hits[0];
    prices[key] = {
      usd: Number(d.pricePerUnit.USD),
      unit: d.unit,
      description: d.description.trim(),
      usagetype: a.usagetype,
      offer: offerCode,
      ...source(url, offer),
    };
  }
  return prices;
}

async function cloudFrontPlans() {
  const url = await offerUrl('CloudFrontPlans', 'aws-other');
  const offer = await getJson(url);
  const plans = {};
  for (const plan of offer.terms.FlatRate.plans) {
    if (!['Free', 'Pro', 'Business'].includes(plan.planCode)) continue;
    plans[`cloudfront.plan.${plan.planCode}`] = {
      usd: Number(plan.subscriptionPrice.pricePerUnit.USD),
      unit: 'Month',
      description: plan.subscriptionPrice.description,
      quotas: Object.fromEntries(
        plan.features.map((f) => [f.featureCode, `${f.usageQuota.value} ${f.usageQuota.unit}`]),
      ),
      overage: plan.features[0]?.overagePolicy,
      offer: 'CloudFrontPlans',
      ...source(url, offer),
    };
  }
  return plans;
}

async function ec2CsvPrices() {
  const jsonUrl = await offerUrl('AmazonEC2');
  const csvUrl = jsonUrl.replace(/index\.json$/, 'index.csv');
  const res = await fetch(HOST + csvUrl);
  const lines = createInterface({ input: Readable.fromWeb(res.body) });
  const prices = {};
  let header;
  let publicationDate = null;
  for await (const line of lines) {
    if (line.startsWith('"Publication Date"')) publicationDate = csvCells(line)[1];
    if (line.startsWith('"SKU"')) header = csvCells(line);
    if (!header || !line.includes('OnDemand')) continue;
    const cells = csvCells(line);
    const description = cells[header.indexOf('PriceDescription')];
    for (const [key, pattern] of Object.entries(EC2_CSV_PATTERNS)) {
      if (prices[key] || !pattern.test(description)) continue;
      if (key.startsWith('ec2.t4g') && cells[header.indexOf('Tenancy')] !== 'Shared') continue;
      prices[key] = {
        usd: Number(cells[header.indexOf('PricePerUnit')]),
        unit: cells[header.indexOf('Unit')],
        description,
        usagetype: cells[header.indexOf('usageType')],
        offer: 'AmazonEC2',
        url: HOST + csvUrl,
        version: csvUrl.split('/')[5],
        publicationDate,
      };
    }
  }
  for (const key of Object.keys(EC2_CSV_PATTERNS))
    if (!prices[key]) throw new Error(`${key}: not found in EC2 CSV`);
  return prices;
}

const prices = {
  fetchedAt: new Date().toISOString(),
  region: REGION,
  prices: { ...(await jsonPrices()), ...(await cloudFrontPlans()), ...(await ec2CsvPrices()) },
};
writeFileSync(OUT, `${JSON.stringify(prices, null, 2)}\n`);
console.log(`wrote ${Object.keys(prices.prices).length} prices to ${OUT}`);
