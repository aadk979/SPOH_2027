'use client';
import { useOnline } from '@/shared/hooks/useOnline';
import { useOutboxEntries } from './SyncIndicator';
import { OfflineState } from '@/shared/ui';

export function ConnectionState() {
  const online = useOnline();
  const entries = useOutboxEntries();
  if (online) return null;
  return <OfflineState queued={entries.some((entry) => entry.status !== 'failed')} />;
}
