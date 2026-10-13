'use client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAllows, useCurrentSession } from '@/features/session';
import { useEffect, useRef } from 'react';
import type {
  GenerateCardBatchRequest,
  PrintCardBatchRequest,
  CardPrintExportRecord,
  VoidCardRequest,
  ReissueCardRequest,
  MissionCardRecord,
} from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import {
  generateCardBatch,
  printCardBatch,
  downloadCardPrint,
  lookupCard,
  voidCard,
  reissueCard,
  listCardPrintExports,
  getCardPrintDetails,
} from './api';
import { issueCard } from './api';
export function useIssueCard(code: string, onIssued: (card: MissionCardRecord) => void) {
  const eventId = useEventId();
  const receipt = useRetryKey();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      issueCard(eventId, { code, body: { idempotencyKey: receipt.forInput({ code }) } }),
    onSuccess: async (card) => {
      receipt.clear();
      onIssued(card);
      await client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}
export function useCardPrinting() {
  const eventId = useEventId();
  const client = useQueryClient();
  const generationKey = useRetryKey();
  const printKey = useRetryKey();
  const generate = useMutation({
    mutationFn: (body: Omit<GenerateCardBatchRequest, 'idempotencyKey'>) =>
      generateCardBatch(eventId, { ...body, idempotencyKey: generationKey.forInput(body) }),
    onSuccess: async () => {
      generationKey.clear();
      await client.invalidateQueries({ queryKey: [eventId] });
    },
  });
  const print = useMutation({
    mutationFn: (body: Omit<PrintCardBatchRequest, 'idempotencyKey'>) =>
      printCardBatch(eventId, { ...body, idempotencyKey: printKey.forInput(body) }),
    onSuccess: async () => {
      printKey.clear();
      await client.invalidateQueries({ queryKey: [eventId, 'card-print'] });
    },
  });
  const download = useCardPrintDownload();
  return { generate, print, download };
}
export function useCardPrintDownload() {
  const eventId = useEventId();
  const session = useCurrentSession();
  const allowed = useAllows()('Report.Export');
  const scope = `${eventId}:${session?.volunteerId ?? 'signed-out'}`;
  const signedIn = session !== null;
  const activeScope = useRef<{ scope: string } | null>(null);
  useEffect(() => {
    activeScope.current = allowed && signedIn ? { scope } : null;
    return () => {
      activeScope.current = null;
    };
  }, [scope, allowed, signedIn]);
  const download = useMutation({
    mutationKey: [eventId, 'card-print', session?.volunteerId ?? 'signed-out', 'download'],
    gcTime: 0,
    mutationFn: async (record: CardPrintExportRecord) => {
      const intent = activeScope.current;
      if (intent?.scope !== scope) throw new Error('Print export access is unavailable.');
      const blob = await downloadCardPrint(eventId, record.id);
      if (activeScope.current !== intent) throw new Error('This print view is no longer open.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cards-${record.id}.${record.format}`;
      try {
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
  return download;
}
export const cardPrintKeys = {
  history: (eventId: string, personId: string) =>
    [eventId, 'card-print', personId, 'history'] as const,
  detail: (eventId: string, personId: string, id: string) =>
    [eventId, 'card-print', personId, 'detail', id] as const,
};
export function useCardPrintHistory() {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: cardPrintKeys.history(eventId, session?.volunteerId ?? 'signed-out'),
    queryFn: ({ pageParam, signal }) => listCardPrintExports(eventId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session,
    gcTime: 0,
  });
}
export function useCardPrintDetails(id: string) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: cardPrintKeys.detail(eventId, session?.volunteerId ?? 'signed-out', id),
    queryFn: ({ signal }) => getCardPrintDetails(eventId, id, signal),
    enabled: !!session,
    gcTime: 0,
  });
}
export function useCardLookup() {
  const eventId = useEventId();
  return useMutation({ mutationFn: (code: string) => lookupCard(eventId, code) });
}
export function useCardCorrections(
  card: MissionCardRecord,
  onChange: (card: MissionCardRecord) => void,
) {
  const eventId = useEventId();
  const voidKey = useRetryKey();
  const reissueKey = useRetryKey();
  const voidMutation = useMutation({
    mutationFn: (body: Omit<VoidCardRequest, 'idempotencyKey'>) => voidCard(eventId, {
      code: card.shortCode, body: { ...body, idempotencyKey: voidKey.forInput({ code: card.shortCode, body }) },
    }),
    onSuccess: (updated) => { voidKey.clear(); onChange(updated); },
  });
  const reissue = useMutation({
    mutationFn: (body: Omit<ReissueCardRequest, 'idempotencyKey'>) => reissueCard(eventId, {
      code: card.shortCode, body: { ...body, idempotencyKey: reissueKey.forInput({ code: card.shortCode, body }) },
    }),
    onSuccess: (result) => { reissueKey.clear(); onChange(result.card); },
  });
  return { voidMutation, reissue };
}
