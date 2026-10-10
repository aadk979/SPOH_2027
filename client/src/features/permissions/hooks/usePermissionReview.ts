import { useState } from 'react';
import { ReviewRolePermissionsRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useReviewRolePermissions } from '../queries';

export function usePermissionReview(version: number) {
  const form = useZodForm(ReviewRolePermissionsRequest, { reason: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [intent, setIntent] = useState<ReviewRolePermissionsRequest | null>(null);
  const mutation = useReviewRolePermissions();
  const frozen = !!intent || mutation.isPending;
  const disabled =
    mutation.isPending || (!intent && (!confirmed || form.values.reason.trim().length < 3));
  function submit() {
    const request =
      intent ??
      form.validate({
        expectedVersion: version,
        reason: form.values.reason,
        idempotencyKey: crypto.randomUUID(),
      });
    if (!request || disabled) return;
    setIntent(request);
    mutation.mutate(request, {
      onSuccess: () => {
        setIntent(null);
        setConfirmed(false);
      },
    });
  }
  return {
    form,
    confirmed,
    setConfirmed,
    mutation,
    frozen,
    disabled,
    submit,
    label: mutation.isPending
      ? 'Saving review…'
      : intent
        ? 'Retry same permissions review'
        : 'Mark current permissions reviewed',
  };
}
