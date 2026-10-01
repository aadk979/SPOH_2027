'use client';
import { useMutation } from '@tanstack/react-query';
import type { CreateIncidentRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { createIncident } from './api';
export function useCreateIncident() {
  const eventId = useEventId();
  return useMutation({
    // Run the attempt offline too, so sendOrQueue can persist it instead of awaiting a paused mutation.
    networkMode: 'always',
    mutationFn: (body: CreateIncidentRequest) => createIncident(eventId, body),
  });
}
