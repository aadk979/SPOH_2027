import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { source as axe } from 'axe-core';
import {
  CategoryActivityResponse,
  CategoryScheduleResponse,
  CreateCategoryScheduleRequest,
  CreateRegistrationResponse,
  MeResponse,
  zonedWallTime,
} from '@spoh/shared';
import { categoryScheduleOrigins, localCategoryScheduleApi } from './categoryScheduleApi';

type Attempt = { body: CreateCategoryScheduleRequest; id?: string };
type OwnedRegistration = { key: string; personId: string; stationId: string; id?: string };

function databaseUrl() {
  const value = process.env.E2E_DATABASE_URL;
  const url = new URL(value ?? 'about:blank');
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== 'localhost' ||
    url.port !== '5435' ||
    url.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated rehearsal category browser database required');
  return value!;
}

async function monitor(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
  page.on('response', (response) => {
    if (
      (response.status() === 429 || response.status() >= 500) &&
      response.headers()['x-synthetic-receipt-loss'] !== '1'
    )
      errors.push(`HTTP_${response.status()}`);
    if (
      response.url().includes('/admin/capture-categories') &&
      response.request().method() !== 'OPTIONS' &&
      response.headers()['cache-control'] !== 'no-store'
    )
      errors.push('PRIVATE_CATEGORY_CACHE');
  });
  await page.exposeBinding('__categoryScheduleCsp', (_source, directive: string) =>
    errors.push(`CSP_${directive}`),
  );
  await page.addInitScript(() =>
    addEventListener(
      'securitypolicyviolation',
      (event) =>
        void (
          globalThis as unknown as { __categoryScheduleCsp: (value: string) => void }
        ).__categoryScheduleCsp(event.effectiveDirective),
    ),
  );
  return errors;
}

async function signIn(page: Page, email: 'admin@spoh2027.test' | 'booth@spoh2027.test') {
  const sent = page.waitForRequest(
    (request) => request.url().endsWith('/me') && !!request.headers().authorization,
  );
  const received = page.waitForResponse(
    (response) => response.url().endsWith('/me') && response.status() === 200,
  );
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/home');
  const base = (await sent).url().slice(0, -3);
  const origins = categoryScheduleOrigins(new URL(page.url()).origin);
  expect(new URL(base).origin).toBe(origins.apiOrigin);
  const me = MeResponse.parse(await (await received).json());
  expect(me.event.status).toBe('REHEARSAL');
  expect(decodeURIComponent(new URL(base).pathname.split('/').at(-1)!)).toBe(me.event.id);
  return { base, me, origins };
}

async function allPages(page: Page) {
  const reload = page.getByRole('button', { name: 'Reload category schedules', exact: true });
  await expect(reload).toBeEnabled();
  const more = page.getByRole('button', { name: 'Load more category schedules', exact: true });
  for (let count = 0; count < 50 && (await more.count()); count++) {
    await more.click();
    await expect(reload).toBeEnabled();
  }
  await expect(more).toHaveCount(0);
}

async function openPanel(page: Page, categoryId: string) {
  await page.getByRole('button', { name: 'Category schedules', exact: true }).click();
  const reload = page.getByRole('button', { name: 'Reload capture categories', exact: true });
  await expect(reload).toBeEnabled();
  const more = page.getByRole('button', { name: 'Load more capture categories', exact: true });
  for (let count = 0; count < 50 && (await more.count()); count++) {
    await more.click();
    await expect(reload).toBeEnabled();
  }
  await expect(more).toHaveCount(0);
  await page.getByLabel('Capture category', { exact: true }).selectOption(categoryId);
  await allPages(page);
}

