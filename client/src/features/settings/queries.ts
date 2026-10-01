'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeEventSettingRequest,
  RuntimeSettings,
  UpdateShiftTemplateRequest,
} from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import {
  changeEventSetting,
  getEventSettings,
  getSettings,
  listShiftTemplates,
  saveSettings,
  saveShiftTemplate,
} from './api';
export const settingsKeys = {
  current: (eventId: string) => [eventId, 'admin', 'settings'] as const,
  shiftTemplates: (eventId: string) => [eventId, 'admin', 'shift-templates'] as const,
  event: (eventId: string) => [eventId, 'event-settings'] as const,
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

export function useShiftTemplates(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: settingsKeys.shiftTemplates(eventId),
    queryFn: () => listShiftTemplates(eventId),
    enabled,
    staleTime: 30_000,
  });
}

export function useSaveShiftTemplate() {
  const client = useQueryClient();
  const eventId = useEventId();
  return useMutation({
    mutationFn: (change: { id: string; body: UpdateShiftTemplateRequest }) =>
      saveShiftTemplate(eventId, change),
    onSuccess: () => {
      // The day's shifts moved too, and every screen that prints their hours.
      void client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}

/** The event's product rules: how counts are shown, whether visitor data exists. */
export function useEventSettings(enabled = true) {
  const eventId = useEventId();
  return useQuery({
    queryKey: settingsKeys.event(eventId),
    queryFn: () => getEventSettings(eventId),
    enabled,
    staleTime: 60_000,
  });
}

export function useChangeEventSetting() {
  const client = useQueryClient();
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: ChangeEventSettingRequest) => changeEventSetting(eventId, body),
    onSuccess: (response) => {
      client.setQueryData(settingsKeys.event(eventId), response);
      // Reports and dashboards show counts by these rules.
      void client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}
