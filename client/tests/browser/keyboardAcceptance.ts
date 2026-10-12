import { expect, type Locator, type Page } from '@playwright/test';
import { installCampaignFixture } from './campaignFixtures';
import { CAMPAIGN_ROUTES } from './routeManifest';

export async function openAcceptancePage(page: Page, path: string) {
  const entry = CAMPAIGN_ROUTES.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`Missing independently authored route: ${path}`);
  await page.clock.setFixedTime(new Date('2027-01-08T02:00:00.000Z'));
  const fixture = await installCampaignFixture(page, entry);
  await page.goto(fixture.url);
  await fixture.ready();
  return fixture;
}

/** Reach controls through the actual browser tab order, including native details. */
export async function keyboardReach(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  for (let count = 0; count < 180; count += 1) {
    if (await control.evaluate((element) => element === document.activeElement)) {
      await expect(control).toBeFocused();
      await visibleFocus(control);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Control was unreachable by Tab: ${await control.getAttribute('id') ?? await control.textContent()}`);
}

export async function visibleFocus(control: Locator) {
  expect(await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
      && !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.outlineColor);
    return element.matches(':focus-visible') && (outline || style.boxShadow !== 'none');
  }), 'Keyboard focus must be painted, as well as present in the DOM').toBe(true);
}

export async function keyboardActivate(page: Page, control: Locator) {
  await keyboardReach(page, control);
  await page.keyboard.press('Enter');
}

export async function keyboardType(page: Page, control: Locator, value: string) {
  await keyboardReach(page, control);
  await page.keyboard.press('ControlOrMeta+A');
  if (value) await page.keyboard.insertText(value);
  else await page.keyboard.press('Backspace');
}

export async function associatedError(control: Locator) {
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(await control.evaluate((element) => {
    const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    return ids.some((id) => {
      const message = document.getElementById(id);
      return message?.getAttribute('role') === 'alert' && !!message.textContent?.trim();
    });
  }), 'The marked field must reference its nonempty validation alert').toBe(true);
}

export async function cancelDialog(page: Page, origin: Locator, title: string) {
  await keyboardActivate(page, origin);
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeFocused();
  await visibleFocus(cancel);
  // The dialog's short deliberate cycle is escapable; it cannot strand keyboard users.
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button').last()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(origin).toBeFocused();
  await visibleFocus(origin);
  await keyboardActivate(page, origin);
  await keyboardActivate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(origin).toBeFocused();
}

export function observedEventWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/v1/events/evt_mock/') && request.method() !== 'GET') writes.push(`${request.method()} ${path}`);
  });
  return writes;
}

/** Overrides are finite intent-specific contracts; all other requests reach the strict installer. */
export async function responseOverride(page: Page, input: { path: string; method?: string; query?: Record<string, string>;
  response: unknown; status?: number; inspect?: (body: unknown) => void }) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const query = Object.fromEntries(url.searchParams);
    if (request.method() !== (input.method ?? 'GET') || url.pathname !== input.path
      || url.searchParams.size !== Object.keys(query).length
      || JSON.stringify(Object.entries(query).sort()) !== JSON.stringify(Object.entries(input.query ?? {}).sort())) {
      await route.fallback(); return;
    }
    input.inspect?.(request.postDataJSON());
    await route.fulfill({ status: input.status ?? 200, json: input.response });
  });
}
