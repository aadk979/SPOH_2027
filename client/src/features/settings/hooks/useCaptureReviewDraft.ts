import { useState } from 'react';
import type { ScopedSettingsReadResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { captureReviewSchema, type CaptureAction } from '../model/captureControl';

export function useCaptureReviewDraft(input: {
  current: ScopedSettingsReadResponse;
  action: CaptureAction;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onReview: () => void;
  onError: (message: string) => void;
}) {
  const [reviewed, setReviewed] = useState(input.current);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useZodForm(captureReviewSchema(input.action), { reason: '' });
  async function reload() {
    setLoading(true);
    try {
      const current = await input.loadCurrent();
      if (!current) {
        input.onError('Current capture settings are unavailable. Reload before reviewing.');
        return;
      }
      setReviewed(current);
      form.reset({ reason: '' });
      setConfirmed(false);
      input.onReview();
    } catch {
      input.onError('Current capture settings are unavailable. Reload before reviewing.');
    } finally {
      setLoading(false);
    }
  }
  return { reviewed, confirmed, setConfirmed, loading, form, reload };
}
