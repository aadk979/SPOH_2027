'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { listGifts } from './api';
export const giftKeys = { all: (eventId: string) => [eventId, 'gifts'] as const };
export function useGifts(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: giftKeys.all(eventId),
    queryFn: () => listGifts(eventId),
    enabled,
    refetchInterval: 15_000,
  });
}
