'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RuntimeSettings } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { getSettings, saveSettings } from './api';
export const settingsKeys = {
  current: (eventId: string) => [eventId, 'admin', 'settings'] as const,
};
export function useSettings(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: settingsKeys.current(eventId),
    queryFn: () => getSettings(eventId),
    enabled,
    staleTime: 30_000,
  });
}
export function useSaveSettings() {
  const client = useQueryClient();
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: Partial<RuntimeSettings>) => saveSettings(eventId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: settingsKeys.current(eventId) });
    },
  });
}
