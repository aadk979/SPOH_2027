import type { Page, Route } from '@playwright/test';
import { VolunteerAdminRecord, type Action, type SessionResponse } from '@spoh/shared';
import { MOCK_EVENT, fulfillClientConfiguration } from './mockEvent';
export const IDENTITY_EVENT = { ...MOCK_EVENT, role: 'ADMIN' as const };
export const IDENTITY_PERSON = {
  id: 'identity_admin',
  displayName: 'Synthetic Admin',
  role: 'ADMIN' as const,
};
export const IDENTITY_SESSION = {
  accessToken: 'synthetic-ui-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  volunteer: IDENTITY_PERSON,
  refreshAvailable: true,
};
export function identityVolunteer(
  person: Pick<VolunteerAdminRecord, 'id' | 'displayName' | 'email'> &
    Partial<Pick<VolunteerAdminRecord, 'role' | 'hasSignedIn'>>,
): VolunteerAdminRecord {
  const hasSignedIn = person.hasSignedIn ?? false;
  return VolunteerAdminRecord.parse({
    role: 'VOLUNTEER',
    phone: null,
    portfolio: null,
    reportsToId: null,
    reportsToName: null,
    active: true,
    createdAt: '2026-10-10T00:00:00.000Z',
    deactivatedAt: null,
    deactivatedReason: null,
    lastSeenAt: hasSignedIn ? '2026-10-10T00:00:00.000Z' : null,
    assignmentCount: 0,
    deviceCount: hasSignedIn ? 2 : 0,
    ...person,
    hasSignedIn,
    status: hasSignedIn ? 'ACTIVE' : 'INVITED',
  });
}
/** UI scenarios complement the real lifecycle/authorization integration suite; no AWS email is sent. */
export async function mockIdentityUi(
  page: Page,
  options: {
    mfa?: boolean;
    person?: SessionResponse['volunteer'];
    actions?: Action[];
    handle?(route: Route, path: string): Promise<boolean>;
  } = {},
) {
  let restricted = options.mfa ?? false;
  const person = options.person ?? IDENTITY_PERSON;
  const session = { ...IDENTITY_SESSION, volunteer: person };
  const event = { ...IDENTITY_EVENT, role: person.role };
  const allowed: Action[] = options.actions ?? [
    'People.Read',
    'People.Update',
    'People.Invite',
    'Roster.Edit',
    'People.AssignRole',
    'People.Deactivate',
    'Self.Read',
    'Platform.ManageAdmins',
  ];
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillClientConfiguration(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (await options.handle?.(route, path)) return;
    if (path.endsWith('/auth/mfa/setup')) {
      await route.fulfill({ json: { secretCode: 'SYNTHETICSETUPKEY' } });
      return;
    }
    if (path.endsWith('/auth/mfa/verify')) {
      restricted = false;
      await route.fulfill({ json: session });
      return;
    }
    const json = path.endsWith('/api/v1/events')
      ? { data: [event] }
      : path.includes('/auth/')
        ? { ...session, mfaRequired: restricted }
        : path.endsWith('/me/permissions')
          ? {
              actions: Object.fromEntries(allowed.map((action) => [action, true])),
              settings: { operational: false, security: false, privacy: false },
            }
          : path.endsWith('/me')
            ? {
                volunteer: person,
                event,
                currentAssignment: null,
                upcomingAssignments: [],
                escalationChain: [],
              }
            : path.endsWith('/lost-person/active')
              ? { alerts: [] }
              : path.endsWith('/registrations/categories')
                ? { data: [] }
                : {};
    await route.fulfill({ json });
  });
}
