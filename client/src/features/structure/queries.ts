'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from '@/features/session';
import {
  getStructure,
  removeDay,
  getAdminStations,
  saveStructure,
  saveStation,
  saveDay,
  type StructureWrite,
} from './api';
export const structureKeys = {
  all: (eventId: string, personId: string) => [eventId, 'structure', personId] as const,
  stations: (eventId: string, personId: string) =>
    [...structureKeys.all(eventId, personId), 'stations'] as const,
};
export function useStructure(enabled = true) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: structureKeys.all(eventId, session?.volunteerId ?? 'signed-out'),
    queryFn: ({ signal }) => getStructure(eventId, signal),
    enabled: enabled && !!session,
    gcTime: 0,
  });
}
export function useAdminStations(enabled = true) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: structureKeys.stations(eventId, session?.volunteerId ?? 'signed-out'),
    queryFn: ({ signal }) => getAdminStations(eventId, signal),
    enabled: enabled && !!session,
    gcTime: 0,
  });
}
function useRefreshStructure() {
  const eventId = useEventId();
  const client = useQueryClient();
  // Structure changes also change capture choices, shifts, staffing and readiness.
  return () => client.invalidateQueries({ queryKey: [eventId] });
}
export function useStructureWrite() {
  const eventId = useEventId();
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: (input: StructureWrite) => saveStructure(eventId, input),
    onSuccess: refresh,
  });
}
export function useStationWrite() {
  const eventId = useEventId();
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: (input: { id?: string; body: unknown }) => saveStation(eventId, input),
    onSuccess: refresh,
  });
}
export function useDayWrite() {
  const eventId = useEventId();
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: (input: { id?: string; body: unknown }) => saveDay(eventId, input),
    onSuccess: refresh,
  });
}
export function useDayRemoval() {
  const eventId = useEventId();
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: (input: Parameters<typeof removeDay>[1]) => removeDay(eventId, input),
    onSuccess: refresh,
  });
}
