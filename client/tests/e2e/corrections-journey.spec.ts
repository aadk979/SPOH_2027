import { expect, test } from '@playwright/test';
import {
  CreateFootfallBulkRequest,
  RecentFootfallResponse,
  RecentRegistrationsResponse,
  VoidRegistrationRequest,
  type AuditEntryRecord,
} from '@spoh/shared';
import { mockIdentityUi, IDENTITY_EVENT, IDENTITY_PERSON } from './identityUiFixture';
import { STAFFING_STATION } from '../helpers/staffing';

const at = '2027-01-08T01:30:00.000Z';
const registration = {
  id: 'registration',
  category: 'SEC_1',
  categoryLabel: 'Sec 1',
  stationId: STAFFING_STATION.id,
  groupId: null,
  missionCardId: null,
  source: 'APP',
  recordedAt: at,
  clientRecordedAt: null,
  voided: false,
};
const tick = {
  id: 'tick',
  stationId: STAFFING_STATION.id,
  quantity: 3,
  source: 'PAPER',
  recordedAt: at,
  clientRecordedAt: null,
  timeBlockStart: at,
  voided: false,
};
const envelope = (data: unknown[], nextCursor: string | null = null) => ({
  data,
  meta: { count: data.length, nextCursor },
});

// These UI journeys use the same synthetic authentication fixture as staffing. The real
// station/mode/receipt guarantees are covered by the server integration campaign in P16.
for (const width of [390, 1440]) {
  test(`select a counting record, correct it and inspect its audit trail (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let voided = false;
    let paperSaved = false;
    const history: AuditEntryRecord[] = [];
    await mockIdentityUi(page, {
      actions: ['Self.Read', 'Dashboard.ReadStation', 'Record.Void', 'Count.Adjust', 'Audit.Read'],
      handle: async (route, path) => {
        const query = new URL(route.request().url()).searchParams;
        if (path.endsWith('/stations')) {
          await route.fulfill({ json: envelope([STAFFING_STATION]) });
          return true;
        }
        if (path.endsWith('/registrations/recent')) {
          expect(query.get('stationId')).toBe(STAFFING_STATION.id);
          expect(query.get('rehearsal')).toBe('false');
          const data = voided
            ? []
            : [query.has('cursor') ? { ...registration, id: 'older-registration' } : registration];
          await route.fulfill({
            json: RecentRegistrationsResponse.parse(
              envelope(data, voided || query.has('cursor') ? null : registration.id),
            ),
          });
          return true;
        }
        if (path.endsWith('/footfall/recent')) {
          expect(query.get('stationId')).toBe(STAFFING_STATION.id);
          expect(query.get('rehearsal')).toBe('false');
          await route.fulfill({ json: RecentFootfallResponse.parse(envelope([tick])) });
          return true;
        }
        if (path.endsWith('/registrations/registration/void')) {
          const input = VoidRegistrationRequest.parse(route.request().postDataJSON());
          expect(input.reason).toBe('Duplicate tap checked against the booth sheet');
          voided = true;
          history.push({
            id: 'audit-void',
            action: 'registration.void',
            entityType: 'Registration',
            entityId: registration.id,
            actorId: IDENTITY_PERSON.id,
            actorName: IDENTITY_PERSON.displayName,
            before: { voided: false },
            after: { voided: true, reason: input.reason },
            requestId: 'correction-request',
            createdAt: at,
          });
          await route.fulfill({ status: 204 });
          return true;
        }
        if (path.endsWith('/footfall/bulk')) {
          expect(CreateFootfallBulkRequest.parse(route.request().postDataJSON())).toMatchObject({
            stationId: STAFFING_STATION.id,
            quantity: 12,
            source: 'PAPER',
            rehearsal: false,
            timeBlockStart: at,
            reason: 'Morning clicker sheet had twelve room entries',
          });
          paperSaved = true;
          await route.fulfill({ status: 201, json: { tick: { ...tick, quantity: 12 } } });
          return true;
        }
        if (path.endsWith('/audit')) {
          const filtered = query.has('action')
            ? history.filter((entry) => entry.action === query.get('action'))
            : history;
          await route.fulfill({ json: envelope(filtered) });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/corrections`);
    const correction = page.getByRole('heading', { name: 'Void a counting record' }).locator('..');
    await expect(correction.getByRole('button', { name: 'Void record' })).toBeDisabled();
    await correction.getByLabel('Find a recent record at').selectOption(STAFFING_STATION.id);
    await correction.getByRole('button', { name: /Sec 1 · APP/ }).click();
    await expect(correction.getByLabel('Selected record ID')).toHaveValue(registration.id);
    await correction.getByRole('button', { name: 'Load older counting records' }).click();
    await expect(correction.getByRole('button', { name: /Sec 1 · APP/ })).toHaveCount(2);
    await correction
      .getByLabel('Reason', { exact: true })
      .fill('Duplicate tap checked against the booth sheet');
    await correction.getByLabel('I checked the record ID and intend to remove this count').check();
    await correction.getByRole('button', { name: 'Void record' }).click();
    await expect(correction.getByRole('status')).toContainText('Correction saved.');
    expect(voided).toBe(true);
    await correction.getByLabel('Footfall tick', { exact: true }).check();
    await expect(correction.getByLabel('Selected record ID')).toHaveValue('');
    await correction.getByLabel('Find a recent record at').selectOption(STAFFING_STATION.id);
    await correction.getByRole('button', { name: /3 room entries/ }).click();
    await expect(correction.getByLabel('Selected record ID')).toHaveValue(tick.id);

    const paper = page.getByRole('heading', { name: 'Add a paper footfall total' }).locator('..');
    await paper.getByLabel('Room or station').selectOption(STAFFING_STATION.id);
    await paper.getByLabel('Room entries', { exact: true }).fill('12');
    await paper.getByLabel('Block start (Asia/Singapore)').fill('2027-01-08T09:30');
    await paper
      .getByLabel('Reason', { exact: true })
      .fill('Morning clicker sheet had twelve room entries');
    await paper.getByRole('button', { name: 'Record paper total' }).click();
    await expect(paper.getByRole('status')).toContainText('Correction saved.');
    expect(paperSaved).toBe(true);
    await page.getByRole('link', { name: 'Find a record in the audit trail' }).click();
    await expect(page.getByRole('heading', { name: 'Audit trail', exact: true })).toBeVisible();
    await page.getByLabel('Action', { exact: false }).fill('registration.void');
    await page.getByLabel('Record ID', { exact: false }).fill(registration.id);
    await page.getByRole('button', { name: 'Apply audit filters' }).click();
    await page.getByText('Before and after', { exact: true }).click();
    await expect(page.getByText(/Duplicate tap checked against the booth sheet/)).toBeVisible();
    expect(history).toHaveLength(1);
  });

  test(`a counting volunteer cannot open correction writes (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    await mockIdentityUi(page, {
      actions: ['Self.Read'],
      handle: async (route, path) => {
        if (
          /\/(registrations\/recent|footfall\/recent|footfall\/bulk)$/.test(path) ||
          path.endsWith('/void')
        ) {
          requests.push(route.request().method());
          await route.fulfill({ status: 403, json: {} });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/corrections`);
    await expect(
      page.getByText('Counting corrections are available to authorised event leaders.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Void record' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Record paper total' })).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}
