/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * P02.9: what the server allows each role, per endpoint, next to whether any
 * screen calls it.
 *
 *   node remediation/tools/journeys/permissions.mjs
 *
 * 1. Reads every router for method, path and `requireCapability` /
 *    `requireStationScope`, and the capability matrix from @spoh/shared.
 * 2. Finds client callers by matching the path against strings in client/src.
 * 3. Signs in once per role (dev auth, local only, D-13) and probes every GET
 *    without path parameters, to confirm the matrix is what the server does.
 *
 * Writes `reports/P02/permissions.json`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_URL, BASE_URL, ROOT } from './lib.mjs';
import { CAPABILITY_MATRIX } from '../../../packages/shared/dist/capabilities.js';

const ROLES = {
  VOLUNTEER: 'booth@spoh2027.test',
  IC: 'ic@spoh2027.test',
  DEPUTY_COORDINATOR: 'dc@spoh2027.test',
  CHIEF_COORDINATOR: 'chief@spoh2027.test',
  LEAD: 'lead@spoh2027.test',
  ADMIN: 'admin@spoh2027.test',
};

function mounts() {
  const routes = readFileSync(path.join(ROOT, 'server/src/routes.ts'), 'utf8');
  const imports = new Map(
    [...routes.matchAll(/import \{ (\w+) \} from '\.\/modules\/(\w+)\/router\.js'/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  return [...routes.matchAll(/apiRouter\.use\('([^']+)', (\w+)\)/g)]
    .filter((m) => imports.has(m[2]))
    .map((m) => ({ prefix: m[1], module: imports.get(m[2]) }));
}

function endpoints() {
  const out = [];
  for (const { prefix, module } of mounts()) {
    const source = readFileSync(path.join(ROOT, `server/src/modules/${module}/router.ts`), 'utf8');
    const chunks = source.split(/\n(?=\w+Router\.(?:get|post|patch|put|delete)\()/);
    for (const chunk of chunks) {
      const head = chunk.match(/^\w+Router\.(get|post|patch|put|delete)\(\s*'([^']*)'/);
      if (!head) continue;
      const cap = chunk.match(/require(?:Capability|StationScope)\('([\w.]+)'\)/);
      out.push({
        method: head[1].toUpperCase(),
        path: `${prefix}${head[2] === '/' ? '' : head[2]}`,
        module,
        capability: cap?.[1] ?? null,
      });
    }
  }
  return out;
}

function clientStrings() {
  const strings = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(ts|tsx)$/.test(name)) {
        for (const m of readFileSync(file, 'utf8').matchAll(/[`'"](\/[a-z][^`'"\s]*)/g))
          strings.push(m[1]);
      }
    }
  };
  walk(path.join(ROOT, 'client/src'));
  return strings;
}

/**
 * Corrections to the string match, each checked by hand: paths the client builds
 * at runtime, and paths whose string exists only for another method.
 */
const CALLER_OVERRIDES = {
  'POST /auth/session': true, // session.ts: `/api/v1/auth${path}`
  'POST /auth/refresh': true,
  'DELETE /auth/session': true,
  'GET /auth/login': true, // sign-in page link
  'GET /reports/export': true, // reports page: `${apiBaseUrl}/api/v1/reports/export`
  'POST /fallback/imports/registrations': true, // imports page: `/fallback/imports/${target}`
  'POST /fallback/imports/footfall': true,
  'GET /incidents': false, // only POST /incidents is called
};

function hasCaller(endpoint, strings) {
  const override = CALLER_OVERRIDES[`${endpoint.method} ${endpoint.path}`];
  if (override !== undefined) return override;
  const pattern = endpoint.path
    .split('/')
    .map((part) =>
      part.startsWith(':')
        ? '(\\$\\{[^}]+\\}|[^/?]+)'
        : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  const re = new RegExp(`^(\\$\\{[^}]+\\})?(/api/v1)?${pattern}(\\?.*|\\$\\{.*)?$`);
  return strings.some((s) => re.test(s));
}

async function probe(token, url) {
  const res = await fetch(`${API_URL}/api/v1${url}`, {
    headers: { origin: BASE_URL, authorization: `Bearer ${token}` },
  });
  return res.status;
}

async function main() {
  const list = endpoints();
  const strings = clientStrings();
  const tokens = {};
  for (const [role, email] of Object.entries(ROLES)) {
    const res = await fetch(`${API_URL}/api/v1/dev-auth/sign-in`, {
      method: 'POST',
      headers: { origin: BASE_URL, 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    tokens[role] = (await res.json()).accessToken;
  }

  const rows = [];
  for (const endpoint of list) {
    const allowed = Object.fromEntries(
      Object.keys(ROLES).map((role) => [
        role,
        endpoint.capability ? CAPABILITY_MATRIX[endpoint.capability].includes(role) : null,
      ]),
    );
    const live = {};
    if (endpoint.method === 'GET' && !endpoint.path.includes(':') && endpoint.module !== 'auth') {
      for (const role of Object.keys(ROLES)) live[role] = await probe(tokens[role], endpoint.path);
    }
    const mismatch = Object.keys(live).filter(
      (role) => allowed[role] !== null && (live[role] === 403) === allowed[role],
    );
    rows.push({ ...endpoint, caller: hasCaller(endpoint, strings), allowed, live, mismatch });
  }

  const out = path.join(ROOT, 'remediation/reports/P02/permissions.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ roles: ROLES, endpoints: rows }, null, 2)}\n`);

  const short = {
    VOLUNTEER: 'V',
    IC: 'I',
    DEPUTY_COORDINATOR: 'D',
    CHIEF_COORDINATOR: 'C',
    LEAD: 'L',
    ADMIN: 'A',
  };
  for (const row of rows) {
    const who = row.capability
      ? Object.keys(ROLES)
          .filter((r) => row.allowed[r])
          .map((r) => short[r])
          .join('')
      : '(any signed-in)';
    const flags = [
      row.caller ? '' : 'NO-SCREEN',
      row.mismatch.length ? `LIVE≠MATRIX:${row.mismatch}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(
      `${row.method.padEnd(6)} ${row.path.padEnd(40)} ${(row.capability ?? '-').padEnd(26)} ${who.padEnd(16)} ${flags}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
