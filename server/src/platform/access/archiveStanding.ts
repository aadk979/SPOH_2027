import type { PrismaTransactionClient } from '../db/client.js';

/** Archive membership is historical; only the owning organisation's admins may read it. */
export async function archiveReader(
  db: PrismaTransactionClient,
  input: { personId: string; status: string; eventId: string },
): Promise<boolean> {
  if (input.status !== 'ENDED') return false;
  const event = await db.event.findUnique({
    where: { id: input.eventId },
    select: { status: true, organisationId: true },
  });
  if (event?.status !== 'ARCHIVED') return false;
  return Boolean(await db.organisationMembership.findFirst({
    where: { personId: input.personId, organisationId: event.organisationId, role: 'PLATFORM_ADMIN' },
    select: { id: true },
  }));
}
