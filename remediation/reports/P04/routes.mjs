/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * P04.3: the route inventory. Method, path, full middleware chain, capability,
 * station scope, validation targets, rate-limit tier and idempotency for every
 * route the API serves, read statically from the routers.
 *
 *   node remediation/reports/P04/routes.mjs            # writes routes.json + routes.md
 *
 * Unlike P02's permissions.mjs this parses each route call's argument list with
 * balanced brackets, so middleware on its own line is not lost, and it folds in
 * router-level `use(...)` middleware.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_MATRIX } from '../../../packages/shared/dist/capabilities.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = path.join(ROOT, 'server/src');
const ROLES = ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'];
const SHORT = {
  VOLUNTEER: 'V',
  IC: 'I',
  DEPUTY_COORDINATOR: 'D',
  CHIEF_COORDINATOR: 'C',
  LEAD: 'L',
  ADMIN: 'A',
};

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The text between the bracket at `open` and its partner, ignoring strings. */
function balanced(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced');
}

/** Split an argument list on top-level commas. */
function topLevelArgs(inner) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) out.push(last);
  return out;
}

function classify(arg) {
  if (arg === 'requireAuth') return { auth: true };
  const rl = arg.match(/^(default|capture|sensitive|admin)RateLimit$/);
  if (rl) return { rateLimit: rl[1] };
  const cap = arg.match(/^requireCapability\('([\w.]+)'\)$/);
  if (cap) return { capability: cap[1] };
  const role = arg.match(/^requireMinimumRole\('(\w+)'\)$/);
  if (role) return { minimumRole: role[1] };
  const scope = arg.match(/^requireStationScope\((.*)\)$/s);
  if (scope) return { stationScope: scope[1].trim() || 'body.stationId' };
  const val = arg.match(/^validate\(\{(.*)\}\)$/s);
  if (val) return { validate: [...val[1].matchAll(/(body|query|params)\s*:/g)].map((m) => m[1]) };
  const idem = arg.match(/^idempotent\('([^']+)'\)$/);
  if (idem) return { idempotent: true };
  return { other: arg.replace(/\s+/g, ' ').slice(0, 60) };
}

function mounts() {
  const routes = stripComments(readFileSync(path.join(SRC, 'routes.ts'), 'utf8'));
  const imports = new Map(
    [...routes.matchAll(/import \{ (\w+) \} from '\.\/modules\/(\w+)\/router\.js'/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const list = [...routes.matchAll(/apiRouter\.use\('([^']+)', (\w+)(\(\))?\)/g)].map((m) => ({
    prefix: `/api/v1${m[1]}`,
    module: imports.get(m[2]) ?? (m[2] === 'createDevAuthRouter' ? 'devAuth' : m[2]),
    note: m[2] === 'createDevAuthRouter' ? 'mounted only when AUTH_PROVIDER=local' : undefined,
  }));
  return [{ prefix: '', module: 'health' }, ...list];
}

function routesOf({ prefix, module, note }) {
  const source = stripComments(readFileSync(path.join(SRC, `modules/${module}/router.ts`), 'utf8'));
  const routerLevel = [];
  for (const m of source.matchAll(/(\w+)\.use\(/g)) {
    if (!/[Rr]outer$/.test(m[1])) continue;
    const inner = balanced(source, m.index + m[0].length - 1);
    for (const arg of topLevelArgs(inner))
      if (!arg.startsWith('(')) routerLevel.push(classify(arg));
  }
  const out = [];
  for (const m of source.matchAll(/(\w+)\.(get|post|patch|put|delete)\(\s*'([^']*)'/g)) {
    if (!/[Rr]outer$/.test(m[1])) continue;
    const open = m.index + m[0].indexOf('(');
    const args = topLevelArgs(balanced(source, open)).slice(1, -1);
    const chain = [...routerLevel, ...args.map(classify)];
    const merged = Object.assign({}, ...chain);
    const handlerSrc = topLevelArgs(balanced(source, open)).at(-1);
    const calls = [...handlerSrc.matchAll(/await (\w+)\(/g)].map((c) => c[1]);
    const roles = merged.capability
      ? CAPABILITY_MATRIX[merged.capability]
      : merged.auth
        ? ROLES
        : [];
    out.push({
      method: m[2].toUpperCase(),
      path: `${prefix}${m[3] === '/' ? '' : m[3]}` || '/',
      module,
      auth: Boolean(merged.auth),
      rateLimit: chain.find((c) => c.rateLimit)?.rateLimit ?? null,
      capability: merged.capability ?? null,
      roles,
      stationScope: merged.stationScope ?? null,
      validate: chain.flatMap((c) => c.validate ?? []),
      idempotent: Boolean(merged.idempotent),
      usesCallerIdentity: /getAuth\(req\)|captureActorFrom\(req\)|actorFrom\(req\)/.test(
        handlerSrc,
      ),
      calls,
      unknownMiddleware: chain.filter((c) => c.other).map((c) => c.other),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

const routes = mounts().flatMap(routesOf);
writeFileSync(
  path.join(ROOT, 'remediation/reports/P04/routes.json'),
  `${JSON.stringify(routes, null, 2)}\n`,
);

const rows = routes.map((r) => {
  const roles =
    r.roles.length === ROLES.length ? 'all' : r.roles.map((x) => SHORT[x]).join('') || '—';
  return `| ${r.method} | \`${r.path}\` | ${r.auth ? 'yes' : '**no**'} | ${r.rateLimit ?? '**none**'} | ${r.capability ?? '—'} | ${roles} | ${r.stationScope ? 'yes' : ''} | ${r.validate.join('+') || '—'} | ${r.idempotent ? 'yes' : ''} |`;
});
const md = [
  '| Method | Path | Auth | Rate limit | Capability | Roles | Station scope | Validated | Idempotent |',
  '| ------ | ---- | ---- | ---------- | ---------- | ----- | ------------- | --------- | ---------- |',
  ...rows,
].join('\n');
writeFileSync(path.join(ROOT, 'remediation/reports/P04/routes.md'), `${md}\n`);

const count = (pred) => routes.filter(pred).length;
console.log(`routes: ${routes.length}`);
console.log(`unauthenticated: ${count((r) => !r.auth)}`);
console.log(`authenticated without capability: ${count((r) => r.auth && !r.capability)}`);
console.log(`no rate limit: ${count((r) => !r.rateLimit)}`);
console.log(`station-scoped: ${count((r) => r.stationScope)}`);
console.log(
  `mutations without validation: ${count((r) => r.method !== 'GET' && r.validate.length === 0)}`,
);
console.log(
  `unknown middleware: ${JSON.stringify(routes.filter((r) => r.unknownMiddleware.length).map((r) => [r.path, r.unknownMiddleware]))}`,
);
