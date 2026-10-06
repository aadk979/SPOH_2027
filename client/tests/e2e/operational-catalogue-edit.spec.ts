import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  GENERATED_SETTING_METADATA as metadata,
  ScopedSettingsReadResponse,
  ScopedSettingsMutationRequest,
  ScopedSettingsMutationResponse,
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
for (const [device, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(`generated catalogue editing (${device})`, () => {
    test.use({
      viewport: { width, height },
      isMobile: device === 'phone',
      hasTouch: device === 'phone',
    });
    for (const [scope, key] of [
      ['event', 'silentStationMinutes'],
      ['station', 'silentStationMinutes'],
      ['event', 'vocabulary.missionCard'],
      ['event', 'incident.pushSeverities'],
    ] as const) {
      test(`reviews ${scope} ${key}, records one set and removes its owned override`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
        if (
          database.hostname !== 'localhost' ||
          database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
        )
          throw new Error('Dedicated local catalogue editor database required');
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
        await page.exposeBinding('__catalogueEditCsp', (_source, directive: string) =>
          violations.push(directive),
        );
        await page.addInitScript(() =>
          addEventListener(
            'securitypolicyviolation',
            (event) =>
              void (
                globalThis as unknown as { __catalogueEditCsp: (directive: string) => void }
              ).__catalogueEditCsp(event.effectiveDirective),
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
          throw new Error('Dedicated fixture API required');
        await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
        const panel = page.getByRole('button', { name: 'Settings catalogue', exact: true });
        const selector = page.getByLabel('Catalogue scope');
        await panel.click();
        await expect(page.getByRole('button', { name: /^Edit catalogue:/ })).toHaveCount(14);
        let target: ScopedSettingsTarget = { scope: 'event' };
        if (scope === 'station') {
          await expect(selector.locator('option')).not.toHaveCount(1);
          target = {
            scope,
            stationId: (await selector.locator('option').nth(1).getAttribute('value'))!,
          };
          await selector.selectOption(target.stationId);
          await expect(page.getByRole('button', { name: /^Edit catalogue:/ })).toHaveCount(3);
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
        const original = await read(),
          originalRow = original.data.find((row) => row.key === key)!;
        expect(originalRow.storedVersion).toBe(0);
        expect(originalRow.invalidScopes).toEqual([]);
        const label = metadata[key].label,
          reason = `Disposable generated catalogue editor ${randomUUID()}`;
        const proposal =
          key === 'silentStationMinutes'
            ? (originalRow.value as number) + 1
            : key === 'vocabulary.missionCard'
              ? 'Reviewed browser card'
              : [];
        const ownedVersions = new Set<number>();
        let firstBody: ScopedSettingsMutationRequest | null = null,
          firstId: string | null = null,
          requests = 0,
          cleaned = false;
        const cleanupOwned = async () => {
          const actual = await read(),
            row = actual.data.find((row) => row.key === key)!;
          if (row.storedVersion !== 0) {
            expect(ownedVersions.has(row.storedVersion)).toBe(true);
            const response = await page.request.post(endpoint, {
              headers: headers(),
              data: {
                target,
                key,
                operation: 'reset',
                expectedVersion: row.storedVersion,
                reason,
                idempotencyKey: randomUUID(),
              },
            });
            expect(response.status()).toBe(200);
            ScopedSettingsMutationResponse.parse(await response.json());
          }
          expect((await read()).data).toEqual(original.data);
          cleaned = true;
        };
        try {
          await page.getByRole('button', { name: `Edit catalogue: ${label}`, exact: true }).click();
          const review = page.getByRole('group', { name: 'Review catalogue change' });
          await expect(
            review.getByRole('button', { name: 'Apply catalogue change' }),
          ).toBeDisabled();
          if (key === 'incident.pushSeverities') {
            for (const severity of ['HIGH', 'CRITICAL'])
              await review.getByLabel(severity, { exact: true }).uncheck();
          } else await review.getByLabel('Proposed value', { exact: true }).fill(String(proposal));
          await review.getByLabel('Reason for catalogue change').fill(reason);
          await review.getByRole('checkbox', { name: /I have reviewed/ }).check();
          await checkAccessibility(page);
          await page.route(endpoint, async (route) => {
            expect(route.request().method()).toBe('POST');
            const body = ScopedSettingsMutationRequest.parse(route.request().postDataJSON());
            expect(body.target).toEqual(target);
            expect(body.key).toBe(key);
            expect(body.reason).toBe(reason);
            if (body.operation === 'set') {
              expect(body.value).toEqual(proposal);
              if (firstBody) expect(body).toEqual(firstBody);
              else firstBody = body;
            }
            requests++;
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            const receipt = ScopedSettingsMutationResponse.parse(await response.json());
            ownedVersions.add(receipt.change.version);
            if (body.operation === 'set') {
              if (firstId) expect(receipt.change.id).toBe(firstId);
              else firstId = receipt.change.id;
            }
            if (key === 'silentStationMinutes' && requests === 1) {
              const responseHeaders: Record<string, string> = {
                ...response.headers(),
                'cache-control': 'no-store',
                'x-synthetic-receipt-loss': '1',
              };
              delete responseHeaders['content-length'];
              await route.fulfill({
                status: 503,
                headers: responseHeaders,
                json: {
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Synthetic lost committed receipt',
                    requestId: randomUUID(),
                  },
                },
              });
            } else await route.fulfill({ response });
          });
          await review.getByRole('button', { name: 'Apply catalogue change' }).click();
          if (key === 'silentStationMinutes') {
            await expect(
              review.getByRole('button', { name: 'Retry same catalogue change' }),
            ).toBeVisible();
            await expect(review.getByLabel('Proposed value')).toBeDisabled();
            await expect(selector).toBeDisabled();
            await expect(panel).toBeDisabled();
            await expect(
              review.getByRole('button', { name: 'Back to catalogue values' }),
            ).toBeDisabled();
            await review.getByRole('button', { name: 'Retry same catalogue change' }).click();
          }
          await expect(page.getByText('Catalogue change applied.', { exact: true })).toBeVisible();
          expect((await read()).data.find((row) => row.key === key)!.value).toEqual(proposal);
          await page.reload();
          await expect(panel).toHaveAttribute('aria-expanded', 'false');
          await panel.click();
          if (target.scope === 'station') await selector.selectOption(target.stationId);
          const history = async () => {
            const response = await page.request.get(
              `${endpoint}/history?${params}&key=${encodeURIComponent(key)}&limit=20`,
              { headers: headers() },
            );
            expect(response.status()).toBe(200);
            return ScopedSettingsHistoryResponse.parse(await response.json()).data;
          };
          const setRows = (await history()).filter(
            (row) => row.reason === reason && row.source === 'USER',
          );
          expect(setRows).toHaveLength(1);
          expect(setRows[0]!.id).toBe(firstId);
          await page
            .getByRole('button', { name: `Remove override: ${label}`, exact: true })
            .click();
          await expect(review).toContainText('uses current inheritance');
          await review.getByLabel('Reason for catalogue change').fill(reason);
          await review.getByRole('checkbox', { name: /I have reviewed/ }).check();
          await review.getByRole('button', { name: 'Apply catalogue change' }).click();
          await expect(page.getByText('Catalogue change applied.', { exact: true })).toBeVisible();
          expect((await read()).data).toEqual(original.data);
          cleaned = true;
          const resetRows = (await history()).filter(
            (row) => row.reason === reason && row.source === 'RESET',
          );
          expect(resetRows).toHaveLength(1);
          expect(resetRows[0]!.createdByYou).toBe(true);
          expect(requests).toBe(key === 'silentStationMinutes' ? 3 : 2);
          await page.unroute(endpoint);
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
          await page.unroute(endpoint);
          if (!cleaned && ownedVersions.size) await cleanupOwned();
        }
      });
    }
  });
}
