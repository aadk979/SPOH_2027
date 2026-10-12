import { expect, test, type Page, type Route } from '@playwright/test';
import { ActiveLostPersonResponse, AdjustGiftStockWithReceiptRequest, CreateUploadRequest,
  CreateUploadResponse, GiftTypeRecord } from '@spoh/shared';
import { campaignAdminResponses } from '../browser/campaignAdminData';
import { CAMPAIGN_NOW } from '../browser/campaignCore';
import { campaignOperationalResponses } from '../browser/campaignOperationalData';
import { associatedError, cancelDialog, keyboardActivate, keyboardReach, keyboardType,
  observedEventWrites, openAcceptancePage, responseOverride } from '../browser/keyboardAcceptance';

const API = '/api/v1/events/evt_mock';
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTz0AAAAASUVORK5CYII=', 'base64');

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release: () => release() };
}

async function exactHandler(page: Page, path: string, method: string, handle: (route: Route) => Promise<void>) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() !== method || url.pathname !== path || url.search) {
      await route.fallback(); return;
    }
    await handle(route);
  });
}

test('every visible icon control has a usable accessible name in safety, stock, and the shared shell', async ({ page }) => {
  for (const path of ['/safety/lost-found/new', '/safety/lost-person/new', '/admin/gifts']) {
    const fixture = await openAcceptancePage(page, path);
    const controls = await page.locator('button:has(svg), a[href]:has(svg)').all();
    expect(controls.length, 'The populated route must exercise its real icon controls').toBeGreaterThan(0);
    for (const control of controls) {
      if (!await control.isVisible()) continue;
      await expect(control).toHaveAccessibleName(/\S/);
      const icons = await control.locator('svg').all();
      for (const icon of icons) await expect(icon).toHaveAttribute('aria-hidden', 'true');
      if (await control.isEnabled()) await keyboardReach(page, control);
    }
    expect(fixture.unexpected).toEqual([]);
    // Each route gets its own strict response set, with no inherited permissive handlers.
    await page.unroute('**/api/v1/**');
  }
});

