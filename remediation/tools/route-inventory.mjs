#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Route inventory from the booted app (P06.1).
 *
 * Boots the Express app exactly as the server builds it and records, for every
 * route: method, full path, the middleware chain in order (router-level `use`
 * middleware included), and the capability it requires. P06 is a pure
 * refactor, so this snapshot must not change apart from middleware renames:
 *
 *   node remediation/tools/route-inventory.mjs                    writes reports/P06/routes-before.json
 *   node remediation/tools/route-inventory.mjs --out <file>       writes somewhere else
 *   node remediation/tools/route-inventory.mjs --diff <file>      compares with a snapshot, exit 1 on change
 *
 * Unlike `reports/P04/routes.mjs`, which parses the router files, this reads
 * the live router stack, so it survives the files moving. Middleware factories
 * name their closures (`server/src/platform/http/named.ts`) so a chain reads
 * `requireCapability(report.generate)`, not `<anonymous>`. The route handler
 * itself (the last function) is counted, not named: P06 turns anonymous
 * handlers into named ones, which is not a change of behaviour.
 *
 * The environment is the integration suite's (server/vitest.config.ts), with
 * `server/.env` skipped, so the snapshot does not depend on a developer's
 * machine. `AUTH_PROVIDER=local` mounts the dev sign-in route, as in tests.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const DEFAULT_OUT = join(REPO, 'remediation', 'reports', 'P06', 'routes-before.json');

Object.assign(process.env, {
  NODE_ENV: 'test',
  SPOH_SKIP_DOTENV: '1',
  DATABASE_URL: 'postgresql://inventory:inventory@localhost:5435/inventory_test',
  AUTH_PROVIDER: 'local',
  ATTENDANCE_ROOT_EMAIL: 'root@attendance.test',
  ATTENDANCE_SP_CIDRS: '127.0.0.1/32',
  LOCAL_AUTH_SECRET: 'route-inventory-only-secret-thirty-two-chars',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
});

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};

/**
 * Express 5 keeps no mount path on a layer (it compiles it into matchers), so
 * record the path as each `use` is called, before the app is built.
 */
function recordMountPaths(express) {
  // A router is a function whose prototype chain reaches Router.prototype
  // through an instance, so look for the object that owns `use`.
  let proto = Object.getPrototypeOf(express.Router());
  while (proto && !Object.hasOwn(proto, 'use')) proto = Object.getPrototypeOf(proto);
  const originalUse = proto.use;
  proto.use = function use(...useArgs) {
    const path = typeof useArgs[0] === 'string' ? useArgs[0] : '/';
    const before = this.stack.length;
    const result = originalUse.apply(this, useArgs);
    for (const layer of this.stack.slice(before)) layer.mountPath = path;
    return result;
  };
}

function joinPath(prefix, path) {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function nameOf(fn) {
  return fn?.name && fn.name !== 'anonymous' ? fn.name : '<anonymous>';
}

function isRouter(layer) {
  return Array.isArray(layer.handle?.stack);
}

/** Walk a router's stack; router-level middleware applies to the routes after it. */
function walk(stack, prefix, inherited, routes) {
  const chain = [...inherited];
  for (const layer of stack) {
    const mount = layer.mountPath ?? '/';
    if (layer.route) {
      const handlers = layer.route.stack.map((entry) => nameOf(entry.handle));
      const middleware = [...chain, ...handlers.slice(0, -1)];
      for (const method of Object.keys(layer.route.methods).filter((m) => layer.route.methods[m])) {
        routes.push({
          method: method.toUpperCase(),
          path: joinPath(prefix, layer.route.path),
          middleware,
          capability:
            middleware.map((name) => /^requireCapability\((.+)\)$/.exec(name)?.[1]).find(Boolean) ??
            null,
        });
      }
    } else if (isRouter(layer)) {
      walk(layer.handle.stack, joinPath(prefix, mount), chain, routes);
    } else {
      chain.push(mount === '/' ? nameOf(layer.handle) : `${nameOf(layer.handle)}@${mount}`);
    }
  }
}

async function inventory() {
  const require = createRequire(join(REPO, 'server', 'package.json'));
  const express = require('express');
  recordMountPaths(express);

  const { register } = await import('tsx/esm/api');
  register();
  const { createApp } = await import(pathToFileURL(join(REPO, 'server', 'src', 'app.ts')).href);
  const app = createApp();

  const routes = [];
  walk(app.router.stack, '', [], routes);

  // Application-wide middleware (request id, helmet, cors, parsers) sits before
  // every route; report it once rather than on each row.
  const firstRouterIndex = app.router.stack.findIndex(isRouter);
  const global = app.router.stack.slice(0, firstRouterIndex).map((layer) => nameOf(layer.handle));
  const perRoute = routes.map((route) => ({
    ...route,
    middleware: route.middleware.slice(global.length),
  }));
  perRoute.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return { global, routes: perRoute };
}

function describe(route) {
  return `${route.method} ${route.path}`;
}

function diff(before, after) {
  const changes = [];
  if (JSON.stringify(before.global) !== JSON.stringify(after.global)) {
    changes.push(`global middleware: ${before.global.join(' → ')}  ⇒  ${after.global.join(' → ')}`);
  }
  const index = (list) => new Map(list.map((route) => [describe(route), route]));
  const was = index(before.routes);
  const now = index(after.routes);
  for (const [key, route] of was) {
    const next = now.get(key);
    if (!next) changes.push(`removed: ${key}`);
    else if (JSON.stringify(route) !== JSON.stringify(next)) {
      changes.push(
        `changed: ${key}\n    ${route.middleware.join(' → ')}\n  ⇒ ${next.middleware.join(' → ')}`,
      );
    }
  }
  for (const key of now.keys()) if (!was.has(key)) changes.push(`added: ${key}`);
  return changes;
}

const result = await inventory();
const compareWith = flag('--diff');

if (compareWith) {
  const before = JSON.parse(readFileSync(compareWith, 'utf8'));
  const changes = diff(before, result);
  if (changes.length === 0) {
    console.log(`route inventory unchanged: ${result.routes.length} routes`);
    process.exit(0);
  }
  console.log(changes.join('\n'));
  process.exit(1);
}

const out = flag('--out') ?? DEFAULT_OUT;
mkdirSync(dirname(out), { recursive: true });
// Formatted as the repo formats JSON, so the committed snapshot passes format:check.
const { format, resolveConfig } = await import('prettier');
const json = JSON.stringify({ generatedBy: 'route-inventory.mjs', ...result });
const config = (await resolveConfig(out)) ?? {};
writeFileSync(out, await format(json, { ...config, filepath: out }));
console.log(`${result.routes.length} routes → ${out}`);
process.exit(0);
