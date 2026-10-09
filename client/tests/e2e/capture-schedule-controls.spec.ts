import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';
import {
  CaptureScheduleResponse,
  ScopedSettingsReadResponse,
  ScopedSettingsMutationResponse,
  zonedWallTime,
  type CreateCaptureScheduleRequest,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { source as axe } from 'axe-core';
import { localCaptureScheduleApi } from './captureScheduleApi';

async function fixture(page: Page, scope: 'event' | 'station') {
  const value = process.env.E2E_DATABASE_URL;
  const database = new URL(value ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated rehearsal browser database required');
  const db = new pg.Client({ connectionString: value });
  await db.connect();
  const meRequest = page.waitForRequest(
    (request) => request.url().endsWith('/me') && !!request.headers().authorization,
  );
  const meResponse = page.waitForResponse(
    (response) => response.url().endsWith('/me') && response.status() === 200,
  );
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill('admin@spoh2027.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/home');
  const request = await meRequest;
  const me = await (await meResponse).json();
  const base = request.url().slice(0, -3);
  const url = new URL(base);
  if (url.hostname !== 'localhost' || url.port !== '4012')
    throw new Error('Dedicated fixture API required');
  const eventId = decodeURIComponent(url.pathname.split('/').at(-1)!);
  const station = (
    await db.query<{ id: string }>(
      'SELECT s.id FROM "Station" s JOIN "StationType" t ON t.id=s."typeId" AND t."eventId"=s."eventId" WHERE s."eventId"=$1 AND s.active AND t."registersVisitors" AND NOT EXISTS (SELECT 1 FROM "Setting" c WHERE c."eventId"=s."eventId" AND c.scope=\'STATION\' AND c."scopeId"=s.id AND c.key=\'capture.open\') ORDER BY s.id LIMIT 1',
      [eventId],
    )
  ).rows[0]!;
  expect(station).toBeTruthy();
  const target: ScopedSettingsTarget =
    scope === 'event' ? { scope } : { scope, stationId: station.id };
  const headers = { Authorization: request.headers().authorization! };
  const api = await localCaptureScheduleApi(url.origin);
  const endpoint = `${base}/admin/settings/catalogue`;
  const params = new URLSearchParams({
    scope,
    ...(scope === 'station' ? { stationId: station.id } : {}),
  });
  const read = async () => {
    const response = await api.get(`${endpoint}?${params}`);
    expect(response.status()).toBe(200);
    return ScopedSettingsReadResponse.parse(await response.json());
  };
  const original = await read();
  expect(original.eventStatus).toBe('REHEARSAL');
  const originalRow = original.data.find((row) => row.key === 'capture.open')!;
  expect(originalRow.storedVersion).toBe(0);
  expect(originalRow.value).toBe(true);
  const reason = `Disposable capture schedule ${randomUUID()}`;
  const attempts: { body: CreateCaptureScheduleRequest; id?: string }[] = [];
  await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
  await page.getByRole('button', { name: 'Capture controls', exact: true }).click();
  if (scope === 'station') await page.getByLabel('Capture scope').selectOption(station.id);
  await page.getByRole('button', { name: 'Capture schedules', exact: true }).click();
  await allPages(page);
  return {
    page,
    api,
    db,
    eventId,
    base,
    endpoint,
    headers,
    target,
    original,
    originalRow,
    reason,
    attempts,
    read,
    timezone: me.event.timezone as string,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function allPages(page: Page) {
  const reload = page.getByRole('button', { name: 'Reload capture schedules' });
  await expect(reload).toBeEnabled();
  const more = page.getByRole('button', { name: 'Load more capture schedules' });
  for (let count = 0; count < 50 && (await more.count()); count++) {
    // The page this click asks for says whether another follows, so the next step waits for
    // the button to settle on that answer rather than racing the render that removes it.
    const requested = page.waitForRequest(
      (request) =>
        request.method() === 'GET' &&
        request.url().includes('/schedules?') &&
        new URL(request.url()).searchParams.has('cursor'),
    );
    await more.click();
    const response = await (await requested).response();
    const { meta } = (await response!.json()) as { meta: { nextCursor: string | null } };
    if (meta.nextCursor) await expect(more).toBeEnabled();
    else await expect(more).toHaveCount(0);
  }
  await expect(reload).toBeEnabled();
  await expect(more).toHaveCount(0);
}
async function review(page: Page, timezone: string, input: { reason: string; runAt?: Date }) {
  if (input.runAt)
    await page
      .getByLabel(`Change capture at (${timezone})`)
      .fill(zonedWallTime(input.runAt, timezone));
  await page.getByLabel('Reason for capture schedule').fill(input.reason);
  await page
    .getByRole('checkbox', {
      name: 'I have reviewed the current capture value, schedule and effects',
    })
    .check();
}
async function stopOwned(input: Fixture) {
  try {
    for (const attempt of input.attempts) {
      if (!attempt.id) {
        const replay = await input.api.post(`${input.endpoint}/schedules`, { data: attempt.body });
        expect(replay.status()).toBe(201);
        attempt.id = CaptureScheduleResponse.parse(await replay.json()).schedule.id;
      }
      const response = await input.api.get(`${input.endpoint}/schedules/${attempt.id}`);
      expect(response.status()).toBe(200);
      const current = CaptureScheduleResponse.parse(await response.json());
      expect(current.schedule.createdByYou).toBe(true);
      expect(current.schedule.target).toEqual(input.target);
      if (current.schedule.status === 'PENDING') {
        const stopped = await input.api.post(`${input.endpoint}/schedules/${attempt.id}/cancel`, {
          data: {
            expectedScheduleVersion: current.schedule.version,
            reason: 'Cancel disposable owned browser schedule',
            idempotencyKey: randomUUID(),
          },
        });
        expect(stopped.status()).toBe(200);
        expect(CaptureScheduleResponse.parse(await stopped.json()).schedule.status).toBe(
          'CANCELLED',
        );
      } else
        expect(['CANCELLED', 'SUCCEEDED', 'FAILED', 'DEAD']).toContain(current.schedule.status);
    }
    const latest = await input.read();
    const row = latest.data.find((row) => row.key === 'capture.open')!;
    if (row.storedVersion !== input.originalRow.storedVersion) {
      const change = (
        await input.db.query<{ scheduledActionId: string; source: string }>(
          'SELECT "scheduledActionId",source FROM "SettingChange" WHERE "eventId"=$1 AND scope=$2 AND "scopeId"=$3 AND key=\'capture.open\' AND version=$4',
          [
            input.eventId,
            input.target.scope.toUpperCase(),
            input.target.scope === 'event' ? input.eventId : input.target.stationId,
            row.storedVersion,
          ],
        )
      ).rows[0];
      expect(change?.source).toBe('SCHEDULE');
      expect(input.attempts.map((attempt) => attempt.id)).toContain(change?.scheduledActionId);
      const restored = await input.api.post(input.endpoint, {
        data: {
          target: input.target,
          key: 'capture.open',
          operation: 'reset',
          expectedVersion: row.storedVersion,
          reason: 'Restore owned scheduled browser capture inheritance',
          idempotencyKey: randomUUID(),
        },
      });
      expect(restored.status()).toBe(200);
      ScopedSettingsMutationResponse.parse(await restored.json());
    }
    expect((await input.read()).data).toEqual(input.original.data);
  } finally {
    try {
      await input.api.dispose();
    } finally {
      await input.db.end();
    }
  }
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

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  for (const scope of ['event', 'station'] as const) {
    test(`capture schedule lost response, edit and cancellation (${name}, ${scope})`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      const input = await fixture(page, scope);
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
      let lost = false;
      await page.route(`${input.endpoint}/schedules`, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const body = route.request().postDataJSON() as CreateCaptureScheduleRequest;
        const attempt = input.attempts.find(
          (attempt) => attempt.body.idempotencyKey === body.idempotencyKey,
        ) ?? { body };
        if (!input.attempts.includes(attempt)) input.attempts.push(attempt);
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        attempt.id = CaptureScheduleResponse.parse(await response.json()).schedule.id;
        if (!lost) {
          lost = true;
          await route.fulfill({
            status: 503,
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
      try {
        await page.getByRole('button', { name: 'Review future capture change' }).click();
        await review(page, input.timezone, {
          reason: input.reason,
          runAt: new Date(Date.now() + 20 * 60_000),
        });
        await accessibility(page);
        await page.getByRole('button', { name: 'Confirm capture schedule' }).click();
        await expect(
          page.getByRole('button', { name: 'Retry same schedule request' }),
        ).toBeVisible();
        await expect(page.getByLabel('Capture scope')).toBeDisabled();
        await expect(
          page.getByRole('button', { name: 'Capture controls', exact: true }),
        ).toBeDisabled();
        await expect(page.getByLabel('Reason for capture schedule')).toBeDisabled();
        await page.getByRole('button', { name: 'Retry same schedule request' }).click();
        await expect(page.getByText(/Schedule request confirmed/)).toBeVisible();
        expect(input.attempts).toHaveLength(1);
        await page.getByRole('button', { name: 'Back to capture schedules' }).click();
        const row = page
          .getByRole('group', { name: 'Paused capture schedule' })
          .filter({ hasText: input.reason });
        await row.getByRole('button', { name: 'Edit capture schedule' }).click();
        await page
          .getByRole('group', { name: 'Future capture value' })
          .getByText('Open', { exact: true })
          .click();
        await review(page, input.timezone, {
          reason: `${input.reason} edited`,
          runAt: new Date(Date.now() + 40 * 60_000),
        });
        await page.getByRole('button', { name: 'Confirm capture schedule' }).click();
        await expect(page.getByText(/Version 2\./)).toBeVisible();
        await page.getByRole('button', { name: 'Back to capture schedules' }).click();
        await page
          .getByRole('group', { name: 'Open capture schedule' })
          .filter({ hasText: `${input.reason} edited` })
          .getByRole('button', { name: 'Cancel capture schedule' })
          .click();
        await review(page, input.timezone, { reason: `${input.reason} cancelled` });
        await accessibility(page);
        await page.getByRole('button', { name: 'Confirm capture schedule' }).click();
        await expect(page.getByText(/Current status: Cancelled · Version 3/)).toBeVisible();
        expect((await input.read()).data).toEqual(input.original.data);
        await page.reload();
        await page.getByRole('button', { name: 'Capture controls', exact: true }).click();
        if (scope === 'station')
          await page
            .getByLabel('Capture scope')
            .selectOption(input.target.scope === 'station' ? input.target.stationId : 'event');
        await page.getByRole('button', { name: 'Capture schedules', exact: true }).click();
        await allPages(page);
        await expect(
          page
            .getByRole('group', { name: 'Open capture schedule' })
            .filter({ hasText: `${input.reason} edited` }),
        ).toContainText('Cancelled');
        expect(errors).toEqual([]);
      } finally {
        try {
          await page.unroute(`${input.endpoint}/schedules`);
        } finally {
          await stopOwned(input);
        }
      }
    });
  }
}

for (const [name, scope, width, height] of [
  ['phone', 'event', 390, 844],
  ['laptop', 'station', 1440, 900],
] as const) {
  test(`UI producer and real worker pause captures (${name}, ${scope})`, async ({ page }) => {
    // Cleanup may wait out the shared admin rate-limit window (captureScheduleApi).
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    const input = await fixture(page, scope);
    try {
      await page.getByRole('button', { name: 'Review future capture change' }).click();
      await review(page, input.timezone, {
        reason: input.reason,
        runAt: new Date(Date.now() + 70_000),
      });
      const sent = page.waitForRequest(
        (request) => request.url() === `${input.endpoint}/schedules` && request.method() === 'POST',
      );
      const created = page.waitForResponse(
        (response) =>
          response.url() === `${input.endpoint}/schedules` &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Confirm capture schedule' }).click();
      const attempt = {
        body: (await sent).postDataJSON() as CreateCaptureScheduleRequest,
        id: undefined as string | undefined,
      };
      input.attempts.push(attempt);
      const response = await created;
      expect(response.status()).toBe(201);
      attempt.id = CaptureScheduleResponse.parse(await response.json()).schedule.id;
      await page.getByRole('button', { name: 'Back to capture schedules' }).click();
      await expect
        .poll(
          async () => {
            const result = await input.api.get(`${input.endpoint}/schedules/${attempt.id}`);
            return CaptureScheduleResponse.parse(await result.json()).schedule.status;
          },
          { timeout: 90_000, intervals: [1000, 2000, 3000] },
        )
        .toBe('SUCCEEDED');
      await page.getByRole('button', { name: 'Reload capture schedules' }).click();
      await expect(
        page
          .getByRole('group', { name: 'Paused capture schedule' })
          .filter({ hasText: input.reason }),
      ).toContainText('Succeeded');
      const current = await input.read();
      expect(current.data.find((row) => row.key === 'capture.open')!.value).toBe(false);
      const station =
        input.target.scope === 'station'
          ? input.target.stationId
          : (
              await input.db.query<{ id: string }>(
                'SELECT s.id FROM "Station" s JOIN "StationType" t ON t.id=s."typeId" AND t."eventId"=s."eventId" WHERE s."eventId"=$1 AND s.active AND t."registersVisitors" AND NOT EXISTS (SELECT 1 FROM "Setting" c WHERE c."eventId"=s."eventId" AND c.scope=\'STATION\' AND c."scopeId"=s.id AND c.key=\'capture.open\') LIMIT 1',
                [input.eventId],
              )
            ).rows[0]!.id;
      const refused = await input.api.post(`${input.base}/registrations`, {
        data: { stationId: station, category: 'SEC_4', idempotencyKey: randomUUID() },
      });
      expect(refused.status()).toBe(409);
      expect((await refused.json()).error.message).toContain('paused');
      expect(
        (
          await input.db.query(
            'SELECT id FROM "SettingChange" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=\'SCHEDULE\'',
            [input.eventId, attempt.id],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await stopOwned(input);
    }
  });
}