test('photo camera/file control, validation, upload failure, retry, removal, and changed live text are named', async ({ page }) => {
  const fixture = await openAcceptancePage(page, '/safety/lost-found/new');
  const photo = page.getByLabel(/^Photo/);
  await expect(photo).toHaveAccessibleName(/^Photo/);
  await expect(photo).toHaveAttribute('capture', 'environment');
  await expect(photo).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  await keyboardReach(page, photo);
  const status = page.getByRole('status').filter({ hasText: 'No photo attached.' });
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveText('No photo attached.');
  // File payload injection represents the OS picker; focus and retry/removal use the real keyboard.
  await photo.setInputFiles({ name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic invalid file') });
  await associatedError(photo);
  await expect(page.getByRole('alert').filter({ hasText: 'That file is not a photo.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Photo upload was not confirmed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry photo', exact: true })).toHaveCount(0);

  const policyBodies: unknown[] = []; let objectPosts = 0;
  const objectUrl = new URL('/synthetic-found-item-photo', page.url()).href;
  const policy = CreateUploadResponse.parse({ url: objectUrl, key: 'synthetic/found-item-photo.png',
    fields: { key: 'synthetic/found-item-photo.png', 'Content-Type': 'image/png' }, expiresIn: 60, maxBytes: 10 * 1024 * 1024 });
  await responseOverride(page, { path: `${API}/media/uploads`, method: 'POST', response: policy, inspect: (body) => {
    const request = CreateUploadRequest.parse(body); policyBodies.push(request);
    expect(request).toMatchObject({ purpose: 'lostFound', contentType: 'image/png', contentLength: IMAGE.length });
  } });
  const firstUpload = deferred();
  await page.route(objectUrl, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBeUndefined();
    objectPosts += 1;
    if (objectPosts === 1) { await firstUpload.promise; await route.fulfill({ status: 503, body: '' }); }
    else await route.fulfill({ status: 204, body: '' });
  });
  await keyboardReach(page, photo);
  await photo.setInputFiles({ name: 'synthetic-bottle.png', mimeType: 'image/png', buffer: IMAGE });
  await expect(page.getByRole('status').filter({ hasText: 'Uploading photo…' })).toHaveAttribute('aria-live', 'polite');
  await expect(photo).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Photo uploaded and ready to attach.' })).toHaveCount(0);
  firstUpload.release();
  await associatedError(photo);
  await expect(page.getByRole('alert').filter({ hasText: 'The photo did not upload.' })).toBeVisible();
  await keyboardActivate(page, page.getByRole('button', { name: 'Retry photo', exact: true }));
  await expect(page.getByRole('status').filter({ hasText: 'Photo uploaded and ready to attach.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'The item you just photographed', exact: true })).toBeVisible();
  await expect(photo).not.toHaveAttribute('aria-invalid', 'true');
  expect(policyBodies).toHaveLength(2); expect(policyBodies[1]).toEqual(policyBodies[0]);
  expect(objectPosts).toBe(2);
  await keyboardActivate(page, page.getByRole('button', { name: 'Remove', exact: true }));
  await expect(page.getByRole('status').filter({ hasText: 'No photo attached.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'The item you just photographed' })).toHaveCount(0);
  await keyboardReach(page, photo); await page.keyboard.press('Tab'); await expect(photo).not.toBeFocused();
  expect(fixture.unexpected).toEqual([]);
});

test('lost-person urgent summary, acknowledgement, and confirmed resolution announce actual changed outcomes', async ({ page }) => {
  const writes = observedEventWrites(page); const fixture = await openAcceptancePage(page, '/safety/lost-person/new');
  const seed = campaignOperationalResponses({ eventId: 'evt_mock', personId: 'person', now: CAMPAIGN_NOW,
    routePath: '/safety/lost-person/new' }).find((response) => response.path === '/lost-person/active');
  let active = ActiveLostPersonResponse.parse(seed?.body);
  const alert = active.alerts[0];
  if (!alert?.descriptionText) throw new Error('The populated alert acceptance needs a described active alert');
  const description = alert.descriptionText;
  await exactHandler(page, `${API}/lost-person/active`, 'GET', async (route) => route.fulfill({ json: active }));
  const banner = page.getByRole('region', { name: 'Lost person alerts', exact: true });
  await expect(banner.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  await expect(banner.getByRole('alert')).toContainText('1 active lost-person alert');
  const expand = banner.getByRole('button', { name: 'View alerts', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await keyboardActivate(page, expand);
  await expect(banner.getByRole('button', { name: 'Collapse alerts', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const ackRegion = banner.locator('p[aria-live="polite"]').filter({ hasText: 'acknowledged' });
  await expect(ackRegion).toHaveText('4 acknowledged');
  const acknowledgement = deferred(); let ackReceived = false;
  await exactHandler(page, `${API}/lost-person/${alert.id}/ack`, 'POST', async (route) => {
    ackReceived = true; await acknowledgement.promise;
    active = ActiveLostPersonResponse.parse({ ...active, alerts: [{ ...alert, ackCount: 5, ackedByMe: true }] });
    await route.fulfill({ json: { acknowledged: true } });
  });
  await keyboardActivate(page, banner.getByRole('button', { name: 'Acknowledge', exact: true }));
  await expect.poll(() => ackReceived).toBe(true);
  await expect(banner.getByRole('button', { name: 'Acknowledge', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Lost-person alert acknowledged.' })).toHaveCount(0);
  acknowledgement.release();
  await expect(ackRegion).toHaveText('5 acknowledged · You acknowledged this alert.');
  await expect(banner.getByRole('button', { name: 'Acknowledged ✓', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Lost-person alert acknowledged.' })).toHaveAttribute('aria-live', 'polite');
  const clear = banner.getByRole('button', { name: 'Found — clear this alert', exact: true });
  const beforeCancel = [...writes];
  await cancelDialog(page, clear, 'Clear this lost-person alert?');
  expect(writes).toEqual(beforeCancel);
  const resolution = deferred(); let resolveReceived = false;
  await exactHandler(page, `${API}/lost-person/${alert.id}/resolve`, 'POST', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ outcome: 'RESOLVED_FOUND' });
    resolveReceived = true; await resolution.promise;
    active = ActiveLostPersonResponse.parse({ ...active, alerts: [] });
    await route.fulfill({ json: { resolved: true } });
  });
  await keyboardActivate(page, clear);
  const dialog = page.getByRole('dialog', { name: 'Clear this lost-person alert?', exact: true });
  await keyboardActivate(page, dialog.getByRole('button', { name: 'Confirmed found — clear alert', exact: true }));
  await expect.poll(() => resolveReceived).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Lost-person alert cleared.' })).toHaveCount(0);
  resolution.release();
  await expect(dialog).toHaveCount(0); await expect(banner).toHaveCount(0);
  const cleared = page.getByRole('status').filter({ hasText: 'Lost-person alert cleared.' });
  await expect(cleared).toHaveAttribute('aria-live', 'polite');
  await expect(cleared).toHaveText('Lost-person alert cleared.');
  await expect(page.getByRole('complementary', { name: 'Action results', exact: true })
    .filter({ hasText: 'Lost-person alert cleared.' })).not.toContainText(description);
  expect(writes).toEqual([`POST ${API}/lost-person/${alert.id}/ack`, `POST ${API}/lost-person/${alert.id}/resolve`]);
  expect(fixture.unexpected).toEqual([]);
});

test('stock validation, safe failure request ID, reviewed retry, and confirmed success expose named text outcomes', async ({ page }) => {
  const fixture = await openAcceptancePage(page, '/admin/gifts');
  const reason = page.getByLabel('Reason for stock change', { exact: true });
  const delta = page.getByLabel('Stock change', { exact: true });
  const review = page.getByRole('button', { name: 'Review stock change', exact: true });
  await keyboardActivate(page, review); await associatedError(reason);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await keyboardType(page, delta, '2'); await keyboardType(page, reason, 'Synthetic sealed badge delivery');
  await cancelDialog(page, review, 'Review gift stock change');
  const bodies: unknown[] = []; const firstWrite = deferred();
  const seed = campaignAdminResponses('/admin/gifts').find((response) => response.path === '/gifts/catalogue');
  const catalogue = seed?.body as { data: unknown[] };
  const gift = GiftTypeRecord.parse(catalogue.data[0]);
  await exactHandler(page, `${API}/gifts/${gift.id}/stock`, 'POST', async (route) => {
    const body = AdjustGiftStockWithReceiptRequest.parse(route.request().postDataJSON()); bodies.push(body);
    expect(body).toMatchObject({ delta: 2, reason: 'Synthetic sealed badge delivery', expectedRehearsal: gift.rehearsal });
    if (bodies.length === 1) {
      await firstWrite.promise;
      await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE',
        message: 'Synthetic internal diagnostic must not become visible.', requestId: 'synthetic-stock-retry' } } });
    } else await route.fulfill({ json: { giftType: GiftTypeRecord.parse({ ...gift, remaining: gift.remaining + 2,
      adjustment: gift.adjustment + 2 }) } });
  });
  await keyboardActivate(page, review);
  const dialog = page.getByRole('dialog', { name: 'Review gift stock change', exact: true });
  await expect(dialog).toContainText(gift.rehearsal ? 'Pool: Practice' : 'Pool: Live');
  await keyboardActivate(page, dialog.getByRole('button', { name: 'Record stock change', exact: true }));
  await expect(page.getByRole('status').filter({ hasText: 'Changing gift stock…' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Stock change confirmed' })).toHaveCount(0);
  firstWrite.release();
  const failure = dialog.getByRole('alert');
  await expect(failure).toContainText('Changing gift stock was not confirmed');
  await expect(failure).toContainText('Request ID: synthetic-stock-retry');
  await expect(failure).not.toContainText('Synthetic internal diagnostic');
  await expect(page.getByRole('status').filter({ hasText: 'Stock change recorded' })).toHaveCount(0);
  await keyboardActivate(page, dialog.getByRole('button', { name: 'Retry changing gift stock', exact: true }));
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Stock change recorded in the reviewed pool.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Stock change confirmed in the reviewed pool.' })).toHaveAttribute('aria-live', 'polite');
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
  const dismiss = page.getByRole('complementary', { name: 'Action results', exact: true })
    .filter({ hasText: 'Stock change confirmed in the reviewed pool.' }).getByRole('button', { name: 'Dismiss', exact: true });
  await keyboardActivate(page, dismiss);
  await expect(page.getByRole('status').filter({ hasText: 'Stock change confirmed in the reviewed pool.' })).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
});
