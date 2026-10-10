import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { promoteToPlatformAdmin } from './platformAdmin';

/** Written with the feature; execution belongs to the P16 campaign (ADR-011). */
test('an organiser creates and clones an event through the reviewed wizard into Setup', async ({
  page,
}) => {
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.port !== '5435' ||
    database.pathname !== '/spoh2027_test'
  )
    throw new Error('The authorised local test database is required');
  const db = new pg.Client({ connectionString: database.toString() });
  await db.connect();
  const restore = await promoteToPlatformAdmin(db, 'admin@spoh2027.test');
  const suffix = randomUUID().slice(0, 8);
  const eventName = `Wizard event ${suffix}`;
  const startedAt = Date.now();
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Roster email').fill('admin@spoh2027.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('/events');
    await page.getByRole('button', { name: 'Create new event' }).click();
    await page.getByLabel('Event name').fill(eventName);
    await page.getByLabel('Event address').fill(`wizard-${suffix}`);
    await page.getByLabel('Venue').fill('Fixture campus');
    await page.getByLabel('Timezone').fill('Asia/Singapore');
    await page.getByLabel('First day').fill('2027-02-01');
    await page.getByLabel('Last day').fill('2027-02-02');
    await expect(page.getByLabel('Join new event as Admin')).toBeChecked();
    await page.getByRole('button', { name: 'Review event', exact: true }).click();
    await expect(page.getByText(/You will join the new event as Admin/)).toBeVisible();
    await page.getByRole('button', { name: 'Create event', exact: true }).click();
    await page.waitForURL(`**/e/wizard-${suffix}/setup`);
    await expect(page.getByRole('heading', { name: 'Set up this event' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Go-live readiness' })).toBeVisible();
    await page.goto('/events');
    await page.getByRole('button', { name: `Clone ${eventName}`, exact: true }).click();
    await page.getByLabel('New event name').fill(`Cloned event ${suffix}`);
    await page.getByLabel('New event address').fill(`clone-${suffix}`);
    await page.getByLabel('Move every day by').fill('365');
    await page.getByLabel('Published guide into a new draft').uncheck();
    await page.getByRole('button', { name: 'Review clone', exact: true }).click();
    await expect(page.getByText(/Days move by 365/)).toBeVisible();
    await page.getByRole('button', { name: 'Create event', exact: true }).click();
    await page.waitForURL(`**/e/clone-${suffix}/setup`);
    await page
      .getByRole('navigation', { name: 'Event workspace' })
      .getByRole('link', { name: 'Overview' })
      .click();
    await expect(
      page.getByRole('heading', { name: `Cloned event ${suffix}`, exact: true }),
    ).toBeVisible();
    test
      .info()
      .annotations.push({
        type: 'journey-1-create-and-clone-ms',
        description: String(Date.now() - startedAt),
      });
  } finally {
    await restore();
    await db.end();
  }
});
