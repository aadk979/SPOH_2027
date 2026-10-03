import { randomUUID } from 'node:crypto';
import { zonedWallTime } from '@spoh/shared';
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  const me = page.waitForRequest(
    (request) => request.url().endsWith('/me') && !!request.headers().authorization,
  );
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill('admin@spoh2027.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/home');
  const observed = await me;
  const base = observed.url().slice(0, -3);
  const api = new URL(base);
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    api.hostname !== 'localhost' ||
    api.port !== '4012' ||
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated local announcement browser fixtures required');
  return { base, headers: { Authorization: observed.headers().authorization! } };
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`private draft editing, cancellation and worker publication survive reload (${name})`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    const { base, headers } = await signIn(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.name));
    const body = `Synthetic browser draft ${randomUUID()}`;
    const revised = `${body} reviewed`;
    const inbox = (await page
      .getByRole('link', { name: /Announcements/ })
      .first()
      .getAttribute('href'))!;
    await page.goto(inbox);
    await page.getByRole('button', { name: 'Drafts and scheduled messages' }).click();
    await page.getByLabel('Draft message', { exact: true }).fill(body);
    await page.getByLabel('Address the whole event', { exact: true }).check();
    await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Saved draft · version 1' })).toBeVisible();
    const before = await page.request.get(`${base}/announcements`, { headers });
    expect(before.status()).toBe(200);
    expect(
      (await before.json()).data.some((message: { body: string }) => message.body === body),
    ).toBe(false);
    await page.getByLabel('Draft message', { exact: true }).fill(revised);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Saved draft · version 2' })).toBeVisible();
    await page
      .getByLabel('Publish at (Asia/Singapore)', { exact: true })
      .fill(zonedWallTime(new Date(Date.now() + 300_000), 'Asia/Singapore'));
    await page.getByRole('button', { name: 'Schedule publication', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel publication', exact: true }).click();
    await expect(page.getByText(/^Cancelled ·/)).toBeVisible();
    await page.getByRole('button', { name: 'Schedule publication', exact: true }).click();
    await page.getByRole('button', { name: 'Edit publication time', exact: true }).click();
    const due = new Date(Math.ceil((Date.now() + 30_000) / 60_000) * 60_000);
    await page
      .getByLabel('New publication time (Asia/Singapore)', { exact: true })
      .fill(zonedWallTime(due, 'Asia/Singapore'));
    await page.getByRole('button', { name: 'Save publication time', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save publication time', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Drafts and scheduled messages' }).click();
    await page.getByRole('button', { name: new RegExp(`^${body}`) }).click();
    await expect(page.getByText(/^Published ·/)).toBeVisible({ timeout: 110_000 });
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Schedule publication' })).toHaveCount(0);
    await expect(page.getByText(revised, { exact: true })).toBeVisible();
    const currentRead = page.waitForRequest(
      (request) => request.url() === `${base}/announcements` && !!request.headers().authorization,
    );
    await page.reload();
    await expect(page.getByText(revised, { exact: true })).toBeVisible();
    const renewed = await currentRead;
    const published = await page.request.get(`${base}/announcements`, {
      headers: { Authorization: renewed.headers().authorization! },
    });
    expect(published.status()).toBe(200);
    expect(
      (await published.json()).data.filter((message: { body: string }) => message.body === revised),
    ).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}
