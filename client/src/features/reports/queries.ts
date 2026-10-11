'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAllows, useCurrentSession } from '@/features/session';
import { listReportSnapshots, readReportSnapshot, downloadReportSnapshot } from './api';
export const snapshotKeys = {
  owner: (eventId: string, personId: string) => [eventId, 'report-snapshots', personId] as const,
};
export function useReportSnapshots(enabled: boolean) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: [...snapshotKeys.owner(eventId, session?.volunteerId ?? 'signed-out'), 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => listReportSnapshots(eventId, pageParam, signal),
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    enabled: enabled && session !== null,
    gcTime: 0,
  });
}
export function useReportSnapshot(id: string) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: [...snapshotKeys.owner(eventId, session?.volunteerId ?? 'signed-out'), 'detail', id],
    queryFn: ({ signal }) => readReportSnapshot(eventId, id, signal),
    enabled: !!id && session !== null,
    gcTime: 0,
  });
}
export function useSnapshotDownload() {
  const eventId = useEventId();
  const session = useCurrentSession();
  const allowed = useAllows()('Report.Export');
  const scope = `${eventId}:${session?.volunteerId ?? 'signed-out'}`;
  const signedIn = session !== null;
  const active = useRef<{ scope: string } | null>(null);
  useEffect(() => {
    active.current = allowed && signedIn ? { scope } : null;
    return () => {
      active.current = null;
    };
  }, [scope, allowed, signedIn]);
  return useMutation({
    mutationKey: [eventId, 'report-snapshots', session?.volunteerId, 'download'],
    gcTime: 0,
    mutationFn: async (input: { id: string; format: 'csv' | 'xlsx' }) => {
      const intent = active.current;
      if (intent?.scope !== scope) throw new Error('Report export access is unavailable.');
      const bytes = await downloadReportSnapshot(eventId, input);
      if (active.current !== intent) throw new Error('This report view is no longer open.');
      const url = URL.createObjectURL(bytes);
      const link = document.createElement('a');
      link.href = url;
      link.download = `snapshot-${input.id}.${input.format}`;
      try {
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
}
import { useEventId } from '@/shared/lib/eventContext';
import { getReport, createArchivePack, listArchivePacks } from './api';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
export const reportKeys = {
  summary: (eventId: string, includeRehearsal = false, current = false) =>
    [eventId, 'reports', 'summary', includeRehearsal, current] as const,
};
export function useReport(enabled: boolean, includeRehearsal = false, current = false) {
  const eventId = useEventId();
  return useQuery({
    queryKey: reportKeys.summary(eventId, includeRehearsal, current),
    queryFn: () => getReport(eventId, includeRehearsal, current),
    enabled,
    staleTime: 60_000,
  });
}
export function useArchivePacks(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: [eventId, 'reports', 'archive-exports'],
    queryFn: () => listArchivePacks(eventId),
    enabled,
    gcTime: 0,
  });
}
export function useCreateArchivePack() {
  const eventId = useEventId();
  const client = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: () => createArchivePack(eventId, receipt.forInput({ eventId })),
    onSuccess: async () => {
      receipt.clear();
      await client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}
