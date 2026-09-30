import { useState } from 'react';
import { useAppRouter } from '@/shared/lib/appPath';
import { useEventId } from '@/shared/lib/eventContext';
import type { CreateGroupRegistrationRequest } from '@spoh/shared';
import { registrationEndpoints } from '@/features/registration';
import { enqueue } from '@/shared/lib/outbox';
import { toGroupRequest, type GroupValues } from '../model/groupRequest';
export function useGroupSubmit({
  stationId,
  total,
  values,
  form,
}: {
  stationId: string | undefined;
  total: number;
  values: GroupValues;
  form: { validate(input: unknown): CreateGroupRegistrationRequest | null };
}) {
  const router = useAppRouter();
  const eventId = useEventId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(): Promise<void> {
    if (!stationId || total === 0) return;
    const body = form.validate(toGroupRequest(values, stationId, crypto.randomUUID()));
    if (!body) return;
    setSaving(true);
    setError(null);

    try {
      await enqueue({
        idempotencyKey: body.idempotencyKey,
        eventId,
        path: registrationEndpoints.group,
        body,
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
