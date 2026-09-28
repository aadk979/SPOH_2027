'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '@/features/session';
import { checkIn, checkOut } from './api';
function useInvalidateMe() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: sessionKeys.me });
  };
}
export function useCheckIn(assignmentId: string | undefined) {
  const invalidate = useInvalidateMe();
  return useMutation({ mutationFn: () => checkIn(assignmentId), onSuccess: invalidate });
}
export function useCheckOut() {
  const invalidate = useInvalidateMe();
  return useMutation({ mutationFn: checkOut, onSuccess: invalidate });
}
