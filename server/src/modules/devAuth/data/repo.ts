import { prisma } from '../../../platform/db/client.js';

export async function findVolunteerByEmail(email: string) {
  return prisma.volunteer.findUnique({
    where: { email },
    select: { cognitoSub: true, role: true, displayName: true, active: true },
  });
}
