import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const EVENT_ID = 'evt_spoh2027';
function databaseUrl(): string {
  const value = process.env.E2E_DATABASE_URL;
  if (!value) throw new Error('E2E_DATABASE_URL is required');
  const url = new URL(value);
  if (url.hostname !== 'localhost' || url.pathname !== '/spoh2027_rehearsal_shift_e2e_test')
    throw new Error('Dedicated local lifecycle browser database required');
  return value;
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`reviewed lifecycle UI ends rehearsal, resumes it, closes and reopens (${name})`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = (
      await db.query<{ status: string; closedAt: Date | null; organisationId: string }>(
        'SELECT status, "closedAt", "organisationId" FROM "Event" WHERE id=$1',
        [EVENT_ID],
      )
    ).rows[0]!;
    const admin = (
      await db.query<{ id: string }>('SELECT id FROM "Person" WHERE email=$1', [
        'admin@spoh2027.test',
      ])
    ).rows[0]!;
    const membership = (
      await db.query<{ id: string; role: string }>(
        'SELECT id, role FROM "OrganisationMembership" WHERE "organisationId"=$1 AND "personId"=$2',
        [original.organisationId, admin.id],
      )
    ).rows[0];
    const windows = (
      await db.query<{ id: string; endedAt: Date | null }>(
        'SELECT id, "endedAt" FROM "FallbackWindow" WHERE "eventId"=$1',
        [EVENT_ID],
      )
    ).rows;
    const items = (
      await db.query<{ id: string; status: string }>(
        'SELECT id, status FROM "LostFoundItem" WHERE "eventId"=$1',
        [EVENT_ID],
      )
    ).rows;
    let windowId: string | undefined;
    let closedVersion: number | undefined;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.name));
    try {
      if (membership)
        await db.query('UPDATE "OrganisationMembership" SET role=$1 WHERE id=$2', [
          'PLATFORM_ADMIN',
          membership.id,
        ]);
      else
        await db.query(
          'INSERT INTO "OrganisationMembership" (id, "organisationId", "personId", role, "updatedAt") VALUES ($1,$2,$3,$4,NOW())',
          [randomUUID(), original.organisationId, admin.id, 'PLATFORM_ADMIN'],
        );
      await db.query('UPDATE "Event" SET status=$1, "closedAt"=NULL WHERE id=$2', [
        'REHEARSAL',
        EVENT_ID,
      ]);
      const me = page.waitForRequest(
        (request) => request.url().endsWith('/me') && !!request.headers().authorization,
      );
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('admin@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      const observed = await me;
      const base = observed.url().replace(/\/me$/, '');
      const api = new URL(base);
      if (api.hostname !== 'localhost' || api.port !== '4012')
        throw new Error('Dedicated local API required');
      const headers = { Authorization: observed.headers().authorization! };
      const declaration = await page.request.post(`${base}/fallback/windows`, {
        headers,
        data: { tier: 4, reason: `Synthetic lifecycle UI ${name}` },
      });
      expect(declaration.status()).toBe(201);
      windowId = (await declaration.json()).window.id;
      await page.goto('/e/spoh2027/admin/settings');
      await page.getByRole('button', { name: 'Lifecycle and readiness' }).click();
      await expect(page.getByText(/Reviewed state: Rehearsal/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'End rehearsal', exact: true })).toBeDisabled();
      await page.getByLabel('I have reviewed this transition and its effects').check();
      await page.getByRole('button', { name: 'End rehearsal', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Event state changed successfully.');
      expect(
        (
          await db.query('SELECT "endedAt" FROM "FallbackWindow" WHERE "eventId"=$1 AND id=$2', [
            EVENT_ID,
            windowId,
          ])
        ).rows[0]?.endedAt,
      ).not.toBeNull();
      await page.getByRole('button', { name: 'Review current state' }).click();
      await expect(page.getByText(/Reviewed state: Ready/)).toBeVisible();
      await expect(page.getByText('The go-live checklist is not available yet.')).toBeVisible();
      await expect(page.getByRole('option', { name: 'Go live', exact: true })).toBeDisabled();
      await page.getByLabel('Next event state').selectOption('REHEARSAL');
      await page.getByLabel('I have reviewed this transition and its effects').check();
      await page.getByRole('button', { name: 'Start rehearsal', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Event state changed successfully.');
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible();
      await db.query('UPDATE "Event" SET status=$1, "closedAt"=NULL WHERE id=$2', [
        'LIVE',
        EVENT_ID,
      ]);
      await page.getByRole('button', { name: 'Reload readiness', exact: true }).click();
      await page.getByRole('button', { name: 'Review current state' }).click();
      await expect(page.getByText(/Reviewed state: Live/)).toBeVisible();
      await expect(page.getByText(/Closing freezes the final report/)).toBeVisible();
      await page.getByLabel('I have reviewed this transition and its effects').check();
      const closing = page.waitForResponse(
        (response) =>
          response.url() === `${base}/lifecycle` && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Close event', exact: true }).click();
      const closed = await closing;
      expect(closed.status()).toBe(200);
      closedVersion = (await closed.json()).lifecycle.version;
      await expect(page.getByRole('status')).toContainText('Event state changed successfully.');
      await page.getByRole('button', { name: 'Review current state' }).click();
      await expect(page.getByText(/Reviewed state: Closed/)).toBeVisible();
      await expect(page.getByRole('option', { name: 'Archive event' })).toBeDisabled();
      await expect(page.getByText(/Reopening deadline:/)).toBeVisible();
      await page.getByLabel('I have reviewed this transition and its effects').check();
      await page.getByRole('button', { name: 'Reopen event', exact: true }).click();
      await expect(page.getByText('Enter a reason for reopening.')).toBeVisible();
      await page
        .getByLabel('Reason for transition', { exact: true })
        .fill(`Correct a synthetic ${name} close`);
      await page.getByRole('button', { name: 'Reopen event', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Event state changed successfully.');
      const snapshot = (
        await db.query<{ supersededAt: Date | null }>(
          'SELECT "supersededAt" FROM "ReportSnapshot" WHERE "eventId"=$1 AND "lifecycleVersion"=$2',
          [EVENT_ID, closedVersion],
        )
      ).rows[0]!;
      expect(snapshot.supersededAt).not.toBeNull();
      expect(
        (
          await db.query(
            'SELECT status FROM "ScheduledAction" WHERE "eventId"=$1 AND type=$2 AND payload->>\'lifecycleVersion\'=$3',
            [EVENT_ID, 'event.archiveReminder', String(closedVersion)],
          )
        ).rows[0]?.status,
      ).toBe('CANCELLED');
      await page.reload();
      await page.getByRole('button', { name: 'Lifecycle and readiness' }).click();
      await expect(page.getByText(/Reviewed state: Live/)).toBeVisible();
      await page.screenshot({ path: `../.local/lifecycle-controls-${name}.png`, fullPage: true });
      expect(pageErrors).toEqual([]);
    } finally {
      for (const window of windows)
        await db.query('UPDATE "FallbackWindow" SET "endedAt"=$1 WHERE "eventId"=$2 AND id=$3', [
          window.endedAt,
          EVENT_ID,
          window.id,
        ]);
      for (const item of items)
        await db.query('UPDATE "LostFoundItem" SET status=$1 WHERE "eventId"=$2 AND id=$3', [
          item.status,
          EVENT_ID,
          item.id,
        ]);
      if (windowId)
        await db.query('DELETE FROM "FallbackWindow" WHERE "eventId"=$1 AND id=$2', [
          EVENT_ID,
          windowId,
        ]);
      if (closedVersion !== undefined) {
        await db.query(
          'DELETE FROM "ReportSnapshot" WHERE "eventId"=$1 AND "lifecycleVersion"=$2',
          [EVENT_ID, closedVersion],
        );
        await db.query(
          'DELETE FROM "ScheduledAction" WHERE "eventId"=$1 AND type=$2 AND payload->>\'lifecycleVersion\'=$3',
          [EVENT_ID, 'event.archiveReminder', String(closedVersion)],
        );
      }
      if (membership)
        await db.query('UPDATE "OrganisationMembership" SET role=$1 WHERE id=$2', [
          membership.role,
          membership.id,
        ]);
      else
        await db.query(
          'DELETE FROM "OrganisationMembership" WHERE "organisationId"=$1 AND "personId"=$2',
          [original.organisationId, admin.id],
        );
      await db.query('UPDATE "Event" SET status=$1, "closedAt"=$2 WHERE id=$3', [
        original.status,
        original.closedAt,
        EVENT_ID,
      ]);
      await db.end();
    }
  });
}
