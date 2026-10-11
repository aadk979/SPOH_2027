import type {
  BriefingSlotRecord,
  CommitteeRole,
  CompleteBriefingSlotRequest,
  ListBriefingSlotsQuery,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError, AppError } from '../../../platform/errors/index.js';
import { ERROR_CODES } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventToday } from '../../../platform/event/today.js';
import { eventDayAnchor, systemClock } from '../../../platform/time/index.js';
import { toBriefingSlotRecord } from '../data/mappers.js';
import { findSlotById, listBriefingSlots } from '../data/repo.js';
import {
  findBriefingForCompletion,
  completePendingBriefing,
} from '../data/briefingCompletionRepo.js';
import { assertSlotOpen, minutesUntilStart } from '../domain/briefingRules.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { settleShiftReceipt } from './mutationReceipt.js';
import { prepareShiftWrite } from './prepareShiftWrite.js';

export async function getBriefingSlots(
  scope: EventScope,
  query: ListBriefingSlotsQuery,
  viewerId: string,
): Promise<BriefingSlotRecord[]> {
  const now = systemClock.now();
  const slots = await listBriefingSlots(scope, {
    ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
    // Defaults to today, because the briefing roster is a today-shaped thing.
    ...(query.date
      ? { date: eventDayAnchor(query.date) }
      : query.eventDayId
        ? {}
        : { date: await eventToday(scope, now) }),
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
  await prisma.$transaction(async (tx) => {
    await prepareShiftWrite(tx, {
      actor,
      action: 'Briefing.Complete',
      key: request.idempotencyKey,
      resource: { type: 'BriefingSlot', id: slotId },
    });
    const slot = await findBriefingForCompletion(tx, scope, slotId);
    if (!slot) throw new NotFoundError('Briefing slot');
    assertSlotOpen(slot);
    if (
      !(await completePendingBriefing(tx, scope, {
        id: slotId,
        notes: request.notes,
        completedAt: systemClock.now(),
      }))
    )
      throw new AppError(
        409,
        ERROR_CODES.SLOT_ALREADY_COMPLETED,
        'That briefing slot is already marked complete',
      );
    await writeAudit(tx, {
      ...audit,
      action: 'roster.edit',
      entityType: 'BriefingSlot',
      entityId: slotId,
      after: { completed: true },
    });
    await settleShiftReceipt(tx, scope, {
      key: request.idempotencyKey,
      id: slotId,
      statusCode: 200,
    });
  });

  const refreshed = await findSlotById(scope, slotId);
  if (!refreshed) throw new NotFoundError('Briefing slot');
  return toBriefingSlotRecord(refreshed, {
    viewerId: actorId,
    minutesUntilStart: minutesUntilStart(refreshed.startsAt, systemClock.now()),
  });
}
