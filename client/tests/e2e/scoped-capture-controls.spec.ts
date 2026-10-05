import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';
import {
  ScopedSettingsReadResponse,
  ScopedSettingsMutationResponse,
  ScopedSettingsRevertResponse,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { source as axe } from 'axe-core';

async function confirmChange(page: Page) {
  const review = page.getByRole('group', { name: 'Review capture change' });
  await expect(review.getByRole('button', { name: 'Apply capture change' })).toBeDisabled();
  await review
    .getByLabel('Reason for capture change')
    .fill('Reviewed disposable browser capture control');
  await review.getByRole('checkbox').check();
  return review;
}
async function checkAccessibility(page: Page) {
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
    ).violations.map(({ id }) => id),
  );
  expect(violations).toEqual([]);
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(`scoped capture controls (${name})`, () => {
    test.use({
      viewport: { width, height },
      isMobile: name === 'phone',
      hasTouch: name === 'phone',
    });
    for (const scope of ['event', 'station'] as const) {
      test(`reviews pause, reset and both historical restores at ${scope} scope`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        const value = process.env.E2E_DATABASE_URL;
        const database = new URL(value ?? 'about:blank');
        if (
          database.hostname !== 'localhost' ||
          database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
        )
          throw new Error('Dedicated local scoped capture browser database required');
        const db = new pg.Client({ connectionString: value });
        await db.connect();
        const errors: string[] = [];
        page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
        try {
          const meRequest = page.waitForRequest(
            (request) => request.url().endsWith('/me') && !!request.headers().authorization,
          );
          await page.goto('/sign-in');
          await page.getByLabel('Roster email').fill('admin@spoh2027.test');
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await page.waitForURL('**/home');
          const me = await meRequest;
          const base = me.url().slice(0, -3);
          if (new URL(base).hostname !== 'localhost' || new URL(base).port !== '4012')
            throw new Error('Dedicated local fixture API required');
          const eventId = decodeURIComponent(new URL(base).pathname.split('/').at(-1)!);
          const station = (
            await db.query<{ id: string }>(
              'SELECT s.id FROM "Station" s JOIN "StationType" t ON t.id=s."typeId" AND t."eventId"=s."eventId" WHERE s."eventId"=$1 AND s.active AND t."registersVisitors" AND ($2 <> \'event\' OR NOT EXISTS (SELECT 1 FROM "Setting" c WHERE c."eventId"=s."eventId" AND c.scope=\'STATION\' AND c."scopeId"=s.id AND c.key=\'capture.open\')) ORDER BY s.id LIMIT 1',
              [eventId, scope],
            )
          ).rows[0]!;
          expect(station).toBeTruthy();
          const target: ScopedSettingsTarget =
            scope === 'event' ? { scope } : { scope, stationId: station.id };
          const headers = { Authorization: me.headers().authorization! };
          const endpoint = `${base}/admin/settings/catalogue`;
          const params = new URLSearchParams({
            scope,
            ...(scope === 'station' ? { stationId: station.id } : {}),
          });
          const read = async () => {
            const response = await page.request.get(`${endpoint}?${params}`, { headers });
            expect(response.status()).toBe(200);
            return ScopedSettingsReadResponse.parse(await response.json());
          };
          const original = await read();
          expect(original.eventStatus).toBe('REHEARSAL');
          const originalRow = original.data.find(({ key }) => key === 'capture.open')!;
          const mutate = async (
            operation: 'set' | 'reset',
            expectedVersion: number,
            next?: boolean,
          ) => {
            const response = await page.request.post(endpoint, {
              headers,
              data: {
                target,
                key: 'capture.open',
                operation,
                ...(operation === 'set' ? { value: next } : {}),
                expectedVersion,
                reason: 'Restore disposable capture browser fixture',
                idempotencyKey: randomUUID(),
              },
            });
            expect(response.status()).toBe(200);
            return ScopedSettingsMutationResponse.parse(await response.json());
          };
          try {
            if (originalRow.value !== true) await mutate('set', originalRow.storedVersion, true);
            await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
            const panel = page.getByRole('button', { name: 'Capture controls', exact: true });
            await expect(panel).toHaveAttribute('aria-expanded', 'false');
            await panel.click();
            if (scope === 'station')
              await page.getByLabel('Capture scope').selectOption(station.id);
            await expect(page.getByText('Effective capture: Open', { exact: true })).toBeVisible();
            const apply = async (restore: boolean) => {
              const review = await confirmChange(page);
              const expected = restore ? `${endpoint}/revert` : endpoint;
              const response = page.waitForResponse(
                (result) => result.url() === expected && result.request().method() === 'POST',
              );
              await review.getByRole('button', { name: 'Apply capture change' }).click();
              const result = await response;
              expect(result.status()).toBe(200);
              expect(result.headers()['cache-control']).toBe('no-store');
              await expect(
                page.getByText('Capture change applied.', { exact: true }),
              ).toBeVisible();
              await page.getByRole('button', { name: 'Back to capture controls' }).click();
              return result.json();
            };
            await page.getByRole('button', { name: 'Review pause', exact: true }).click();
            await checkAccessibility(page);
            const paused = ScopedSettingsMutationResponse.parse(await apply(false));
            expect(paused.change.operation).toBe('set');
            expect(paused.current.data.find(({ key }) => key === 'capture.open')!.value).toBe(
              false,
            );
            const rejected = await page.request.post(`${base}/registrations`, {
              headers,
              data: { stationId: station.id, category: 'SEC_4', idempotencyKey: randomUUID() },
            });
            expect(rejected.status()).toBe(409);
            expect((await rejected.json()).error.message).toContain('paused');
            await page
              .getByRole('button', { name: 'Review removing override', exact: true })
              .click();
            const reset = ScopedSettingsMutationResponse.parse(await apply(false));
            expect(reset.change.operation).toBe('reset');
            expect(
              reset.current.data.find(({ key }) => key === 'capture.open')!.storedVersion,
            ).toBe(0);
            await page.getByRole('button', { name: 'Capture history and restore' }).click();
            await page
              .getByRole('button', {
                name: `Review capture version ${paused.change.version}`,
                exact: true,
              })
              .click();
            const restored = ScopedSettingsRevertResponse.parse(await apply(true));
            expect(restored.history.source).toBe('REVERT');
            expect(restored.revertedFrom.historyId).toBe(paused.change.id);
            await page.getByRole('button', { name: 'Capture history and restore' }).click();
            await page
              .getByRole('button', {
                name: `Review capture version ${reset.change.version}`,
                exact: true,
              })
              .click();
            await checkAccessibility(page);
            const removed = ScopedSettingsRevertResponse.parse(await apply(true));
            expect(removed.history.source).toBe('RESET');
            expect(removed.revertedFrom.historyId).toBe(reset.change.id);
            expect(removed.history.values).not.toHaveProperty('after');
            expect(
              removed.current.data.find(({ key }) => key === 'capture.open')!.storedVersion,
            ).toBe(0);
            await page.reload();
            await panel.click();
            if (scope === 'station')
              await page.getByLabel('Capture scope').selectOption(station.id);
            await expect(page.getByText(/Selected scope version 0 · Checked/)).toBeVisible();
            await page.getByRole('button', { name: 'Capture history and restore' }).click();
            await expect(
              page.getByText(`Version ${removed.history.version} · Override removed`, {
                exact: true,
              }),
            ).toBeVisible();
            expect(errors).toEqual([]);
          } finally {
            const latest = (await read()).data.find(({ key }) => key === 'capture.open')!;
            if (originalRow.storedVersion > 0)
              await mutate('set', latest.storedVersion, originalRow.value === true);
            else if (latest.storedVersion > 0) await mutate('reset', latest.storedVersion);
            const final = await read();
            expect(
              final.data.map(({ key, value, storedVersion }) =>
                key === 'capture.open'
                  ? { key, value, inherited: storedVersion === 0 }
                  : { key, value, storedVersion },
              ),
            ).toEqual(
              original.data.map(({ key, value, storedVersion }) =>
                key === 'capture.open'
                  ? { key, value, inherited: storedVersion === 0 }
                  : { key, value, storedVersion },
              ),
            );
          }
        } finally {
          await db.end();
        }
      });
    }
  });
}
