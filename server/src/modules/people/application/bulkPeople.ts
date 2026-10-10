import type { BulkPeopleRequest, BulkPeopleResponse } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';
import type { ManagerContext } from './context.js';
import { deactivateVolunteer } from './deactivateVolunteer.js';
import { resendInvite } from './invitations.js';
import { updateVolunteer } from './updateVolunteer.js';
import { getVolunteer } from './queries.js';

export async function bulkPeople(
  input: BulkPeopleRequest,
  actor: ManagerContext,
): Promise<BulkPeopleResponse> {
  const data: BulkPeopleResponse['data'] = [];
  for (const id of [...new Set(input.ids)]) await getVolunteer(actor.scope, id);
  for (const id of [...new Set(input.ids)]) {
    try {
      if (input.action === 'resend') await resendInvite(id, actor);
      else if (input.action === 'deactivate')
        await deactivateVolunteer(
          id,
          { reason: input.reason as string, disableIdentity: false },
          actor,
        );
      else await updateVolunteer(id, { role: input.role }, actor);
      data.push({ id, ok: true });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      data.push({ id, ok: false, error: error.message });
    }
  }
  return { data, meta: { count: data.length } };
}
