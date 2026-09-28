'use client';
import { useQuery } from '@tanstack/react-query';
import { listGifts } from './api';
export const giftKeys = { all: ['gifts'] as const };
export function useGifts(enabled: boolean) {
  return useQuery({ queryKey: giftKeys.all, queryFn: listGifts, enabled, refetchInterval: 15_000 });
}
