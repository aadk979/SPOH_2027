import { prisma } from '../../../platform/db/client.js';

/** A person by email, with their role in their home event (the first running one). */
export async function findVolunteerByEmail(email: string) {
  const person = await prisma.person.findUnique({
    where: { email },
    select: {
      cognitoSub: true,
      displayName: true,
      eventMemberships: {
        where: { status: 'ACTIVE', event: { status: { notIn: ['CLOSED', 'ARCHIVED'] } } },
        orderBy: { event: { createdAt: 'asc' } },
        take: 1,
        select: { role: true },
      },
    },
  });
  if (!person) return null;
  const { eventMemberships, ...identity } = person;
  return { ...identity, role: eventMemberships[0]?.role ?? 'VOLUNTEER' };
}
