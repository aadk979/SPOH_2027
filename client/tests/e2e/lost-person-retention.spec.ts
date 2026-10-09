import { EventSettingHistoryResponse, EventSettingsResponse } from '@spoh/shared';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { promoteToPlatformAdmin } from './platformAdmin';

function checkedDatabase(): string {
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated local browser database required');
  return database.toString();
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/home');
}

/**
 * Retention is a privacy setting (C9): a Chief who manages the event's configuration sees it,
 * and only a platform admin edits it. The fixture's Chief is not a platform admin.
 */
test('shows retention to a Chief without letting them change it', async ({ page }) => {
  checkedDatabase();
  await signIn(page, 'chief@spoh2027.test');
  await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
  await expect(
    page.getByText('Only a platform admin can change visitor data and retention.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Lost-person retention', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save retention', exact: true })).toHaveCount(0);
});

test('shortens lost-person retention only after confirming, with history', async ({ page }) => {
  test.setTimeout(90_000);
  const db = new pg.Client({ connectionString: checkedDatabase() });
  await db.connect();
  // The fixture's Admin is a platform admin already; promoting keeps the test independent of it.
  const restoreRole = await promoteToPlatformAdmin(db, 'admin@spoh2027.test');
  try {
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
    const endpoint = `${base}/admin/event-settings`;
    const read = async () =>
      EventSettingsResponse.parse(
        await (
          await page.request.get(endpoint, { headers: { Authorization: authorization } })
        ).json(),
      );
    const initial = await read();
    const original = initial.settings.lostPersonPurgeHours;
    const shorter = original - 1;
    try {
      await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
      const field = page.getByLabel('Lost-person retention', { exact: true });
      await expect(field).toHaveValue(String(original));
      await field.fill(shorter.toString());
      const writes: unknown[] = [];
      page.on('request', (request) => {
        if (request.url() === endpoint && request.method() === 'PATCH')
          writes.push(request.postDataJSON());
      });
      await page.getByRole('button', { name: 'Save retention', exact: true }).click();
      await expect(
        page.getByText(`resolved more than ${shorter} hours ago are removed`),
      ).toBeVisible();
      expect(writes).toEqual([]);
      const saved = page.waitForResponse(
        (response) => response.url() === endpoint && response.request().method() === 'PATCH',
      );
      await page.getByRole('button', { name: `Confirm ${shorter} hours`, exact: true }).click();
      expect((await saved).status()).toBe(200);
      expect(writes).toEqual([
        {
          key: 'lostPersonPurgeHours',
          value: shorter,
          expectedVersion: initial.versions.lostPersonPurgeHours,
        },
      ]);
      const after = await read();
      expect(after.settings.lostPersonPurgeHours).toBe(shorter);
      expect(after.versions.lostPersonPurgeHours).toBe(initial.versions.lostPersonPurgeHours + 1);
      const history = EventSettingHistoryResponse.parse(
        await (
          await page.request.get(`${endpoint}/history?key=lostPersonPurgeHours&limit=5`, {
            headers: { Authorization: authorization },
          })
        ).json(),
      );
      expect(history.data[0]).toMatchObject({
        version: after.versions.lostPersonPurgeHours,
        source: 'USER',
        createdByYou: true,
        values: { available: true, before: original, after: shorter },
      });
      // Refused above the promise, whatever a client sends.
      const longer = await page.request.patch(endpoint, {
        headers: { Authorization: authorization },
        data: {
          key: 'lostPersonPurgeHours',
          value: 25,
          expectedVersion: after.versions.lostPersonPurgeHours,
        },
      });
      expect(longer.status()).toBe(400);
      expect(errors).toEqual([]);
    } finally {
      const current = await read();
      if (current.settings.lostPersonPurgeHours !== original) {
        const restore = await page.request.patch(endpoint, {
          headers: { Authorization: authorization },
          data: {
            key: 'lostPersonPurgeHours',
            value: original,
            expectedVersion: current.versions.lostPersonPurgeHours,
            reason: 'Restore the local browser fixture',
          },
        });
        expect(restore.status()).toBe(200);
      }
    }
  } finally {
    await restoreRole();
    await db.end();
  }
});
