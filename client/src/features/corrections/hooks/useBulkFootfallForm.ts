import { useState } from 'react';
import { CreateFootfallBulkRequest } from '@spoh/shared';
import { useEvent } from '@/shared/lib/eventContext';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { useBulkFootfall } from '../queries';
import { correctionInstant } from '../model/correctionForms';

export function useBulkFootfallForm() {
  const event = useEvent();
  const form = useZodForm(
    CreateFootfallBulkRequest,
    {
      stationId: '',
      quantity: '',
      wallTime: '',
      reason: '',
      source: 'PAPER' as CreateFootfallBulkRequest['source'],
    },
    { timeBlockStart: 'wallTime' },
  );
  const mutation = useBulkFootfall();
  const receipt = useRetryKey();
  const [error, setError] = useState<string | null>(null);
  function submit() {
    try {
      setError(null);
      const { wallTime, quantity, ...fields } = form.values;
      const input = {
        ...fields,
        quantity: Number(quantity),
        timeBlockStart: correctionInstant(wallTime, event.timezone),
        rehearsal: event.status === 'REHEARSAL',
      };
      const request = form.validate({ ...input, idempotencyKey: receipt.forInput(input) });
      if (request)
        mutation.mutate(request, {
          onSuccess: () => {
            receipt.clear();
            form.reset();
          },
        });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the block start.');
    }
  }
  return { form, mutation, error, submit, timezone: event.timezone };
}
