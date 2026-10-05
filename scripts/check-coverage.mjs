import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGES = {
  server: {
    root: 'server/src/',
    required: [
      'main.ts',
      'app/createApp.ts',
      'app/routes.ts',
      'config/env.ts',
      'modules/admin/http/settingsRoutes.ts',
    ],
    report: 'server/coverage/coverage-summary.json',
  },
  client: {
    root: 'client/src/',
    required: ['app/layout.tsx', 'instrumentation-client.ts'],
    report: 'client/coverage/coverage-summary.json',
  },
  shared: {
    root: 'packages/shared/src/',
    required: ['index.ts'],
    report: 'packages/shared/coverage/coverage-summary.json',
  },
};
const METRICS = ['lines', 'branches'];
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validFloor(floor) {
  if (!record(floor) || floor.schemaVersion !== 1 || !record(floor.packages)) return false;
  if (Object.keys(floor.packages).sort().join() !== Object.keys(PACKAGES).sort().join())
    return false;
  return Object.values(floor.packages).every(
    (entry) =>
      record(entry) &&
      METRICS.every(
        (type) => Number.isFinite(entry[type]) && entry[type] >= 0 && entry[type] <= 100,
      ),
  );
}
function validCounters(metric) {
  return (
    record(metric) &&
    Number.isSafeInteger(metric.total) &&
    Number.isSafeInteger(metric.covered) &&
    metric.total >= 0 &&
    metric.covered >= 0 &&
    metric.covered <= metric.total
  );
}
function sourcePaths(summary, config) {
  return Object.keys(summary)
    .filter((path) => path !== 'total')
    .map((path) => {
      const normal = path.replaceAll('\\', '/');
      const start = normal.lastIndexOf(config.root);
      return { path, source: start < 0 ? null : normal.slice(start) };
    });
}
function packageFindings(key, summary, floor, maintained = []) {
  if (!record(summary) || !record(summary.total)) return [`${key}: missing coverage report totals`];
  const config = PACKAGES[key],
    paths = sourcePaths(summary, config),
    findings = [];
  const expected = new Set([...config.required.map((path) => config.root + path), ...maintained]);
  for (const required of expected)
    if (!paths.some(({ source }) => source === required))
      findings.push(`${key}: coverage scope is missing ${required}`);
  for (const { path, source } of paths)
    if (!source || source.startsWith('server/src/generated/') || /\.(test|d)\.tsx?$/.test(source))
      findings.push(`${key}: report includes a file outside maintained source: ${path}`);
  for (const type of METRICS)
    findings.push(...metricFindings({ key, type, summary, paths, floor }));
  return findings;
}
function metricFindings({ key, type, summary, paths, floor }) {
  const total = summary.total[type];
  if (!validCounters(total) || paths.some(({ path }) => !validCounters(summary[path]?.[type])))
    return [`${key} ${type}: invalid coverage counters`];
  if (type === 'lines' && total.total === 0) return [`${key} lines: empty coverage report`];
  const aggregate = paths.reduce(
    (sum, { path }) => ({
      total: sum.total + summary[path][type].total,
      covered: sum.covered + summary[path][type].covered,
    }),
    { total: 0, covered: 0 },
  );
  if (aggregate.total !== total.total || aggregate.covered !== total.covered)
    return [`${key} ${type}: file aggregate does not match report totals`];
  // Counter comparisons avoid accepting a regression hidden by display rounding or pct fields.
  const actual = total.total === 0 ? 100 : (total.covered * 100) / total.total;
  return actual < floor[type]
    ? [`${key} ${type}: ${actual.toFixed(4)}% is below floor ${floor[type]}%`]
    : [];
}
export function coverageFindings({ floor, reports, sources }) {
  if (!validFloor(floor)) return ['Invalid coverage floor schema or application package floors'];
  return Object.keys(PACKAGES).flatMap((key) =>
    packageFindings(key, reports?.[key], floor.packages[key], sources?.[key]),
  );
}
export function floorChangeFindings(previous, current) {
  if (!validFloor(current) || (previous !== null && !validFloor(previous)))
    return ['Invalid current or previous coverage floor'];
  if (previous === null) return [];
  return Object.keys(PACKAGES).flatMap((key) =>
    METRICS.filter((type) => current.packages[key][type] < previous.packages[key][type]).map(
      (type) =>
        `${key} ${type}: coverage floor cannot decrease from ${previous.packages[key][type]} to ${current.packages[key][type]}`,
    ),
  );
}
function previousFloor(root, base) {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid coverage comparison commit');
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('cat-file', '-e', `${base}^{commit}`);
  const path = 'reports/metrics/coverage-floor.json';
  if (!git('ls-tree', '--name-only', base, '--', path).trim()) return null;
  return JSON.parse(git('show', `${base}:${path}`));
}
function maintainedSources(root) {
  return Object.fromEntries(
    Object.entries(PACKAGES).map(([key, config]) => [
      key,
      readdirSync(resolve(root, config.root), { recursive: true })
        .map((path) => config.root + path.replaceAll('\\', '/'))
        .filter(
          (path) =>
            /\.tsx?$/.test(path) &&
            !/\.(test|d)\.tsx?$/.test(path) &&
            !path.startsWith('server/src/generated/'),
        ),
    ]),
  );
}
export function checkCoverage(root) {
  const floor = JSON.parse(
    readFileSync(resolve(root, 'reports/metrics/coverage-floor.json'), 'utf8'),
  );
  const reports = Object.fromEntries(
    Object.entries(PACKAGES).map(([key, { report }]) => [
      key,
      JSON.parse(readFileSync(resolve(root, report), 'utf8')),
    ]),
  );
  const findings = coverageFindings({ floor, reports, sources: maintainedSources(root) });
  if (process.env.COVERAGE_BASE_SHA)
    findings.push(
      ...floorChangeFindings(previousFloor(root, process.env.COVERAGE_BASE_SHA), floor),
    );
  if (findings.length) throw new Error(findings.join('\n'));
  return Object.fromEntries(
    Object.entries(reports).map(([key, { total }]) => [
      key,
      Object.fromEntries(
        METRICS.map((type) => [
          type,
          total[type].total === 0
            ? 100
            : Math.floor((total[type].covered * 10000) / total[type].total) / 100,
        ]),
      ),
    ]),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify({ coverageFloorPassed: checkCoverage(root) }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
