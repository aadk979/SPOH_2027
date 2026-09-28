import type { CardTone } from '@/shared/ui';
export type Priority = 'INFO' | 'OPERATIONAL' | 'URGENT';

export const PRIORITY_LABELS: Record<Priority, string> = {
  INFO: 'Information',
  OPERATIONAL: 'Operational',
  URGENT: 'Urgent',
};

/** Urgent gets the rail; the other two do not need one to be found. */
export const PRIORITY_TONE: Record<Priority, CardTone> = {
  URGENT: 'alert',
  OPERATIONAL: 'neutral',
  INFO: 'neutral',
};
