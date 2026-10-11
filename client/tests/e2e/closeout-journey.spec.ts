import { expect, test } from '@playwright/test';
import {
  CreateArchiveExportRequest,
  GoLiveCheckCode,
  LifecycleReadinessResponse,
  TransitionEventRequest,
  type EventStatus,
} from '@spoh/shared';
import { mockIdentityUi, IDENTITY_EVENT, IDENTITY_PERSON } from './identityUiFixture';

const at = '2027-01-08T10:00:00.000Z';
const pack = {
  id: 'archive-pack',
  eventId: IDENTITY_EVENT.id,
  snapshotId: 'final-report',
  objectKey: 'synthetic/archive.xlsx',
  createdAt: at,
  downloadPath: `/reports/archive-export/archive-pack`,
};
function readiness(status: EventStatus, version: number, packed: boolean) {
  const to = status === 'LIVE' ? 'CLOSED' : 'ARCHIVED';
  return LifecycleReadinessResponse.parse({
    lifecycle: { eventId: IDENTITY_EVENT.id, status, version, hasBeenLive: true },
    evaluatedAt: at,
    reopenUntil: null,
    goLiveReadiness: GoLiveCheckCode.options.map((code) => ({
      code,
      state: 'passed',
      passed: true,
      reasons: [],
    })),
    transitions:
      status === 'ARCHIVED'
        ? []
        : [
            {
              to,
              allowed: status === 'LIVE' || packed,
              requiresReason: false,
              blockers: status === 'CLOSED' && !packed ? ['final-report'] : [],
            },
          ],
  });
}

