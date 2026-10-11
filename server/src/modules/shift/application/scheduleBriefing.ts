import type { CreateBriefingSlotRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { briefingScheduleContext, insertBriefingSlot } from '../data/briefingScheduleRepo.js';
import { assertBriefingSchedule } from '../domain/briefingSchedule.js';

export async function scheduleBriefing(
  request: CreateBriefingSlotRequest,
  actor: ActorContext,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await lockReserved(tx, actor.scope, request.idempotencyKey);
    await holdCaptureEvent(tx, actor.scope);
    await requireCurrentPermission(tx, {
      scope: actor.scope,
      membershipId: actor.membershipId,
      personId: actor.volunteerId,
      action: 'Roster.Edit',
    });
    assertBriefingSchedule(request, await briefingScheduleContext(tx, actor.scope, request));
    const slot = await insertBriefingSlot(tx, actor.scope, request);
    await writeAudit(tx, {
      ...actor.audit,
      action: 'briefing.schedule',
      entityType: 'BriefingSlot',
      entityId: slot.id,
      after: {
        eventDayId: request.eventDayId,
        startsAt: request.startsAt,
        briefierId: request.briefierId,
        waveSize: request.waveSize,
      },
    });
    await settleReserved(tx, actor.scope, {
      key: request.idempotencyKey,
      statusCode: 201,
      body: { data: slot },
    });
    return slot;
  });
}
