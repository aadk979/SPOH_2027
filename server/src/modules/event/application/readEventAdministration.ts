import type { EventAdministrationResponse } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { organisationAuthority } from './organisationAuthority.js';
import { readOrganisations, readAdministrativeEvents } from '../data/organisationRepo.js';

export async function readEventAdministration(
  personId: string,
): Promise<EventAdministrationResponse> {
  return prisma.$transaction(async (tx) => {
    const memberships = await readOrganisations(tx, personId);
    const organisations: EventAdministrationResponse['organisations'] = [];
    for (const { organisation } of memberships) {
      organisations.push({
        id: organisation.id,
        name: organisation.name,
        timezone: organisation.defaultTimezone,
        locale: organisation.locale,
        canCreate: await organisationAuthority(tx, {
          personId,
          organisationId: organisation.id,
          action: 'Platform.CreateEvent',
        }),
        canClone: await organisationAuthority(tx, {
          personId,
          organisationId: organisation.id,
          action: 'Platform.CloneEvent',
        }),
      });
    }
    const ids = organisations
      .filter((item) => item.canClone || item.canCreate)
      .map((item) => item.id);
    const events = await readAdministrativeEvents(tx, ids);
    return { organisations, events };
  });
}
