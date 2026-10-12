import type { ConfirmOutboxSalvageRequest } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function retainedSalvageCapture(scope: EventScope, input: {
  db: PrismaTransactionClient; personId: string; entry: ConfirmOutboxSalvageRequest['entries'][number];
}) {
  const where = { eventId: scope.eventId, id: input.entry.recordId,
    idempotencyKey: input.entry.idempotencyKey, recordedById: input.personId };
  const select = { id: true } as const;
  switch (input.entry.captureKind) {
    case 'registration': return input.db.registration.findFirst({ where, select });
    case 'footfall': return input.db.footfallTick.findFirst({ where, select });
    case 'stamp': return input.db.cardStampEvent.findFirst({ where, select });
    case 'redemption': return input.db.giftRedemption.findFirst({ where, select });
    case 'incident': return input.db.incident.findFirst({ where: { eventId: scope.eventId,
      id: input.entry.recordId, idempotencyKey: input.entry.idempotencyKey, reportedById: input.personId }, select });
  }
}
