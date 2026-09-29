#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Client bundle size, measured the way P03.7 measured the baseline: every JS
 * file under client/.next/static/chunks, raw and gzip. It also reports each
 * route's first-load JS (the scripts its prerendered HTML names) and the chunks
 * every route loads, which is where a dependency shipped everywhere shows up.
 *
 *   npm run build --workspace client
 *   node remediation/tools/bundle-size.mjs [--json out.json]
 *
 * Baseline (P03.7, F03-037): 43 chunks, 2,152 KB raw / 613 KB gzip; an 83 KB gz
 * chunk of zod and the shared schemas on every route.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const NEXT = join(process.cwd(), 'client', '.next');
const CHUNKS = join(NEXT, 'static', 'chunks');
const PAGES = join(NEXT, 'server', 'app');

function walk(dir, keep) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, keep) : keep(name) ? [path] : [];
  });
}

const kb = (bytes) => Math.round(bytes / 102.4) / 10;

function measure(path) {
  const body = readFileSync(path);
  return { raw: body.length, gzip: gzipSync(body, { level: 9 }).length };
}

const sizes = new Map(
  walk(CHUNKS, (name) => name.endsWith('.js')).map((path) => [
    `/_next/static/chunks/${relative(CHUNKS, path).split(sep).join('/')}`,
    measure(path),
  ]),
);

function routeOf(htmlPath) {
  const route = relative(PAGES, htmlPath)
    .split(sep)
    .join('/')
    .replace(/\.html$/, '');
  return route === 'index' ? '/' : `/${route}`;
}

const routes = walk(PAGES, (name) => name.endsWith('.html') && !name.startsWith('_'))
  .map((path) => {
    const html = readFileSync(path, 'utf8');
    const scripts = [...new Set(html.match(/\/_next\/static\/chunks\/[^"'\s]+\.js/g) ?? [])];
    const gzip = scripts.reduce((sum, src) => sum + (sizes.get(src)?.gzip ?? 0), 0);
    return { route: routeOf(path), scripts, gzipKb: kb(gzip) };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const everywhere = routes.length
  ? routes[0].scripts.filter((src) => routes.every((route) => route.scripts.includes(src)))
  : [];
const total = [...sizes.values()].reduce(
  (sum, size) => ({ raw: sum.raw + size.raw, gzip: sum.gzip + size.gzip }),
  { raw: 0, gzip: 0 },
);

const report = {
  chunks: sizes.size,
  totalRawKb: kb(total.raw),
  totalGzipKb: kb(total.gzip),
  sharedByEveryRouteGzipKb: kb(everywhere.reduce((sum, src) => sum + sizes.get(src).gzip, 0)),
  largestFirstLoadGzipKb: Math.max(...routes.map((route) => route.gzipKb)),
  routes: routes.map(({ route, gzipKb }) => ({ route, gzipKb })),
};

console.log(
  `${report.chunks} chunks, ${report.totalRawKb} KB raw / ${report.totalGzipKb} KB gzip; ` +
    `${report.sharedByEveryRouteGzipKb} KB gzip on every route; ` +
    `largest first load ${report.largestFirstLoadGzipKb} KB gzip`,
);
const out = process.argv.indexOf('--json');
if (out > -1) writeFileSync(process.argv[out + 1], `${JSON.stringify(report, null, 2)}\n`);
