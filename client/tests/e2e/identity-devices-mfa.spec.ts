import { expect, test } from '@playwright/test';
import { mockIdentityUi, identityVolunteer, IDENTITY_EVENT } from './identityUiFixture';
test('a restricted session completes authenticator enrolment before opening the event', async ({
  page,
}) => {
  const eventRequests: string[] = [];
  await mockIdentityUi(page, { mfa: true });
  page.on('request', (request) => {
    if (/\/events\/[^/]+\//.test(request.url())) eventRequests.push(request.url());
  });
  await page.goto('/mfa');
  await page.getByRole('button', { name: 'Get setup key' }).click();
  await expect(page.getByLabel('Authenticator setup key')).toHaveText('SYNTHETICSETUPKEY');
  expect(eventRequests).toEqual([]);
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole('link', { name: /Mock Event/ })).toBeVisible();
});
test('signing out a different device leaves this device signed in', async ({ page }) => {
  let revoked = false;
  const now = '2026-10-10T00:00:00.000Z';
  await mockIdentityUi(page, {
    handle: async (route, path) => {
      if (path.endsWith('/auth/sessions/other')) {
        expect(route.request().method()).toBe('DELETE');
        revoked = true;
        await route.fulfill({ status: 204 });
        return true;
      }
      if (path.endsWith('/auth/sessions')) {
        await route.fulfill({
          json: {
            data: [
              {
                id: 'current',
                current: true,
                userAgent: 'This synthetic browser',
                issuedAt: now,
                lastUsedAt: now,
                expiresAt: '2026-10-11T00:00:00.000Z',
              },
              ...(!revoked
                ? [
                    {
                      id: 'other',
                      current: false,
                      userAgent: 'Borrowed synthetic browser',
                      issuedAt: now,
                      lastUsedAt: now,
                      expiresAt: '2026-10-11T00:00:00.000Z',
                    },
                  ]
                : []),
            ],
          },
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/e/${IDENTITY_EVENT.slug}/devices`);
  const other = page
    .locator('article, section, div')
    .filter({ has: page.getByRole('heading', { name: 'Signed-in device', exact: true }) })
    .last();
  await other.getByRole('button', { name: 'Sign out this device', exact: true }).click();
  expect(revoked).toBe(false);
  await other.getByRole('button', { name: 'Confirm sign out' }).click();
  await expect(page.getByText('Borrowed synthetic browser')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'This device', exact: true })).toBeVisible();
  expect(page.url()).toContain('/devices');
});

test('revoking this device requires confirmation and returns it to sign-in', async ({ page }) => {
  let revoked = false;
  const deletions: string[] = [];
  await mockIdentityUi(page, {
    handle: async (route, path) => {
      if (path.endsWith('/auth/sessions/current')) {
        expect(route.request().method()).toBe('DELETE');
        expect(route.request().headers().authorization).toBe('Bearer synthetic-ui-token');
        deletions.push(path);
        revoked = true;
        await route.fulfill({ status: 204 });
        return true;
      }
      if (path.endsWith('/auth/refresh') && revoked) {
        await route.fulfill({ status: 401, json: { error: { code: 'SESSION_ENDED' } } });
        return true;
      }
      if (path.endsWith('/auth/sessions')) {
        await route.fulfill({
          json: {
            data: [
              {
                id: 'current',
                current: true,
                userAgent: 'This synthetic browser',
                issuedAt: '2026-10-10T00:00:00.000Z',
                lastUsedAt: '2026-10-10T00:00:00.000Z',
                expiresAt: '2026-10-11T00:00:00.000Z',
              },
            ],
          },
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/e/${IDENTITY_EVENT.slug}/devices`);
  await expect(page.getByRole('heading', { name: 'This device', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out this device', exact: true }).click();
  await expect(
    page.getByText('This signs you out here. Captures waiting on this phone stay on this phone.'),
  ).toBeVisible();
  expect(deletions).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(deletions).toEqual([]);
  await page.getByRole('button', { name: 'Sign out this device', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(deletions).toEqual(['/api/v1/auth/sessions/current']);
  const returnTo = new URL(page.url()).searchParams.get('returnTo');
  expect(returnTo).toBe(`/e/${IDENTITY_EVENT.slug}/devices`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('an administrator signs another person out everywhere while keeping their own device', async ({
  page,
  context,
}) => {
  const person = identityVolunteer({
    id: 'synthetic-person',
    displayName: 'Synthetic Signed-in Person',
    email: 'signed-in-person@example.test',
    hasSignedIn: true,
  });
  const forceSignOuts: { idempotencyKey: string }[] = [];
  let signedOut = false;
  let deniedRecovery = 0;
  await mockIdentityUi(page, {
    handle: async (route, path) => {
      if (path.endsWith('/admin/volunteers/synthetic-person/sign-out')) {
        expect(route.request().method()).toBe('POST');
        const body = route.request().postDataJSON() as { idempotencyKey: string };
        expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
        forceSignOuts.push(body);
        signedOut = true;
        await route.fulfill({ json: { sessionsRevoked: 2 } });
        return true;
      }
      if (path.endsWith('/admin/volunteers')) {
        await route.fulfill({ json: { data: [person], meta: { count: 1, nextCursor: null } } });
        return true;
      }
      if (path.endsWith('/auth/sessions')) {
        await route.fulfill({
          json: {
            data: [
              {
                id: 'admin-device',
                current: true,
                userAgent: 'Synthetic administrator browser',
                issuedAt: '2026-10-10T00:00:00.000Z',
                lastUsedAt: '2026-10-10T00:00:00.000Z',
                expiresAt: '2026-10-11T00:00:00.000Z',
              },
            ],
          },
        });
        return true;
      }
      return false;
    },
  });
  const otherDevice = await context.newPage();
  await mockIdentityUi(otherDevice, {
    person: { id: person.id, displayName: person.displayName, role: person.role },
    actions: ['Self.Read'],
    handle: async (route, path) => {
      if (signedOut && (path.includes('/auth/') || path.endsWith('/me'))) {
        deniedRecovery++;
        await route.fulfill({ status: 401, json: { error: { code: 'SESSION_ENDED' } } });
        return true;
      }
      if (path.endsWith('/auth/sessions')) {
        await route.fulfill({
          json: {
            data: [
              {
                id: 'person-device',
                current: true,
                userAgent: 'Synthetic volunteer browser',
                issuedAt: '2026-10-10T00:00:00.000Z',
                lastUsedAt: '2026-10-10T00:00:00.000Z',
                expiresAt: '2026-10-11T00:00:00.000Z',
              },
            ],
          },
        });
        return true;
      }
      return false;
    },
  });
  await otherDevice.goto(`/e/${IDENTITY_EVENT.slug}/devices`);
  await expect(
    otherDevice.getByRole('heading', { name: 'This device', exact: true }),
  ).toBeVisible();
  await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/users`);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resend sign-in invite' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click();
  await expect(
    page.getByText(
      'Sign Synthetic Signed-in Person out on every device, across events? Their account and captured records stay.',
    ),
  ).toBeVisible();
  expect(forceSignOuts).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(forceSignOuts).toEqual([]);
  await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm sign out everywhere', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Signed out 2 sessions.' }),
  ).toBeVisible();
  expect(forceSignOuts).toHaveLength(1);
  await otherDevice.reload();
  await expect(otherDevice).toHaveURL(/\/sign-in\?returnTo=/);
  await expect(otherDevice.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(deniedRecovery).toBeGreaterThan(0);
  await page.goto(`/e/${IDENTITY_EVENT.slug}/devices`);
  await expect(page.getByRole('heading', { name: 'This device', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic administrator browser')).toBeVisible();
  await otherDevice.close();
});
