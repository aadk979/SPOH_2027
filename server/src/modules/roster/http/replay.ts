import { getVolunteer } from '../../people/index.js';
import { getAuth } from '../../../platform/http/requireAuth.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';

export const provisionReplay: RedactedReplay = {
  store(body) {
    const result = body as { volunteer: { id: string }; identityCreated: boolean };
    return { id: result.volunteer.id, identityCreated: result.identityCreated };
  },
  async replay(req, stored) {
    const result = stored as { id: string; identityCreated: boolean };
    const row = await getVolunteer({ eventId: getAuth(req).eventId }, result.id);
    return {
      identityCreated: result.identityCreated,
      volunteer: {
        id: row.id,
        displayName: row.displayName,
        email: row.email,
        phone: row.phone,
        role: row.role,
        portfolio: row.portfolio,
        reportsToId: row.reportsToId,
        active: row.active,
        createdAt: row.createdAt,
      },
    };
  },
};
