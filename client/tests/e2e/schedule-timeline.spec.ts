import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ScheduleTimelineResponse } from '@spoh/shared';
import { expect, test } from '@playwright/test';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(name, () => {
    test.use({
      isMobile: name === 'phone',
      hasTouch: name === 'phone',
      viewport: { width, height },
    });
    test('current event schedule metadata survives cancellation and reload', async ({ page }) => {
      const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
      if (
        database.hostname !== 'localhost' ||
        database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
      )
        throw new Error('Dedicated local schedule browser database required');
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
      const headers = { Authorization: me.headers().authorization! };
      const privateBody = `Private timeline fixture ${randomUUID()}`;
      const create = await page.request.post(`${base}/announcements/drafts`, {
        headers,
        data: { body: privateBody, idempotencyKey: randomUUID() },
      });
      expect(create.status()).toBe(201);
      const { draft } = await create.json();
      const scheduled = await page.request.post(
        `${base}/announcements/drafts/${draft.id}/schedules`,
        {
          headers,
          data: {
            expectedVersion: draft.version,
            runAt: new Date(Date.now() + 86_400_000).toISOString(),
            idempotencyKey: randomUUID(),
          },
        },
      );
      expect(scheduled.status()).toBe(201);
      const { schedule } = await scheduled.json();
      let cancelled = false;
      const cancel = () =>
        page.request.post(
          `${base}/announcements/drafts/${draft.id}/schedules/${schedule.id}/cancel`,
          {
            headers,
            data: {
              expectedVersion: schedule.version,
              reason: 'Finish bounded local timeline fixture',
            },
          },
        );
      try {
        const errors: string[] = [];
        page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
        await page.goto(page.url().replace(/\/home$/, '/admin/settings'));
        const toggle = page.getByRole('button', { name: 'Scheduled work', exact: true });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        const response = page.waitForResponse(
          (read) =>
            read.url() === `${base}/schedules?limit=20&status=PENDING` && read.status() === 200,
        );
        await toggle.click();
        const metadata = await response;
        expect(metadata.headers()['cache-control']).toBe('no-store');
        const timeline = ScheduleTimelineResponse.parse(await metadata.json());
        expect(timeline.data.find(({ id }) => id === schedule.id)?.kind).toBe('ANNOUNCEMENT');
        await expect(
          page
            .getByRole('list', { name: 'Scheduled work results' })
            .getByText('Announcement publication')
            .first(),
        ).toBeVisible();
        await expect(page.getByText(privateBody, { exact: true })).toHaveCount(0);
        await toggle.hover();
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
        expect((await cancel()).status()).toBe(200);
        cancelled = true;
        await page.getByLabel('Schedule status').selectOption('CANCELLED');
        await expect(
          page.getByRole('list', { name: 'Scheduled work results' }).getByText('Cancelled').first(),
        ).toBeVisible();
        await page.reload();
        await page.getByRole('button', { name: 'Scheduled work', exact: true }).click();
        await page.getByLabel('Schedule status').selectOption('CANCELLED');
        await expect(
          page.getByRole('list', { name: 'Scheduled work results' }).getByText('Cancelled').first(),
        ).toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        if (!cancelled) expect((await cancel()).status()).toBe(200);
      }
    });
  });
}
