'use client';
import { useQuery } from '@tanstack/react-query';
import { listStations } from './api';
export const stationKeys = { all: ['stations'] as const };
export function useStations(enabled = true) {
  return useQuery({
    queryKey: stationKeys.all,
    queryFn: listStations,
    enabled,
    staleTime: 5 * 60_000,
  });
}
