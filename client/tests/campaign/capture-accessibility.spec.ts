import { expect, test, type Page } from '@playwright/test';
import { CreateGroupRegistrationRequest, GiftTypeRecord, MissionCardRecord, RedeemGiftRequest,
  RedeemGiftResponse, StampCardRequest, StampCardResponse } from '@spoh/shared';
import { CAMPAIGN_NOW } from '../browser/campaignCore';
import { associatedError, keyboardActivate, keyboardReach, keyboardType, openAcceptancePage,
  responseOverride } from '../browser/keyboardAcceptance';

const API = '/api/v1/events/evt_mock';
const CARD = MissionCardRecord.parse({ id: 'keyboard-card', shortCode: 'A23456', rehearsal: false,
  status: 'ISSUED', issuedAt: CAMPAIGN_NOW, completedAt: null, voidedAt: null, reissuedFromId: null,
  batchLabel: 'Synthetic keyboard batch', stamps: [], remainingStationIds: ['station'], redeemed: false });
const GIFT = GiftTypeRecord.parse({ id: 'existing-gift', name: 'Existing Badge', rehearsal: false, initialStock: 20,
  lowStockThreshold: 5, active: true, remaining: 19, redeemed: 1, adjustment: 0, lowStock: false, outOfStock: false });

async function cameraDenied(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true, value: () => Promise.reject(new DOMException('Synthetic camera refusal', 'NotAllowedError')),
    });
  });
}

async function liveText(page: Page, text: string) {
  const live = page.locator('[aria-live="polite"], [role="status"]').filter({ hasText: text }).first();
  await expect(live).toBeVisible();
  await expect(live).toHaveText(text);
}

/** Hold direct sends until their pending announcement has been observed. */
async function delayedResponses(page: Page, path: string, responses: unknown[]) {
  const bodies: unknown[] = [];
  const release: Array<() => void> = [];
  const waits = responses.map(() => new Promise<void>((resolve) => release.push(resolve)));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() !== 'POST' || url.pathname !== path || url.search) {
      await route.fallback(); return;
    }
    const index = bodies.length;
    bodies.push(request.postDataJSON());
    if (index >= responses.length) throw new Error(`Unexpected repeated capture: ${path}`);
    await waits[index];
    await route.fulfill({ json: responses[index] });
  });
  return { bodies, release };
}

async function allowQueuedSend(page: Page) {
  // Date is fixed independently of the real flush timer; make the recorded tap old enough to send.
  await page.clock.setFixedTime(new Date(new Date(CAMPAIGN_NOW).getTime() + 3_000));
}

for (const capture of [
  { path: '/capture/registration', control: 'Guests', endpoint: '/registrations', recorded: 'Recorded Guests' },
  { path: '/capture/footfall', control: 'Count one entry to Room', endpoint: '/footfall/ticks', recorded: 'Counted one entry' },
]) {
  test(`${capture.path}: named capture, local queue, undo and settled sync each announce changed text`, async ({ page }) => {
    const fixture = await openAcceptancePage(page, capture.path); const sent: unknown[] = [];
    await responseOverride(page, { path: `${API}${capture.endpoint}`, method: 'POST', response: { accepted: true },
      inspect: (body) => sent.push(body) });
    const button = page.getByRole('button', { name: capture.control, exact: true });
    await expect(button).toHaveAccessibleName(capture.control);
    if (capture.path === '/capture/footfall') await expect(button.locator('[aria-hidden="true"]')).toHaveText('+');
    await liveText(page, 'All synced');
    await keyboardActivate(page, button);
    await liveText(page, 'Saved on this phone. Waiting to sync.');
    await liveText(page, capture.recorded);
    await liveText(page, '1 unsynced');
    expect(sent).toEqual([]);
    await keyboardActivate(page, page.getByRole('button', { name: 'Undo', exact: true }));
    await liveText(page, 'Capture removed from this phone.');
    await liveText(page, 'All synced');
    expect(sent).toEqual([]);
    await keyboardActivate(page, button);
    await liveText(page, '1 unsynced');
    await allowQueuedSend(page);
    await liveText(page, 'All synced');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ stationId: 'station', rehearsal: false, clientRecordedAt: CAMPAIGN_NOW });
    await keyboardActivate(page, page.getByRole('button', { name: 'Undo', exact: true }));
    await liveText(page, 'This capture is sending or already recorded. Ask your IC for a correction.');
    expect(fixture.unexpected).toEqual([]);
  });

  test(`${capture.path}: refused queued capture announces failure and persistent recovery advice`, async ({ page }) => {
    const fixture = await openAcceptancePage(page, capture.path);
    await responseOverride(page, { path: `${API}${capture.endpoint}`, method: 'POST', status: 409,
      response: { error: { code: 'CAPTURE_CLOSED', message: 'This capture window has closed.', requestId: 'keyboard-capture-closed' } } });
    await keyboardActivate(page, page.getByRole('button', { name: capture.control, exact: true }));
    await liveText(page, '1 unsynced');
    await allowQueuedSend(page);
    await liveText(page, '1 failed');
    await expect(page.getByRole('status').filter({ hasText: 'Taps are not reaching the server.' })).toContainText(
      '1 could not be sent. Tell your IC — the counts can still be recovered from the Shift screen.');
    await keyboardReach(page, page.getByRole('button', { name: capture.control, exact: true }));
    expect(fixture.unexpected).toEqual([]);
  });
}

