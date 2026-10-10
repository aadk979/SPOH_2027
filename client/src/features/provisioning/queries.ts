'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProvisionVolunteerRequest, RosterImportRequest } from '@spoh/shared';
import { volunteerKeys } from '@/features/volunteers';
import { useEventId } from '@/shared/lib/eventContext';
import { importPeople, invitePerson } from './api';
import { useRetryKey } from '@/shared/hooks/useRetryKey';

export function useInvitePerson() {
  const eventId = useEventId();
  const queryClient = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: (body: ProvisionVolunteerRequest) =>
      invitePerson(eventId, { ...body, idempotencyKey: receipt.forInput(body) }),
    onSuccess: () => {
      receipt.clear();
      void queryClient.invalidateQueries({ queryKey: volunteerKeys.all(eventId) });
    },
  });
}

export function useImportPeople() {
  const eventId = useEventId();
  const queryClient = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: (body: RosterImportRequest) =>
      importPeople(eventId, { ...body, idempotencyKey: receipt.forInput(body) }),
    onSuccess: (response) => {
      receipt.clear();
      if (response.committed)
        void queryClient.invalidateQueries({ queryKey: volunteerKeys.all(eventId) });
    },
  });
}
