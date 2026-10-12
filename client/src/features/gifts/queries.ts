'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import {
  listGifts,
  listGiftCatalogue,
  createGiftType,
  updateGiftType,
  adjustGiftStock,
} from './api';
import type {
  CreateGiftTypeRequest,
  UpdateGiftTypeRequest,
  AdjustGiftStockWithReceiptRequest,
} from '@spoh/shared';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
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
export function useGiftAdmin() {
  const eventId = useEventId();
  const client = useQueryClient();
  const receipt = useRetryKey();
  const createReceipt = useRetryKey();
  const updateReceipt = useRetryKey();
  const invalidate = () => client.invalidateQueries({ queryKey: [eventId] });
  const create = useMutation({
    mutationFn: (body: CreateGiftTypeRequest) =>
      createGiftType(eventId, { ...body, idempotencyKey: createReceipt.forInput(body) }),
    onSuccess: async () => {
      createReceipt.clear();
      await invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (change: { id: string; body: UpdateGiftTypeRequest }) =>
      updateGiftType(eventId, {
        ...change,
        body: { ...change.body, idempotencyKey: updateReceipt.forInput(change) },
      }),
    onSuccess: async () => {
      updateReceipt.clear();
      await invalidate();
    },
  });
  const adjust = useMutation({
    mutationFn: (change: { id: string; body: Omit<AdjustGiftStockWithReceiptRequest, 'idempotencyKey'> }) =>
      adjustGiftStock(eventId, {
        ...change,
        body: { ...change.body, idempotencyKey: receipt.forInput(change) },
      }),
    onSuccess: async () => {
      receipt.clear();
      await invalidate();
    },
  });
  return { create, update, adjust };
}
export function useGiftCatalogue(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: [eventId, 'gifts', 'catalogue'],
    queryFn: () => listGiftCatalogue(eventId),
    enabled,
  });
}