async function fixture(page: Page) {
  const connectionString = databaseUrl();
  categoryScheduleOrigins(new URL(process.env.E2E_BASE_URL ?? 'about:blank').origin);
  const errors = await monitor(page);
  const signed = await signIn(page, 'admin@spoh2027.test');
  const api = await localCategoryScheduleApi({
    clientOrigin: signed.origins.clientOrigin,
    email: 'admin@spoh2027.test',
  });
  const db = new pg.Client({ connectionString });
  try {
    await db.connect();
    const category = (
      await db.query<{ id: string }>(
        'SELECT id FROM "CaptureCategory" WHERE "eventId"=$1 AND code=$2 AND active',
        [signed.me.event.id, 'SEC_4'],
      )
    ).rows[0];
    expect(category).toBeTruthy();
    const endpoint = `${signed.base}/admin/capture-categories/${category!.id}`;
    const read = async () => {
      const response = await api.get(endpoint);
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toBe('no-store');
      const current = CategoryActivityResponse.parse(await response.json());
      expect(current.eventId).toBe(signed.me.event.id);
      expect(current.eventStatus).toBe('REHEARSAL');
      expect(current.data.id).toBe(category!.id);
      return current;
    };
    const original = (await read()).data;
    expect(original.active).toBe(true);
    await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
    await openPanel(page, category!.id);
    return {
      page,
      api,
      db,
      ...signed,
      endpoint,
      original,
      read,
      errors,
      reason: `Owned category browser schedule ${randomUUID()}`,
      attempts: [] as Attempt[],
      registrations: [] as OwnedRegistration[],
    };
  } catch (error) {
    try {
      await api.dispose();
    } finally {
      await db.end();
    }
    throw error;
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function recordCreates(input: Fixture, loseFirstReceipt = false) {
  const bodies: string[] = [];
  await input.page.route(`${input.endpoint}/schedules`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const text = route.request().postData()!;
    const body = CreateCategoryScheduleRequest.parse(route.request().postDataJSON());
    bodies.push(text);
    let attempt = input.attempts.find((row) => row.body.idempotencyKey === body.idempotencyKey);
    if (!attempt) {
      attempt = { body };
      input.attempts.push(attempt);
    }
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    expect(response.headers()['cache-control']).toBe('no-store');
    const receipt = CategoryScheduleResponse.parse(await response.json());
    expect(receipt.schedule.createdByYou).toBe(true);
    expect(receipt.schedule.categoryId).toBe(input.original.id);
    attempt.id = receipt.schedule.id;
    if (loseFirstReceipt && bodies.length === 1) {
      const headers: Record<string, string> = {
        ...response.headers(),
        'x-synthetic-receipt-loss': '1',
        'access-control-allow-origin': input.origins.clientOrigin,
        'access-control-allow-credentials': 'true',
      };
      delete headers['content-length'];
      delete headers['content-encoding'];
      await route.fulfill({
        status: 503,
        headers,
        json: {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Synthetic lost committed response',
            requestId: randomUUID(),
          },
        },
      });
    } else await route.fulfill({ response });
  });
  return bodies;
}

async function review(input: Fixture, reason: string, proposal?: { active: boolean; runAt: Date }) {
  if (proposal) {
    await input.page
      .getByRole('group', { name: 'Scheduled category state' })
      .getByText(proposal.active ? 'Active' : 'Inactive', { exact: true })
      .click();
    await input.page
      .getByLabel(`Change category at (${input.me.event.timezone})`)
      .fill(zonedWallTime(proposal.runAt, input.me.event.timezone));
  }
  await input.page.getByLabel('Reason for category schedule').fill(reason);
  await input.page
    .getByRole('checkbox', { name: 'I have reviewed the current category, schedule and effects' })
    .check();
}

async function accessibility(page: Page) {
  await page.evaluate(axe);
  const violations = await page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run: (node: Document, options: object) => Promise<{ violations: { id: string }[] }>;
          };
        }
      ).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    ).violations.map((row) => row.id),
  );
  expect(violations).toEqual([]);
}