// Keep this synthetic UI journey aligned with the staffing fixture; production guards,
// retention, frozen reports and archive packs are also tested against the API in P16.
for (const width of [390, 1440]) {
  test(`close, settle custody, save the archive pack and open the next-event wizard (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let status: EventStatus = 'LIVE';
    let version = 4;
    let settled = false;
    let packed = false;
    const transitions: EventStatus[] = [];
    await mockIdentityUi(page, {
      actions: [
        'Self.Read',
        'Event.Close',
        'Event.Archive',
        'Platform.CloneEvent',
        'Incident.Read',
        'LostFound.CloseOut',
        'Fallback.Declare',
        'Report.Export',
      ],
      handle: async (route, path) => {
        const event = { ...IDENTITY_EVENT, status };
        if (path.endsWith('/me')) {
          await route.fulfill({
            json: {
              volunteer: IDENTITY_PERSON,
              event,
              currentAssignment: null,
              upcomingAssignments: [],
              escalationChain: [],
            },
          });
          return true;
        }
        if (path.endsWith('/api/v1/events')) {
          await route.fulfill({ json: { data: [event] } });
          return true;
        }
        if (path.endsWith('/events/administration')) {
          await route.fulfill({
            json: {
              organisations: [
                {
                  id: 'organisation',
                  name: 'Synthetic School',
                  timezone: IDENTITY_EVENT.timezone,
                  locale: IDENTITY_EVENT.locale,
                  canCreate: true,
                  canClone: true,
                },
              ],
              events: [
                {
                  id: event.id,
                  organisationId: 'organisation',
                  slug: event.slug,
                  name: event.name,
                  timezone: event.timezone,
                  locale: event.locale,
                  status,
                  venue: 'Synthetic Hall',
                },
              ],
            },
          });
          return true;
        }
        if (path.endsWith('/lifecycle/readiness')) {
          await route.fulfill({ json: readiness(status, version, packed) });
          return true;
        }
        if (path.endsWith('/lifecycle')) {
          const input = TransitionEventRequest.parse(route.request().postDataJSON());
          expect(input.expectedVersion).toBe(version);
          expect(input.to).toBe(status === 'LIVE' ? 'CLOSED' : 'ARCHIVED');
          if (input.to === 'ARCHIVED') expect(packed).toBe(true);
          status = input.to;
          version += 1;
          transitions.push(status);
          await route.fulfill({
            json: { lifecycle: { eventId: event.id, status, version, hasBeenLive: true } },
          });
          return true;
        }
        if (path.endsWith('/incidents')) {
          await route.fulfill({ json: { data: [], meta: { count: 0, nextCursor: null } } });
          return true;
        }
        if (path.endsWith('/fallback/windows')) {
          await route.fulfill({ json: { data: [] } });
          return true;
        }
        if (path.endsWith('/lost-found/close-out')) {
          expect(status).toBe('CLOSED');
          expect(route.request().postDataJSON()).toEqual({});
          settled = true;
          await route.fulfill({ json: { markedUnclaimed: 2 } });
          return true;
        }
        if (path.endsWith('/lost-found')) {
          await route.fulfill({ json: { data: [] } });
          return true;
        }
        if (path.endsWith('/reports/archive-exports')) {
          await route.fulfill({ json: { data: packed ? [pack] : [] } });
          return true;
        }
        if (path.endsWith('/reports/archive-export')) {
          expect(status).toBe('CLOSED');
          CreateArchiveExportRequest.parse(route.request().postDataJSON());
          packed = true;
          await route.fulfill({ status: 201, json: { data: pack } });
          return true;
        }
        if (path.endsWith('/reports/archive-export/archive-pack')) {
          await route.fulfill({
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: 'synthetic UI download bytes',
          });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/close-out`);
    await expect(page.getByRole('button', { name: 'Close event', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('link', { name: 'Open final report', exact: true }),
    ).toHaveAttribute('href', `/e/${IDENTITY_EVENT.slug}/reports`);
    await page.getByLabel('I reviewed the open cases and am ready to close capture').check();
    await page.getByRole('button', { name: 'Close event', exact: true }).click();
    await expect.poll(() => status).toBe('CLOSED');
    await page.reload();
    await expect(page.getByText('A verified final report is required.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive event', exact: true })).toHaveCount(0);
    await page.getByLabel('I reviewed held items and their custody').check();
    await page.getByRole('button', { name: 'Settle lost and found', exact: true }).click();
    await expect(page.getByText('2 items marked unclaimed.')).toBeVisible();
    expect(settled).toBe(true);
    await page.getByRole('button', { name: 'Prepare archive export', exact: true }).click();
    await page.getByRole('button', { name: 'Save export pack', exact: true }).click();
    await expect(
      page.getByText('Export pack saved. Check the Overview for archive readiness.'),
    ).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Download pack/ }).click();
    expect((await download).suggestedFilename()).toBe(
      `${IDENTITY_EVENT.slug}-archive-${pack.id}.xlsx`,
    );
    await page.getByRole('button', { name: 'Reload close-out readiness', exact: true }).click();
    await page.getByLabel('I saved the export pack and reviewed archive readiness').check();
    await page.getByRole('button', { name: 'Archive event', exact: true }).click();
    await expect.poll(() => status).toBe('ARCHIVED');
    expect(transitions).toEqual(['CLOSED', 'ARCHIVED']);
    const next = page.getByRole('link', { name: 'Start a new event from this one', exact: true });
    await expect(next).toHaveAttribute('href', `/events?clone=${IDENTITY_EVENT.id}`);
    await next.click();
    await expect(
      page.getByRole('heading', { name: `Clone ${IDENTITY_EVENT.name}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review clone', exact: true })).toBeVisible();
  });

  test(`a member without lifecycle authority cannot start close-out (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    await mockIdentityUi(page, {
      actions: ['Self.Read'],
      handle: async (route, path) => {
        if (
          path.endsWith('/lifecycle') ||
          path.endsWith('/lost-found/close-out') ||
          path.endsWith('/reports/archive-export')
        ) {
          writes.push(route.request().method());
          await route.fulfill({ status: 403, json: {} });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/close-out`);
    await expect(
      page.getByText('Close-out is available to authorised event leaders.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close event', exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
