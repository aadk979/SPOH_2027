#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Route inventory from the booted app (P16.10).
 *
 * Boots the Express app exactly as the server builds it and records, for every
 * route: method, full path, the middleware chain in order (router-level `use`
 * middleware included), and its actual Cedar questions. It sends no HTTP
 * request and performs no migration/seed. This is source inventory, not
 * provider, staging or authorization acceptance.
 *
 *   node remediation/tools/route-inventory.mjs --out remediation/reports/P16/<new-file>.json
 *   node remediation/tools/route-inventory.mjs --diff <file>      compares with a snapshot, exit 1 on change
 *
 * Unlike `reports/P04/routes.mjs`, which parses the router files, this reads
 * the live router stack, so it survives the files moving. Middleware factories
 * name their closures (`server/src/platform/http/named.ts`) so a chain reads
 * `authorize(Report.Generate)`, not `<anonymous>`. Every composite question is
 * retained rather than flattened to an inferred grant.
 *
 * Explicit sole test-DB URLs and skip-dotenv are required before app imports.
 * The default is the Cognito route composition with inert inventory settings;
 * --auth-provider local additionally inventories the test-only dev sign-in.
 * Existing output and historical P04/P06 evidence cannot be overwritten.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventoryEnvironment, inventoryOptions } from './route-inventory-config.mjs';
import { isRouter, nameOf, walk } from './route-inventory-stack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const options = inventoryOptions(process.argv.slice(2), REPO);
Object.assign(process.env, inventoryEnvironment(process.env, options.provider));
delete process.env.CLIENT_DIR;

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

async function inventory() {
  const require = createRequire(join(REPO, 'server', 'package.json'));
  const express = require('express');
  recordMountPaths(express);

  const { register } = await import('tsx/esm/api');
  register();
  const { createApp } = await import(
    pathToFileURL(join(REPO, 'server', 'src', 'app', 'createApp.ts')).href
  );
  const { validationSchemasOf } = await import(pathToFileURL(join(REPO, 'server/src/platform/http/validate.ts')).href);
  const { toJSONSchema } = require('zod');
  const app = createApp();

  const routes = [];
  walk(app.router.stack, '', [], routes, { validation: (handler) => Object.fromEntries(
    Object.entries(validationSchemasOf(handler) ?? {}).map(([location, schema]) =>
      [location, toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })]),
  ) });

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
const compareWith = options.compareWith;

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

const out = options.out;
mkdirSync(dirname(out), { recursive: true });
// Formatted as the repo formats JSON, so the committed snapshot passes format:check.
const { format, resolveConfig } = await import('prettier');
const json = JSON.stringify({ generatedBy: 'route-inventory.mjs', authProvider: options.provider,
  evidence: 'source inventory only; no provider or HTTP execution',
  validationEvidence: 'actual mounted input schemas; custom/refinement semantics need authored cases; unrepresentable nodes are any', ...result });
const config = (await resolveConfig(out)) ?? {};
writeFileSync(out, await format(json, { ...config, filepath: out }), { flag: 'wx' });
console.log(`${result.routes.length} routes → ${out}`);
process.exit(0);