test('group steppers name each action, announce composition and associate card validation before a single queued send', async ({ page }) => {
  const fixture = await openAcceptancePage(page, '/capture/registration/group'); const sent: unknown[] = [];
  await responseOverride(page, { path: `${API}/registrations/group`, method: 'POST', response: { accepted: true },
    inspect: (body) => sent.push(body) });
  const row = page.locator('main li').filter({ hasText: 'Guests' });
  const add = row.getByRole('button', { name: 'Add one Guests', exact: true });
  const remove = row.getByRole('button', { name: 'Remove one Guests', exact: true });
  await expect(add).toHaveAccessibleName('Add one Guests');
  await expect(remove).toHaveAccessibleName('Remove one Guests');
  await expect(add.locator('[aria-hidden="true"]')).toHaveText('+');
  await expect(remove.locator('[aria-hidden="true"]')).toHaveText('−');
  await expect(remove).toBeDisabled();
  await keyboardActivate(page, add);
  await expect(row.locator('[aria-live="polite"]')).toHaveText('1');
  await keyboardActivate(page, remove);
  await expect(row.locator('[aria-live="polite"]')).toHaveText('0');
  await keyboardActivate(page, add); await page.keyboard.press('Enter');
  await expect(row.locator('[aria-live="polite"]')).toHaveText('2');
  const code = page.getByLabel('Mission Card code', { exact: false });
  await keyboardType(page, code, 'A');
  await associatedError(code);
  await expect(page.getByRole('button', { name: 'Register 2 people', exact: true })).toBeDisabled();
  await keyboardType(page, code, 'A23456');
  await expect(code).not.toHaveAttribute('aria-invalid', 'true');
  await keyboardActivate(page, page.getByRole('button', { name: 'Register 2 people', exact: true }));
  await expect(page).toHaveURL(/\/e\/mock-event\/capture\/registration$/);
  await liveText(page, '1 unsynced');
  expect(sent).toEqual([]);
  await allowQueuedSend(page);
  await liveText(page, 'All synced');
  expect(sent).toHaveLength(1);
  expect(CreateGroupRegistrationRequest.parse(sent[0])).toMatchObject({ stationId: 'station', rehearsal: false,
    members: [{ category: 'GUEST', count: 2 }], missionCardShortCode: 'A23456', clientRecordedAt: CAMPAIGN_NOW });
  expect(fixture.unexpected).toEqual([]);
});

test('camera denial leaves named manual entry usable and stamp validation, pending, warning and result all communicate', async ({ page }) => {
  await cameraDenied(page);
  const fixture = await openAcceptancePage(page, '/capture/stamp');
  await liveText(page, 'The camera is not available. Type the six-character code instead.');
  await expect(page.getByLabel('Camera viewfinder for scanning a Mission Card')).toBeHidden();
  const responses = await delayedResponses(page, `${API}/cards/A23456/stamps`, [
    StampCardResponse.parse({ card: CARD, stampAdded: false, justCompleted: false, warning: 'Already stamped here.' }),
    StampCardResponse.parse({ card: { ...CARD, status: 'COMPLETED', completedAt: CAMPAIGN_NOW, remainingStationIds: [] },
      stampAdded: true, justCompleted: true, warning: null }),
  ]);
  const code = page.getByLabel('Six-character card code', { exact: true });
  await keyboardType(page, code, 'UUUUUU');
  await keyboardActivate(page, page.getByRole('button', { name: 'Go', exact: true }));
  await associatedError(code);
  expect(responses.bodies).toEqual([]);
  await keyboardType(page, code, 'A23456');
  await keyboardActivate(page, page.getByRole('button', { name: 'Go', exact: true }));
  await liveText(page, 'Checking this card…');
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeDisabled();
  responses.release[0]!();
  await liveText(page, 'Already stamped here.');
  await keyboardType(page, code, 'A23456');
  await keyboardActivate(page, page.getByRole('button', { name: 'Go', exact: true }));
  await liveText(page, 'Checking this card…');
  responses.release[1]!();
  await liveText(page, 'Journey complete — send them to Mission Complete.');
  expect(responses.bodies).toHaveLength(2);
  responses.bodies.forEach((body) => expect(StampCardRequest.parse(body)).toMatchObject({ stationId: 'station', rehearsal: false }));
  expect(fixture.unexpected).toEqual([]);
});

