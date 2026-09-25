/* eslint-disable no-console -- a CLI helper; stdout is its interface */
/**
 * Journey harness helpers (P02.1): signed-in contexts per role, paced sign-in,
 * a frozen client clock inside a shift block, and compressed screenshots.
 *
 * Runs against the local dev server only (D-13). Never against staging.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');
export const STATE_DIR = path.join(here, '.state');
export const SCREENS_DIR = path.join(ROOT, 'remediation/findings/F02-screens');
export const LOG_DIR = path.join(ROOT, 'remediation/reports/P02/journeys');

export const BASE_URL = process.env.JOURNEY_BASE_URL ?? 'http://localhost:3000';
export const API_URL = process.env.JOURNEY_API_URL ?? 'http://localhost:4010';

export const VIEWPORTS = {
  phone: { ...devices['Pixel 7'] },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

/** Screenshots above this are re-encoded with fewer colours, then cropped. */
const MAX_BYTES = 300 * 1024;

/**
 * The sign-in endpoint allows 20 per minute per IP. Staying at half that leaves
 * room for the e2e suite or a person signing in by hand at the same time.
 */
const SIGN_INS_PER_MINUTE = 10;
const MIN_GAP_MS = 3_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertLocal() {
  for (const url of [BASE_URL, API_URL]) {
    const host = new URL(url).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(`Journeys run against the local dev server only (D-13), not ${host}`);
    }
  }
}

async function paceSignIn() {
  const file = path.join(STATE_DIR, 'sign-ins.json');
  const now = Date.now();
  const recent = existsSync(file)
    ? JSON.parse(await readFile(file, 'utf8')).filter((t) => now - t < 60_000)
    : [];
  const last = recent.at(-1) ?? 0;
  let wait = Math.max(0, last + MIN_GAP_MS - now);
  if (recent.length >= SIGN_INS_PER_MINUTE) wait = Math.max(wait, recent[0] + 60_000 - now);
  if (wait > 0) {
    console.log(`  pacing sign-in: waiting ${Math.ceil(wait / 1000)}s`);
    await sleep(wait);
  }
  recent.push(Date.now());
  await writeFile(file, JSON.stringify(recent));
}

async function signIn(page, email) {
  await paceSignIn();
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home', { timeout: 15_000 });
  console.log(`  signed in as ${email}`);
}

function stateFile(email, viewportName) {
  return path.join(STATE_DIR, `${email.split('@')[0]}-${viewportName}.json`);
}

/**
 * A browser context signed in as `email`.
 *
 * The refresh cookie rotates on every page load and a replayed one revokes the
 * whole session family, so each (role, viewport) keeps its own state file and
 * `close()` writes the latest cookie back. Sign-in happens only when that state
 * is missing or dead.
 */
export async function openSession(browser, { email, viewportName }) {
  assertLocal();
  await mkdir(STATE_DIR, { recursive: true });
  const file = stateFile(email, viewportName);
  const context = await browser.newContext({
    ...VIEWPORTS[viewportName],
    baseURL: BASE_URL,
    storageState: existsSync(file) ? file : undefined,
  });
  const page = await context.newPage();
  const tokens = { access: null };
  // Borrow the page's own access token instead of refreshing on the side: a
  // second refresh racing the page's one looks like token reuse and revokes
  // the whole session family.
  page.on('response', async (res) => {
    if (!/\/api\/v1\/(auth|dev-auth)\//.test(res.url()) || !res.ok()) return;
    const body = await res.json().catch(() => null);
    if (body?.accessToken) tokens.access = body.accessToken;
  });

  if (email) {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname.startsWith('/sign-in')) await signIn(page, email);
  }

  return {
    context,
    page,
    tokens,
    async close() {
      if (email) await context.storageState({ path: file });
      await context.close();
    },
  };
}

/** Minutes since local midnight for `HH:MM`. */
function toMinutes(wallClock) {
  const [h, m] = wallClock.split(':').map(Number);
  return h * 60 + m;
}

/**
 * The configured shift blocks, read through the signed-in context so a changed
 * `shiftBlocks` setting is honoured. Falls back to the compiled defaults when
 * the role cannot read settings.
 */
async function shiftBlocks(page, accessToken) {
  const fallback = {
    MORNING: { start: '09:30', end: '14:00' },
    AFTERNOON: { start: '13:30', end: '18:00' },
  };
  if (!accessToken) return fallback;
  const res = await page.context().request.get(`${API_URL}/api/v1/admin/settings`, {
    headers: { origin: BASE_URL, authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return fallback;
  return (await res.json()).settings?.shiftBlocks ?? fallback;
}

/**
 * Freeze the page clock an hour into a shift block, today, in the event's zone.
 *
 * This is the client half. The server half is `SHIFT_HOURS_ALWAYS_OPEN=true`
 * in the dev `.env`: server time cannot be frozen from a browser, so the server
 * keeps capture open and the client shows what a volunteer sees mid-shift.
 * The event zone is fixed at UTC+8 here because the product fixes it (F01 T-01).
 */
export async function freezeInShift(page, { block = 'MORNING', accessToken } = {}) {
  const blocks = await shiftBlocks(page, accessToken);
  const window = blocks[block];
  if (!window) throw new Error(`Unknown shift block ${block}`);
  const minute = Math.min(toMinutes(window.start) + 60, toMinutes(window.end) - 1);
  const todaySgt = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const utcMidnight = Date.parse(`${todaySgt}T00:00:00Z`) - 8 * 3_600_000;
  const at = new Date(utcMidnight + minute * 60_000);
  await page.clock.install({ time: at });
  return at;
}

/** A full-page screenshot, compressed to stay under 300 KB. */
export async function capture(page, file) {
  await mkdir(path.dirname(file), { recursive: true });
  const raw = await page.screenshot({ fullPage: true, scale: 'css', animations: 'disabled' });
  let image = sharp(raw);
  const { height } = await image.metadata();
  if (height > 6000)
    image = image.extract({ left: 0, top: 0, width: (await image.metadata()).width, height: 6000 });
  for (const colours of [128, 64, 32, 16]) {
    const out = await image
      .clone()
      .png({ palette: true, colours, compressionLevel: 9, effort: 10 })
      .toBuffer();
    if (out.length <= MAX_BYTES || colours === 16) {
      await writeFile(file, out);
      return out.length;
    }
  }
  return 0;
}

export async function launch() {
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/opt/pw-browsers/chromium',
  });
}
