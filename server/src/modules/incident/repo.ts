import type { IncidentRecord } from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';

/** Data access for incident reports (PRODUCT_BRIEF §7.1). */

const incidentInclude = {
  station: { select: { name: true } },
  reportedBy: { select: { displayName: true } },
  followUps: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.IncidentInclude;

export type IncidentWithContext = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

/**
 * Follow-up authors are resolved separately because `IncidentFollowUp.authorId`
 * has no Prisma relation (see the note at the top of schema.prisma). One extra
 * query per incident list, which is fine at this volume.
 */
export async function toIncidentRecord(incident: IncidentWithContext): Promise<IncidentRecord> {
  const authorIds = [...new Set(incident.followUps.map((f) => f.authorId))];
  const authors = authorIds.length
    ? await prisma.volunteer.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.displayName]));

  return {
    id: incident.id,
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    stationId: incident.stationId,
    stationName: incident.station?.name ?? null,
    locationNote: incident.locationNote,
    description: incident.description,
    reportedById: incident.reportedById,
    reportedByName: incident.reportedBy.displayName,
    occurredAt: incident.occurredAt.toISOString(),
    reportedAt: incident.reportedAt.toISOString(),
    followUps: incident.followUps.map((followUp) => ({
      id: followUp.id,
      note: followUp.note,
      authorId: followUp.authorId,
      authorName: nameById.get(followUp.authorId) ?? 'Unknown',
      createdAt: followUp.createdAt.toISOString(),
    })),
  };
}

export async function createIncident(
  tx: PrismaTransactionClient,
  data: Prisma.IncidentUncheckedCreateInput,
): Promise<IncidentWithContext> {
  return tx.incident.create({ data, include: incidentInclude });
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
    orderBy: { reportedAt: 'desc' },
    take: filter.limit,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
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
