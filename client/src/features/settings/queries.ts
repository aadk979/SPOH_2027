'use client';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type {
  ChangeAttendanceConfigRequest,
  ChangeEventSettingRequest,
  RuntimeSettings,
  TestAttendanceNetworkRequest,
  UpdateShiftTemplateRequest,
  EventSettingKey,
  RevertEventSettingRequest,
  ScopedSettingsTarget,
  ScopedSettingsMutationResponse,
  ScopedSettingsRevertResponse,
  ScopedSettingsReadResponse,
} from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from '@/features/session';
import { ms } from '@/shared/lib/runtimeSettings';
import { ApiError } from '@/shared/lib/apiErrors';
import {
  changeAttendanceConfig,
  changeEventSetting,
  getAttendanceConfig,
  getEventSettings,
  getSettings,
  listShiftTemplates,
  saveSettings,
  saveShiftTemplate,
  testAttendanceNetwork,
  getEventSettingHistory,
  getReviewedEventSettings,
  revertEventSetting,
  getScopedSettings,
  getScopedSettingHistory,
  changeScopedSetting,
  revertScopedSetting,
} from './api';
import type { CaptureRequest } from './model/captureControl';
export const settingsKeys = {
  current: (eventId: string) => [eventId, 'admin', 'settings'] as const,
  shiftTemplates: (eventId: string) => [eventId, 'admin', 'shift-templates'] as const,
  event: (eventId: string) => [eventId, 'event-settings'] as const,
  attendance: (eventId: string) => [eventId, 'admin', 'attendance-settings'] as const,
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

export function useAttendanceConfig(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: settingsKeys.attendance(eventId),
    queryFn: () => getAttendanceConfig(eventId),
    enabled,
    staleTime: 30_000,
  });
}

export function useChangeAttendanceConfig() {
  const client = useQueryClient();
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: ChangeAttendanceConfigRequest) => changeAttendanceConfig(eventId, body),
    onSuccess: (response) => {
      client.setQueryData(settingsKeys.attendance(eventId), response);
      void client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}

export function useTestAttendanceNetwork() {
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: TestAttendanceNetworkRequest) => testAttendanceNetwork(eventId, body),
  });
}

export const productHistoryKeys = {
  list: (eventId: string, personId: string | undefined, key: EventSettingKey) =>
    [eventId, 'product-setting-history', personId ?? 'signed-out', key] as const,
  current: (eventId: string, personId: string | undefined) =>
    [eventId, 'product-setting-review', personId ?? 'signed-out'] as const,
};
export function useProductHistory(key: EventSettingKey) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: productHistoryKeys.list(eventId, session?.volunteerId, key),
    queryFn: ({ pageParam }) => getEventSettingHistory(eventId, { key, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useProductReviewCurrent() {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: productHistoryKeys.current(eventId, session?.volunteerId),
    queryFn: () => getReviewedEventSettings(eventId),
    enabled: !!session,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useRevertProductSetting() {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RevertEventSettingRequest) => revertEventSetting(eventId, body),
    gcTime: 0,
    onSuccess: async (response) => {
      client.setQueryData(settingsKeys.event(eventId), response.current);
      await client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}

export const scopedSettingsKeys = {
  owner: (eventId: string, personId: string | undefined) =>
    [eventId, 'scoped-settings', personId ?? 'signed-out'] as const,
  current: (eventId: string, personId: string | undefined, target: ScopedSettingsTarget) =>
    [
      ...scopedSettingsKeys.owner(eventId, personId),
      target.scope,
      target.scope === 'station' ? target.stationId : 'event',
      'current',
    ] as const,
  history: (eventId: string, personId: string | undefined, target: ScopedSettingsTarget) =>
    [...scopedSettingsKeys.current(eventId, personId, target), 'capture.open', 'history'] as const,
};
export function useScopedCaptureCurrent(target: ScopedSettingsTarget, enabled = true) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: scopedSettingsKeys.current(eventId, session?.volunteerId, target),
    queryFn: () => getScopedSettings(eventId, target),
    enabled: enabled && !!session,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useScopedCaptureHistory(target: ScopedSettingsTarget) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: scopedSettingsKeys.history(eventId, session?.volunteerId, target),
    queryFn: ({ pageParam }) =>
      getScopedSettingHistory(eventId, { target, key: 'capture.open', cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useApplyCaptureChange() {
  const eventId = useEventId();
  const session = useCurrentSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      request: CaptureRequest,
    ): Promise<ScopedSettingsMutationResponse | ScopedSettingsRevertResponse> =>
      request.kind === 'change'
        ? changeScopedSetting(eventId, request.body)
        : revertScopedSetting(eventId, request.body),
    gcTime: 0,
    onSuccess: async (response) => {
      client.setQueryData(
        scopedSettingsKeys.current(eventId, session?.volunteerId, response.current.target),
        response.current,
      );
      await client.invalidateQueries({
        queryKey: scopedSettingsKeys.owner(eventId, session?.volunteerId),
      });
    },
    onError: (failure) => {
      if (failure instanceof ApiError && [401, 403].includes(failure.status))
        client.removeQueries({ queryKey: scopedSettingsKeys.owner(eventId, session?.volunteerId) });
    },
  });
}

export function useCaptureScheduleSettings() {
  const eventId = useEventId();
  const session = useCurrentSession();
  const client = useQueryClient();
  const owner = scopedSettingsKeys.owner(eventId, session?.volunteerId);
  return {
    clear: () => client.removeQueries({ queryKey: owner }),
    accept: (current: ScopedSettingsReadResponse) => {
      client.setQueryData(
        scopedSettingsKeys.current(eventId, session?.volunteerId, current.target),
        current,
      );
      void client.invalidateQueries({ queryKey: owner });
    },
  };
}
