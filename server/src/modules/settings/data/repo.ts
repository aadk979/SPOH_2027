import { prisma } from '../../../platform/db/client.js';

/** The display name of whoever last changed the settings. */
export async function findVolunteerName(id: string): Promise<string | null> {
  const row = await prisma.person.findUnique({ where: { id }, select: { displayName: true } });
  return row?.displayName ?? null;
}
