import { OrganisationSettingsResponse } from '@spoh/shared';
import { expect, test } from '@playwright/test';

/**
 * A platform admin changes an organisation-wide setting from the event settings
 * screen (D-17); the value applies to the organisation and the fixture is restored.
 */
test('a platform admin changes alert refresh for the organisation', async ({ page }) => {
  test.setTimeout(90_000);
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated local browser database required');
  const errors: string[] = [];
  page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
  const meRequest = page.waitForRequest(
    (request) => request.url().endsWith('/me') && !!request.headers().authorization,
  );
  await page.goto('/sign-in');
  // The seeded admin is also the organisation's platform admin.
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
  const endpoint = `${base}/admin/organisation-settings`;
  const read = async () => {
    const response = await page.request.get(endpoint, {
      headers: { Authorization: authorization },
    });
    expect(response.headers()['cache-control']).toBe('no-store');
    return OrganisationSettingsResponse.parse(await response.json());
  };
  const initial = await read();
  expect(initial.canChange).toBe(true);
  const original = initial.settings.alertPollSeconds;
  const alternate = original < 30 ? original + 1 : original - 1;
  try {
    await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
    const field = page.getByLabel('Alert refresh', { exact: true });
    await expect(field).toHaveValue(String(original));
    await field.fill(String(alternate));
    const saved = page.waitForResponse(
      (response) => response.url() === endpoint && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save alert refresh', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const after = await read();
    expect(after.settings).toEqual({ ...initial.settings, alertPollSeconds: alternate });
    expect(after.versions.alertPollSeconds).toBe(initial.versions.alertPollSeconds + 1);
    await page.reload();
    await expect(page.getByLabel('Alert refresh', { exact: true })).toHaveValue(String(alternate));
    expect(errors).toEqual([]);
  } finally {
    const current = await read();
    if (current.settings.alertPollSeconds !== original) {
      const restore = await page.request.patch(endpoint, {
        headers: { Authorization: authorization },
        data: {
          key: 'alertPollSeconds',
          value: original,
          expectedVersion: current.versions.alertPollSeconds,
          reason: 'Restore the local browser fixture',
        },
      });
      expect(restore.status()).toBe(200);
    }
  }
});
