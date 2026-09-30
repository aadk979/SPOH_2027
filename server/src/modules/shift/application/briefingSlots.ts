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
import { eventToday } from '../../../platform/event/today.js';
import { eventDayAnchor } from '../../../platform/time/index.js';
import { toBriefingSlotRecord } from '../data/mappers.js';
import { completeSlot, findSlotById, listBriefingSlots } from '../data/repo.js';
import { assertMayComplete, assertSlotOpen, minutesUntilStart } from '../domain/briefingRules.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function getBriefingSlots(
  scope: EventScope,
  query: ListBriefingSlotsQuery,
  viewerId: string,
): Promise<BriefingSlotRecord[]> {
  const now = new Date();
  const slots = await listBriefingSlots(scope, {
    ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
    // Defaults to today, because the briefing roster is a today-shaped thing.
    date: query.date ? eventDayAnchor(query.date) : await eventToday(scope, now),
  });
  return slots.map((slot) =>
    toBriefingSlotRecord(slot, {
      viewerId,
      minutesUntilStart: minutesUntilStart(slot.startsAt, now),
    }),
  );
}

export async function markSlotComplete(
  slotId: string,
  request: CompleteBriefingSlotRequest,
  actor: ActorContext & { role: CommitteeRole },
): Promise<BriefingSlotRecord> {
  const { volunteerId: actorId, scope, audit } = actor;
  const slot = await findSlotById(scope, slotId);
  if (!slot) throw new NotFoundError('Briefing slot');
  assertSlotOpen(slot);
  assertMayComplete(slot, actor);

  await prisma.$transaction(async (tx) => {
    await completeSlot(tx, scope, { id: slotId, notes: request.notes ?? null });
    await writeAudit(tx, {
      ...audit,
      action: 'roster.edit',
      entityType: 'BriefingSlot',
      entityId: slotId,
      after: { completed: true },
    });
  });

  const refreshed = await findSlotById(scope, slotId);
  if (!refreshed) throw new NotFoundError('Briefing slot');
  return toBriefingSlotRecord(refreshed, {
    viewerId: actorId,
    minutesUntilStart: minutesUntilStart(refreshed.startsAt, new Date()),
  });
}
