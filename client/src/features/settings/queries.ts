'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, saveSettings } from './api';
export const settingsKeys = { current: ['admin', 'settings'] as const };
export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.current,
    queryFn: getSettings,
    enabled,
    staleTime: 30_000,
  });
}
export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: settingsKeys.current });
    },
  });
}
