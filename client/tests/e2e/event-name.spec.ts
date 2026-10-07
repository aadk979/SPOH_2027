import { readFileSync } from 'node:fs';
import { MeResponse, RenameEventResponse } from '@spoh/shared';
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
    test("renames the event from the settings screen, everywhere it is read, and restores the fixture's name", async ({
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
      const readName = async () =>
        MeResponse.parse(
          await (await page.request.get(`${base}/me`, { headers: headers() })).json(),
        ).event.name;
      const endpoint = `${base}/admin/event-name`;
      const original = await readName();
      const alternate = `${original.slice(0, 100)} reviewed`;
      let current = original;
      const requests: unknown[] = [];
      page.on('request', (request) => {
        if (request.url() === endpoint && request.method() === 'PATCH')
          requests.push(request.postDataJSON());
      });
      try {
        await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
        const field = page.getByLabel('Event name', { exact: true });
        const rename = page.getByRole('button', { name: 'Rename event', exact: true });
        await expect(field).toHaveValue(original);
        await expect(rename).toHaveCount(0);
        await field.fill(` ${original} `);
        await expect(rename).toHaveCount(0);
        await field.fill(alternate);
        await rename.hover();
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
        const renaming = page.waitForResponse(
          (response) => response.url() === endpoint && response.request().method() === 'PATCH',
        );
        await rename.click();
        const renamed = await renaming;
        expect(renamed.status()).toBe(200);
        expect(RenameEventResponse.parse(await renamed.json()).event.name).toBe(alternate);
        current = alternate;
        expect(requests).toEqual([{ name: alternate, expectedName: original }]);
        await expect(page.getByText('Renamed. Every screen shows the new name.')).toBeVisible();
        expect(await readName()).toBe(alternate);

        // The legacy endpoint no longer takes the name, and says where it went.
        const legacy = await page.request.patch(`${base}/admin/settings`, {
          headers: headers(),
          data: { eventName: 'Legacy name' },
        });
        expect(legacy.status()).toBe(400);
        expect((await legacy.json()).error.details).toEqual({
          keys: ['eventName'],
          replacement: '/admin/event-name',
        });

        await page.reload();
        await expect(field).toHaveValue(alternate);
        await expect(rename).toHaveCount(0);
        await field.fill(original);
        const restoring = page.waitForResponse(
          (response) => response.url() === endpoint && response.request().method() === 'PATCH',
        );
        await rename.click();
        expect((await restoring).status()).toBe(200);
        current = original;
        await expect(field).toHaveValue(original);
        expect(requests).toEqual([
          { name: alternate, expectedName: original },
          { name: original, expectedName: alternate },
        ]);
        expect(await readName()).toBe(original);
        expect(errors).toEqual([]);
      } finally {
        if (current !== original)
          expect(
            (
              await page.request.patch(endpoint, {
                headers: headers(),
                data: { name: original, expectedName: current },
              })
            ).status(),
          ).toBe(200);
      }
    });
  });
}
