import { expect, test, type Page } from '@playwright/test';
import { AuditEntryRecord, CreateLifecycleScheduleRequest, LifecycleReadinessResponse,
  MemberPermissionsResponse, MissionCardRecord, RosterImportRequest, RosterImportResponse, ScheduleMutationResponse,
  ScheduleTimelineResponse, SimulatePermissionResponse, SwapRequestRecord, collection } from '@spoh/shared';
import { campaignAdminResponses } from '../browser/campaignAdminData';
import { CAMPAIGN_NOW, CAMPAIGN_STATION } from '../browser/campaignCore';
import { STAFFING_SWAP } from '../helpers/staffing';
import { associatedError, cancelDialog, keyboardActivate, keyboardReach, keyboardType, observedEventWrites,
  openAcceptancePage, responseOverride, visibleFocus } from '../browser/keyboardAcceptance';

const API = '/api/v1/events/evt_mock';
const ADMIN_PATHS = ['/setup', '/admin/stations', '/admin/categories', '/admin/days', '/admin/gifts', '/admin/cards',
  '/admin/settings', '/admin/permissions', '/admin/content', '/admin/schedule', '/admin/users', '/admin/users/invite',
  '/admin/users/person', '/admin/staffing', '/swaps', '/briefings', '/admin/audit', '/admin/corrections', '/admin/close-out'];