async function readOwned(input: Fixture, attempt: Attempt) {
  if (!attempt.id) {
    const replay = await input.api.post(`${input.endpoint}/schedules`, { data: attempt.body });
    expect(replay.status()).toBe(201);
    attempt.id = CategoryScheduleResponse.parse(await replay.json()).schedule.id;
  }
  const response = await input.api.get(`${input.endpoint}/schedules/${attempt.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const current = CategoryScheduleResponse.parse(await response.json());
  expect(current.schedule.createdByYou).toBe(true);
  expect(current.schedule.eventId).toBe(input.me.event.id);
  expect(current.schedule.categoryId).toBe(input.original.id);
  expect(current.schedule.id).toBe(attempt.id);
  return current;
}

async function settleOwned(input: Fixture, attempt: Attempt) {
  for (let retry = 0; retry < 3; retry++) {
    let current = await readOwned(input, attempt);
    if (current.schedule.status === 'RUNNING') {
      await expect
        .poll(
          async () => {
            current = await readOwned(input, attempt);
            return current.schedule.status;
          },
          { timeout: 120_000, intervals: [2000, 3000] },
        )
        .not.toBe('RUNNING');
    }
    if (current.schedule.status !== 'PENDING') {
      expect(['CANCELLED', 'SUCCEEDED', 'FAILED', 'DEAD']).toContain(current.schedule.status);
      return;
    }
    const cancelled = await input.api.post(`${input.endpoint}/schedules/${attempt.id}/cancel`, {
      data: {
        expectedScheduleVersion: current.schedule.version,
        reason: 'Cancel only the owned category browser schedule',
        idempotencyKey: randomUUID(),
      },
    });
    // A worker can claim the pending action between the read and CAS. Re-read owned state;
    // never force cancellation or edit scheduler rows after that legitimate conflict.
    if (cancelled.status() === 409) continue;
    expect(cancelled.status()).toBe(200);
    expect(cancelled.headers()['cache-control']).toBe('no-store');
    expect(CategoryScheduleResponse.parse(await cancelled.json()).schedule.status).toBe(
      'CANCELLED',
    );
    return;
  }
  throw new Error('Owned category cancellation needs review after repeated CAS conflicts');
}

async function waitSucceeded(input: Fixture, attempt: Attempt) {
  await expect
    .poll(async () => (await readOwned(input, attempt)).schedule.status, {
      timeout: 240_000,
      intervals: [2000, 3000],
    })
    .toBe('SUCCEEDED');
}

async function restoreActivity(input: Fixture) {
  const current = await input.read();
  const {
    active: _currentActive,
    updatedAt: _currentUpdatedAt,
    ...currentDefinition
  } = current.data;
  const {
    active: _originalActive,
    updatedAt: _originalUpdatedAt,
    ...originalDefinition
  } = input.original;
  expect(currentDefinition).toEqual(originalDefinition);
  if (
    current.data.updatedAt !== input.original.updatedAt ||
    current.data.active !== input.original.active
  ) {
    const latest = (
      await input.db.query<{ scheduledActionId: string; source: string }>(
        'SELECT "scheduledActionId",source FROM "AuditLog" WHERE "eventId"=$1 AND "entityType"=\'CaptureCategory\' AND "entityId"=$2 AND action=\'category.setActive\' AND outcome=\'SUCCESS\' ORDER BY "createdAt" DESC,id DESC LIMIT 1',
        [input.me.event.id, input.original.id],
      )
    ).rows[0];
    expect(latest?.source).toBe('SCHEDULE');
    const owned = input.attempts.find((attempt) => attempt.id === latest?.scheduledActionId);
    expect(owned).toBeDefined();
    const completed = await readOwned(input, owned!);
    expect(completed.schedule.status).toBe('SUCCEEDED');
    expect(completed.schedule.active).toBe(current.data.active);
    expect(completed.schedule.completedAt).toBe(current.data.updatedAt);
  }
  if (current.data.active !== input.original.active) {
    const attempt: Attempt = {
      body: {
        active: input.original.active,
        expectedActive: current.data.active,
        expectedUpdatedAt: current.data.updatedAt,
        reason: 'Restore only the owned category browser activity',
        runAt: new Date(Date.now() + 15_000).toISOString(),
        idempotencyKey: randomUUID(),
      },
    };
    input.attempts.push(attempt);
    const restored = await input.api.post(`${input.endpoint}/schedules`, { data: attempt.body });
    expect(restored.status()).toBe(201);
    attempt.id = CategoryScheduleResponse.parse(await restored.json()).schedule.id;
    await waitSucceeded(input, attempt);
  }
  const restored = (await input.read()).data;
  expect(restored.active).toBe(input.original.active);
  const {
    active: _restoredActive,
    updatedAt: _restoredUpdatedAt,
    ...restoredDefinition
  } = restored;
  expect(restoredDefinition).toEqual(originalDefinition);
}

async function undoRegistrations(input: Fixture) {
  for (const owned of input.registrations) {
    const rows = (
      await input.db.query<{ id: string; voided: boolean }>(
        'SELECT id,voided FROM "Registration" WHERE "eventId"=$1 AND "idempotencyKey"=$2 AND "recordedById"=$3 AND "stationId"=$4 AND "categoryId"=$5 AND rehearsal',
        [input.me.event.id, owned.key, owned.personId, owned.stationId, input.original.id],
      )
    ).rows;
    expect(rows.length).toBeLessThanOrEqual(1);
    if (!rows.length) {
      expect(owned.id).toBeUndefined();
      continue;
    }
    if (owned.id) expect(rows[0]!.id).toBe(owned.id);
    if (!rows[0]!.voided) {
      const result = await input.api.post(`${input.base}/registrations/${rows[0]!.id}/void`, {
        data: { reason: 'Undo only the proven owned rehearsal browser registration' },
      });
      expect(result.status()).toBe(204);
    }
    expect(
      (
        await input.db.query<{ voided: boolean }>(
          'SELECT voided FROM "Registration" WHERE "eventId"=$1 AND id=$2 AND "idempotencyKey"=$3 AND "recordedById"=$4 AND rehearsal',
          [input.me.event.id, rows[0]!.id, owned.key, owned.personId],
        )
      ).rows[0]?.voided,
    ).toBe(true);
  }
}

async function cleanup(input: Fixture) {
  const failures: unknown[] = [];
  let unsettled = false;
  try {
    try {
      await input.page.unroute(`${input.endpoint}/schedules`);
    } catch (error) {
      failures.push(error);
    }
    for (const attempt of input.attempts) {
      try {
        await settleOwned(input, attempt);
      } catch (error) {
        unsettled = true;
        failures.push(error);
      }
    }
    if (!unsettled) {
      try {
        await restoreActivity(input);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await undoRegistrations(input);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length)
      throw new AggregateError(failures, 'Owned category browser cleanup incomplete');
  } finally {
    try {
      await input.api.dispose();
    } finally {
      await input.db.end();
    }
  }
}

async function createFuture(input: Fixture, active: boolean, reason: string) {
  const count = input.attempts.length;
  await input.page.getByRole('button', { name: 'Review future category change' }).click();
  // Leave a full two minutes after minute rounding and UI review, rather than racing due time.
  await review(input, reason, {
    active,
    runAt: new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 120_000),
  });
  await accessibility(input.page);
  await input.page.getByRole('button', { name: 'Confirm category schedule' }).click();
  await expect(input.page.getByText(/Category schedule request confirmed/)).toBeVisible();
  expect(input.attempts).toHaveLength(count + 1);
  const attempt = input.attempts.at(-1)!;
  expect(attempt.id).toBeTruthy();
  expect(attempt.body.active).toBe(active);
  await input.page.getByRole('button', { name: 'Back to category schedules' }).click();
  return attempt;
}

async function completedHistory(input: Fixture, attempt: Attempt, active: boolean) {
  await input.page.reload();
  await openPanel(input.page, input.original.id);
  const row = input.page
    .getByRole('group', {
      name: `${active ? 'Active' : 'Inactive'} category schedule`,
      exact: true,
    })
    .filter({ hasText: attempt.body.reason });
  await expect(row).toContainText('Succeeded');
  await expect(row.getByRole('button', { name: 'Edit category schedule' })).toHaveCount(0);
  expect((await input.read()).data.active).toBe(active);
  const audit = await input.db.query(
    'SELECT id FROM "AuditLog" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=\'SCHEDULE\' AND action=\'category.setActive\' AND "entityType"=\'CaptureCategory\' AND "entityId"=$3',
    [input.me.event.id, attempt.id, input.original.id],
  );
  expect(audit.rowCount).toBe(1);
}

for (const [device, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(`category scheduling controls (${device})`, () => {
    test.use({
      viewport: { width, height },
      isMobile: device === 'phone',
      hasTouch: device === 'phone',
    });

    test('retries the identical lost receipt, edits and cancels its owned schedule', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const input = await fixture(page);
      try {
        const bodies = await recordCreates(input, true);
        await page.getByRole('button', { name: 'Review future category change' }).click();
        await review(input, input.reason, {
          active: false,
          runAt: new Date(Date.now() + 20 * 60_000),
        });
        await accessibility(page);
        await page.getByRole('button', { name: 'Confirm category schedule' }).click();
        await expect(
          page.getByRole('button', { name: 'Retry same category schedule request' }),
        ).toBeVisible();
        await expect(page.getByLabel('Capture category', { exact: true })).toBeDisabled();
        await expect(
          page.getByRole('button', { name: 'Category schedules', exact: true }),
        ).toBeDisabled();
        await expect(page.getByLabel('Reason for category schedule')).toBeDisabled();
        await page.getByRole('button', { name: 'Retry same category schedule request' }).click();
        await expect(page.getByText(/Category schedule request confirmed/)).toBeVisible();
        expect(bodies).toHaveLength(2);
        expect(bodies[1]).toBe(bodies[0]);
        expect(input.attempts).toHaveLength(1);
        expect((await readOwned(input, input.attempts[0]!)).schedule.version).toBe(1);
        await page.getByRole('button', { name: 'Back to category schedules' }).click();
        await page
          .getByRole('group', { name: 'Inactive category schedule', exact: true })
          .filter({ hasText: input.reason })
          .getByRole('button', { name: 'Edit category schedule' })
          .click();
        await review(input, `${input.reason} edited`, {
          active: true,
          runAt: new Date(Date.now() + 40 * 60_000),
        });
        await page.getByRole('button', { name: 'Confirm category schedule' }).click();
        await expect(page.getByText(/Version 2\./)).toBeVisible();
        await page.getByRole('button', { name: 'Back to category schedules' }).click();
        await page
          .getByRole('group', { name: 'Active category schedule', exact: true })
          .filter({ hasText: `${input.reason} edited` })
          .getByRole('button', { name: 'Cancel category schedule' })
          .click();
        await review(input, `${input.reason} cancelled`);
        await accessibility(page);
        await page.getByRole('button', { name: 'Confirm category schedule' }).click();
        await expect(page.getByText(/Current status: Cancelled · Version 3/)).toBeVisible();
        const current = await readOwned(input, input.attempts[0]!);
        expect(current.schedule.status).toBe('CANCELLED');
        expect(current.schedule.version).toBe(3);
        expect(current.schedule.active).toBe(true);
        expect((await input.read()).data).toEqual(input.original);
        await page.reload();
        await openPanel(page, input.original.id);
        await expect(
          page
            .getByRole('group', { name: 'Active category schedule', exact: true })
            .filter({ hasText: `${input.reason} edited` }),
        ).toContainText('Cancelled');
        await accessibility(page);
        expect(input.errors).toEqual([]);
      } finally {
        await cleanup(input);
      }
    });

    test('UI schedules run on the worker, hide and restore the open booth category', async ({
      page,
      browser,
    }) => {
      test.setTimeout(660_000);
      const input = await fixture(page);
      let boothContext: BrowserContext | undefined;
      let boothApi: Awaited<ReturnType<typeof localCategoryScheduleApi>> | undefined;
      try {
        await recordCreates(input);
        boothContext = await browser.newContext({
          baseURL: input.origins.clientOrigin,
          viewport: { width, height },
          isMobile: device === 'phone',
          hasTouch: device === 'phone',
        });
        const booth = await boothContext.newPage();
        const errors = await monitor(booth);
        boothApi = await localCategoryScheduleApi({
          clientOrigin: input.origins.clientOrigin,
          email: 'booth@spoh2027.test',
        });
        const signed = await signIn(booth, 'booth@spoh2027.test');
        expect(signed.me.event.id).toBe(input.me.event.id);
        expect(signed.me.currentAssignment).not.toBeNull();
        const stationId = signed.me.currentAssignment!.station.id;
        await booth.getByRole('link', { name: /Register a visitor/ }).click();
        await booth.waitForURL('**/capture/registration');
        const button = booth.getByRole('button', { name: input.original.label, exact: true });
        await expect(button).toBeVisible();
        await expect(booth.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible();
        await accessibility(booth);
        const inactive = await createFuture(input, false, `${input.reason} inactive`);
        expect(inactive.body.expectedActive).toBe(true);
        await waitSucceeded(input, inactive);
        await completedHistory(input, inactive, false);
        await expect(button).toHaveCount(0, { timeout: 45_000 });
        const refused = await boothApi.post(`${input.base}/registrations`, {
          data: { stationId, category: input.original.code, idempotencyKey: randomUUID() },
        });
        expect(refused.status()).toBe(409);
        expect((await refused.json()).error.message).toContain('category');
        await expect(
          page
            .getByLabel('Capture category', { exact: true })
            .locator(`option[value="${input.original.id}"]`),
        ).toContainText('Inactive');
        const fresh = await input.read();
        const active = await createFuture(input, true, `${input.reason} active`);
        expect(active.body.expectedActive).toBe(false);
        expect(active.body.expectedUpdatedAt).toBe(fresh.data.updatedAt);
        await waitSucceeded(input, active);
        await completedHistory(input, active, true);
        await expect(button).toBeVisible({ timeout: 45_000 });
        const owned: OwnedRegistration = {
          key: randomUUID(),
          stationId,
          personId: signed.me.volunteer.id,
        };
        input.registrations.push(owned);
        const resumed = await boothApi.post(`${input.base}/registrations`, {
          data: { stationId, category: input.original.code, idempotencyKey: owned.key },
        });
        expect(resumed.status()).toBe(201);
        const registration = CreateRegistrationResponse.parse(await resumed.json()).registration;
        owned.id = registration.id;
        expect(registration.stationId).toBe(stationId);
        expect(registration.category).toBe(input.original.code);
        const replay = await input.api.post(`${input.endpoint}/schedules`, { data: inactive.body });
        expect(replay.status()).toBe(201);
        const replayed = CategoryScheduleResponse.parse(await replay.json());
        expect(replayed.schedule.id).toBe(inactive.id);
        expect(replayed.schedule.status).toBe('SUCCEEDED');
        expect(replayed.current.data.active).toBe(true);
        await accessibility(page);
        await accessibility(booth);
        expect(input.errors).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        try {
          await boothApi?.dispose();
        } finally {
          try {
            await boothContext?.close();
          } finally {
            await cleanup(input);
          }
        }
      }
    });
  });
}
