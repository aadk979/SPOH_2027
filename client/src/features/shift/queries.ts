'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionKeys, useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { checkIn, checkOut, confirmSalvage } from './api';
import type { ConfirmOutboxSalvageRequest } from '@spoh/shared';
import { clearConfirmedFailed } from '@/shared/lib/outboxSalvage';
import { getSessionGeneration } from '@/shared/lib/session';
import { refreshOutbox } from '@/shared/lib/outbox';
function useInvalidateMe() {
  const client = useQueryClient();
  const eventId = useEventId();
  return () => {
    void client.invalidateQueries({ queryKey: sessionKeys.me(eventId) });
  };
}
export function useCheckIn(assignment: { id: string } | null) {
  const eventId = useEventId();
  const invalidate = useInvalidateMe();
  return useMutation({ mutationFn: () => checkIn(eventId, assignment?.id), onSuccess: invalidate });
}
export function useCheckOut() {
  const eventId = useEventId();
  const invalidate = useInvalidateMe();
  return useMutation({
    mutationFn: (assignmentId: string) => checkOut(eventId, assignmentId),
    onSuccess: invalidate,
  });
}

export function useConfirmOutboxSalvage() {
  const eventId = useEventId();
  const personId = useCurrentSession()?.volunteerId;
  return useMutation({ gcTime: 0, mutationFn: async (body: ConfirmOutboxSalvageRequest) => {
    if (!personId) throw new Error('Sign in again before confirming recovery.');
    const generation = getSessionGeneration();
    const proof = await confirmSalvage(eventId, body);
    const cleared = await clearConfirmedFailed({ eventId, personId, generation,
      selectedIds: body.entries.map((entry) => entry.idempotencyKey) }, proof);
    await refreshOutbox();
    return { cleared, auditId: proof.auditId };
  } });
}
