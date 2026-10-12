import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function currentNoticeStanding(scope: EventScope, input: {
  db: PrismaTransactionClient; personId: string;
}) {
  return input.db.event.findUnique({ where: { id: scope.eventId }, select: { id: true,
    name: true, slug: true, status: true, organisationId: true,
    memberships: { where: { personId: input.personId }, select: { id: true, status: true } },
    organisation: { select: { memberships: { where: { personId: input.personId, role: 'PLATFORM_ADMIN',
      person: { deactivatedAt: null } }, select: { id: true } } } },
  } });
}

export async function currentNoticeEvents(db: PrismaTransactionClient, input: {
  personId: string; eventId?: string;
}) {
  return db.event.findMany({ where: { ...(input.eventId ? { id: input.eventId } : {}), OR: [
    { memberships: { some: { personId: input.personId, person: { deactivatedAt: null },
      OR: [{ status: 'ACTIVE' }, { status: 'ENDED', event: { status: 'ARCHIVED' } }] } } },
    { organisation: { memberships: { some: { personId: input.personId,
      role: 'PLATFORM_ADMIN', person: { deactivatedAt: null } } } } },
  ] }, select: { id: true }, orderBy: { id: 'asc' } });
}

export function noticePreference(db: PrismaTransactionClient, personId: string) {
  return db.noticePreference.findUnique({ where: { personId } });
}
