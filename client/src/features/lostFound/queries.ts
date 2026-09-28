'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createLostFound } from './api';
export function useCreateLostFound() {
  return useMutation({ mutationFn: createLostFound });
}

import { listLostFound, claimLostFound, type LostFoundFilters } from './api';
export const lostFoundKeys = {
  all: ['lost-found'] as const,
  list: (filters: LostFoundFilters) => ['lost-found', filters.query, filters.heldOnly] as const,
};
export function useLostFound(filters: LostFoundFilters, enabled: boolean) {
  return useQuery({
    queryKey: lostFoundKeys.list(filters),
    queryFn: () => listLostFound(filters),
    enabled,
  });
}
export function useClaimLostFound() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: claimLostFound,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: lostFoundKeys.all });
    },
  });
}