function redemptionResponse(warning: string | null) {
  return RedeemGiftResponse.parse({ redemption: { id: 'keyboard-redemption', giftTypeId: GIFT.id,
    giftTypeName: GIFT.name, missionCardId: warning ? null : CARD.id, stationId: 'station', source: 'APP',
    recordedAt: CAMPAIGN_NOW, voided: false }, giftType: GIFT, cardComplete: warning ? null : true, warning });
}

test('gift choice and manual fallback remain reachable while handover pending, warning and success change live text', async ({ page }) => {
  await cameraDenied(page);
  const fixture = await openAcceptancePage(page, '/capture/redeem');
  const warning = 'Check the physical stamped card before handing over the gift.';
  const responses = await delayedResponses(page, `${API}/gifts/redemptions`, [redemptionResponse(warning), redemptionResponse(null)]);
  const gift = page.getByRole('button', { name: /^Existing Badge / });
  await keyboardActivate(page, gift);
  await expect(gift).toHaveAttribute('aria-pressed', 'true');
  const withoutCode = page.getByRole('button', { name: 'Redeem without a card code', exact: true });
  await keyboardActivate(page, withoutCode);
  await liveText(page, 'Recording this gift handover…');
  await expect(withoutCode).toBeDisabled();
  responses.release[0]!();
  await liveText(page, warning);
  await keyboardType(page, page.getByLabel('Six-character card code', { exact: true }), 'A23456');
  await keyboardActivate(page, page.getByRole('button', { name: 'Go', exact: true }));
  await liveText(page, 'Recording this gift handover…');
  responses.release[1]!();
  await liveText(page, 'Existing Badge redeemed. 19 left.');
  expect(responses.bodies).toHaveLength(2);
  expect(RedeemGiftRequest.parse(responses.bodies[0])).not.toHaveProperty('cardShortCode');
  expect(RedeemGiftRequest.parse(responses.bodies[1])).toMatchObject({ stationId: 'station', cardShortCode: 'A23456', rehearsal: false });
  expect(fixture.unexpected).toEqual([]);
});

for (const offline of [
  { path: '/capture/stamp', endpoint: '/cards/A23456/stamps', queued: 'No connection. The stamp is saved on this phone and will send when the connection returns.' },
  { path: '/capture/redeem', endpoint: '/gifts/redemptions', queued: 'No connection. Hand over the gift: the redemption is saved on this phone and will send when the connection returns.' },
]) {
  test(`${offline.path}: retryable send announces a local queue and later sync without a false direct result`, async ({ page }) => {
    await cameraDenied(page);
    const fixture = await openAcceptancePage(page, offline.path); const sent: unknown[] = [];
    await responseOverride(page, { path: `${API}${offline.endpoint}`, method: 'POST', status: 503,
      response: { error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Synthetic network interruption.', requestId: 'keyboard-offline' } },
      inspect: (body) => sent.push(body) });
    await liveText(page, 'All synced');
    if (offline.path === '/capture/redeem') await keyboardActivate(page, page.getByRole('button', { name: /^Existing Badge / }));
    await keyboardType(page, page.getByLabel('Six-character card code', { exact: true }), 'A23456');
    await keyboardActivate(page, page.getByRole('button', { name: 'Go', exact: true }));
    await liveText(page, offline.queued);
    await liveText(page, '1 unsynced');
    await expect(page.getByRole('status').filter({ hasText: /Journey complete|redeemed\. \d+ left/ })).toHaveCount(0);
    expect(sent).toHaveLength(1);
    await responseOverride(page, { path: `${API}${offline.endpoint}`, method: 'POST', response: { accepted: true },
      inspect: (body) => sent.push(body) });
    await allowQueuedSend(page);
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1]).toMatchObject(sent[0] as Record<string, unknown>);
    if (offline.path === '/capture/redeem') expect(sent[1]).toMatchObject({ queued: true });
    await liveText(page, 'All synced');
    expect(fixture.unexpected).toEqual([]);
  });
}
