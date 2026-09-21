import { expect, test, type Page } from '@playwright/test';
import type { AttendanceStatus } from '@spoh/shared';

async function attendanceSession(page: Page, root = false) {
  const now = new Date().toISOString();
  const volunteer = {
    id: 'attendance-user',
    displayName: 'Alex Tan',
    role: root ? 'ADMIN' : 'VOLUNTEER',
  };
  const state: AttendanceStatus = {
    eventDay: { id: 'event-day', label: 'Open House' },
    configured: true,
    isRoot: root,
    isExco: root,
    onCampusNetwork: true,
    networkConfigured: true,
    attendance: null,
    canIssue: false,
    serverTime: now,
  };
  const submissions: unknown[] = [];
  let generation = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Camera denied', 'NotAllowedError')),
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/attendance/submit')) {
      const body: unknown = route.request().postDataJSON();
      submissions.push(body);
      if (submissions.length === 1) {
        await route.fulfill({
          status: 403,
          json: {
            error: {
              code: 'FORBIDDEN',
              message: 'This attendance code is invalid or expired. Ask for a fresh code.',
              requestId: 'test',
            },
          },
        });
        return;
      }
      state.attendance = {
        id: 'present',
        presentAt: now,
        method: 'PIN',
        verifiedByName: 'Event Exco',
      };
      await route.fulfill({ json: { attendance: state.attendance } });
      return;
    }
    if (path.endsWith('/attendance/start')) {
      state.attendance = { id: 'present', presentAt: now, method: 'ROOT', verifiedByName: null };
      state.canIssue = true;
      await route.fulfill({ json: { attendance: state.attendance } });
      return;
    }
    if (path.endsWith('/attendance/challenge')) {
      generation += 1;
      const serverTime = new Date().toISOString();
      await route.fulfill({
        json: {
          token: `attendance-test-token-${generation}`,
          pin: generation === 1 ? '1234567890' : '0987654321',
          serverTime,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          qrEnabled: true,
        },
      });
      return;
    }
    const json = path.includes('/auth/')
      ? {
          accessToken: 'preview',
          expiresIn: 3600,
          volunteer,
          capabilities: ['own.read'],
          refreshAvailable: true,
        }
      : path.endsWith('/attendance')
        ? state
        : path.endsWith('/me')
          ? {
              volunteer,
              capabilities: ['own.read'],
              currentAssignment: null,
              upcomingAssignments: [],
              escalationChain: [],
            }
          : path.endsWith('/lost-person/active')
            ? { alerts: [] }
            : {};
    await route.fulfill({ json });
  });
  return { submissions };
}

test('scanner failure retains PIN fallback, rejects invalid PIN, then shows server-confirmed presence', async ({
  page,
}) => {
  const { submissions } = await attendanceSession(page);
  await page.goto('/home');
  await page.getByRole('link', { name: 'Submit attendance / verify team' }).click();
  await expect(page.getByLabel('Attendance QR scanner')).toBeVisible();
  await expect(page.getByText(/Camera access failed/)).toBeVisible();
  const submit = page.getByRole('button', { name: 'Submit attendance with PIN' });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Secondary verification PIN', { exact: true }).fill('1111111111');
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'invalid or expired' })).toBeVisible();
  await expect(page.getByText('You are marked present')).toHaveCount(0);
  await page.getByLabel('Secondary verification PIN', { exact: true }).fill('1234567890');
  await submit.click();
  await expect(page.getByText('You are marked present')).toBeVisible();
  expect(submissions).toEqual([
    { method: 'PIN', pin: '1111111111' },
    { method: 'PIN', pin: '1234567890' },
  ]);
  await expect(page.getByLabel('Attendance QR scanner')).toHaveCount(0);
});

test('root opens attendance and can display, rotate and hide verifier credentials on a narrow phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await attendanceSession(page, true);
  await page.goto('/attendance');
  await page.getByRole('button', { name: 'I am at the event — open attendance' }).click();
  await expect(page.getByText('You are marked present')).toBeVisible();
  await page.getByRole('button', { name: 'Show my QR and secondary PIN' }).click();
  await expect(page.getByRole('img', { name: 'Attendance verification QR code' })).toBeVisible();
  await expect(page.getByText('1234567890', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/attendance-root-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Generate fresh QR / PIN' }).click();
  await expect(page.getByText('0987654321', { exact: true })).toBeVisible();
  await expect(page.getByText('1234567890', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide QR and PIN' }).click();
  await expect(page.getByRole('img', { name: 'Attendance verification QR code' })).toHaveCount(0);
});
