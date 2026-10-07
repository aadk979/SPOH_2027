import { ClientSettingsResponse } from '@spoh/shared';
import { expect, test } from '@playwright/test';

/**
 * A device reads its tuning for the event page it has open (P10.2): the
 * capture and outbox values are that event's, not the legacy global copy.
 */
test('a signed-in device loads its settings for the open event, privately', async ({ page }) => {
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated local browser database required');
  const errors: string[] = [];
  page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
  const legacyReads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/admin/settings'))
      legacyReads.push(request.url());
  });
  const deviceSettings = page.waitForResponse((response) =>
    /\/api\/v1\/events\/[^/]+\/admin\/settings\/client$/.test(new URL(response.url()).pathname),
  );

  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill('admin@spoh2027.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/home');

  const response = await deviceSettings;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const { settings } = ClientSettingsResponse.parse(await response.json());
  expect(Object.keys(settings).sort()).toEqual([
    'alertPollSeconds',
    'captureSendGraceSeconds',
    'captureUndoWindowSeconds',
    'dashboardPollSeconds',
    'outboxWarningAgeMinutes',
    'outboxWarningCount',
  ]);
  expect(new URL(page.url()).pathname).toMatch(/^\/e\/[^/]+\/home$/);
  expect(legacyReads).toEqual([]);
  expect(errors).toEqual([]);
});
