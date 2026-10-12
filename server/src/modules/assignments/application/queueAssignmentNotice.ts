import { randomUUID } from 'node:crypto';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { queueNotices } from '../../notification/index.js';

export async function queueAssignmentNotice(tx: PrismaTransactionClient, scope: EventScope, input: {
  id: string; volunteerId: string; stationId: string; eventDayId: string; shiftId: string;
  operation: 'ADDED' | 'MOVED' | 'REMOVED'; now: Date;
}) {
  const transition = randomUUID();
  return queueNotices(tx, scope, { kind: input.operation === 'REMOVED' ? 'ASSIGNMENT_REMOVED' : 'ASSIGNMENT_CHANGED',
    priority: 'OPERATIONAL', source: { kind: 'ASSIGNMENT', id: input.id },
    transitionKey: `assignment:${input.id}:change:${transition}`,
    context: { type: 'assignment', operation: input.operation, stationId: input.stationId,
      eventDayId: input.eventDayId, shiftId: input.shiftId }, recipientPersonIds: [input.volunteerId], createdAt: input.now });
}
