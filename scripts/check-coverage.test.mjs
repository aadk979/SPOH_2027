import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageFindings, floorChangeFindings } from './check-coverage.mjs';

const metric = (covered = 90, total = 100) => ({ covered, total, skipped: 0, pct: 100 });
const sources = {
  server: [
    'server/src/main.ts',
    'server/src/app/createApp.ts',
    'server/src/app/routes.ts',
    'server/src/config/env.ts',
    'server/src/modules/admin/http/settingsRoutes.ts',
  ],
  client: ['client/src/app/layout.tsx', 'client/src/instrumentation-client.ts'],
  shared: ['packages/shared/src/index.ts'],
};
function fixture() {
  const floor = { schemaVersion: 1, packages: {} },
    reports = {};
  for (const key of Object.keys(sources)) {
    floor.packages[key] = { lines: 90, branches: 90 };
    reports[key] = Object.fromEntries(
      sources[key].map((path) => [`/workspace/${path}`, { lines: metric(), branches: metric() }]),
    );
    reports[key].total = {
      lines: metric(90 * sources[key].length, 100 * sources[key].length),
      branches: metric(90 * sources[key].length, 100 * sources[key].length),
    };
  }
  return { floor, reports };
}
test('accepts every package at its measured floor on POSIX or Windows paths', () => {
  const { floor, reports } = fixture();
  assert.deepEqual(coverageFindings({ floor, reports }), []);
  for (const report of Object.values(reports))
    for (const path of Object.keys(report)) {
      if (path === 'total') continue;
      report[path.replace('/workspace/', 'C:\\repo\\').replaceAll('/', '\\')] = report[path];
      delete report[path];
    }
  assert.deepEqual(coverageFindings({ floor, reports }), []);
});
for (const [key, type] of [
  ['server', 'lines'],
  ['client', 'branches'],
  ['shared', 'lines'],
]) {
  test(`fails a ${key} ${type} regression even when reported pct falsely says 100`, () => {
    const { floor, reports } = fixture();
    const path = Object.keys(reports[key]).find((path) => path !== 'total');
    reports[key][path][type].covered--;
    reports[key].total[type].covered--;
    assert.match(
      coverageFindings({ floor, reports }).join('\n'),
      new RegExp(`${key} ${type}.*below`),
    );
  });
}
test('compares exact counters without rounding a near miss up to the floor', () => {
  const { floor, reports } = fixture();
  reports.client['/workspace/client/src/app/layout.tsx'].lines = metric(899999, 1000000);
  reports.client.total.lines = metric(900089, 1000100);
  assert.match(coverageFindings({ floor, reports }).join('\n'), /client lines.*below/);
});
test('refuses missing reports, malformed/empty counters and forged total aggregates', () => {
  for (const invalid of [
    undefined,
    { total: {} },
    { total: { lines: metric(0, 0), branches: metric(0, 0) } },
  ]) {
    const { floor, reports } = fixture();
    reports.server = invalid;
    assert.ok(coverageFindings({ floor, reports }).length);
  }
  const { floor, reports } = fixture();
  reports.client.total.lines.covered++;
  assert.match(coverageFindings({ floor, reports }).join('\n'), /aggregate/);
});
test('refuses omitted server composition/configuration/router or client root layout', () => {
  for (const key of ['server', 'client'])
    for (const path of sources[key]) {
      const { floor, reports } = fixture();
      delete reports[key][`/workspace/${path}`];
      assert.match(coverageFindings({ floor, reports }).join('\n'), /scope is missing/);
    }
});
test('refuses generated Prisma dependencies, tests and paths outside the package source', () => {
  for (const path of [
    'server/src/generated/client.ts',
    'server/src/extra.test.ts',
    'node_modules/zod/index.ts',
  ]) {
    const { floor, reports } = fixture();
    reports.server[`/workspace/${path}`] = { lines: metric(), branches: metric() };
    assert.match(coverageFindings({ floor, reports }).join('\n'), /outside maintained source/);
  }
});
test('refuses any omitted maintained source rather than only the required composition markers', () => {
  const { floor, reports } = fixture();
  const maintained = {
    ...sources,
    server: [...sources.server, 'server/src/modules/media/http/routes.ts'],
  };
  assert.match(
    coverageFindings({ floor, reports, sources: maintained }).join('\n'),
    /scope is missing server\/src\/modules\/media\/http\/routes.ts/,
  );
  maintained.server.pop();
  assert.deepEqual(coverageFindings({ floor, reports, sources: maintained }), []);
});
test('includes versioned generated shared setting contracts in application coverage', () => {
  const { floor, reports } = fixture();
  reports.shared['/workspace/packages/shared/src/generated/settings/index.ts'] = {
    lines: metric(),
    branches: metric(),
  };
  reports.shared.total = { lines: metric(180, 200), branches: metric(180, 200) };
  assert.deepEqual(coverageFindings({ floor, reports }), []);
});
test('validates floor schema and refuses missing, extra or invalid package floors', () => {
  for (const mutate of [
    (floor) => {
      floor.schemaVersion = 2;
    },
    (floor) => {
      delete floor.packages.client;
    },
    (floor) => {
      floor.packages.other = { lines: 0, branches: 0 };
    },
    (floor) => {
      floor.packages.server.lines = '90';
    },
    (floor) => {
      floor.packages.server.branches = Number.NaN;
    },
    (floor) => {
      floor.packages.client.lines = -1;
    },
    (floor) => {
      floor.packages.shared.lines = 101;
    },
  ]) {
    const { floor, reports } = fixture();
    mutate(floor);
    assert.ok(coverageFindings({ floor, reports }).length);
  }
});
test('refuses impossible, negative, fractional and nonfinite covered/total values', () => {
  for (const invalid of [
    metric(101),
    metric(-1),
    metric(1.5),
    metric(1, -1),
    metric(Number.NaN),
    metric(1, Number.POSITIVE_INFINITY),
  ]) {
    const { floor, reports } = fixture();
    reports.client.total.lines = invalid;
    assert.match(coverageFindings({ floor, reports }).join('\n'), /invalid.*counters/);
  }
});
test('counts an actual zero-branch file without dropping its executable lines', () => {
  const { floor, reports } = fixture();
  reports.client.total.branches = metric(0, 0);
  for (const source of sources.client)
    reports.client[`/workspace/${source}`].branches = metric(0, 0);
  assert.deepEqual(coverageFindings({ floor, reports }), []);
});

test('permits initial establishment and later unchanged or increased floors', () => {
  const { floor } = fixture();
  assert.deepEqual(floorChangeFindings(null, floor), []);
  assert.deepEqual(floorChangeFindings(structuredClone(floor), floor), []);
  const raised = structuredClone(floor);
  raised.packages.client.lines = 91;
  assert.deepEqual(floorChangeFindings(floor, raised), []);
});
test('fails a lowered floor even when the measured coverage would still pass', () => {
  const { floor } = fixture();
  for (const key of Object.keys(sources))
    for (const type of ['lines', 'branches']) {
      const lowered = structuredClone(floor);
      lowered.packages[key][type]--;
      assert.match(floorChangeFindings(floor, lowered).join('\n'), /floor cannot decrease/);
    }
});
test('refuses an invalid previous or current floor instead of bypassing the ratchet', () => {
  const { floor } = fixture();
  assert.ok(floorChangeFindings({}, floor).length);
  assert.ok(floorChangeFindings(floor, {}).length);
});
