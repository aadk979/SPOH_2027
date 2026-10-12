import type { NoticeRecord } from '@spoh/shared';
import { eventHref } from '@/shared/lib/eventPath';
import { workspacePath } from '@/shared/lib/workspacePath';

export function noticeDestination(record: NoticeRecord): string | null {
  if (!record.destination) return null;
  const path = workspacePath(record.destination);
  return record.destination.type === 'platform' ? path : eventHref(record.eventSlug, path);
}
