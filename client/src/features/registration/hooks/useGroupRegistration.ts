import { useState } from 'react';
import type { VisitorCategory } from '@spoh/shared';
import { useMe } from '@/features/session';
import { adjustGroup, groupTotal, type GroupCounts } from '../model/groupMembers';
import { useGroupSubmit } from './useGroupSubmit';
export function useGroupRegistration() {
  const { data: me } = useMe();
  const [counts, setCounts] = useState<GroupCounts>({});
  const [shortCode, setShortCode] = useState('');
  const stationId = me?.currentAssignment?.station.id;
  const total = groupTotal(counts);
  function adjust(category: VisitorCategory, delta: number): void {
    setCounts((current) => adjustGroup(current, category, delta));
  }
  const submission = useGroupSubmit({ stationId, total, counts, shortCode });
  return { stationId, counts, shortCode, setShortCode, total, adjust, ...submission };
}
export type GroupRegistrationForm = ReturnType<typeof useGroupRegistration>;
