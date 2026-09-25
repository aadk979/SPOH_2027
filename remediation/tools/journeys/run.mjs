/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Journey runner (P02.1).
 *
 *   node remediation/tools/journeys/run.mjs <journey> [--viewport phone|laptop]
 *   node remediation/tools/journeys/run.mjs --list
 *
 * Signs in as the journey's role (reusing a saved session), walks its steps and
 * saves `findings/F02-screens/<journey>-<nn>-<phone|laptop>.png` for each. A log
 * of final URLs, failed API calls and console errors goes to
 * `reports/P02/journeys/<journey>.json` as evidence for F02.
 *
 * Needs the local dev server (`npm run dev`) and a seeded database.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { journeys } from './journeys.mjs';
import {
  API_URL,
  LOG_DIR,
  SCREENS_DIR,
  capture,
  freezeInShift,
  launch,
  openSession,
} from './lib.mjs';

function parseArgs(argv) {
  const args = { names: [], viewports: ['phone', 'laptop'] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--viewport') args.viewports = [argv[(i += 1)]];
    else args.names.push(argv[i]);
  }
  return args;
}

function watchPage(page) {
  const events = [];
  page.on('response', (res) => {
    if (res.url().startsWith(API_URL) && res.status() >= 400) {
      events.push({ kind: 'api', status: res.status(), url: res.url().slice(API_URL.length) });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') events.push({ kind: 'console', text: msg.text().slice(0, 300) });
  });
  page.on('pageerror', (err) =>
    events.push({ kind: 'pageerror', text: String(err).slice(0, 300) }),
  );
  return events;
}

async function runStep(page, journey, step) {
  if (step.path) {
    await page.goto(step.path);
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  if (step.act) await step.act(page, { journey });
  await page.waitForTimeout(step.settleMs ?? 400);
}

async function runViewport(browser, journey, viewportName) {
  const session = await openSession(browser, { email: journey.role, viewportName });
  const { page } = session;
  const log = { viewport: viewportName, frozenAt: null, steps: [] };
  try {
    if (journey.freeze)
      log.frozenAt = (
        await freezeInShift(page, { block: journey.freeze, accessToken: session.tokens.access })
      ).toISOString();
    for (const [index, step] of journey.steps.entries()) {
      const nn = String(index + 1).padStart(2, '0');
      const events = watchPage(page);
      let error = null;
      try {
        await runStep(page, journey, step);
      } catch (cause) {
        error = String(cause.message ?? cause).split('\n')[0];
      }
      const file = path.join(SCREENS_DIR, `${journey.id}-${nn}-${viewportName}.png`);
      const bytes = await capture(page, file);
      page.removeAllListeners('response');
      page.removeAllListeners('console');
      page.removeAllListeners('pageerror');
      log.steps.push({
        nn,
        name: step.name,
        path: step.path ?? null,
        landedOn: new URL(page.url()).pathname + new URL(page.url()).search,
        screenshot: path.basename(file),
        kb: Math.round(bytes / 1024),
        error,
        events,
      });
      console.log(
        `  ${nn} ${step.name} → ${log.steps.at(-1).landedOn}${error ? `  ✗ ${error}` : ''}`,
      );
    }
  } finally {
    await session.close();
  }
  return log;
}

async function runJourney(browser, journey, viewports) {
  console.log(`${journey.id}: ${journey.title}`);
  const logs = [];
  for (const viewportName of journey.viewports ?? viewports) {
    console.log(` [${viewportName}]`);
    logs.push(await runViewport(browser, journey, viewportName));
  }
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(
    path.join(LOG_DIR, `${journey.id}.json`),
    `${JSON.stringify({ id: journey.id, title: journey.title, role: journey.role, runs: logs }, null, 2)}\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list || args.names.length === 0) {
    for (const j of journeys)
      console.log(`${j.id.padEnd(24)} ${j.role ?? '(signed out)'}  ${j.title}`);
    return;
  }
  const selected = args.names.map((name) => {
    const found = journeys.find((j) => j.id === name);
    if (!found) throw new Error(`Unknown journey ${name}. Try --list.`);
    return found;
  });
  const browser = await launch();
  try {
    for (const journey of selected) await runJourney(browser, journey, args.viewports);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
