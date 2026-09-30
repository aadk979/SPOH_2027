'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { checkIn, checkOut } from './api';
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
