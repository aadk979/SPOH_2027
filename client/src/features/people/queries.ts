'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeactivatePersonRequest } from '@spoh/shared';
import { useAllows, useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { getPerson, deactivatePerson, reactivatePerson, exportPersonData, erasePersonData } from './api';

export function usePerson(id: string | null) {
  const eventId = useEventId();
  const session = useCurrentSession();
  const allows = useAllows();
  return useQuery({
    queryKey: [eventId, 'person', id],
    queryFn: () => getPerson(id!),
    enabled: !!id && !!session && allows('Platform.ManageAdmins'),
  });
}

export function useDeactivatePerson() {
  const eventId = useEventId();
  const queries = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: (input: { id: string; body: DeactivatePersonRequest }) =>
      deactivatePerson({
        id: input.id,
        body: { ...input.body, idempotencyKey: receipt.forInput(input) },
      }),
    onSuccess: () => {
      receipt.clear();
      void queries.invalidateQueries({ queryKey: [eventId] });
    },
  });
}

export function useReactivatePerson() {
  const eventId = useEventId();
  const queries = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: (id: string) => reactivatePerson({ id, idempotencyKey: receipt.forInput(id) }),
    onSuccess: () => {
      receipt.clear();
      void queries.invalidateQueries({ queryKey: [eventId] });
    },
  });
}
export function useExportPersonData() {
  return useMutation({ mutationFn: exportPersonData, gcTime: 0 });
}
export function useErasePersonData() {
  const eventId = useEventId();
  const queries = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({ mutationFn: (input: { id: string; body: DeactivatePersonRequest }) =>
    erasePersonData({ ...input, body: { ...input.body, idempotencyKey: receipt.forInput(input) } }),
    gcTime: 0, onSuccess: async () => { receipt.clear(); await queries.invalidateQueries({ queryKey: [eventId] }); } });
}
