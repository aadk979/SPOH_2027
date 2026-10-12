import { expect, type Page } from '@playwright/test';
import type { CampaignRoute } from './routeManifest';

const requiredReads: Record<string, string[]> = {
  '/': ['/api/v1/events', '/api/v1/events/administration'], '/events': ['/api/v1/events', '/api/v1/events/administration'],
  '/mfa': ['/api/v1/auth/refresh'],
  '/notifications': ['/api/v1/notification-centre', '/api/v1/notification-centre/preferences'],
  '/home': ['/me'], '/shift': ['/me'], '/attendance': ['/attendance'], '/devices': ['/api/v1/auth/sessions'],
  '/guide': ['/content'], '/map': ['/content'], '/journey': ['/content'], '/brief': ['/content'], '/safety': ['/me'],
  '/safety/incident/new': ['/me'], '/safety/incidents': ['/incidents'], '/safety/lost-person/new': ['/me', '/lost-person/active'],
  '/safety/lost-found': ['/lost-found'], '/safety/lost-found/new': ['/me', '/media/config'], '/operations': ['/me/permissions'],
  '/chief': ['/dashboard/live'], '/ic': ['/dashboard/station/station'], '/tv': ['/dashboard/live'],
  '/counts': ['/footfall/summary', '/footfall/live', '/cards/funnel', '/gifts/summary'],
  '/chief/fallback': ['/fallback/windows'], '/chief/imports': ['/fallback/windows'],
  '/reports': ['/reports/summary'], '/inbox': ['/announcements'], '/overview': ['/lifecycle/readiness'],
  '/setup': ['/branding'], '/swaps': ['/roster/swaps'], '/briefings': ['/roster/briefing-slots'],
  '/capture/registration': ['/registrations/categories'], '/capture/registration/group': ['/registrations/categories'],
  '/capture/footfall': ['/me'], '/capture/stamp': ['/me'], '/capture/redeem': ['/gifts'],
  '/admin/users': ['/admin/volunteers'], '/admin/users/invite': ['/me/permissions'], '/admin/users/person': ['/api/v1/people/target'],
  '/admin/settings': ['/admin/event-settings', '/admin/shift-templates', '/admin/organisation-settings', '/admin/attendance-settings'],
  '/admin/permissions': ['/permissions'], '/admin/content': ['/content/draft', '/content/versions'],
  '/admin/schedule': ['/lifecycle/readiness'], '/admin/stations': ['/admin/structure', '/admin/stations'],
  '/admin/categories': ['/admin/structure'], '/admin/days': ['/admin/structure', '/admin/event-days'],
  '/admin/cards': ['/cards/print'], '/admin/gifts': ['/gifts/catalogue'], '/admin/staffing': ['/roster/station/station'],
  '/admin/corrections': ['/stations'], '/admin/audit': ['/audit'], '/admin/close-out': ['/lifecycle/readiness', '/reports/archive-exports'],
  '/entity': ['/workspace/entity'], '/records': ['/workspace/records'], '/search': ['/workspace/search'], '/help': ['/me/permissions'],
};
const populatedText: Record<string, string> = {
  '/events': 'Synthetic Other Event', '/notifications': 'Operational announcement', '/home': 'Hello, Sample Person',
  '/shift': 'Day one', '/attendance': 'Day one', '/devices': 'Borrowed synthetic browser',
  '/guide': 'Know your station.', '/map': 'AED by reception', '/journey': 'Visit the welcome desk.', '/brief': 'Know your station.',
  '/safety': 'Synthetic Lead', '/safety/incidents': 'Queue barrier moved to keep the exit clear.', '/safety/lost-found': 'Blue water bottle',
  '/chief': 'Registrations', '/ic': 'Room', '/tv': 'Registered', '/counts': 'Room entries',
  '/chief/fallback': 'Paper count retained during a network outage.', '/inbox': 'Welcome desk briefing begins at 10:30.',
  '/swaps': 'Exam timetable', '/briefings': 'Bring route guide', '/capture/registration': 'Guests', '/capture/registration/group': 'Guests',
  '/capture/redeem': 'Existing Badge', '/admin/users': 'Sample Person', '/admin/users/person': 'Target Person',
  '/admin/permissions': 'Every operation remains in its selected event.', '/admin/stations': 'Room', '/admin/categories': 'Guests',
  '/admin/days': 'Day one', '/admin/gifts': 'Existing Badge', '/admin/staffing': 'Sample Person',
  '/admin/audit': 'registration.void', '/entity': 'ROOM', '/records': 'Room · Paper count', '/search': '1 visible matches.',
};

export async function assertCampaignReady(page: Page, input: { entry: CampaignRoute; served: ReadonlySet<string> }): Promise<void> {
  const requests = requiredReads[input.entry.path] ?? [];
  await expect.poll(() => requests.filter((path) => !input.served.has(path)), { message: 'Required domain responses must settle' }).toEqual([]);
  await expect(page.getByRole('heading', { name: input.entry.heading, exact: true }).first()).toBeVisible();
  const text = input.entry.path === '/' ? populatedText['/events'] : populatedText[input.entry.path];
  if (text) await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
  if (input.entry.path === '/sign-in') await expect(page.getByLabel('Roster email')).toBeVisible();
  if (input.entry.path === '/mfa') await expect(page.getByRole('button', { name: 'Get setup key', exact: true })).toBeVisible();
  if (input.entry.path === '/admin/schedule') await expect(page.getByLabel('Move the event to')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
