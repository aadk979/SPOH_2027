import { useState } from 'react';
import { RevertEventSettingRequest, type EventSettingsResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';

export function useProductRevertDraft(input: {
  current: EventSettingsResponse;
  loadCurrent: () => Promise<EventSettingsResponse | null>;
  onReview: () => void;
  onError: (message: string) => void;
}) {
  const [reviewed, setReviewed] = useState(input.current);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useZodForm(RevertEventSettingRequest, { reason: '' });
  async function reload() {
    setLoading(true);
    try {
      const current = await input.loadCurrent();
      if (!current) {
        input.onError('Current values are unavailable. Reload history before reviewing again.');
        return;
      }
      setReviewed(current);
      form.reset({ reason: '' });
      setConfirmed(false);
      input.onReview();
    } catch {
      input.onError('Current values are unavailable. Reload history before reviewing again.');
    } finally {
      setLoading(false);
    }
  }
  return { reviewed, confirmed, setConfirmed, loading, form, reload };
}
