import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { getAuth } from '../../../platform/http/requireAuth.js';
import { getVolunteer } from '../application/queries.js';
import { ValidationError } from '../../../platform/errors/index.js';

export const volunteerMutationReplay: RedactedReplay = {
  store(body) {
    const result = body as {
      volunteer: { id: string };
      sessionsRevoked: number;
      identityChanged: boolean;
    };
    return {
      id: result.volunteer.id,
      sessionsRevoked: result.sessionsRevoked,
      identityChanged: result.identityChanged,
    };
  },
  async replay(req, stored) {
    const result = stored as { id: string; sessionsRevoked: number; identityChanged: boolean };
    if (!result.id) throw new ValidationError('Invalid retry receipt');
    return {
      volunteer: await getVolunteer({ eventId: getAuth(req).eventId }, result.id),
      sessionsRevoked: result.sessionsRevoked,
      identityChanged: result.identityChanged,
    };
  },
};
