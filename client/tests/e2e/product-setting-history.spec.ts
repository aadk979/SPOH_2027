import { readFileSync } from 'node:fs';
import {
  EventSettingHistoryResponse,
  EventSettingsResponse,
  RevertEventSettingResponse,
} from '@spoh/shared';
import { expect, test } from '@playwright/test';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(name, () => {
    test.use({
      viewport: { width, height },
      isMobile: name === 'phone',
      hasTouch: name === 'phone',
    });
    test('changes counts, reviews history and restores an earlier value as a new version', async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
      if (
        database.hostname !== 'localhost' ||
        database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
      )
        throw new Error('Dedicated local product history browser database required');
      const meRequest = page.waitForRequest(
        (request) => request.url().endsWith('/me') && !!request.headers().authorization,
      );
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('admin@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      const me = await meRequest;
      const base = me.url().slice(0, -3);
      if (new URL(base).hostname !== 'localhost' || new URL(base).port !== '4012')
        throw new Error('Local fixture API required');
      const headers = { Authorization: me.headers().authorization! };
      const endpoint = `${base}/admin/event-settings`;
      const initialRead = await page.request.get(endpoint, { headers });
      expect(initialRead.status()).toBe(200);
      const initial = EventSettingsResponse.parse(await initialRead.json());
      const original = initial.settings['product.countsMode'];
      let restored = false;
      try {
        const baselineWrite = await page.request.patch(endpoint, {
          headers,
          data: {
            key: 'product.countsMode',
            value: original,
            expectedVersion: initial.versions['product.countsMode'],
            reason: 'Bounded local history review baseline',
          },
        });
        expect(baselineWrite.status()).toBe(200);
        const baseline = EventSettingsResponse.parse(await baselineWrite.json());
        const historyRead = await page.request.get(
          `${endpoint}/history?key=product.countsMode&limit=20`,
          { headers },
        );
        expect(historyRead.status()).toBe(200);
        const history = EventSettingHistoryResponse.parse(await historyRead.json());
        const target = history.data.find(
          ({ version }) => version === baseline.versions['product.countsMode'],
        )!;
        expect(target).toBeTruthy();
        await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
        const toggle = page.getByRole('button', {
          name: 'Setting history and restore',
          exact: true,
        });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        const alternativeLabel =
          original.mode === 'separate'
            ? 'One headline figure as well'
            : 'Three counts, side by side';
        await page
          .getByRole('group', { name: 'Counts', exact: true })
          .getByText(alternativeLabel, { exact: true })
          .click();
        await expect(page.getByRole('radio', { name: alternativeLabel })).toBeChecked();
        if (original.mode === 'separate')
          await page.getByLabel('Headline from', { exact: true }).selectOption('registrations');
        const changing = page.waitForResponse(
          (response) => response.url() === endpoint && response.request().method() === 'PATCH',
        );
        await page.getByRole('button', { name: 'Save counts', exact: true }).click();
        expect((await changing).status()).toBe(200);
        const historyResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/event-settings/history?') && response.status() === 200,
        );
        await toggle.click();
        expect((await historyResponse).headers()['cache-control']).toBe('no-store');
        await page
          .getByRole('button', { name: `Review version ${target.version}`, exact: true })
          .click();
        const review = page.getByRole('group', { name: 'Review setting restore' });
        await expect(review.getByRole('button', { name: 'Restore this version' })).toBeDisabled();
        await review.getByLabel('Reason for restoring').fill('Restore the reviewed local baseline');
        await review.getByRole('checkbox').check();
        await review.getByRole('button', { name: 'Restore this version' }).hover();
        await page.evaluate(axe);
        const violations = await page.evaluate(async () =>
          (
            await (
              window as unknown as {
                axe: {
                  run: (
                    node: Document,
                    options: object,
                  ) => Promise<{ violations: { id: string }[] }>;
                };
              }
            ).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
          ).violations.map(({ id }) => id),
        );
        expect(violations).toEqual([]);
        const restoring = page.waitForResponse(
          (response) =>
            response.url() === `${endpoint}/revert` && response.request().method() === 'POST',
        );
        await review.getByRole('button', { name: 'Restore this version' }).click();
        const response = await restoring;
        expect(response.status()).toBe(200);
        expect(response.headers()['cache-control']).toBe('no-store');
        const result = RevertEventSettingResponse.parse(await response.json());
        expect(result.revertedFrom.historyId).toBe(target.id);
        expect(result.history.source).toBe('REVERT');
        expect(result.history.version).toBeGreaterThan(target.version);
        expect(result.current.settings['product.countsMode']).toEqual(original);
        restored = true;
        await expect(
          page.getByText('Setting restored successfully as a new version.'),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to history' }).click();
        await expect(
          page.getByText(`Version ${result.history.version} · Restored from history`),
        ).toBeVisible();
        await page.reload();
        await toggle.click();
        await expect(
          page.getByText(`Version ${result.history.version} · Restored from history`),
        ).toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        if (!restored) {
          const latest = EventSettingsResponse.parse(
            await (await page.request.get(endpoint, { headers })).json(),
          );
          expect(
            (
              await page.request.patch(endpoint, {
                headers,
                data: {
                  key: 'product.countsMode',
                  value: original,
                  expectedVersion: latest.versions['product.countsMode'],
                  reason: 'Restore failed local browser fixture',
                },
              })
            ).status(),
          ).toBe(200);
        }
      }
    });
  });
}
