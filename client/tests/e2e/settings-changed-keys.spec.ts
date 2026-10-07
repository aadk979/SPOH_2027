import { readFileSync } from 'node:fs';
import { SettingsResponse } from '@spoh/shared';
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
    test('saves only a changed event name, leaves untouched overrides alone and restores the fixture', async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
      if (
        database.hostname !== 'localhost' ||
        database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
      )
        throw new Error('Dedicated local settings browser database required');
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
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
        throw new Error('Local fixture API required');
      let authorization = me.headers().authorization!;
      page.on('request', (request) => {
        if (request.url().startsWith(base) && request.headers().authorization)
          authorization = request.headers().authorization!;
      });
      const headers = () => ({ Authorization: authorization });
      const endpoint = `${base}/admin/settings`;
      const initialRead = await page.request.get(endpoint, { headers: headers() });
      expect(initialRead.status()).toBe(200);
      const initial = SettingsResponse.parse(await initialRead.json());
      // The event name is the one key the legacy form still writes.
      const original = initial.settings.eventName;
      const alternate = `${original.slice(0, 60)} reviewed`;
      let restored = false;
      const requests: unknown[] = [];
      page.on('request', (request) => {
        if (request.url() === endpoint && request.method() === 'PATCH')
          requests.push(request.postDataJSON());
      });
      try {
        await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
        const save = page.getByRole('button', { name: 'Save settings', exact: true });
        const field = page.getByLabel('Event name', { exact: true });
        await expect(field).toHaveValue(original);
        await expect(save).toBeDisabled();
        await field.fill(` ${original} `);
        await expect(save).toBeDisabled();
        expect(requests).toEqual([]);
        await field.fill(alternate);
        await save.hover();
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
        const changing = page.waitForResponse(
          (response) => response.url() === endpoint && response.request().method() === 'PATCH',
        );
        await save.click();
        const changedRead = await changing;
        expect(changedRead.status()).toBe(200);
        const changed = SettingsResponse.parse(await changedRead.json());
        expect(requests).toEqual([{ eventName: alternate }]);
        expect(changed.settings).toEqual({ ...initial.settings, eventName: alternate });
        expect(changed.overriddenKeys.filter((key) => key !== 'eventName').sort()).toEqual(
          initial.overriddenKeys.filter((key) => key !== 'eventName').sort(),
        );
        await expect(save).toBeDisabled();
        await page.reload();
        await expect(field).toHaveValue(alternate);
        await expect(save).toBeDisabled();
        await field.fill(original);
        const restoring = page.waitForResponse(
          (response) => response.url() === endpoint && response.request().method() === 'PATCH',
        );
        await save.click();
        const restoredRead = await restoring;
        expect(restoredRead.status()).toBe(200);
        expect(SettingsResponse.parse(await restoredRead.json()).settings).toEqual(
          initial.settings,
        );
        restored = true;
        await expect(save).toBeDisabled();
        expect(requests).toEqual([{ eventName: alternate }, { eventName: original }]);
        expect(errors).toEqual([]);
      } finally {
        if (!restored)
          expect(
            (
              await page.request.patch(endpoint, {
                headers: headers(),
                data: { eventName: original },
              })
            ).status(),
          ).toBe(200);
      }
    });
  });
}
