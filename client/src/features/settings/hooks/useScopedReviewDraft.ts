import { useState } from 'react';
import type { z } from 'zod';
import type { ScopedSettingsReadResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';

export function useScopedReviewDraft<Schema extends z.ZodType>(input: {
  current: ScopedSettingsReadResponse;
  schema: Schema;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onReview: () => void;
  onError: (message: string) => void;
  unavailableMessage: string;
}) {
  const [reviewed, setReviewed] = useState(input.current);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useZodForm(input.schema, { reason: '' });
  async function reload() {
    setLoading(true);
    try {
      const current = await input.loadCurrent();
      if (!current) {
        input.onError(input.unavailableMessage);
        return;
      }
      setReviewed(current);
      form.reset({ reason: '' });
      setConfirmed(false);
      input.onReview();
    } catch {
      input.onError(input.unavailableMessage);
    } finally {
      setLoading(false);
    }
  }
  return { reviewed, confirmed, setConfirmed, loading, form, reload };
}
