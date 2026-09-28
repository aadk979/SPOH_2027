import type {
  BriefingSlotRecord,
  CommitteeRole,
  CompleteBriefingSlotRequest,
  ListBriefingSlotsQuery,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventDayAnchor, singaporeDateString } from '../../../platform/time/index.js';
import { toBriefingSlotRecord } from '../data/mappers.js';
import { completeSlot, findSlotById, listBriefingSlots } from '../data/repo.js';
import { assertMayComplete, assertSlotOpen } from '../domain/briefingRules.js';

export async function getBriefingSlots(
  query: ListBriefingSlotsQuery,
  viewerId: string,
): Promise<BriefingSlotRecord[]> {
  const slots = await listBriefingSlots({
    ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
    // Defaults to today, because the briefing roster is a today-shaped thing.
    date: eventDayAnchor(query.date ?? singaporeDateString()),
  });
  const now = new Date();
  return slots.map((slot) => toBriefingSlotRecord(slot, { viewerId, now }));
}

export async function markSlotComplete(
  slotId: string,
  request: CompleteBriefingSlotRequest,
  actor: ActorContext & { role: CommitteeRole },
): Promise<BriefingSlotRecord> {
  const { volunteerId: actorId, audit } = actor;
  const slot = await findSlotById(slotId);
  if (!slot) throw new NotFoundError('Briefing slot');
  assertSlotOpen(slot);
  assertMayComplete(slot, actor);

  await prisma.$transaction(async (tx) => {
    await completeSlot(tx, slotId, request.notes ?? null);
    await writeAudit(tx, {
      ...audit,
      action: 'roster.edit',
      entityType: 'BriefingSlot',
      entityId: slotId,
      after: { completed: true },
    });
  });

  const refreshed = await findSlotById(slotId);
  if (!refreshed) throw new NotFoundError('Briefing slot');
  return toBriefingSlotRecord(refreshed, { viewerId: actorId, now: new Date() });
}
