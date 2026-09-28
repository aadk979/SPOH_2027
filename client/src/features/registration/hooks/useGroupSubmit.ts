import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrationEndpoints } from '@/features/registration';
import { enqueue } from '@/shared/lib/outbox';
import { groupMembers, type GroupCounts } from '../model/groupMembers';
export function useGroupSubmit({
  stationId,
  total,
  counts,
  shortCode,
}: {
  stationId: string | undefined;
  total: number;
  counts: GroupCounts;
  shortCode: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(): Promise<void> {
    if (!stationId || total === 0) return;
    setSaving(true);
    setError(null);

    const members = groupMembers(counts);

    const idempotencyKey = crypto.randomUUID();

    try {
      await enqueue({
        idempotencyKey,
        endpoint: registrationEndpoints.group,
        body: {
          stationId,
          members,
          // Optional. If the card cannot be linked the registrations still
          // stand and only that card's journey goes untracked (remediation/phases/P07-client-refactor.md).
          ...(shortCode.trim() ? { missionCardShortCode: shortCode.trim().toUpperCase() } : {}),
          idempotencyKey,
          clientRecordedAt: new Date().toISOString(),
        },
      });
    } catch {
      // The local write itself failed. Without this the button stayed
      // disabled forever with no explanation — the group was never queued
      // and the volunteer had no way to know or retry.
      setSaving(false);
      setError('This group was not recorded. Try again, and tell your IC if it keeps happening.');
      return;
    }

    navigator.vibrate?.(15);
    router.replace('/capture/registration');
  }

  return { saving, error, submit };
}
