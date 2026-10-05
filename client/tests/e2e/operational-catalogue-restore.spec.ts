import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  ScopedSettingsReadResponse,
  ScopedSettingsMutationResponse,
  ScopedSettingsRevertResponse,
  ScopedSettingsRevertRequest,
  ScopedSettingsHistoryResponse,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { source as axe } from 'axe-core';

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
  test.describe(`catalogue history restores (${name})`, () => {
    test.use({
      viewport: { width, height },
      isMobile: name === 'phone',
      hasTouch: name === 'phone',
    });
    for (const scope of ['event', 'station'] as const) {
      test(`restores owned numeric history, retries one lost receipt and removes the ${scope} fixture`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
        if (
          database.hostname !== 'localhost' ||
          database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
        )
          throw new Error('Dedicated local catalogue restore browser database required');
        const errors: string[] = [],
          failures: number[] = [],
          violations: string[] = [];
        let authorization = '';
        page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
        page.on('request', (request) => {
          if (
            request.url().startsWith('http://localhost:4012/api/v1/') &&
            request.headers().authorization
          )
            authorization = request.headers().authorization!;
        });
        page.on('response', (response) => {
          if (
            (response.status() === 429 || response.status() >= 500) &&
            response.headers()['x-synthetic-receipt-loss'] !== '1'
          )
            failures.push(response.status());
          if (response.url().includes('/admin/settings/catalogue'))
            expect(response.headers()['cache-control']).toBe('no-store');
        });
        await page.exposeBinding('__catalogueRestoreCsp', (_source, directive: string) =>
          violations.push(directive),
        );
        await page.addInitScript(() =>
          addEventListener(
            'securitypolicyviolation',
            (event) =>
              void (
                globalThis as unknown as {
                  __catalogueRestoreCsp: (directive: string) => void;
                }
              ).__catalogueRestoreCsp(event.effectiveDirective),
          ),
        );
        const meRead = page.waitForRequest(
          (request) => request.url().endsWith('/me') && !!request.headers().authorization,
        );
        await page.goto('/sign-in');
        await page.getByLabel('Roster email').fill('chief@spoh2027.test');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.waitForURL('**/home');
        const base = (await meRead).url().slice(0, -3);
        if (new URL(base).hostname !== 'localhost' || new URL(base).port !== '4012')
          throw new Error('Dedicated local fixture API required');
        await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
        const panel = page.getByRole('button', { name: 'Settings catalogue', exact: true });
        await panel.click();
        await expect(page.getByRole('button', { name: /^View history:/ })).toHaveCount(14);
        const selector = page.getByLabel('Catalogue scope');
        let target: ScopedSettingsTarget = { scope: 'event' };
        if (scope === 'station') {
          await expect(selector.locator('option')).not.toHaveCount(1);
          const stationId = (await selector.locator('option').nth(1).getAttribute('value'))!;
          target = { scope, stationId };
          await selector.selectOption(stationId);
          await expect(page.getByRole('button', { name: /^View history:/ })).toHaveCount(3);
        }
        const endpoint = `${base}/admin/settings/catalogue`;
        const params = new URLSearchParams({
          scope,
          ...(target.scope === 'station' ? { stationId: target.stationId } : {}),
        });
        const headers = () => ({ Authorization: authorization });
        const read = async () => {
          const response = await page.request.get(`${endpoint}?${params}`, { headers: headers() });
          expect(response.status()).toBe(200);
          expect(response.headers()['cache-control']).toBe('no-store');
          return ScopedSettingsReadResponse.parse(await response.json());
        };
        const original = await read();
        const originalRow = original.data.find((row) => row.key === 'silentStationMinutes')!;
        expect(originalRow.storedVersion).toBe(0);
        expect(originalRow.invalidScopes).toEqual([]);
        expect(typeof originalRow.value).toBe('number');
        const before = originalRow.value as number;
        const historical = before < 1440 ? before + 1 : before - 1;
        const alternative = historical < 1440 ? historical + 1 : historical - 2;
        const reason = `Disposable catalogue browser restore ${randomUUID()}`;
        const ownedVersions = new Set<number>();
        let cleaned = false,
          received: ScopedSettingsRevertResponse | null = null;
        let firstBody: ScopedSettingsRevertRequest | null = null,
          requests = 0;
        const mutate = async (
          operation: 'set' | 'reset',
          expectedVersion: number,
          value?: number,
        ) => {
          const response = await page.request.post(endpoint, {
            headers: headers(),
            data: {
              target,
              key: 'silentStationMinutes',
              operation,
              expectedVersion,
              ...(operation === 'set' ? { value } : {}),
              reason,
              idempotencyKey: randomUUID(),
            },
          });
          expect(response.status()).toBe(200);
          expect(response.headers()['cache-control']).toBe('no-store');
          const receipt = ScopedSettingsMutationResponse.parse(await response.json());
          ownedVersions.add(receipt.change.version);
          return receipt;
        };
        const cleanupOwned = async () => {
          const actual = await read();
          const row = actual.data.find((row) => row.key === 'silentStationMinutes')!;
          if (row.storedVersion !== 0) {
            expect(ownedVersions.has(row.storedVersion)).toBe(true);
            await mutate('reset', row.storedVersion);
          }
          expect((await read()).data).toEqual(original.data);
          cleaned = true;
        };
        try {
          const baseline = await mutate('set', originalRow.storedVersion, historical);
          const changed = await mutate('set', baseline.change.version, alternative);
          const historyResponse = await page.request.get(
            `${endpoint}/history?${params}&key=silentStationMinutes&limit=20`,
            { headers: headers() },
          );
          expect(historyResponse.status()).toBe(200);
          const history = ScopedSettingsHistoryResponse.parse(await historyResponse.json());
          const selected = history.data.find((row) => row.id === baseline.change.id)!;
          expect(selected).toBeTruthy();
          await page.getByRole('button', { name: 'Reload catalogue', exact: true }).click();
          await expect(
            page
              .locator('#operational-catalogue')
              .getByText(`Scoped value: ${alternative} minutes`, { exact: true }),
          ).toBeVisible();
          await page
            .getByRole('button', { name: 'View history: Silent station', exact: true })
            .click();
          await page
            .getByRole('button', {
              name: `Review catalogue version ${selected.version}`,
              exact: true,
            })
            .click();
          const review = page.getByRole('group', { name: 'Review catalogue restore' });
          await expect(
            review.getByRole('button', { name: 'Restore catalogue setting' }),
          ).toBeDisabled();
          await review.getByLabel('Reason for catalogue restore').fill(reason);
          await review.getByRole('checkbox').check();
          await expect(review).toContainText(`Selected scope version ${changed.change.version}`);
          await checkAccessibility(page);
          await page.route(`${endpoint}/revert`, async (route) => {
            expect(route.request().method()).toBe('POST');
            const body = ScopedSettingsRevertRequest.parse(route.request().postDataJSON());
            expect(body.historyId).toBe(selected.id);
            expect(body.target).toEqual(target);
            if (firstBody) expect(body).toEqual(firstBody);
            else firstBody = body;
            requests++;
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            const receipt = ScopedSettingsRevertResponse.parse(await response.json());
            ownedVersions.add(receipt.history.version);
            if (received) expect(receipt.history.id).toBe(received.history.id);
            received = receipt;
            if (requests === 1)
              await route.fulfill({
                status: 503,
                headers: {
                  ...response.headers(),
                  'cache-control': 'no-store',
                  'x-synthetic-receipt-loss': '1',
                },
                json: {
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Synthetic lost committed receipt',
                    requestId: randomUUID(),
                  },
                },
              });
            else await route.fulfill({ response });
          });
          await review.getByRole('button', { name: 'Restore catalogue setting' }).click();
          await expect(
            review.getByRole('button', { name: 'Retry same catalogue restore' }),
          ).toBeVisible();
          await expect(selector).toBeDisabled();
          await expect(panel).toBeDisabled();
          await expect(review.getByLabel('Reason for catalogue restore')).toBeDisabled();
          await expect(
            review.getByRole('button', { name: 'Back to catalogue history' }),
          ).toBeDisabled();
          await review.getByRole('button', { name: 'Retry same catalogue restore' }).click();
          await expect(page.getByText('Catalogue restore applied.', { exact: true })).toBeVisible();
          expect(requests).toBe(2);
          await page.unroute(`${endpoint}/revert`);
          const final = await read();
          expect(final.data.find((row) => row.key === 'silentStationMinutes')!.value).toBe(
            historical,
          );
          await review.getByRole('button', { name: 'Back to catalogue history' }).click();
          const recorded = await page.request.get(
            `${endpoint}/history?${params}&key=silentStationMinutes&limit=20`,
            { headers: headers() },
          );
          const recordedRows = ScopedSettingsHistoryResponse.parse(await recorded.json()).data;
          expect(
            recordedRows.filter((row) => row.reason === reason && row.source === 'REVERT'),
          ).toHaveLength(1);
          await page.reload();
          await expect(panel).toHaveAttribute('aria-expanded', 'false');
          await panel.click();
          if (target.scope === 'station') await selector.selectOption(target.stationId);
          await expect(
            page
              .locator('#operational-catalogue')
              .getByText(`Scoped value: ${historical} minutes`, { exact: true }),
          ).toBeVisible();
          await cleanupOwned();
          const revoked = page.waitForResponse(
            (response) =>
              response.url().endsWith('/auth/session') && response.request().method() === 'DELETE',
          );
          await page.getByRole('button', { name: 'Sign out', exact: true }).click();
          expect((await revoked).status()).toBe(204);
          await page.waitForURL('**/sign-in');
          expect(errors).toEqual([]);
          expect(failures).toEqual([]);
          expect(violations).toEqual([]);
        } finally {
          await page.unroute(`${endpoint}/revert`);
          if (!cleaned && ownedVersions.size) await cleanupOwned();
        }
      });
    }
  });
}
