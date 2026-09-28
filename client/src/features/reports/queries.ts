'use client';
import { useQuery } from '@tanstack/react-query';
import { getReport } from './api';
export const reportKeys = { summary: ['reports', 'summary'] as const };
export function useReport(enabled: boolean) {
  return useQuery({ queryKey: reportKeys.summary, queryFn: getReport, enabled, staleTime: 60_000 });
}
