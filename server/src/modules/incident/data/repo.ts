import type { Prisma } from '../../../generated/prisma/client.js';
import { pageArgs } from '../../../platform/db/pagination.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for incident reports (PRODUCT_BRIEF §7.1). */

const incidentInclude = {
  station: { select: { name: true } },
  reportedBy: { select: { displayName: true } },
  followUps: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.IncidentInclude;

export type IncidentWithContext = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

/**
 * Display names for follow-up authors. `IncidentFollowUp.authorId` has no
 * Prisma relation (see the note at the top of schema.prisma), so the names are
 * a second query rather than an include.
 */
export async function findAuthorNames(authorIds: readonly string[]): Promise<Map<string, string>> {
  if (authorIds.length === 0) return new Map();
  const authors = await prisma.volunteer.findMany({
    where: { id: { in: [...authorIds] } },
    select: { id: true, displayName: true },
  });
  return new Map(authors.map((author) => [author.id, author.displayName]));
}

export async function createIncident(
  tx: PrismaTransactionClient,
  data: Prisma.IncidentUncheckedCreateInput,
): Promise<{
  id: string;
  type: string;
  severity: IncidentWithContext['severity'];
  stationId: string | null;
}> {
  return tx.incident.create({
    data,
    select: { id: true, type: true, severity: true, stationId: true },
  });
}

export async function findIncidentById(id: string): Promise<IncidentWithContext | null> {
  return prisma.incident.findUnique({ where: { id }, include: incidentInclude });
}

export interface IncidentListFilter {
  status?: Prisma.IncidentWhereInput['status'];
  severity?: Prisma.IncidentWhereInput['severity'];
  stationId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: string;
}

export async function listIncidents(filter: IncidentListFilter): Promise<IncidentWithContext[]> {
  return prisma.incident.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.severity ? { severity: filter.severity } : {}),
      ...(filter.stationId ? { stationId: filter.stationId } : {}),
      ...(filter.from || filter.to
        ? {
            reportedAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    },
    include: incidentInclude,
    orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(filter),
  });
}

export async function addFollowUp(
  tx: PrismaTransactionClient,
  data: { incidentId: string; note: string; authorId: string },
): Promise<void> {
  await tx.incidentFollowUp.create({ data });
}

export async function updateIncidentStatus(
  tx: PrismaTransactionClient,
  id: string,
  status: Prisma.IncidentUpdateInput['status'],
): Promise<void> {
  await tx.incident.update({ where: { id }, data: { status } });
}
