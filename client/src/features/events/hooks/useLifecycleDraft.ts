import { useState } from 'react';
import {
  TransitionEventRequest,
  type EventStatus,
  type LifecycleReadinessResponse,
} from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';

/** Local review survives refreshes; adopting current evidence always clears confirmation. */
export function useLifecycleDraft(input: {
  readiness: LifecycleReadinessResponse;
  loadCurrent: () => Promise<LifecycleReadinessResponse | null>;
  onReview: () => void;
  onError: (message: string) => void;
}) {
  const [reviewed, setReviewed] = useState(input.readiness);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useZodForm(TransitionEventRequest, {
    to: reviewed.transitions[0]?.to ?? 'READY',
    reason: '',
  });
  const option = reviewed.transitions.find((item) => item.to === form.values.to);
  function choose(to: EventStatus) {
    form.setField('to', to);
    setConfirmed(false);
    input.onError('');
  }
  async function reload() {
    setLoading(true);
    try {
      const current = await input.loadCurrent();
      if (!current) {
        input.onError('Readiness is unavailable. Try reloading again.');
        return;
      }
      setReviewed(current);
      form.reset({ to: current.transitions[0]?.to ?? 'READY', reason: '' });
      setConfirmed(false);
      input.onReview();
    } catch {
      input.onError('Readiness is unavailable. Try reloading again.');
    } finally {
      setLoading(false);
    }
  }
  return { reviewed, confirmed, setConfirmed, loading, form, option, choose, reload };
}
