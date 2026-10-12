import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { NoticeRecord } from '@spoh/shared';
import { IDENTITY_PERSON, IDENTITY_SESSION } from './identityUiFixture';
import { MOCK_EVENT, fulfillClientConfiguration } from './mockEvent';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');
const instant = '2030-03-04T01:00:00.000Z';
const original: NoticeRecord = { id: 'notice-owned', eventId: MOCK_EVENT.id, eventName: MOCK_EVENT.name, eventSlug: MOCK_EVENT.slug,
  kind: 'ANNOUNCEMENT_PUBLISHED', priority: 'URGENT', createdAt: instant, readAt: null,
  title: 'Urgent centre notice', summary: 'Synthetic current announcement', detail: 'Current notice body from its permitted source',
  destination: { type: 'entity', target: { kind: 'announcement', id: 'source-owned' } },
  acknowledgement: { kind: 'ANNOUNCEMENT', sourceId: 'source-owned', acknowledged: false, canAcknowledge: true } };
async function noticeFixture(page: Page) {
  let notice = { ...original }; let operational = false; let owner = true;
  const unexpected: string[] = []; const writes: string[] = [];
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillClientConfiguration(route)) return;
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    const path = url.pathname;
    if (method === 'POST' && path === '/api/v1/auth/refresh' && !url.search) {
      await route.fulfill({ json: { ...IDENTITY_SESSION, volunteer: owner ? IDENTITY_PERSON : { ...IDENTITY_PERSON, id: 'new-person', displayName: 'New owner' } } }); return;
    }
    if (method === 'GET' && path === '/api/v1/events' && !url.search) {
      await route.fulfill({ json: { data: [{ ...MOCK_EVENT, role: 'ADMIN' }] } }); return;
    }
    if (method === 'GET' && path === '/api/v1/notification-centre/device/config' && !url.search) {
      await route.fulfill({ json: { enabled: false, publicKey: null } }); return;
    }
    if (path === '/api/v1/notification-centre/preferences' && !url.search && ['GET', 'PUT'].includes(method)) {
      if (method === 'PUT') { const body = request.postDataJSON() as { urgentPush: boolean; operationalPush: boolean };
        expect(body).toEqual({ urgentPush: true, operationalPush: true }); operational = body.operationalPush; writes.push('preferences'); }
      await route.fulfill({ json: { data: { urgentPush: true, operationalPush: operational, updatedAt: operational ? instant : null } } }); return;
    }
    if (method === 'GET' && path === '/api/v1/notification-centre' && url.search === '?limit=25&unreadOnly=false') {
      await route.fulfill({ json: { data: owner ? [notice] : [], meta: { count: owner ? 1 : 0, nextCursor: null,
        unreadCount: owner && !notice.readAt ? 1 : 0, unreadCountComplete: true, visibilityScanComplete: true } } }); return;
    }
    if (path === '/api/v1/notification-centre/notice-owned' && method === 'GET' && !url.search) {
      await route.fulfill(owner ? { json: { data: notice } } : { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Notification unavailable', requestId: 'fixture-owner' } } }); return;
    }
    if (path === '/api/v1/notification-centre/notice-owned/read' && method === 'PUT' && !url.search && owner) {
      expect(request.postDataJSON()).toEqual({}); notice = { ...notice, readAt: instant }; writes.push('notice.read');
      await route.fulfill({ json: { data: notice } }); return;
    }
    if (method === 'GET' && path === `/api/v1/events/${MOCK_EVENT.id}/me/permissions` && !url.search) {
      await route.fulfill({ json: { actions: { 'Self.Read': true, 'Announcement.Ack': true, 'People.Read': true },
        settings: { operational: false, security: false, privacy: false } } }); return;
    }
    if (method === 'GET' && path === `/api/v1/events/${MOCK_EVENT.id}/me` && !url.search) {
      await route.fulfill({ json: { volunteer: IDENTITY_PERSON, event: { ...MOCK_EVENT, role: 'ADMIN' },
        currentAssignment: null, upcomingAssignments: [], escalationChain: [] } }); return;
    }
    if (method === 'GET' && path === `/api/v1/events/${MOCK_EVENT.id}/lost-person/active` && !url.search) {
      await route.fulfill({ json: { asOf: instant, alerts: [] } }); return;
    }
    if (method === 'GET' && path === '/api/v1/public/events/mock-event/branding' && !url.search) {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Unpublished', requestId: 'fixture-neutral' } } }); return;
    }
    if (method === 'GET' && path === `/api/v1/events/${MOCK_EVENT.id}/workspace/entity` && url.search === '?kind=announcement&id=source-owned') {
      await route.fulfill({ json: { data: { ref: { kind: 'announcement', id: 'source-owned' }, title: 'Current announcement source',
        fields: [{ label: 'Message', value: 'Current notice body from its permitted source', format: 'text' }],
        facets: [{ name: 'Message', availability: 'available' }], related: [], actions: [], asOf: instant } } }); return;
    }
    unexpected.push(`${method} ${path}${url.search}`);
    await route.fulfill({ status: 500, json: { error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: 'Unexpected request', requestId: 'fixture' } } });
  });
  return { unexpected, writes, changeOwner: () => { owner = false; } };
}
for (const [device, width, height] of [['phone', 390, 844], ['laptop', 1440, 900]] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${device} ${colorScheme}: receive, read, open source, opt in, and discard previous-owner detail`, async ({ page }) => {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme });
      const fixture = await noticeFixture(page);
      await page.goto('/notifications');
      await expect(page.getByText('1 unread', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'View notification' }).click();
      await expect(page.getByText('Current notice body from its permitted source', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Mark as read' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Mark as read' })).toHaveCount(0);
      await expect(page.getByText(/Acknowledgement is still required/)).toBeVisible();
      await page.getByRole('checkbox', { name: 'Operational push alerts' }).check();
      await page.getByRole('button', { name: 'Save push preferences' }).click();
      await expect(page.getByRole('checkbox', { name: 'Operational push alerts' })).toBeChecked();
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => {
        const runtime = window as unknown as { axe: typeof import('axe-core') };
        return (await runtime.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations
          .filter(({ impact }) => impact === 'serious' || impact === 'critical').map(({ id }) => id);
      });
      expect(violations).toEqual([]);
      await page.screenshot({ path: `test-results/notice-centre-${device}-${colorScheme}.png`, fullPage: true });
      await page.getByRole('link', { name: 'Open source' }).click();
      await expect(page).toHaveURL(/\/e\/mock-event\/entity\?kind=announcement&id=source-owned$/);
      await expect(page.getByRole('heading', { name: 'Current announcement source' })).toBeVisible();
      expect(fixture.writes).toEqual(['notice.read', 'preferences']);
      fixture.changeOwner(); await page.goto('/notifications?notice=notice-owned');
      await expect(page.getByText('Current notice body from its permitted source', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Open source' })).toHaveCount(0);
      expect(fixture.unexpected).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