async function nativeValue(page: Page, label: string, value: string) {
  const control = page.getByLabel(label, { exact: false });
  await keyboardReach(page, control);
  // Native segmented date/time editing varies by OS; Tab reach and all actions remain real keyboard interactions.
  await control.fill(value);
  await page.keyboard.press('Tab');
}
async function tabThroughPage(page: Page) {
  const controls = await page.locator('main a[href], main button, main input, main select, main textarea, main summary').all();
  let checked = 0;
  for (const control of controls) {
    const focusable = await control.evaluate((element) => {
      const input = element as HTMLInputElement;
      return element.getClientRects().length > 0 && !input.disabled && input.tabIndex >= 0
        && !(input.type === 'radio' && !input.checked);
    });
    if (!focusable) continue;
    await keyboardReach(page, control);
    await page.keyboard.press('Tab');
    await expect(control).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(control).toBeFocused();
    checked += 1;
  }
  expect(checked, 'The populated workspace must expose actual keyboard controls').toBeGreaterThan(0);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`admin keyboard ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false,
      colorScheme: theme, locale: 'en-SG', timezoneId: 'Asia/Singapore', serviceWorkers: 'block',
      contextOptions: { reducedMotion: 'reduce' } });

    for (const path of ADMIN_PATHS) {
      test(`${path}: every visible enabled workspace control has reachable painted focus and an exit`, async ({ page }) => {
        const fixture = await openAcceptancePage(page, path);
        await tabThroughPage(page);
        expect(fixture.unexpected).toEqual([]);
      });
    }

    test('setup branding validation and publication cancellation return to the exact opener', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/setup');
      await cancelDialog(page, page.getByRole('button', { name: 'Publish event branding', exact: true }), 'Publish this event identity?');
      await keyboardType(page, page.getByLabel('Accent colour'), 'invalid');
      await keyboardActivate(page, page.getByRole('button', { name: 'Save branding draft', exact: true }));
      await associatedError(page.getByLabel('Accent colour'));
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    for (const item of [
      { path: '/admin/stations', summary: 'Add stations', submit: 'Create station', label: 'Station code' },
      { path: '/admin/categories', summary: 'Add visitor categories', submit: 'Create category', label: 'Category code' },
      { path: '/admin/days', summary: 'Add event days', submit: 'Create day', label: 'Day label' },
    ]) {
      test(`${item.path}: Enter expands a native editor, invalid submit associates errors, and Tab exits`, async ({ page }) => {
        const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, item.path);
        const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: item.summary }) }).first();
        await keyboardActivate(page, details.locator('summary'));
        await expect(details).toHaveAttribute('open', '');
        await keyboardActivate(page, details.getByRole('button', { name: item.submit, exact: true }));
        await associatedError(details.getByLabel(item.label, { exact: true }));
        await keyboardReach(page, details.getByLabel(item.label, { exact: true }));
        await page.keyboard.press('Tab'); await expect(details.getByLabel(item.label, { exact: true })).not.toBeFocused();
        expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
      });
    }

    test('day removal has an explicit reversible review and exceptions grid works by keyboard', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/days');
      const day = page.locator('details').filter({ has: page.locator('summary strong').filter({ hasText: /^Day one$/ }) });
      await keyboardActivate(page, day.locator('summary'));
      const consent = day.getByLabel(/Remove Day one .* and its empty shifts/);
      await keyboardReach(page, consent); await page.keyboard.press('Space');
      await expect(day.getByRole('button', { name: 'Remove unused day' })).toBeEnabled();
      await page.keyboard.press('Space');
      await expect(consent).toBeFocused(); await expect(day.getByRole('button', { name: 'Remove unused day' })).toBeDisabled();
      const grid = page.getByRole('table', { name: 'Individual shift hours by event day and template' });
      await keyboardActivate(page, grid.locator('summary').first());
      await keyboardReach(page, grid.getByLabel('Exception start time').first());
      await keyboardReach(page, grid.getByRole('button', { name: 'Save exception' }).first());
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('settings error belongs to Event name and correcting it keeps a usable tab order', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/settings');
      await keyboardType(page, page.getByLabel('Event name', { exact: true }), 'x');
      await associatedError(page.getByLabel('Event name', { exact: true }));
      await keyboardType(page, page.getByLabel('Event name', { exact: true }), 'Synthetic Campaign Event');
      await expect(page.getByLabel('Event name', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
      await keyboardActivate(page, page.getByRole('button', { name: 'Lifecycle and readiness', exact: true }));
      await keyboardReach(page, page.getByRole('button', { name: 'Reload readiness', exact: true }));
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('permissions are read-only where fixed and a keyboard simulation announces its refusal reason', async ({ page }) => {
      const fixture = await openAcceptancePage(page, '/admin/permissions');
      await responseOverride(page, { path: `${API}/permissions/people/person`, response: MemberPermissionsResponse.parse({
        data: { personId: 'person', role: 'ADMIN', actions: { 'Self.Read': true } } }) });
      await responseOverride(page, { path: `${API}/permissions/simulate`, method: 'POST', response: SimulatePermissionResponse.parse({
        data: { allowed: false, policies: ['event-isolation'], explanation: 'The selected station is outside this event.' } }) });
      await keyboardReach(page, page.getByLabel('Role', { exact: true }));
      await page.keyboard.press('Home'); await page.keyboard.press('Enter');
      await expect(page.getByText('fixed', { exact: true }).first()).toBeVisible();
      await keyboardReach(page, page.getByLabel('Person', { exact: true }));
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await keyboardReach(page, page.getByLabel('Action', { exact: true }));
      await keyboardActivate(page, page.getByRole('button', { name: 'Check', exact: true }));
      await expect(page.getByRole('status').filter({ hasText: 'The selected station is outside this event.' })).toBeVisible();
      expect(fixture.unexpected).toEqual([]);
    });

    test('saved content can be reviewed by keyboard and publishing cancellation restores focus', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/content');
      await keyboardActivate(page, page.locator('summary').filter({ hasText: 'Saved draft 2 to publish' }));
      await expect(page.getByText('Know your station.', { exact: true }).first()).toBeVisible();
      await cancelDialog(page, page.getByRole('button', { name: 'Publish reviewed draft', exact: true }), 'Publish reviewed guide');
      await keyboardType(page, page.getByLabel('Essential point 1', { exact: true }), '');
      await keyboardActivate(page, page.getByRole('button', { name: 'Save draft', exact: true }));
      await associatedError(page.getByLabel('Essential point 1', { exact: true }));
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('schedule producer validation, exact create and pending cancellation are reachable by keyboard', async ({ page }) => {
      const fixture = await openAcceptancePage(page, '/admin/schedule');
      const timeline = ScheduleTimelineResponse.parse(campaignAdminResponses('/admin/schedule').find((response) => response.path === '/schedules')!.body);
      const row = timeline.data[0]!;
      await responseOverride(page, { path: `${API}/schedules/lifecycle`, method: 'POST', response: ScheduleMutationResponse.parse({ schedule: { ...row, kind: 'LIFECYCLE' } }),
        inspect: (body) => expect(CreateLifecycleScheduleRequest.parse(body)).toMatchObject({ to: 'CLOSED', expectedVersion: 4 }) });
      await responseOverride(page, { path: `${API}/schedules/${row.id}/cancel`, method: 'POST', response: ScheduleMutationResponse.parse({ schedule: { ...row, status: 'CANCELLED', version: 2 } }),
        inspect: (body) => expect(body).toMatchObject({ expectedVersion: 1, idempotencyKey: expect.any(String) }) });
      await keyboardActivate(page, page.getByRole('button', { name: 'Schedule lifecycle change', exact: true }));
      await associatedError(page.getByLabel('Move the event to'));
      await associatedError(page.getByLabel('Change at', { exact: false }));
      await keyboardReach(page, page.getByLabel('Move the event to'));
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await nativeValue(page, 'Change at', '2027-01-08T13:00');
      await keyboardType(page, page.getByLabel('Reason (required to reopen)'), 'Reviewed operations finish time');
      await keyboardActivate(page, page.getByRole('button', { name: 'Schedule lifecycle change', exact: true }));
      await expect(page.getByRole('status').filter({ hasText: 'Scheduled. It appears under Scheduled work' })).toBeVisible();
      await keyboardActivate(page, page.getByRole('button', { name: 'Scheduled work', exact: true }));
      await keyboardReach(page, page.getByLabel('Schedule status'));
      await keyboardActivate(page, page.getByRole('button', { name: 'Cancel this schedule', exact: true }).first());
      expect(fixture.unexpected).toEqual([]);
    });

    test('roster withdrawal review can be cancelled and focus returns without a write', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/users');
      await keyboardReach(page, page.getByLabel('Name or email'));
      await keyboardActivate(page, page.getByRole('button', { name: 'Manage', exact: true }).first());
      await keyboardType(page, page.getByLabel('Reason', { exact: true }), 'Verified committee departure');
      await cancelDialog(page, page.getByRole('button', { name: 'Deactivate Target Person', exact: true }), 'Withdraw Target Person from this event?');
      await keyboardActivate(page, page.getByRole('button', { name: 'Close', exact: true }).first());
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('invitation and CSV errors are associated; corrected CSV preview/apply remains exact', async ({ page }) => {
      const fixture = await openAcceptancePage(page, '/admin/users/invite');
      const imports: RosterImportRequest[] = [];
      await responseOverride(page, { path: `${API}/roster/import`, method: 'POST', response: RosterImportResponse.parse({ committed: false,
        volunteersCreated: 1, volunteersUpdated: 0, assignmentsCreated: 0, assignmentsUpdated: 0, issues: [] }),
      inspect: (body) => { imports.push(RosterImportRequest.parse(body)); } });
      await keyboardActivate(page, page.getByRole('button', { name: 'Invite person', exact: true }));
      await associatedError(page.getByLabel('Name', { exact: true })); await associatedError(page.getByLabel('Email', { exact: true }));
      const csv = page.getByLabel('Roster CSV');
      await keyboardType(page, csv, 'displayName,email,role\nSynthetic Person,invalid-email,VOLUNTEER');
      await keyboardActivate(page, page.getByRole('button', { name: 'Preview import', exact: true }));
      await associatedError(csv); expect(imports).toEqual([]);
      await keyboardType(page, csv, 'displayName,email,role\nSynthetic Person,synthetic@example.test,VOLUNTEER');
      await keyboardActivate(page, page.getByRole('button', { name: 'Preview import', exact: true }));
      await expect(page.getByRole('status').filter({ hasText: 'Preview: 1 people added' })).toBeVisible();
      await responseOverride(page, { path: `${API}/roster/import`, method: 'POST', response: RosterImportResponse.parse({ committed: true,
        volunteersCreated: 1, volunteersUpdated: 0, assignmentsCreated: 0, assignmentsUpdated: 0, issues: [] }),
      inspect: (body) => { imports.push(RosterImportRequest.parse(body)); } });
      await keyboardActivate(page, page.getByRole('button', { name: 'Apply reviewed import', exact: true }));
      await expect(page.getByRole('status').filter({ hasText: 'Applied: 1 people added' })).toBeVisible();
      expect(imports.map((body) => body.commit)).toEqual([false, true]); expect(imports[1]!.rows).toEqual(imports[0]!.rows);
      expect(fixture.unexpected).toEqual([]);
    });

    test('person lifecycle inline cancellation returns to its opener and privacy controls remain reachable', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/users/person');
      await keyboardType(page, page.getByLabel('Reason for deactivating'), 'Verified synthetic departure');
      await keyboardActivate(page, page.getByRole('button', { name: 'Deactivate across all events', exact: true }));
      await keyboardReach(page, page.getByRole('button', { name: 'Confirm deactivate everywhere', exact: true }));
      await keyboardActivate(page, page.getByRole('button', { name: 'Cancel', exact: true }));
      await expect(page.getByRole('button', { name: 'Deactivate across all events', exact: true })).toBeFocused();
      await visibleFocus(page.getByRole('button', { name: 'Deactivate across all events', exact: true }));
      await keyboardActivate(page, page.locator('summary').filter({ hasText: 'Personal data requests' }));
      await keyboardReach(page, page.getByRole('button', { name: 'Download personal data', exact: true }));
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('staffing exact assignment review cancellation, assignment validation and escalation keyboard controls', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/staffing');
      await cancelDialog(page, page.getByRole('button', { name: 'Unassign Sample Person', exact: true }), 'Review assignment removal');
      await keyboardActivate(page, page.locator('summary').filter({ hasText: 'Assign to Room' }).first());
      await keyboardActivate(page, page.getByRole('button', { name: 'Assign', exact: true }).first());
      await associatedError(page.getByLabel('Assign person').first());
      await keyboardReach(page, page.getByLabel('Assignment role').first());
      await keyboardReach(page, page.getByLabel(/reports to/).first());
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('swap creation validation and review decisions have associated, keyboard reachable controls', async ({ page }) => {
      const fixture = await openAcceptancePage(page, '/swaps');
      await responseOverride(page, { path: `${API}/roster/swaps/swap/decide`, method: 'POST',
        response: { swap: SwapRequestRecord.parse({ ...STAFFING_SWAP, status: 'REJECTED', decidedById: 'person', decidedAt: CAMPAIGN_NOW }) },
        inspect: (body) => expect(body).toMatchObject({ decision: 'REJECTED', note: 'Reviewed timetable conflict', idempotencyKey: expect.any(String) }) });
      await keyboardActivate(page, page.getByRole('button', { name: 'Request swap', exact: true }));
      await associatedError(page.getByLabel('Shift to give away'));
      await associatedError(page.getByLabel('Person taking the shift'));
      await keyboardReach(page, page.getByLabel('Decision', { exact: true }).first());
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await keyboardType(page, page.getByLabel('Decision note').first(), 'Reviewed timetable conflict');
      await keyboardActivate(page, page.getByRole('button', { name: 'Save decision', exact: true }).first());
      await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
      expect(fixture.unexpected).toEqual([]);
    });

    test('briefing day, briefer and wave validation remain reachable through completion notes', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/briefings');
      await keyboardReach(page, page.getByLabel('Briefing day'));
      await keyboardActivate(page, page.getByRole('button', { name: 'Schedule briefing', exact: true }));
      await associatedError(page.getByLabel('Briefing time', { exact: false }));
      await keyboardReach(page, page.getByLabel('Briefer', { exact: true }));
      await keyboardReach(page, page.getByLabel('Wave size'));
      await keyboardType(page, page.getByLabel('Completion notes'), 'Synthetic briefing review note');
      await keyboardReach(page, page.getByRole('button', { name: 'Mark briefing complete', exact: true }));
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('audit filters, before/after disclosure and older records work without a pointer', async ({ page }) => {
      const fixture = await openAcceptancePage(page, '/admin/audit');
      const row = AuditEntryRecord.parse({ id: 'older-audit', action: 'registration.void', entityType: 'Registration', entityId: 'registration',
        actorId: 'person', actorName: 'Sample Person', before: { voided: false }, after: { voided: true }, requestId: 'keyboard-audit', createdAt: CAMPAIGN_NOW });
      await responseOverride(page, { path: `${API}/audit`, query: { limit: '50', action: 'registration.void' },
        response: collection(AuditEntryRecord).parse({ data: [row], meta: { count: 2, nextCursor: 'older-cursor' } }) });
      await responseOverride(page, { path: `${API}/audit`, query: { limit: '50', action: 'registration.void', cursor: 'older-cursor' },
        response: collection(AuditEntryRecord).parse({ data: [{ ...row, id: 'oldest-audit' }], meta: { count: 2, nextCursor: null } }) });
      await keyboardType(page, page.getByLabel('Action', { exact: false }), 'registration.void');
      await keyboardActivate(page, page.getByRole('button', { name: 'Apply audit filters', exact: true }));
      await keyboardActivate(page, page.locator('summary').filter({ hasText: 'Before and after' }).first());
      await expect(page.getByText(/Before:.*voided/)).toBeVisible();
      await keyboardActivate(page, page.getByRole('button', { name: 'Load older entries', exact: true }));
      await expect(page.getByText(/Audit ID: oldest-audit/)).toBeVisible();
      expect(fixture.unexpected).toEqual([]);
    });

    test('counting correction validation is associated and cancelling consent sends no void', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/corrections');
      const consent = page.getByLabel('I checked the record ID and intend to remove this count');
      await keyboardReach(page, consent); await page.keyboard.press('Space');
      await keyboardActivate(page, page.getByRole('button', { name: 'Void record', exact: true }));
      await associatedError(page.getByLabel('Selected record ID'));
      await associatedError(page.getByLabel('Reason', { exact: true }).first());
      await keyboardType(page, page.getByLabel('Selected record ID'), 'campaign-registration');
      await expect(page.getByRole('button', { name: 'Void record', exact: true })).toBeDisabled();
      await keyboardReach(page, consent); await page.keyboard.press('Space'); await page.keyboard.press('Space');
      await expect(consent).toBeFocused(); await expect(consent).not.toBeChecked();
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('close-out allowed consent is reversible and blocked archive has an explicit reason', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/close-out');
      const consent = page.getByLabel('I saved the export pack and reviewed archive readiness');
      await keyboardReach(page, consent); await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Archive event', exact: true })).toBeEnabled();
      await page.keyboard.press('Space'); await expect(consent).toBeFocused();
      await expect(page.getByRole('button', { name: 'Archive event', exact: true })).toBeDisabled();
      const current = LifecycleReadinessResponse.parse(campaignAdminResponses('/admin/close-out').find((response) => response.path === '/lifecycle/readiness')!.body);
      await responseOverride(page, { path: `${API}/lifecycle/readiness`, response: LifecycleReadinessResponse.parse({ ...current,
        transitions: [{ to: 'ARCHIVED', allowed: false, requiresReason: false, blockers: ['final-report'] }] }) });
      await keyboardActivate(page, page.getByRole('button', { name: 'Reload close-out readiness', exact: true }));
      await expect(page.getByText('A verified final report is required.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Archive event', exact: true })).toHaveCount(0);
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    test('gift stock review and issued card void/reissue cancellation restore each exact opener', async ({ page }) => {
      const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/gifts');
      await keyboardType(page, page.getByLabel('Stock change').first(), '5');
      await keyboardType(page, page.getByLabel('Reason for stock change').first(), 'Reviewed synthetic delivery');
      await cancelDialog(page, page.getByRole('button', { name: 'Review stock change', exact: true }).first(), 'Review gift stock change');
      expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });

    for (const status of ['ISSUED', 'UNISSUED'] as const) {
      test(`card ${status}: lookup, reviewed correction/handover cancellation and print controls`, async ({ page }) => {
        const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/admin/cards');
        await responseOverride(page, { path: `${API}/cards/A23456`, response: { card: MissionCardRecord.parse({ id: 'keyboard-card', shortCode: 'A23456', status,
          rehearsal: true, issuedAt: status === 'ISSUED' ? CAMPAIGN_NOW : null, completedAt: null, voidedAt: null, reissuedFromId: null,
          batchLabel: 'Synthetic batch', stamps: [], remainingStationIds: [CAMPAIGN_STATION.id], redeemed: false }) } });
        await keyboardType(page, page.getByLabel('Printed card code'), 'A23456');
        await keyboardActivate(page, page.getByRole('button', { name: 'Find card', exact: true }));
        if (status === 'UNISSUED') await cancelDialog(page, page.getByRole('button', { name: 'Issue this card', exact: true }), 'Issue card A23456');
        else {
          await keyboardType(page, page.getByLabel('Correction reason'), 'Reviewed synthetic card damage');
          await cancelDialog(page, page.getByRole('button', { name: 'Void this card', exact: true }), 'Void card A23456');
          await keyboardType(page, page.getByLabel('Replacement card code'), 'B23456');
          await cancelDialog(page, page.getByRole('button', { name: 'Reissue onto replacement', exact: true }), 'Replace card A23456');
        }
        await keyboardReach(page, page.getByLabel('Number of cards'));
        await keyboardReach(page, page.getByRole('button', { name: /^View export / }).first());
        expect(writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
      });
    }
  });
}
